import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const config = app.get(ConfigService);
  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  const corsOrigin = config.get<string>('CORS_ORIGIN', 'http://localhost:5173');
  const port = config.get<number>('PORT', 3000);

  // Seguridad y parsing
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: corsOrigin.split(',').map((o) => o.trim()),
    credentials: true, // permite enviar la cookie httpOnly del JWT
  });

  // Prefijo y versionado: todas las rutas quedan bajo /api/v1
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Validación automática de DTOs en todas las rutas
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // elimina propiedades no declaradas en el DTO
      forbidNonWhitelisted: true, // rechaza propiedades desconocidas
      transform: true, // transforma payloads a instancias tipadas
    }),
  );

  // Formato de error consistente para toda la API
  app.useGlobalFilters(new HttpExceptionFilter());

  // Documentación Swagger: visible en todos los entornos salvo producción (main).
  // Por defecto se muestra fuera de 'production'. `SWAGGER_ENABLED` permite forzarlo
  // independientemente de NODE_ENV: el entorno test corre con NODE_ENV=production
  // (por la cookie `Secure` cross-site) pero igual expone Swagger con SWAGGER_ENABLED=true.
  const swaggerEnabled =
    (config.get<string>('SWAGGER_ENABLED') ?? (nodeEnv !== 'production' ? 'true' : 'false')) === 'true';
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('SocialClub API')
      .setDescription('API REST del sistema SocialClub')
      .setVersion('1.0')
      .addCookieAuth('access_token')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(port, '0.0.0.0');
  Logger.log(`SocialClub API escuchando en http://localhost:${port}/api/v1`, 'Bootstrap');
}

void bootstrap();
