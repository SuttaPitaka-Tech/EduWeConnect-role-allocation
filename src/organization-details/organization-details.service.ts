import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationDetails } from './entities/organization-details.entity';
import { MinioService } from '../minio/minio.service';
import { UserRole, RoleName } from '../user-roles/entities/user-role.entity';
import * as bcrypt from 'bcrypt';

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
export class OrganizationDetailsService {
  private readonly logger = new Logger(OrganizationDetailsService.name);

  constructor(
    @InjectRepository(OrganizationDetails)
    private readonly orgDetailsRepo: Repository<OrganizationDetails>,
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

  private async uploadDoc(file?: UploadedMulterFile, prefix = 'doc'): Promise<string | null> {
    if (!file) return null;
    this.validateFile(file);

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectKey = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${safeName}`;

    await this.minioService.uploadFile(
      file.buffer,
      objectKey,
      file.mimetype,
      BUCKET_NAME,
    );
    this.logger.log(`Uploaded document to MinIO [${BUCKET_NAME}/${objectKey}]`);
    return objectKey;
  }

  async register(
    data: any,
    files: {
      panFile?: UploadedMulterFile[];
      gstFile?: UploadedMulterFile[];
      regCertFile?: UploadedMulterFile[];
      orgHeadAadharFile?: UploadedMulterFile[];
    },
  ) {
    // 1. Validate all files first
    const panFile = files.panFile?.[0];
    const gstFile = files.gstFile?.[0];
    const regCertFile = files.regCertFile?.[0];
    const headAadharFile = files.orgHeadAadharFile?.[0];

    this.validateFile(panFile);
    this.validateFile(gstFile);
    this.validateFile(regCertFile);
    this.validateFile(headAadharFile);

    // 2. Upload files to MinIO bucket 'organization-details'
    const [panFileId, gstFileId, regCertFileId, headAadharFileId] =
      await Promise.all([
        this.uploadDoc(panFile, 'pan'),
        this.uploadDoc(gstFile, 'gst'),
        this.uploadDoc(regCertFile, 'reg_cert'),
        this.uploadDoc(headAadharFile, 'aadhar'),
      ]);

    const now = new Date();

    // 3. Create Organization Details record in MySQL
    const org = this.orgDetailsRepo.create({
      organization_name: data.organizationName || data.organization_name,
      organization_email: data.organizationEmail || data.organization_email,
      organization_mobile: data.organizationMobile || data.organization_mobile,
      organization_type: data.organizationType || data.organization_type,
      address: data.address,
      city: data.city,
      district: data.district,
      state: data.state,
      pincode: data.pincode,
      country: data.country || 'India',
      pan_number: data.panNumber || data.pan_number,
      pan_file_id: panFileId || undefined,
      gst_number: data.gstNumber || data.gst_number,
      gst_file_id: gstFileId || undefined,
      reg_cert_number: data.regCertNumber || data.reg_cert_number,
      reg_cert_file_id: regCertFileId || undefined,
      head_first_name: data.orgHeadFirstName || data.head_first_name,
      head_middle_name: data.orgHeadMiddleName || data.head_middle_name || null,
      head_last_name: data.orgHeadLastName || data.head_last_name,
      head_email: data.orgHeadEmail || data.head_email,
      head_mobile: data.orgHeadMobile || data.head_mobile,
      head_aadhar_number: data.orgHeadAadharNumber || data.head_aadhar_number,
      head_aadhar_file_id: headAadharFileId || undefined,
      status: 'pending',
      uploaded_at: now,
    });

    const savedOrg = await this.orgDetailsRepo.save(org);

    // 4. Ensure organization is recorded in user_roles table if not already present
    try {
      const email = savedOrg.organization_email;
      const existingUser = await this.userRoleRepo.findOne({
        where: { email_id: email },
      });
      if (!existingUser) {
        const newUser = this.userRoleRepo.create({
          email_id: email,
          mobile_number: savedOrg.organization_mobile,
          role_name: RoleName.ORGANIZATION,
        });
        await this.userRoleRepo.save(newUser);
        this.logger.log(`Created user_roles record for organization: ${email}`);
      }
    } catch (err: any) {
      this.logger.warn(`Could not sync to user_roles: ${err.message}`);
    }

    return {
      message: 'Organization registered successfully',
      organization: savedOrg,
    };
  }

  async findAll() {
    const orgs = await this.orgDetailsRepo.find({
      order: { registered_at: 'DESC' },
    });

    return Promise.all(
      orgs.map(async (org) => {
        const [panUrl, gstUrl, regCertUrl, aadharUrl] = await Promise.all([
          org.pan_file_id ? this.minioService.getFileUrl(org.pan_file_id, BUCKET_NAME) : null,
          org.gst_file_id ? this.minioService.getFileUrl(org.gst_file_id, BUCKET_NAME) : null,
          org.reg_cert_file_id ? this.minioService.getFileUrl(org.reg_cert_file_id, BUCKET_NAME) : null,
          org.head_aadhar_file_id ? this.minioService.getFileUrl(org.head_aadhar_file_id, BUCKET_NAME) : null,
        ]);
        return {
          ...org,
          documentUrls: {
            pan: panUrl,
            gst: gstUrl,
            regCert: regCertUrl,
            headAadhar: aadharUrl,
          },
        };
      }),
    );
  }

  async findById(id: string) {
    const org = await this.orgDetailsRepo.findOne({ where: { id } });
    if (!org) {
      throw new NotFoundException(`Organization with id ${id} not found`);
    }

    // Attach presigned URLs for uploaded documents if they exist
    const [panUrl, gstUrl, regCertUrl, aadharUrl] = await Promise.all([
      org.pan_file_id ? this.minioService.getFileUrl(org.pan_file_id, BUCKET_NAME) : null,
      org.gst_file_id ? this.minioService.getFileUrl(org.gst_file_id, BUCKET_NAME) : null,
      org.reg_cert_file_id ? this.minioService.getFileUrl(org.reg_cert_file_id, BUCKET_NAME) : null,
      org.head_aadhar_file_id ? this.minioService.getFileUrl(org.head_aadhar_file_id, BUCKET_NAME) : null,
    ]);

    return {
      ...org,
      documentUrls: {
        pan: panUrl,
        gst: gstUrl,
        regCert: regCertUrl,
        headAadhar: aadharUrl,
      },
    };
  }

  async updateStatus(
    id: string,
    status: 'pending' | 'approved' | 'rejected',
    rejectionReason?: string,
  ) {
    const org = await this.orgDetailsRepo.findOne({ where: { id } });
    if (!org) {
      throw new NotFoundException(`Organization with id ${id} not found`);
    }

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      throw new BadRequestException(`Invalid status: ${status}. Must be pending, approved, or rejected.`);
    }

    org.status = status;
    org.rejection_reason = rejectionReason || (status === 'approved' ? undefined : org.rejection_reason);
    org.reviewed_at = new Date();

    const saved = await this.orgDetailsRepo.save(org);
    this.logger.log(`Updated organization ${id} status to ${status}`);

    // If approved, automatically create/update user_roles with default password Okay@123
    if (status === 'approved') {
      try {
        const defaultPasswordHash = await bcrypt.hash('Okay@123', 10);
        let user = await this.userRoleRepo.findOne({ where: { email_id: org.organization_email } });
        if (!user) {
          user = this.userRoleRepo.create({
            email_id: org.organization_email,
            mobile_number: org.organization_mobile,
            role_name: RoleName.ORGANIZATION,
            password: defaultPasswordHash,
            must_change_password: true,
          });
        } else {
          user.role_name = RoleName.ORGANIZATION;
          user.mobile_number = org.organization_mobile;
          user.password = defaultPasswordHash;
          user.must_change_password = true;
        }
        await this.userRoleRepo.save(user);
        this.logger.log(`Created/updated user_roles record with default password Okay@123 for ${org.organization_email}`);
      } catch (err: any) {
        this.logger.error(`Error saving user_roles on approval: ${err.message}`);
      }
    }

    return this.findById(saved.id);
  }
}
