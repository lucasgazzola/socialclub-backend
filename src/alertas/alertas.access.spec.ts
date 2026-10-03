import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { AlertasController } from './alertas.controller';
import { CronTokenGuard } from './cron-token.guard';

/**
 * US-26 · Control de acceso: las alertas las ven ADMIN y DELEGADO (los mismos
 * que gestionan la documentación); el envío programado solo entra con el token.
 */
describe('US-26 · AlertasController · control de acceso', () => {
  describe('GET /alertas/documentacion', () => {
    const guard = new RolesGuard(new Reflector());
    const contexto = (roles: string[]) =>
      ({
        getHandler: () => AlertasController.prototype.documentacion,
        getClass: () => AlertasController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { id: 1, email: 'x@club.test', roles } }),
        }),
      }) as unknown as ExecutionContext;

    it.each(['ADMIN', 'DELEGADO'])('permite a un %s', (rol) => {
      expect(guard.canActivate(contexto([rol]))).toBe(true);
    });

    it.each(['COLABORADOR', 'SOCIO'])('rechaza a un %s', (rol) => {
      expect(() => guard.canActivate(contexto([rol]))).toThrow(ForbiddenException);
    });
  });

  describe('POST /alertas/documentacion/notificar (CronTokenGuard)', () => {
    const SECRETO = 'un-secreto-de-prueba-largo';
    const guardCon = (token?: string) =>
      new CronTokenGuard({ get: () => token } as unknown as ConfigService);
    const contexto = (cabecera?: string) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({
            headers: cabecera === undefined ? {} : { 'x-cron-token': cabecera },
          }),
        }),
      }) as unknown as ExecutionContext;

    it('permite con el token correcto', () => {
      expect(guardCon(SECRETO).canActivate(contexto(SECRETO))).toBe(true);
    });

    it('rechaza un token incorrecto o ausente', () => {
      expect(() => guardCon(SECRETO).canActivate(contexto('otro'))).toThrow(UnauthorizedException);
      expect(() => guardCon(SECRETO).canActivate(contexto())).toThrow(UnauthorizedException);
    });

    it('queda cerrado si el entorno no configuró el token', () => {
      expect(() => guardCon(undefined).canActivate(contexto('lo-que-sea'))).toThrow(
        'El envío programado de alertas no está configurado',
      );
    });
  });
});
