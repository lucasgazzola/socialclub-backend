import { Reflector } from '@nestjs/core';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { CuotaSocialController } from './cuota-social.controller';

/**
 * US-16 · Configurar la cuota social es exclusivo de ADMIN; consultarla
 * también la puede ver COLABORADOR.
 */
describe('US-16 · CuotaSocialController · control de acceso', () => {
  const guard = new RolesGuard(new Reflector());

  function contextoPara(handler: unknown, roles: string[]): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => CuotaSocialController,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 7, roles } }) }),
    } as unknown as ExecutionContext;
  }

  const soloAdmin = {
    'POST /cuota-social': CuotaSocialController.prototype.configurar,
    'POST /cuota-social/sincronizar': CuotaSocialController.prototype.sincronizar,
    'PATCH /cuota-social/:id': CuotaSocialController.prototype.actualizar,
  };

  const adminYColaborador = {
    'GET /cuota-social': CuotaSocialController.prototype.findAll,
    'GET /cuota-social/:id': CuotaSocialController.prototype.findOne,
    'GET /cuota-social/vigente': CuotaSocialController.prototype.getVigentes,
    'GET /cuota-social/vigente/:categoriaId': CuotaSocialController.prototype.getVigente,
  };

  describe.each(Object.entries(soloAdmin))('%s (solo ADMIN)', (_ruta, handler) => {
    it('rechaza a un COLABORADOR', () => {
      expect(() => guard.canActivate(contextoPara(handler, ['COLABORADOR']))).toThrow(
        ForbiddenException,
      );
    });

    it('rechaza a un SOCIO', () => {
      expect(() => guard.canActivate(contextoPara(handler, ['SOCIO']))).toThrow(ForbiddenException);
    });

    it('permite a un ADMIN', () => {
      expect(guard.canActivate(contextoPara(handler, ['ADMIN']))).toBe(true);
    });
  });

  describe.each(Object.entries(adminYColaborador))('%s (ADMIN y COLABORADOR)', (_ruta, handler) => {
    it('rechaza a un SOCIO', () => {
      expect(() => guard.canActivate(contextoPara(handler, ['SOCIO']))).toThrow(ForbiddenException);
    });

    it('permite a un COLABORADOR', () => {
      expect(guard.canActivate(contextoPara(handler, ['COLABORADOR']))).toBe(true);
    });
  });

  it('ningún endpoint queda sin roles declarados', () => {
    const reflector = new Reflector();
    const todos = { ...soloAdmin, ...adminYColaborador };

    const sinRoles = Object.entries(todos)
      .filter(
        ([, handler]) =>
          !reflector.getAllAndOverride<string[]>('roles', [handler, CuotaSocialController]),
      )
      .map(([ruta]) => ruta);

    expect(sinRoles).toEqual([]);
  });
});
