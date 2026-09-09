import { Controller, Post, Get, Req, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MinioService } from './minio.service';

interface MulterFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@Controller(['files', 'api/files', 'minio', 'api/minio'])
export class MinioController {
  constructor(private readonly minioService: MinioService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: MulterFile) {
    if (!file) {
      return { error: 'No file provided' };
    }
    
    const fileName = `${Date.now()}-${file.originalname}`;
    await this.minioService.uploadFile(file.buffer, fileName, file.mimetype);
    
    return {
      message: 'File uploaded successfully',
      fileName: fileName,
    };
  }

  @Get(['download', 'download/*'])
  async getFileUrl(
    @Req() req: any,
    @Query('fileName') queryFileName?: string,
    @Query('bucket') bucket?: string,
  ) {
    let fileName = queryFileName;
    if (!fileName && req.params && req.params[0]) {
      fileName = req.params[0];
    }
    if (!fileName) {
      const match = req.url.match(/download\/(.+?)(\?|$)/);
      if (match) {
        fileName = decodeURIComponent(match[1]);
      }
    }
    if (!fileName) {
      return { error: 'fileName is required' };
    }

    const isOrgDoc =
      fileName.startsWith('pan_') ||
      fileName.startsWith('gst_') ||
      fileName.startsWith('reg_cert_') ||
      fileName.startsWith('aadhar_') ||
      fileName.startsWith('staff-details/') ||
      fileName.startsWith('staff_');
    const targetBucket = bucket || (isOrgDoc ? 'organization-details' : undefined);
    const url = await this.minioService.getFileUrl(fileName, targetBucket);
    return { url };
  }
}
