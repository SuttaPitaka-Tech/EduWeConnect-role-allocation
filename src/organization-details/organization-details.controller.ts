import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { OrganizationDetailsService, UploadedMulterFile } from './organization-details.service';

@Controller(['organization-details', 'api/organization-details'])
export class OrganizationDetailsController {
  constructor(
    private readonly orgDetailsService: OrganizationDetailsService,
  ) {}

  @Post('register')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'panFile', maxCount: 1 },
      { name: 'gstFile', maxCount: 1 },
      { name: 'regCertFile', maxCount: 1 },
      { name: 'orgHeadAadharFile', maxCount: 1 },
    ]),
  )
  async register(
    @Body() body: any,
    @UploadedFiles()
    files: {
      panFile?: UploadedMulterFile[];
      gstFile?: UploadedMulterFile[];
      regCertFile?: UploadedMulterFile[];
      orgHeadAadharFile?: UploadedMulterFile[];
    },
  ) {
    return this.orgDetailsService.register(body, files || {});
  }

  @Get()
  async findAll() {
    return this.orgDetailsService.findAll();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.orgDetailsService.findById(id);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: 'pending' | 'approved' | 'rejected'; rejectionReason?: string },
  ) {
    return this.orgDetailsService.updateStatus(id, body.status, body.rejectionReason);
  }
}
