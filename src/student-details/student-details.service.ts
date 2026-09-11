import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentDetails } from './entities/student-details.entity';
import { OrganizationDetails } from '../organization-details/entities/organization-details.entity';
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
export class StudentDetailsService {
  private readonly logger = new Logger(StudentDetailsService.name);

  constructor(
    @InjectRepository(StudentDetails)
    private readonly studentRepo: Repository<StudentDetails>,
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

  private async uploadDoc(
    file?: UploadedMulterFile,
    prefix = 'student_aadhar',
  ): Promise<string | null> {
    if (!file) return null;
    this.validateFile(file);

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectKey = `student-details/${prefix}_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 8)}_${safeName}`;

    await this.minioService.uploadFile(
      file.buffer,
      objectKey,
      file.mimetype,
      BUCKET_NAME,
    );
    this.logger.log(`Uploaded student document to MinIO: ${objectKey}`);
    return objectKey;
  }

  /**
   * Create a new student enrollment under an organization & standard
   */
  async createStudent(data: any, aadharFile?: UploadedMulterFile) {
    let orgId = data.organization_id || data.organizationId;
    let org = orgId ? await this.orgRepo.findOne({ where: { id: orgId } }) : null;

    if (!org) {
      const fallbackOrg = await this.orgRepo.findOne({ where: {}, order: { registered_at: 'DESC' } });
      if (fallbackOrg) {
        org = fallbackOrg;
        orgId = fallbackOrg.id;
      } else {
        throw new BadRequestException(
          'organization_id is required and at least one organization must exist to enroll students',
        );
      }
    }

    if (!data.student_name && !data.studentName) {
      throw new BadRequestException('student_name is required');
    }

    if (!data.standard) {
      throw new BadRequestException('standard is required');
    }

    // Upload Aadhaar document if present
    const aadharFileId = await this.uploadDoc(aadharFile, 'student_aadhar');

    const student = this.studentRepo.create({
      organization_id: orgId,
      standard: (data.standard || '').trim(),
      student_name: (data.student_name || data.studentName || '').trim(),
      student_aadhar_number: data.student_aadhar_number || data.aadharNumber || null,
      student_aadhar_file_id: aadharFileId || data.student_aadhar_file_id || null,
      contact_mobile: data.contact_mobile || data.contactMobile || null,
      contact_email: data.contact_email || data.contactEmail || null,
      father_name: data.father_name || data.fatherName || null,
      mother_name: data.mother_name || data.motherName || null,
      father_mobile: data.father_mobile || data.fatherMobile || null,
      mother_mobile: data.mother_mobile || data.motherMobile || null,
      father_email: data.father_email || data.fatherEmail || null,
      mother_email: data.mother_email || data.motherEmail || null,
      country: data.country || 'India',
      state: data.state || null,
      district: data.district || null,
      current_address: data.current_address || data.currentAddress || null,
      permanent_address: data.permanent_address || data.permanentAddress || null,
      emergency_person_name: data.emergency_person_name || data.emergencyName || null,
      emergency_person_mobile: data.emergency_person_mobile || data.emergencyMobile || null,
      emergency_person_relation: data.emergency_person_relation || data.emergencyRelation || null,
      status: data.status || 'active',
    });

    const savedStudent = await this.studentRepo.save(student);

    // Automatically generate unique 4-digit roll numbers alphabetically for this standard
    await this.generateRollNumbersForStandard(orgId, savedStudent.standard);

    // Automatically create user_roles account for the student (Student ID as username, default password Okay@123)
    try {
      const studentUsername = savedStudent.id;
      const existingUser = await this.userRoleRepo.findOne({
        where: [{ email_id: studentUsername }, { user_id: savedStudent.id }],
      });
      if (!existingUser) {
        const hashedPassword = await bcrypt.hash('Okay@123', 10);
        const userRole = this.userRoleRepo.create({
          user_id: savedStudent.id,
          email_id: studentUsername,
          mobile_number: savedStudent.contact_mobile || savedStudent.father_mobile || savedStudent.mother_mobile || '',
          role_name: RoleName.STUDENTS,
          password: hashedPassword,
          must_change_password: true,
        });
        await this.userRoleRepo.save(userRole);
        this.logger.log(`Created user_roles login account for student: ${studentUsername} with default password Okay@123`);
      }
    } catch (err: any) {
      this.logger.warn(`Could not create user_roles record for student: ${err.message}`);
    }

    const refreshedStudent = await this.studentRepo.findOne({ where: { id: savedStudent.id } });

    this.logger.log(
      `Successfully enrolled student "${refreshedStudent?.student_name || savedStudent.student_name}" (${savedStudent.id}) in ${savedStudent.standard} with Roll No: ${refreshedStudent?.roll_number}`,
    );
    return refreshedStudent || savedStudent;
  }

  /**
   * Generates and assigns unique 4-digit roll numbers (e.g. 1001, 1002...)
   * for all students in a specific standard under an organization,
   * strictly sorted in alphabetical order by student name.
   */
  async generateRollNumbersForStandard(organizationId: string, standard: string): Promise<void> {
    if (!organizationId || !standard) return;

    const students = await this.studentRepo
      .createQueryBuilder('student')
      .where('student.organization_id = :organizationId', { organizationId })
      .andWhere(
        'LOWER(REPLACE(TRIM(student.standard), \'.\', \'\')) = LOWER(REPLACE(TRIM(:standard), \'.\', \'\'))',
        { standard },
      )
      .getMany();

    if (!students || students.length === 0) return;

    // Sort alphabetically by student_name (case-insensitive)
    students.sort((a, b) =>
      (a.student_name || '').localeCompare(b.student_name || '', undefined, {
        sensitivity: 'base',
        numeric: true,
      }),
    );

    // Assign 4-digit unique roll numbers: 1001, 1002, 1003...
    const updates: StudentDetails[] = [];
    students.forEach((st, idx) => {
      const assignedRollNo = String(1001 + idx);
      if (st.roll_number !== assignedRollNo) {
        st.roll_number = assignedRollNo;
        updates.push(st);
      }
    });

    if (updates.length > 0) {
      await this.studentRepo.save(updates);
      this.logger.log(
        `Assigned 4-digit roll numbers for ${updates.length} students in "${standard}" (Org: ${organizationId}) based on alphabetical order`,
      );
    }
  }

  /**
   * Find all students, optionally filtered by organization and/or standard
   */
  async findAll(organizationId?: string, standard?: string) {
    const query = this.studentRepo.createQueryBuilder('student');

    if (organizationId) {
      query.andWhere('student.organization_id = :organizationId', { organizationId });
    }

    if (standard) {
      query.andWhere(
        'LOWER(REPLACE(TRIM(student.standard), \'.\', \'\')) = LOWER(REPLACE(TRIM(:standard), \'.\', \'\'))',
        { standard },
      );
    }

    query.orderBy('student.standard', 'ASC')
         .addOrderBy('student.roll_number', 'ASC')
         .addOrderBy('student.student_name', 'ASC');

    const students = await query.getMany();

    // Self-healing: if any student in the query lacks a roll number, generate for their standard
    const standardsToRefresh = new Set<string>();
    for (const st of students) {
      if (!st.roll_number && st.organization_id && st.standard) {
        standardsToRefresh.add(`${st.organization_id}:::${st.standard}`);
      }
    }

    if (standardsToRefresh.size > 0) {
      for (const item of standardsToRefresh) {
        const [org, std] = item.split(':::');
        await this.generateRollNumbersForStandard(org, std);
      }
      return query.getMany();
    }

    return students;
  }

  /**
   * Find a single student by UUID
   */
  async findById(id: string) {
    const student = await this.studentRepo.findOne({
      where: { id },
      relations: { organization: true },
    });
    if (!student) {
      throw new NotFoundException(`Student with ID "${id}" not found`);
    }
    return student;
  }

  /**
   * Update student details
   */
  async updateStudent(id: string, data: any, aadharFile?: UploadedMulterFile) {
    const student = await this.findById(id);

    let aadharFileId = student.student_aadhar_file_id;
    if (aadharFile) {
      aadharFileId = await this.uploadDoc(aadharFile, 'student_aadhar');
    }

    Object.assign(student, {
      student_name: data.student_name || data.studentName || student.student_name,
      standard: data.standard || student.standard,
      student_aadhar_number: data.student_aadhar_number || data.aadharNumber || student.student_aadhar_number,
      student_aadhar_file_id: aadharFileId,
      contact_mobile: data.contact_mobile || data.contactMobile || student.contact_mobile,
      contact_email: data.contact_email || data.contactEmail || student.contact_email,
      father_name: data.father_name || data.fatherName || student.father_name,
      mother_name: data.mother_name || data.motherName || student.mother_name,
      father_mobile: data.father_mobile || data.fatherMobile || student.father_mobile,
      mother_mobile: data.mother_mobile || data.motherMobile || student.mother_mobile,
      father_email: data.father_email || data.fatherEmail || student.father_email,
      mother_email: data.mother_email || data.motherEmail || student.mother_email,
      country: data.country || student.country,
      state: data.state || student.state,
      district: data.district || student.district,
      current_address: data.current_address || data.currentAddress || student.current_address,
      permanent_address: data.permanent_address || data.permanentAddress || student.permanent_address,
      emergency_person_name: data.emergency_person_name || data.emergencyName || student.emergency_person_name,
      emergency_person_mobile: data.emergency_person_mobile || data.emergencyMobile || student.emergency_person_mobile,
      emergency_person_relation: data.emergency_person_relation || data.emergencyRelation || student.emergency_person_relation,
      status: data.status || student.status,
    });

    const saved = await this.studentRepo.save(student);
    if (saved.organization_id && saved.standard) {
      await this.generateRollNumbersForStandard(saved.organization_id, saved.standard);
    }

    return this.findById(saved.id);
  }

  /**
   * Remove a student and delete their document from MinIO
   */
  async remove(id: string) {
    const student = await this.findById(id);
    if (student.student_aadhar_file_id) {
      try {
        await this.minioService.deleteFile(student.student_aadhar_file_id, BUCKET_NAME);
      } catch (err) {
        this.logger.warn(`Could not delete file ${student.student_aadhar_file_id} from MinIO:`, err);
      }
    }
    const orgId = student.organization_id;
    const std = student.standard;
    const res = await this.studentRepo.remove(student);
    if (orgId && std) {
      await this.generateRollNumbersForStandard(orgId, std);
    }
    return res;
  }
}
