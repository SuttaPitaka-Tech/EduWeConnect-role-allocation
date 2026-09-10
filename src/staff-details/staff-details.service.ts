import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaffDetails, EmployeeType } from './entities/staff-details.entity';
import { OrganizationDetails } from '../organization-details/entities/organization-details.entity';
import { MinioService } from '../minio/minio.service';
import { UserRole, RoleName } from '../user-roles/entities/user-role.entity';
import * as bcrypt from 'bcrypt';
import { CreateStaffDetailDto } from './dto/create-staff-detail.dto';
import { UpdateStaffDetailDto } from './dto/update-staff-detail.dto';

export interface UploadedMulterFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size?: number;
}

const BUCKET_NAME = 'organization-details';
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
];
const ALLOWED_EXTENSIONS = /\.(pdf|png|jpg|jpeg)$/i;

/**
 * Safely parses stringified JSON or returns fallback
 */
function safeJsonParse<T>(input: unknown, fallback: T): T {
  if (input == null) return fallback;
  if (typeof input !== 'string') return (input as T) ?? fallback;
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

/**
 * Normalizes input (array, JSON string, or comma-delimited string) into string[]
 */
function parseStringArray(input: unknown): string[] {
  if (Array.isArray(input)) return input.filter(Boolean);
  if (typeof input !== 'string' || !input.trim()) return [];
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [input.trim()];
  } catch {
    return input.split(',').map((s) => s.trim()).filter(Boolean);
  }
}

/**
 * Normalizes staff address from payload object, JSON string, or discrete fields
 */
function parseStaffAddress(data: Record<string, any>, existing?: any): any {
  const raw = data.staff_address ?? data.staffAddress;
  if (raw) {
    return safeJsonParse(raw, typeof raw === 'object' ? raw : { current_address: String(raw) });
  }

  const fields = {
    current_address: data.current_address ?? data.currentAddress ?? existing?.current_address,
    permanent_address: data.permanent_address ?? data.permanentAddress ?? existing?.permanent_address,
    state: data.state ?? existing?.state,
    country: data.country ?? existing?.country,
    pincode: data.pincode ?? existing?.pincode,
  };

  return Object.values(fields).some(Boolean) ? fields : (existing ?? null);
}

@Injectable()
export class StaffDetailsService {
  private readonly logger = new Logger(StaffDetailsService.name);

  constructor(
    @InjectRepository(StaffDetails)
    private readonly staffRepo: Repository<StaffDetails>,
    @InjectRepository(OrganizationDetails)
    private readonly orgRepo: Repository<OrganizationDetails>,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    private readonly minioService: MinioService,
  ) {}

  private validateFile(file?: UploadedMulterFile) {
    if (!file) return;
    const isValidMime = ALLOWED_MIME_TYPES.includes(file.mimetype);
    const isValidExt = ALLOWED_EXTENSIONS.test(file.originalname);
    if (!isValidMime || !isValidExt) {
      throw new BadRequestException(
        `File ${file.originalname} has invalid type. Only PDF, PNG, and JPG files are allowed.`,
      );
    }
  }

  private async uploadDoc(file?: UploadedMulterFile, prefix = 'staff_doc'): Promise<string | null> {
    if (!file) return null;
    this.validateFile(file);

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectKey = `staff-details/${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${safeName}`;

    await this.minioService.uploadFile(
      file.buffer,
      objectKey,
      file.mimetype,
      BUCKET_NAME,
    );
    this.logger.log(`Uploaded staff document to MinIO: ${objectKey}`);
    return objectKey;
  }

