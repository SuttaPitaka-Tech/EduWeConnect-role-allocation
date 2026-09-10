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

@Entity('student_details')
export class StudentDetails {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ── Organization Association ──────────────────────────────────────────────
  @Column({ name: 'organization_id' })
  organization_id: string;

  @ManyToOne(() => OrganizationDetails, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationDetails;

  // ── Standard / Grade Association ──────────────────────────────────────────
  @Column({ name: 'standard' })
  standard: string;

  // ── Unique 4-Digit Roll Number scoped to Standard & Alphabetical Name ──────
  @Column({ name: 'roll_number', nullable: true })
  roll_number: string;

  // ── Student Identity & Personal Information ───────────────────────────────
  @Column({ name: 'student_name' })
  student_name: string;

  @Column({ name: 'student_aadhar_number', nullable: true })
  student_aadhar_number: string;

  @Column({ name: 'student_aadhar_file_id', nullable: true })
  student_aadhar_file_id: string;

  @Column({ name: 'contact_mobile', nullable: true })
  contact_mobile: string;

  @Column({ name: 'contact_email', nullable: true })
  contact_email: string;

  // ── Parent & Guardian Particulars ─────────────────────────────────────────
  @Column({ name: 'father_name', nullable: true })
  father_name: string;

  @Column({ name: 'mother_name', nullable: true })
  mother_name: string;

  @Column({ name: 'father_mobile', nullable: true })
  father_mobile: string;

  @Column({ name: 'mother_mobile', nullable: true })
  mother_mobile: string;

  @Column({ name: 'father_email', nullable: true })
  father_email: string;

  @Column({ name: 'mother_email', nullable: true })
  mother_email: string;

  // ── Residential & Address Details ─────────────────────────────────────────
  @Column({ name: 'country', nullable: true, default: 'India' })
  country: string;

  @Column({ name: 'state', nullable: true })
  state: string;

  @Column({ name: 'district', nullable: true })
  district: string;

  @Column({ type: 'text', name: 'current_address', nullable: true })
  current_address: string;

  @Column({ type: 'text', name: 'permanent_address', nullable: true })
  permanent_address: string;

  // ── Emergency Contact Information ─────────────────────────────────────────
  @Column({ name: 'emergency_person_name', nullable: true })
  emergency_person_name: string;

  @Column({ name: 'emergency_person_mobile', nullable: true })
  emergency_person_mobile: string;

  @Column({ name: 'emergency_person_relation', nullable: true })
  emergency_person_relation: string;

  // ── Status & Audit ────────────────────────────────────────────────────────
  @Column({ default: 'active' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
