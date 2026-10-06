import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { MenusService } from './menus.service';

@Controller(['menus', 'api/menus'])
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  @Get('schema')
  getMenuSchema() {
    return this.menusService.getMenuSchema();
  }

  @Get('permissions/:organizationId')
  getPermissions(@Param('organizationId') organizationId: string) {
    return this.menusService.getPermissionsForOrganization(organizationId);
  }

  @Post('permissions/:organizationId')
  updatePermissions(
    @Param('organizationId') organizationId: string,
    @Body() permissions: Record<string, boolean>,
  ) {
    console.log(`[MenusController] Updating permissions for ${organizationId}:`, permissions);
    return this.menusService.updatePermissionsForOrganization(organizationId, permissions);
  }
}
