import { Controller, Post, Get, Param, UploadedFile, UseInterceptors, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MinioService } from './minio.service';
import { Response } from 'express';

interface MulterFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@Controller('files')
export class MinioController {
  constructor(private readonly minioService: MinioService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: MulterFile) {
    if (!file) {
      return { error: 'No file provided' };
    }
    
    // Use a unique name for the file, e.g., prepending a timestamp
    const fileName = `${Date.now()}-${file.originalname}`;
    await this.minioService.uploadFile(file.buffer, fileName, file.mimetype);
    
    return {
      message: 'File uploaded successfully',
      fileName: fileName,
    };
  }

  @Get('download/:fileName')
  async getFileUrl(@Param('fileName') fileName: string) {
    const url = await this.minioService.getFileUrl(fileName);
    return { url };
  }
}
