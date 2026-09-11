import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: true,
    credentials: true,
  });
  const port = process.env.PORT ?? 7002;
  await app.listen(port);
  Logger.log(`🚀 EduWeConnect Role Allocation service is running on: http://localhost:${port}`);
}
void bootstrap();
