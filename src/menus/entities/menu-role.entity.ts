import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import type { Menu } from './menu.entity';
import { RoleName } from '../../user-roles/entities/user-role.entity';

@Entity('menu_roles')
@Unique(['organization_id', 'role_name', 'menu_id'])
export class MenuRole {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'enum',
    enum: RoleName,
  })
  role_name: RoleName;

  @Column({ type: 'uuid' })
  organization_id: string;

  @Column()
  menu_id: number;

  @ManyToOne('Menu', (menu: Menu) => menu.menuRoles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'menu_id' })
  menu: Menu;
}