  /**
   * Create a new staff member under an organization
   */
  async createStaff(
    data: any,
    files?: {
      panFile?: UploadedMulterFile[];
      aadharFile?: UploadedMulterFile[];
      expLetterFile?: UploadedMulterFile[];
      relievingLetterFile?: UploadedMulterFile[];
      additionalFiles?: UploadedMulterFile[];
    },
  ) {
    let orgId = data.organization_id || data.organizationId;
    let org = orgId ? await this.orgRepo.findOne({ where: { id: orgId } }) : null;

    if (!org) {
      // Fallback to the most recently registered organization so staff can be attached
      const fallbackOrg = await this.orgRepo.findOne({ order: { created_at: 'DESC' } });
      if (fallbackOrg) {
        org = fallbackOrg;
        orgId = fallbackOrg.id;
      } else {
        throw new BadRequestException('organization_id is required and at least one organization must exist to register staff');
      }
    }

    // 2. Prevent duplicate staff registration with the same email under the same organization
    const staffEmail = (data.employee_email || data.email || '').trim().toLowerCase();
    if (staffEmail) {
      const existingStaff = await this.staffRepo.findOne({
        where: { organization_id: orgId, employee_email: staffEmail },
      });
      if (existingStaff) {
        throw new BadRequestException(
          `Staff member with email "${staffEmail}" is already registered under this institution.`,
        );
      }
    }

    // 3. Upload any provided statutory and experience files concurrently
    const [panFileId, aadharFileId, expLetterFileId, relievingLetterFileId] = await Promise.all([
      this.uploadDoc(files?.panFile?.[0], 'staff_pan'),
      this.uploadDoc(files?.aadharFile?.[0], 'staff_aadhar'),
      this.uploadDoc(files?.expLetterFile?.[0], 'staff_exp'),
      this.uploadDoc(files?.relievingLetterFile?.[0], 'staff_relieving'),
    ]);

    // 4. Parse complex payloads cleanly with functional helpers
    const parsedSubjects = parseStringArray(data.subjects);
    const additionalDocuments = safeJsonParse(data.additional_documents ?? data.additionalDocuments, []);
    const staffAddress = parseStaffAddress(data);

    // 5. Create StaffDetails record mapped to organization_id
    const staff = this.staffRepo.create({
      organization_id: orgId,
      employee_first_name: data.employee_first_name || data.firstName,
      employee_last_name: data.employee_last_name || data.lastName || null,
      employee_email: data.employee_email || data.email,
      employee_mobile_number: data.employee_mobile_number || data.mobile,
      employee_pan_number: data.employee_pan_number || data.panNumber || null,
      employee_pan_file_id: panFileId || data.employee_pan_file_id || null,
      employee_aadhar_number: data.employee_aadhar_number || data.aadharNumber || null,
      employee_aadhar_file_id: aadharFileId || data.employee_aadhar_file_id || null,
      employee_experience: data.employee_experience || data.experience || null,
      employee_previous_work_institute_name:
        data.employee_previous_work_institute_name || data.previousInstitute || null,
      employee_experience_letter_file_id: expLetterFileId || data.employee_experience_letter_file_id || null,
      employee_relieving_letter_file_id: relievingLetterFileId || data.employee_relieving_letter_file_id || null,
      additional_documents: additionalDocuments,
      staff_address: staffAddress,
      employee_type: (data.employee_type || data.employeeType || EmployeeType.TEACHER) as EmployeeType,
      subjects: parsedSubjects,
      status: data.status || 'active',
    });

    const savedStaff = await this.staffRepo.save(staff);
    this.logger.log(`Created staff member: ${savedStaff.id} under organization: ${orgId}`);

    // 6. Automatically register in user_roles as STAFF if not exists
    try {
      const email = savedStaff.employee_email;
      const existingUser = await this.userRoleRepo.findOne({ where: { email_id: email } });
      if (!existingUser) {
        const hashedPassword = await bcrypt.hash('Staff@123', 10);
        const userRole = this.userRoleRepo.create({
          email_id: email,
          mobile_number: savedStaff.employee_mobile_number,
          role_name: RoleName.STAFF,
          password: hashedPassword,
          must_change_password: true,
        });
        await this.userRoleRepo.save(userRole);
        this.logger.log(`Created user_roles login account for staff: ${email}`);
      }
    } catch (err: any) {
      this.logger.warn(`Could not create user_roles record for staff: ${err.message}`);
    }

    return savedStaff;
  }

