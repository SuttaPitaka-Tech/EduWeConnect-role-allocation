import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MenusController } from './menus.controller';
import { MenusService } from './menus.service';
import { Menu } from './entities/menu.entity';
import { MenuRole } from './entities/menu-role.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Menu, MenuRole])],
  controllers: [MenusController],
  providers: [MenusService],
  exports: [MenusService],
})
export class MenusModule {}
