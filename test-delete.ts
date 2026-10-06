import { DataSource } from 'typeorm';
import { Menu } from './src/menus/entities/menu.entity';
import { MenuRole } from './src/menus/entities/menu-role.entity';

const ds = new DataSource({
  type: 'mysql',
  host: '127.0.0.1',
  port: 3306,
  username: 'root',
  password: 'Punith@1234',
  database: 'role-allocation-service',
  entities: [Menu, MenuRole]
});

async function run() {
  await ds.initialize();
  const repo = ds.getRepository(MenuRole);
  
  // Try deleting
  const result = await repo.delete({ organization_id: '5b0dd20f-4917-477d-a6b6-36339635ddf7' });
  console.log('Delete result:', result);
  
  process.exit(0);
}
run().catch(console.error);
