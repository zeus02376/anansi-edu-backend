import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { DecimalToNumberInterceptor } from './common/interceptors/decimal-to-number.interceptor';

/**
 * Configuration globale de l'application, partagée par main.ts et les
 * tests e2e pour qu'ils exercent exactement le même comportement.
 */
export function configureApp(app: INestApplication) {
  app.enableCors({ origin: ['http://localhost:5173'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(
    new PrismaExceptionFilter(app.get(HttpAdapterHost).httpAdapter),
  );
  app.useGlobalInterceptors(new DecimalToNumberInterceptor());
  return app;
}
