import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { OrganizationDetails } from '../../organization-details/entities/organization-details.entity';

export enum EmployeeType {
  TEACHER = 'Teacher',
  NON_STAFF = 'Non Staff',
  FINANCE = 'Finance',
}

@Entity('staff_details')
export class StaffDetails {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ── Correct Foreign Key Mapping with Organization Details ───────────────────
  @Column({ name: 'organization_id' })
  organization_id: string;

  @ManyToOne(() => OrganizationDetails, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationDetails;

  // ── Personal & Contact Credentials ──────────────────────────────────────────
  @Column({ name: 'employee_first_name' })
  employee_first_name: string;

  @Column({ name: 'employee_last_name', nullable: true })
  employee_last_name: string;

  @Column({ name: 'employee_email' })
  employee_email: string;

  @Column({ name: 'employee_mobile_number' })
  employee_mobile_number: string;

  // ── Identity & Statutory Verification Documents ────────────────────────────
  @Column({ name: 'employee_pan_number', nullable: true })
  employee_pan_number: string;

  @Column({ name: 'employee_pan_file_id', nullable: true })
  employee_pan_file_id: string;

  @Column({ name: 'employee_aadhar_number', nullable: true })
  employee_aadhar_number: string;

  @Column({ name: 'employee_aadhar_file_id', nullable: true })
  employee_aadhar_file_id: string;

  // ── Experience & Employment History ─────────────────────────────────────────
  @Column({ name: 'employee_experience', nullable: true })
  employee_experience: string;

  @Column({ name: 'employee_previous_work_institute_name', nullable: true })
  employee_previous_work_institute_name: string;

  @Column({ name: 'employee_experience_letter_file_id', nullable: true })
  employee_experience_letter_file_id: string;

  @Column({ name: 'employee_relieving_letter_file_id', nullable: true })
  employee_relieving_letter_file_id: string;

  // ── Dynamic Additional Documents JSON ───────────────────────────────────────
  @Column({ type: 'json', nullable: true, name: 'additional_documents' })
  additional_documents: Array<{
    docName: string;
    file_id?: string;
    file_name?: string;
  }>;

  // ── Employee Role & Subject Allocation ──────────────────────────────────────
  @Column({
    type: 'enum',
    enum: EmployeeType,
    name: 'employee_type',
  })
  employee_type: EmployeeType;

  @Column({ type: 'json', nullable: true, name: 'subjects' })
  subjects: string[];

  // ── Status & Record Tracking ────────────────────────────────────────────────
  @Column({ default: 'active' })
  status: string;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updated_at: Date;
}
