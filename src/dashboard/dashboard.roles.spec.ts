import { Reflector } from '@nestjs/core';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { DashboardController } from './dashboard.controller';

/**
 * US-34 · Ver dashboard · Control de acceso basado en roles.
 * Acceso restringido exclusivamente a roles autorizados de gestión: ADMIN y COLABORADOR.
 * Los roles DELEGADO, SOCIO o usuarios sin roles deben ser rechazados.
 */
describe('US-34 · DashboardController · Control de acceso (RolesGuard)', () => {
  const guard = new RolesGuard(new Reflector());
  const handler = DashboardController.prototype.getMetricas;

  function contextoPara(roles: string[]): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => DashboardController,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 1, roles } }) }),
    } as unknown as ExecutionContext;
  }

  it.each(['ADMIN', 'COLABORADOR'])('permite el acceso al rol %s', (rol) => {
    expect(guard.canActivate(contextoPara([rol]))).toBe(true);
  });

  it.each(['DELEGADO', 'SOCIO'])('rechaza al rol %s con 403 Forbidden', (rol) => {
    expect(() => guard.canActivate(contextoPara([rol]))).toThrow(ForbiddenException);
  });

  it('rechaza a un usuario sin roles asignados con 403 Forbidden', () => {
    expect(() => guard.canActivate(contextoPara([]))).toThrow(ForbiddenException);
  });
});
