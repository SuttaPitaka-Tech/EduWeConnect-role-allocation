import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Menu } from './entities/menu.entity';
import { MenuRole } from './entities/menu-role.entity';
import { RoleName } from '../user-roles/entities/user-role.entity';

@Injectable()
export class MenusService implements OnModuleInit {
  private readonly logger = new Logger(MenusService.name);

  constructor(
    @InjectRepository(Menu)
    private readonly menuRepository: Repository<Menu>,
    @InjectRepository(MenuRole)
    private readonly menuRoleRepository: Repository<MenuRole>,
  ) {}

  async onModuleInit() {
    await this.seedMenus();
  }

  private async seedMenus() {
    const menusToSeed = [
      { name: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard', sort_order: 1 },
      { name: 'Chats', path: '/chat', icon: 'MessageSquare', sort_order: 2 },
      { name: 'Create Users', path: '/create-users', icon: 'UserPlus', sort_order: 3 },
      { name: 'Attendance and Calendar', path: '/calendar', icon: 'Calendar', sort_order: 4 },
      { name: 'Time Table', path: '/timetable', icon: 'Clock', sort_order: 5 },
      { name: 'Attendance', path: '/attendance', icon: 'CheckSquare', sort_order: 6 },
      { name: 'Notes', path: '/notes', icon: 'FileText', sort_order: 7 },
      { name: 'Chat', path: '/chat', icon: 'MessageSquare', sort_order: 8 },
    ];

    for (const item of menusToSeed) {
      const exists = await this.menuRepository.findOne({ where: { name: item.name } });
      if (!exists) {
        await this.menuRepository.save(this.menuRepository.create(item));
      }
    }
    this.logger.log('Menus seeded successfully');
  }

  getMenuSchema() {
    return [
      {
        role: 'Organization',
        modules: ['Dashboard', 'Chats', 'Create Users', 'Attendance and Calendar']
      },
      {
        role: 'Staff / Teachers',
        modules: ['Dashboard', 'Attendance and Calendar', 'Chat']
      },
      {
        role: 'Students',
        modules: ['Dashboard', 'Time Table', 'Attendance', 'Notes', 'Attendance and Calendar', 'Chats']
      }
    ];
  }

  async getPermissionsForOrganization(organizationId: string) {
    const permissions = await this.menuRoleRepository.find({
      where: { organization_id: organizationId },
      relations: { menu: true }
    });

    // Format them into a key-value pair of `${roleName}-${menuName}`
    const result: Record<string, boolean> = {};
    for (const perm of permissions) {
      if (perm.menu) {
        // Map RoleName to the UI group name
        let roleGroup = '';
        if (perm.role_name === RoleName.ORGANIZATION) roleGroup = 'Organization';
        if (perm.role_name === RoleName.STAFF) roleGroup = 'Staff / Teachers';
        if (perm.role_name === RoleName.STUDENTS) roleGroup = 'Students';
        
        if (roleGroup) {
          result[`${roleGroup}-${perm.menu.name}`] = true;
        }
      }
    }
    return result;
  }

  async updatePermissionsForOrganization(organizationId: string, permissions: Record<string, boolean>) {
    // 1. Clear existing for org
    await this.menuRoleRepository.delete({ organization_id: organizationId });

    // 2. Fetch all menus
    const menus = await this.menuRepository.find();

    // 3. Build new permissions array
    const newRoles: MenuRole[] = [];
    
    for (const [key, isEnabled] of Object.entries(permissions)) {
      if (isEnabled) {
        const [roleGroup, menuName] = key.split('-');
        
        let roleEnum: RoleName;
        if (roleGroup === 'Organization') roleEnum = RoleName.ORGANIZATION;
        else if (roleGroup === 'Staff / Teachers') roleEnum = RoleName.STAFF;
        else if (roleGroup === 'Students') roleEnum = RoleName.STUDENTS;
        else continue;

        const menu = menus.find(m => m.name === menuName);
        if (menu) {
          const role = this.menuRoleRepository.create({
            organization_id: organizationId,
            role_name: roleEnum,
            menu_id: menu.id
          });
          newRoles.push(role);
        }
      }
    }

    if (newRoles.length > 0) {
      await this.menuRoleRepository.save(newRoles);
    }
    
    return { success: true };
  }
}
