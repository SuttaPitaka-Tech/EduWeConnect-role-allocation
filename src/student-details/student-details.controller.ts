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
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StudentDetailsService, UploadedMulterFile } from './student-details.service';

@Controller(['student-details', 'api/student-details'])
export class StudentDetailsController {
  constructor(private readonly studentService: StudentDetailsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('aadharFile'))
  async createStudent(
    @Body() body: any,
    @UploadedFile() aadharFile?: UploadedMulterFile,
  ) {
    return this.studentService.createStudent(body, aadharFile);
  }

  @Get()
  async findAll(
    @Query('organization_id') organizationId?: string,
    @Query('standard') standard?: string,
  ) {
    return this.studentService.findAll(organizationId, standard);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.studentService.findById(id);
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('aadharFile'))
  async update(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFile() aadharFile?: UploadedMulterFile,
  ) {
    return this.studentService.updateStudent(id, body, aadharFile);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.studentService.remove(id);
  }
}
