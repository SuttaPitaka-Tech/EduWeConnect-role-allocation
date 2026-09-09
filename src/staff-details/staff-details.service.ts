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

    // 3. Upload any provided statutory and experience files
    const panFileId = await this.uploadDoc(files?.panFile?.[0], 'staff_pan');
    const aadharFileId = await this.uploadDoc(files?.aadharFile?.[0], 'staff_aadhar');
    const expLetterFileId = await this.uploadDoc(files?.expLetterFile?.[0], 'staff_exp');
    const relievingLetterFileId = await this.uploadDoc(files?.relievingLetterFile?.[0], 'staff_relieving');

    // 3. Process subjects if teacher
    let parsedSubjects: string[] = [];
    const rawSubjects = data.subjects;
    if (Array.isArray(rawSubjects)) {
      parsedSubjects = rawSubjects;
    } else if (typeof rawSubjects === 'string' && rawSubjects.trim()) {
      try {
        const parsed = JSON.parse(rawSubjects);
        parsedSubjects = Array.isArray(parsed) ? parsed : [rawSubjects];
      } catch {
        parsedSubjects = rawSubjects.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
    }

    // 4. Process additional documents
    let additionalDocuments: Array<{ docName: string; file_id?: string; file_name?: string }> = [];
    const rawAddDocs = data.additional_documents || data.additionalDocuments;
    if (Array.isArray(rawAddDocs)) {
      additionalDocuments = rawAddDocs;
    } else if (typeof rawAddDocs === 'string' && rawAddDocs.trim()) {
      try {
        additionalDocuments = JSON.parse(rawAddDocs);
      } catch {
        additionalDocuments = [];
      }
    }

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

    if (data.employee_first_name || data.firstName) {
      staff.employee_first_name = data.employee_first_name || data.firstName;
    }
    if (data.employee_last_name !== undefined || data.lastName !== undefined) {
      staff.employee_last_name = data.employee_last_name ?? data.lastName ?? staff.employee_last_name;
    }
    if (data.employee_email || data.email) {
      staff.employee_email = (data.employee_email || data.email).trim().toLowerCase();
    }
    if (data.employee_mobile_number || data.mobile) {
      staff.employee_mobile_number = data.employee_mobile_number || data.mobile;
    }
    if (data.employee_pan_number !== undefined || data.panNumber !== undefined) {
      staff.employee_pan_number = data.employee_pan_number ?? data.panNumber;
    }
    if (data.employee_aadhar_number !== undefined || data.aadharNumber !== undefined) {
      staff.employee_aadhar_number = data.employee_aadhar_number ?? data.aadharNumber;
    }
    if (data.employee_experience !== undefined || data.experience !== undefined) {
      staff.employee_experience = data.employee_experience ?? data.experience;
    }
    if (data.employee_previous_work_institute_name !== undefined || data.previousInstitute !== undefined) {
      staff.employee_previous_work_institute_name =
        data.employee_previous_work_institute_name ?? data.previousInstitute;
    }
    if (data.employee_type || data.employeeType) {
      staff.employee_type = data.employee_type || data.employeeType;
    }
    if (data.subjects !== undefined) {
      let parsedSubjects: string[] = [];
      const rawSubjects = data.subjects;
      if (Array.isArray(rawSubjects)) {
        parsedSubjects = rawSubjects;
      } else if (typeof rawSubjects === 'string' && rawSubjects.trim()) {
        try {
          const parsed = JSON.parse(rawSubjects);
          parsedSubjects = Array.isArray(parsed) ? parsed : [rawSubjects];
        } catch {
          parsedSubjects = rawSubjects.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
      }
      staff.subjects = parsedSubjects;
    }

    // Upload replacement files if supplied
    if (files?.panFile?.[0]) {
      staff.employee_pan_file_id = await this.uploadDoc(files.panFile[0], 'staff_pan');
    }
    if (files?.aadharFile?.[0]) {
      staff.employee_aadhar_file_id = await this.uploadDoc(files.aadharFile[0], 'staff_aadhar');
    }
    if (files?.expLetterFile?.[0]) {
      staff.employee_experience_letter_file_id = await this.uploadDoc(files.expLetterFile[0], 'staff_exp');
    }
    if (files?.relievingLetterFile?.[0]) {
      staff.employee_relieving_letter_file_id = await this.uploadDoc(files.relievingLetterFile[0], 'staff_relieving');
    }

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
