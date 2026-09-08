import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

export enum RoleName {
  SUPER_ADMIN = 'super_admin',
  ORGANIZATION = 'organization',
  STAFF = 'staff',
  STUDENTS = 'students',
  PARENTS = 'parents',
}

@Entity('user_roles')
export class UserRole {
  @PrimaryGeneratedColumn('uuid')
  user_id: string;

  @Column({
    type: 'enum',
    enum: RoleName,
  })
  role_name: RoleName;

  @Column()
  email_id: string;

  @Column()
  mobile_number: string;

  @Column()
  password?: string;

  @Column({ name: 'must_change_password', default: false })
  must_change_password: boolean;
}
