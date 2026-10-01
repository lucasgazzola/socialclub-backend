import { Reflector } from '@nestjs/core';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditoriaController } from './auditoria.controller';

/**
 * US-32 · El log de operaciones es exclusivo de ADMIN: expone quién hizo qué
 * en todo el sistema, así que no puede quedar al alcance de otros roles.
 */
describe('US-32 · AuditoriaController · control de acceso', () => {
  const guard = new RolesGuard(new Reflector());

  function contextoPara(roles: string[]): ExecutionContext {
    return {
      getHandler: () => AuditoriaController.prototype.findAll,
      getClass: () => AuditoriaController,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 7, roles } }) }),
    } as unknown as ExecutionContext;
  }

  it.each([['SOCIO'], ['COLABORADOR'], ['DELEGADO']])('rechaza a un %s', (rol) => {
    expect(() => guard.canActivate(contextoPara([rol]))).toThrow(ForbiddenException);
  });

  it('permite a un ADMIN', () => {
    expect(guard.canActivate(contextoPara(['ADMIN']))).toBe(true);
  });
});
