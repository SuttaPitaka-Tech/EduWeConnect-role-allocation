import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationDetails } from './entities/organization-details.entity';
import { OrganizationDetailsService } from './organization-details.service';
import { OrganizationDetailsController } from './organization-details.controller';
import { MinioModule } from '../minio/minio.module';
import { UserRole } from '../user-roles/entities/user-role.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrganizationDetails, UserRole]),
    MinioModule,
  ],
  controllers: [OrganizationDetailsController],
  providers: [OrganizationDetailsService],
  exports: [OrganizationDetailsService],
})
export class OrganizationDetailsModule {}
