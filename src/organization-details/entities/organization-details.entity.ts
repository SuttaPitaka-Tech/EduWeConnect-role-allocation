import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('organization-details')
export class OrganizationDetails {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_name' })
  organization_name: string;

  @Column({ name: 'organization_email' })
  organization_email: string;

  @Column({ name: 'organization_mobile' })
  organization_mobile: string;

  @Column({ name: 'organization_type' })
  organization_type: string;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  district: string;

  @Column({ nullable: true })
  state: string;

  @Column({ nullable: true })
  pincode: string;

  @Column({ nullable: true })
  country: string;

  // Statutory Compliance Document Details
  @Column({ name: 'pan_number', nullable: true })
  pan_number: string;

  @Column({ name: 'pan_file_id', nullable: true })
  pan_file_id: string;

  @Column({ name: 'gst_number', nullable: true })
  gst_number: string;

  @Column({ name: 'gst_file_id', nullable: true })
  gst_file_id: string;

  @Column({ name: 'reg_cert_number', nullable: true })
  reg_cert_number: string;

  @Column({ name: 'reg_cert_file_id', nullable: true })
  reg_cert_file_id: string;

  // Head of Organization Details
  @Column({ name: 'head_first_name', nullable: true })
  head_first_name: string;

  @Column({ name: 'head_middle_name', nullable: true })
  head_middle_name: string;

  @Column({ name: 'head_last_name', nullable: true })
  head_last_name: string;

  @Column({ name: 'head_email', nullable: true })
  head_email: string;

  @Column({ name: 'head_mobile', nullable: true })
  head_mobile: string;

  @Column({ name: 'head_aadhar_number', nullable: true })
  head_aadhar_number: string;

  @Column({ name: 'head_aadhar_file_id', nullable: true })
  head_aadhar_file_id: string;

  @Column({ default: 'pending' })
  status: string; // 'pending' | 'approved' | 'rejected'

  @Column({ type: 'text', nullable: true, name: 'rejection_reason' })
  rejection_reason?: string;

  @Column({ type: 'timestamp', nullable: true, name: 'reviewed_at' })
  reviewed_at?: Date;

  // Date and Time tracking columns
  @CreateDateColumn({ type: 'timestamp', name: 'registered_at' })
  registered_at: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    name: 'uploaded_at',
  })
  uploaded_at: Date;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updated_at: Date;
}
