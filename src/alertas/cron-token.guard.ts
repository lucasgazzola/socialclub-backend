import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

export const CABECERA_CRON = 'x-cron-token';

function huella(valor: string): Buffer {
  return createHash('sha256').update(valor).digest();
}

/**
 * Autoriza las tareas programadas (US-26): el workflow de GitHub Actions llama
 * sin sesión, con el secreto `ALERTAS_CRON_TOKEN` en la cabecera `x-cron-token`.
 * Sin el secreto configurado el endpoint queda cerrado.
 */
@Injectable()
export class CronTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const esperado = this.config.get<string>('ALERTAS_CRON_TOKEN');
    if (!esperado) {
      throw new ForbiddenException('El envío programado de alertas no está configurado');
    }
    const recibido = context.switchToHttp().getRequest<Request>().headers[CABECERA_CRON];
    if (typeof recibido !== 'string' || !timingSafeEqual(huella(recibido), huella(esperado))) {
      throw new UnauthorizedException('Token de tarea programada inválido');
    }
    return true;
  }
}
