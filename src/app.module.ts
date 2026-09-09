import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { MinioModule } from './minio/minio.module';
import { AuthModule } from './auth/auth.module';
import { UserRolesModule } from './user-roles/user-roles.module';
import { OrganizationDetailsModule } from './organization-details/organization-details.module';
import { StaffDetailsModule } from './staff-details/staff-details.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'environment/.env.local',
    }),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT as string, 10),
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: true, // Auto-create tables for dev
    }),
    MinioModule,
    AuthModule,
    UserRolesModule,
    OrganizationDetailsModule,
    StaffDetailsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