  /**
   * Find all staff, optionally filtered by organization_id
   */
  async findAll(organizationId?: string) {
    if (organizationId) {
      return this.staffRepo.find({
        where: { organization_id: organizationId },
        relations: { organization: true },
        order: { created_at: 'DESC' },
      });
    }
    return this.staffRepo.find({
      relations: { organization: true },
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Find a single staff member by ID
   */
  async findById(id: string) {
    const staff = await this.staffRepo.findOne({
      where: { id },
      relations: { organization: true },
    });
    if (!staff) {
      throw new NotFoundException(`Staff record with ID "${id}" not found`);
    }
    return staff;
  }

  /**
   * Find all staff members for a specific organization
   */
  async findByOrganization(organizationId: string) {
    return this.staffRepo.find({
      where: { organization_id: organizationId },
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Update staff member details
   */
  async update(id: string, updateDto: UpdateStaffDetailDto) {
    const staff = await this.findById(id);
    Object.assign(staff, updateDto);
    return this.staffRepo.save(staff);
  }

  /**
   * Update staff member details and optionally upload new replacement files
   */
  async updateStaff(
    id: string,
    data: any,
    files?: {
      panFile?: UploadedMulterFile[];
      aadharFile?: UploadedMulterFile[];
      expLetterFile?: UploadedMulterFile[];
      relievingLetterFile?: UploadedMulterFile[];
      additionalFiles?: UploadedMulterFile[];
    },
  ) {
    const staff = await this.findById(id);

    // Dynamic field assignment
    const fieldMap: Record<string, any> = {
      employee_first_name: data.employee_first_name ?? data.firstName,
      employee_last_name: data.employee_last_name ?? data.lastName,
      employee_email: (data.employee_email ?? data.email)?.trim()?.toLowerCase(),
      employee_mobile_number: data.employee_mobile_number ?? data.mobile,
      employee_pan_number: data.employee_pan_number ?? data.panNumber,
      employee_aadhar_number: data.employee_aadhar_number ?? data.aadharNumber,
      employee_experience: data.employee_experience ?? data.experience,
      employee_previous_work_institute_name:
        data.employee_previous_work_institute_name ?? data.previousInstitute,
      employee_type: data.employee_type ?? data.employeeType,
    };

    for (const [key, value] of Object.entries(fieldMap)) {
      if (value !== undefined) {
        (staff as any)[key] = value;
      }
    }

    if (data.subjects !== undefined) {
      staff.subjects = parseStringArray(data.subjects);
    }

    if (data.additional_documents !== undefined || data.additionalDocuments !== undefined) {
      staff.additional_documents = safeJsonParse(
        data.additional_documents ?? data.additionalDocuments,
        staff.additional_documents || [],
      );
    }

    const resolvedAddress = parseStaffAddress(data, staff.staff_address);
    if (resolvedAddress) {
      staff.staff_address = {
        ...(staff.staff_address || {}),
        ...resolvedAddress,
      };
    }

    // Upload replacement files concurrently
    const [panFileId, aadharFileId, expLetterFileId, relievingLetterFileId] = await Promise.all([
      files?.panFile?.[0] ? this.uploadDoc(files.panFile[0], 'staff_pan') : null,
      files?.aadharFile?.[0] ? this.uploadDoc(files.aadharFile[0], 'staff_aadhar') : null,
      files?.expLetterFile?.[0] ? this.uploadDoc(files.expLetterFile[0], 'staff_exp') : null,
      files?.relievingLetterFile?.[0] ? this.uploadDoc(files.relievingLetterFile[0], 'staff_relieving') : null,
    ]);

    if (panFileId) staff.employee_pan_file_id = panFileId;
    if (aadharFileId) staff.employee_aadhar_file_id = aadharFileId;
    if (expLetterFileId) staff.employee_experience_letter_file_id = expLetterFileId;
    if (relievingLetterFileId) staff.employee_relieving_letter_file_id = relievingLetterFileId;

    return this.staffRepo.save(staff);
  }

  /**
   * Remove a staff record
   */
  async remove(id: string) {
    const staff = await this.findById(id);
    await this.staffRepo.remove(staff);
    return { success: true, message: `Staff record ${id} removed successfully` };
  }
}
