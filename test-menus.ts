import { DataSource } from 'typeorm';
import { Menu } from './src/menus/entities/menu.entity';
import { MenuRole } from './src/menus/entities/menu-role.entity';
const ds = new DataSource({
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  username: 'root',
  password: 'password', // check if password is correct
  database: 'eduweconnect_role_allocation',
  entities: [Menu, MenuRole]
});
ds.initialize().then(async () => {
  const menus = await ds.getRepository(Menu).find();
  console.log('Menus:', menus);
  process.exit(0);
}).catch(console.error);
