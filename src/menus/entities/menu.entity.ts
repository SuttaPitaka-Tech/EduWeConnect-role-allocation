import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import type { MenuRole } from './menu-role.entity';

@Entity('menus')
export class Menu {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  path: string;

  @Column()
  icon: string;

  @Column({ default: 0 })
  sort_order: number;

  @OneToMany('MenuRole', (menuRole: MenuRole) => menuRole.menu)
  menuRoles: MenuRole[];
}
