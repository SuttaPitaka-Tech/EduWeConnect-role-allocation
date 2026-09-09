import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaffDetails } from './entities/staff-details.entity';
import { OrganizationDetails } from '../organization-details/entities/organization-details.entity';
import { UserRole } from '../user-roles/entities/user-role.entity';
import { StaffDetailsService } from './staff-details.service';
import { StaffDetailsController } from './staff-details.controller';
import { MinioModule } from '../minio/minio.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StaffDetails, OrganizationDetails, UserRole]),
    MinioModule,
  ],
  controllers: [StaffDetailsController],
  providers: [StaffDetailsService],
  exports: [StaffDetailsService],
})
export class StaffDetailsModule {}
