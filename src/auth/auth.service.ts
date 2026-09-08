import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserRole, RoleName } from '../user-roles/entities/user-role.entity';
import { OrganizationDetails } from '../organization-details/entities/organization-details.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserRole)
    private userRoleRepository: Repository<UserRole>,
    @InjectRepository(OrganizationDetails)
    private orgDetailsRepository: Repository<OrganizationDetails>,
    private jwtService: JwtService,
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

  async login(data: any): Promise<any> {
    if (!data?.email || !data?.password) {
      throw new BadRequestException('Email and password are required');
    }
    let user = await this.userRoleRepository.findOne({ where: { email_id: data.email } });
    if (!user) {
      // Check if this is an approved organization whose user_roles entry needs provisioning
      const approvedOrg = await this.orgDetailsRepository.findOne({
        where: { organization_email: data.email, status: 'approved' },
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
      }
    }

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(data.password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    let organizationName: string | undefined;
    if (user.role_name === RoleName.ORGANIZATION) {
      const org = await this.orgDetailsRepository.findOne({
        where: { organization_email: user.email_id },
      });
      if (org) {
        organizationName = org.organization_name;
      }
    }
    
    const payload = {
      sub: user.user_id,
      email: user.email_id,
      role: user.role_name,
      organizationName,
      mustChangePassword: Boolean(user.must_change_password),
    };

    return {
      access_token: this.jwtService.sign(payload),
      mustChangePassword: Boolean(user.must_change_password),
      organizationName,
      user: {
        id: user.user_id,
        email: user.email_id,
        role: user.role_name,
        organizationName,
        mustChangePassword: Boolean(user.must_change_password),
      },
    };
  }

  async changePassword(data: { email: string; currentPassword: string; newPassword: string }): Promise<any> {
    if (!data.email || !data.currentPassword || !data.newPassword) {
      throw new BadRequestException('Email, current password, and new password are required');
    }

    let user = await this.userRoleRepository.findOne({ where: { email_id: data.email } });
    if (!user) {
      const approvedOrg = await this.orgDetailsRepository.findOne({
        where: { organization_email: data.email, status: 'approved' },
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
      }
    }

    if (!user || !user.password) {
      throw new UnauthorizedException('User not found');
    }

    const isMatch = await bcrypt.compare(data.currentPassword, user.password);
    if (!isMatch) {
      throw new BadRequestException('Current password does not match');
    }

    if (data.currentPassword === data.newPassword) {
      throw new BadRequestException('New password cannot be the same as your current password');
    }

    const hashedPassword = await bcrypt.hash(data.newPassword, 10);
    user.password = hashedPassword;
    user.must_change_password = false;
    await this.userRoleRepository.save(user);
    this.logger.log(`Password updated successfully for ${user.email_id}`);

    let organizationName: string | undefined;
    if (user.role_name === RoleName.ORGANIZATION) {
      const org = await this.orgDetailsRepository.findOne({
        where: { organization_email: user.email_id },
      });
      if (org) {
        organizationName = org.organization_name;
      }
    }

    const payload = {
      sub: user.user_id,
      email: user.email_id,
      role: user.role_name,
      organizationName,
      mustChangePassword: false,
    };

    return {
      message: 'Password changed successfully',
      access_token: this.jwtService.sign(payload),
      mustChangePassword: false,
      organizationName,
      user: {
        id: user.user_id,
        email: user.email_id,
        role: user.role_name,
        organizationName,
        mustChangePassword: false,
      },
    };
  }

  async getMe(payload: any): Promise<any> {
    const userId = payload.userId || payload.sub;
    const user = await this.userRoleRepository.findOne({ where: { user_id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    let organizationName: string | undefined;
    if (user.role_name === RoleName.ORGANIZATION) {
      const org = await this.orgDetailsRepository.findOne({
        where: { organization_email: user.email_id },
      });
      if (org) {
        organizationName = org.organization_name;
      }
    }

    return {
      id: user.user_id,
      email: user.email_id,
      role: user.role_name,
      organizationName,
      mustChangePassword: Boolean(user.must_change_password),
    };
  }
}
