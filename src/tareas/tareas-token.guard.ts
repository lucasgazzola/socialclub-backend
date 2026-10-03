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

export const CABECERA_TAREAS = 'x-tareas-token';

function huella(valor: string): Buffer {
  return createHash('sha256').update(valor).digest();
}

/**
 * Autoriza las ejecuciones programadas (DT-22): el workflow de GitHub Actions
 * llama sin sesión, con el secreto `TAREAS_TOKEN` en la cabecera
 * `x-tareas-token`. Acepta también `ALERTAS_CRON_TOKEN` y `x-cron-token`
 * (nombres de US-26) para no romper un entorno ya configurado.
 * Sin secreto configurado, el disparador queda cerrado.
 */
@Injectable()
export class TareasTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const esperado =
      this.config.get<string>('TAREAS_TOKEN') ?? this.config.get<string>('ALERTAS_CRON_TOKEN');
    if (!esperado) {
      throw new ForbiddenException('La ejecución programada de tareas no está configurada');
    }
    const cabeceras = context.switchToHttp().getRequest<Request>().headers;
    const recibido = cabeceras[CABECERA_TAREAS] ?? cabeceras['x-cron-token'];
    if (typeof recibido !== 'string' || !timingSafeEqual(huella(recibido), huella(esperado))) {
      throw new UnauthorizedException('Token de tareas automáticas inválido');
    }
    return true;
  }
}
