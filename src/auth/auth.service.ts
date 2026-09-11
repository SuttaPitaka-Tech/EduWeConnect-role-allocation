import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserRole, RoleName } from '../user-roles/entities/user-role.entity';
import { OrganizationDetails } from '../organization-details/entities/organization-details.entity';
import { StaffDetails } from '../staff-details/entities/staff-details.entity';
import { StudentDetails } from '../student-details/entities/student-details.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
    @InjectRepository(OrganizationDetails)
    private readonly orgDetailsRepository: Repository<OrganizationDetails>,
    @InjectRepository(StaffDetails)
    private readonly staffDetailsRepository: Repository<StaffDetails>,
    @InjectRepository(StudentDetails)
    private readonly studentDetailsRepository: Repository<StudentDetails>,
    private readonly jwtService: JwtService,
  ) {}

  async registerSuperadmin(data: any): Promise<any> {
    if (!data?.email || !data?.password) {
      throw new BadRequestException('Email and password are required');
    }
    const hashedPassword = await bcrypt.hash(data.password, 10);
    const superadmin = this.userRoleRepository.create({
      email_id: data.email,
      mobile_number: data.mobile_number,
      password: hashedPassword,
      role_name: RoleName.SUPER_ADMIN,
    });
    await this.userRoleRepository.save(superadmin);
    return { message: 'Superadmin registered successfully' };
  }

  /**
   * Resolves a user from user_roles by email or user ID.
   * If not found, attempts auto-provisioning from approved organization_details,
   * staff_details, or student_details using the default password 'Okay@123'.
   */
  private async findOrProvisionUser(identifier: string): Promise<UserRole | null> {
    if (!identifier) return null;
    const cleanId = identifier.trim();

    // 1. Check direct match in user_roles table
    let user = await this.userRoleRepository.findOne({
      where: [{ email_id: cleanId }, { user_id: cleanId }],
    });
    if (user) return user;

    // 2. Check approved organization
    const approvedOrg = await this.orgDetailsRepository.findOne({
      where: { organization_email: cleanId, status: 'approved' },
    });
    if (approvedOrg) {
      const defaultPassword = await bcrypt.hash('Okay@123', 10);
      user = this.userRoleRepository.create({
        email_id: approvedOrg.organization_email,
        mobile_number: approvedOrg.organization_mobile,
        role_name: RoleName.ORGANIZATION,
        password: defaultPassword,
        must_change_password: true,
      });
      user = await this.userRoleRepository.save(user);
      this.logger.log(`Auto-provisioned user_roles for approved organization ${approvedOrg.organization_email}`);
      return user;
    }

    // 3. Check staff_details (Teacher, Non-Staff, Finance) by email
    const staff = await this.staffDetailsRepository.findOne({
      where: { employee_email: cleanId },
    });
    if (staff) {
      const defaultPassword = await bcrypt.hash('Okay@123', 10);
      user = this.userRoleRepository.create({
        email_id: staff.employee_email,
        mobile_number: staff.employee_mobile_number,
        role_name: RoleName.STAFF,
        password: defaultPassword,
        must_change_password: true,
      });
      user = await this.userRoleRepository.save(user);
      this.logger.log(`Auto-provisioned user_roles for staff ${staff.employee_email} (${staff.employee_type})`);
      return user;
    }

    // 4. Check student_details by Student ID (UUID) or contact_email
    const student = await this.studentDetailsRepository.findOne({
      where: [{ id: cleanId }, { contact_email: cleanId }],
    });
    if (student) {
      const defaultPassword = await bcrypt.hash('Okay@123', 10);
      user = this.userRoleRepository.create({
        user_id: student.id,
        email_id: student.id, // Student ID as username
        mobile_number: student.contact_mobile || student.father_mobile || '',
        role_name: RoleName.STUDENTS,
        password: defaultPassword,
        must_change_password: true,
      });
      user = await this.userRoleRepository.save(user);
      this.logger.log(`Auto-provisioned user_roles for student ${student.student_name} (${student.id})`);
      return user;
    }

    return null;
  }

  /**
   * Enriches user role with specific domain details based on their role
   */
  private async enrichUserDetails(user: UserRole): Promise<{
    firstName: string;
    lastName: string;
    organizationName?: string;
    institutionId?: string;
    employeeType?: string;
    subjects?: string[];
    standard?: string;
    rollNumber?: string;
    studentId?: string;
    mobileNumber?: string;
  }> {
    if (user.role_name === RoleName.ORGANIZATION) {
      const org = await this.orgDetailsRepository.findOne({
        where: { organization_email: user.email_id },
      });
      return {
        firstName: org?.organization_name || 'Organization',
        lastName: '',
        organizationName: org?.organization_name,
        institutionId: org?.id,
        mobileNumber: user.mobile_number,
      };
    }

    if (user.role_name === RoleName.STAFF) {
      const staff = await this.staffDetailsRepository.findOne({
        where: { employee_email: user.email_id },
        relations: { organization: true },
      });
      return {
        firstName: staff?.employee_first_name || 'Staff',
        lastName: staff?.employee_last_name || '',
        organizationName: staff?.organization?.organization_name,
        institutionId: staff?.organization_id,
        employeeType: staff?.employee_type, // 'Teacher' | 'Non Staff' | 'Finance'
        subjects: staff?.subjects || [],
        mobileNumber: staff?.employee_mobile_number || user.mobile_number,
      };
    }

    if (user.role_name === RoleName.STUDENTS) {
      const student = await this.studentDetailsRepository.findOne({
        where: [{ id: user.email_id }, { id: user.user_id }, { contact_email: user.email_id }],
        relations: { organization: true },
      });
      return {
        firstName: student?.student_name || 'Student',
        lastName: '',
        studentId: student?.id || user.user_id,
        standard: student?.standard,
        rollNumber: student?.roll_number,
        organizationName: student?.organization?.organization_name,
        institutionId: student?.organization_id,
        mobileNumber: student?.contact_mobile || user.mobile_number,
      };
    }

    return {
      firstName: user.role_name === RoleName.SUPER_ADMIN ? 'Super Admin' : 'User',
      lastName: '',
      mobileNumber: user.mobile_number,
    };
  }

  async login(data: any): Promise<any> {
    const identifier = (data?.email || data?.username || data?.studentId || '').trim();
    if (!identifier || !data?.password) {
      throw new BadRequestException('Email/Student ID and password are required');
    }

    const user = await this.findOrProvisionUser(identifier);

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    let isMatch = await bcrypt.compare(data.password, user.password);
    if (!isMatch && user.must_change_password && (data.password === 'Okay@123' || data.password === 'Staff@123')) {
      user.password = await bcrypt.hash('Okay@123', 10);
      await this.userRoleRepository.save(user);
      isMatch = true;
    }

    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const enriched = await this.enrichUserDetails(user);

    const payload = {
      sub: user.user_id,
      email: user.email_id,
      role: user.role_name,
      mustChangePassword: Boolean(user.must_change_password),
      ...enriched,
    };

    return {
      access_token: this.jwtService.sign(payload),
      mustChangePassword: Boolean(user.must_change_password),
      organizationName: enriched.organizationName,
      user: {
        id: user.user_id,
        email: user.email_id,
        role: user.role_name,
        mustChangePassword: Boolean(user.must_change_password),
        ...enriched,
      },
    };
  }

  async changePassword(data: { email?: string; username?: string; studentId?: string; currentPassword: string; newPassword: string }): Promise<any> {
    const identifier = (data.email || data.username || data.studentId || '').trim();
    if (!identifier || !data.currentPassword || !data.newPassword) {
      throw new BadRequestException('Identifier, current password, and new password are required');
    }

    const user = await this.findOrProvisionUser(identifier);

    if (!user || !user.password) {
      throw new UnauthorizedException('User not found');
    }

    let isMatch = await bcrypt.compare(data.currentPassword, user.password);
    if (!isMatch && user.must_change_password && (data.currentPassword === 'Okay@123' || data.currentPassword === 'Staff@123')) {
      isMatch = true;
    }

    if (!isMatch) {
      throw new BadRequestException('Current password does not match');
    }

    if (data.currentPassword === data.newPassword) {
      throw new BadRequestException('New password cannot be the same as your current password');
    }

    if (data.newPassword.length < 6) {
      throw new BadRequestException('New password must be at least 6 characters long');
    }

    const hashedPassword = await bcrypt.hash(data.newPassword, 10);
    user.password = hashedPassword;
    user.must_change_password = false;
    await this.userRoleRepository.save(user);
    this.logger.log(`Password updated successfully for ${user.email_id}`);

    const enriched = await this.enrichUserDetails(user);

    const payload = {
      sub: user.user_id,
      email: user.email_id,
      role: user.role_name,
      mustChangePassword: false,
      ...enriched,
    };

    return {
      message: 'Password changed successfully',
      access_token: this.jwtService.sign(payload),
      mustChangePassword: false,
      organizationName: enriched.organizationName,
      user: {
        id: user.user_id,
        email: user.email_id,
        role: user.role_name,
        mustChangePassword: false,
        ...enriched,
      },
    };
  }

  async getMe(payload: any): Promise<any> {
    const userId = payload.userId || payload.sub;
    let user = await this.userRoleRepository.findOne({ where: { user_id: userId } });
    if (!user && payload.email) {
      user = await this.userRoleRepository.findOne({ where: { email_id: payload.email } });
    }
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const enriched = await this.enrichUserDetails(user);

    return {
      id: user.user_id,
      email: user.email_id,
      role: user.role_name,
      mustChangePassword: Boolean(user.must_change_password),
      ...enriched,
    };
  }
}
