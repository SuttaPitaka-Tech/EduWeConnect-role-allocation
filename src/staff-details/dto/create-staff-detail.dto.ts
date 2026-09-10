import { EmployeeType } from '../entities/staff-details.entity';

export class CreateStaffDetailDto {
  organization_id: string;
  employee_first_name: string;
  employee_last_name?: string;
  employee_email: string;
  employee_mobile_number: string;

  employee_pan_number?: string;
  employee_pan_file_id?: string;

  employee_aadhar_number?: string;
  employee_aadhar_file_id?: string;

  employee_experience?: string;
  employee_previous_work_institute_name?: string;
  employee_experience_letter_file_id?: string;
  employee_relieving_letter_file_id?: string;

  additional_documents?: Array<{
    docName: string;
    file_id?: string;
    file_name?: string;
  }>;

  staff_address?: {
    current_address?: string;
    permanent_address?: string;
    state?: string;
    country?: string;
    pincode?: string;
  };

  employee_type: EmployeeType;
  subjects?: string[];
  status?: string;
}
