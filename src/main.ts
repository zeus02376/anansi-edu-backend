import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: ['http://localhost:5173'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ANANSI EdTech API')
    .setDescription('API de gestion académique pour universités africaines')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth')
    .addTag('tenants')
    .addTag('ecoles')
    .addTag('filieres')
    .addTag('niveaux')
    .addTag('annees-academiques')
    .addTag('matieres')
    .addTag('enseignants')
    .addTag('etudiants')
    .addTag('candidatures')
    .addTag('inscriptions')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
