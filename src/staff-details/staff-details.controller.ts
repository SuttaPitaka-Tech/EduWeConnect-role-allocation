import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { StaffDetailsService, UploadedMulterFile } from './staff-details.service';
import { UpdateStaffDetailDto } from './dto/update-staff-detail.dto';

@Controller(['staff-details', 'api/staff-details'])
export class StaffDetailsController {
  constructor(private readonly staffService: StaffDetailsService) {}

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'panFile', maxCount: 1 },
      { name: 'aadharFile', maxCount: 1 },
      { name: 'expLetterFile', maxCount: 1 },
      { name: 'relievingLetterFile', maxCount: 1 },
      { name: 'additionalFiles', maxCount: 5 },
    ]),
  )
  async createStaff(
    @Body() body: any,
    @UploadedFiles()
    files: {
      panFile?: UploadedMulterFile[];
      aadharFile?: UploadedMulterFile[];
      expLetterFile?: UploadedMulterFile[];
      relievingLetterFile?: UploadedMulterFile[];
      additionalFiles?: UploadedMulterFile[];
    },
  ) {
    return this.staffService.createStaff(body, files || {});
  }

  @Get()
  async findAll(@Query('organization_id') organizationId?: string) {
    return this.staffService.findAll(organizationId);
  }

  @Get('organization/:organizationId')
  async findByOrganization(@Param('organizationId') organizationId: string) {
    return this.staffService.findByOrganization(organizationId);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.staffService.findById(id);
  }

  @Patch(':id')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'panFile', maxCount: 1 },
      { name: 'aadharFile', maxCount: 1 },
      { name: 'expLetterFile', maxCount: 1 },
      { name: 'relievingLetterFile', maxCount: 1 },
      { name: 'additionalFiles', maxCount: 5 },
    ]),
  )
  async update(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFiles()
    files: {
      panFile?: UploadedMulterFile[];
      aadharFile?: UploadedMulterFile[];
      expLetterFile?: UploadedMulterFile[];
      relievingLetterFile?: UploadedMulterFile[];
      additionalFiles?: UploadedMulterFile[];
    },
  ) {
    return this.staffService.updateStaff(id, body, files || {});
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.staffService.remove(id);
  }
}
