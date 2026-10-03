import { Reflector } from '@nestjs/core';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { AlertasController } from './alertas.controller';

/**
 * US-26 · Control de acceso: las alertas las ven ADMIN y DELEGADO (los mismos
 * que gestionan la documentación). El envío programado es una tarea automática
 * (ver `tareas/tareas.access.spec.ts`).
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
});
