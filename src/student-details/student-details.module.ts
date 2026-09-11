import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentDetails } from './entities/student-details.entity';
import { OrganizationDetails } from '../organization-details/entities/organization-details.entity';
import { MinioModule } from '../minio/minio.module';
import { UserRole } from '../user-roles/entities/user-role.entity';
import { StudentDetailsService } from './student-details.service';
import { StudentDetailsController } from './student-details.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([StudentDetails, OrganizationDetails, UserRole]),
    MinioModule,
  ],
  controllers: [StudentDetailsController],
  providers: [StudentDetailsService],
  exports: [StudentDetailsService],
})
export class StudentDetailsModule {}
