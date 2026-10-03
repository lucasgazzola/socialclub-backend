import { plainToInstance, Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, MinLength, validateSync } from 'class-validator';

/**
 * Valida las variables de entorno al arrancar la aplicación. Si falta alguna
 * variable crítica o tiene un valor inválido, el proceso falla de inmediato
 * con un mensaje claro, en lugar de romperse en runtime más adelante.
 */
export enum Entorno {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Entorno)
  @IsOptional()
  NODE_ENV: Entorno = Entorno.Development;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  PORT = 3000;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  @MinLength(16, { message: 'JWT_SECRET debe tener al menos 16 caracteres.' })
  JWT_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN = '8h';

  @IsString()
  @IsOptional()
  CORS_ORIGIN = 'http://localhost:5173';

  // ── Emails (US-26). Sin SMTP_HOST no se envía nada (solo se registra en el log).
  @IsString()
  @IsOptional()
  SMTP_HOST?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  SMTP_PORT?: number;

  @IsString()
  @IsOptional()
  SMTP_USER?: string;

  @IsString()
  @IsOptional()
  SMTP_PASS?: string;

  @IsString()
  @IsOptional()
  MAIL_FROM?: string;

  /** URL del frontend, para el enlace de los emails. */
  @IsString()
  @IsOptional()
  APP_URL?: string;

  /** Secreto con el que la tarea programada llama a /alertas/documentacion/notificar. */
  @IsString()
  @MinLength(16, { message: 'ALERTAS_CRON_TOKEN debe tener al menos 16 caracteres.' })
  @IsOptional()
  ALERTAS_CRON_TOKEN?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    const detalle = errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('\n  - ');
    throw new Error(`Configuración de entorno inválida:\n  - ${detalle}`);
  }

  return validatedConfig;
}
