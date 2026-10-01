import { Reflector } from '@nestjs/core';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { PagosController } from './pagos.controller';

/**
 * US-17 · Cobrar cuota social de un socio por secretaría es accesible para ADMIN y COLABORADOR;
 * rechaza con 403 a usuarios con solo rol SOCIO o DELEGADO.
 * US-10 · Mis cuotas es accesible para SOCIO, ADMIN y COLABORADOR.
 */
describe('US-17 & US-10 · PagosController · control de acceso', () => {
  const guard = new RolesGuard(new Reflector());

  function contextoPara(handler: unknown, roles: string[]): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => PagosController,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 7, roles } }) }),
    } as unknown as ExecutionContext;
  }

  const adminYColaborador = {
    'GET /pagos/socio/:id/cuotas-pendientes': PagosController.prototype.getCuotasPendientesSocio,
    'POST /pagos/socio/:id': PagosController.prototype.registrarPagoSocio,
    'GET /pagos/socio/:id/historial': PagosController.prototype.getHistorialSocio,
  };

  const socioYAdmin = {
    'GET /pagos/mis-cuotas': PagosController.prototype.getMisCuotas,
    'POST /pagos/registrar': PagosController.prototype.registrarPago,
    'GET /pagos/historial': PagosController.prototype.getHistorial,
  };

  describe.each(Object.entries(adminYColaborador))('%s (ADMIN y COLABORADOR)', (_ruta, handler) => {
    it('rechaza a un usuario con solo rol SOCIO con 403', () => {
      expect(() => guard.canActivate(contextoPara(handler, ['SOCIO']))).toThrow(ForbiddenException);
    });

    it('rechaza a un usuario con solo rol DELEGADO con 403', () => {
      expect(() => guard.canActivate(contextoPara(handler, ['DELEGADO']))).toThrow(
        ForbiddenException,
      );
    });

    it('permite el acceso a un COLABORADOR', () => {
      expect(guard.canActivate(contextoPara(handler, ['COLABORADOR']))).toBe(true);
    });

    it('permite el acceso a un ADMIN', () => {
      expect(guard.canActivate(contextoPara(handler, ['ADMIN']))).toBe(true);
    });
  });

  describe.each(Object.entries(socioYAdmin))(
    '%s (SOCIO, ADMIN y COLABORADOR)',
    (_ruta, handler) => {
      it('permite el acceso a un SOCIO', () => {
        expect(guard.canActivate(contextoPara(handler, ['SOCIO']))).toBe(true);
      });

      it('permite el acceso a un ADMIN', () => {
        expect(guard.canActivate(contextoPara(handler, ['ADMIN']))).toBe(true);
      });

      it('permite el acceso a un COLABORADOR', () => {
        expect(guard.canActivate(contextoPara(handler, ['COLABORADOR']))).toBe(true);
      });

      it('rechaza a un DELEGADO sin otros roles', () => {
        expect(() => guard.canActivate(contextoPara(handler, ['DELEGADO']))).toThrow(
          ForbiddenException,
        );
      });
    },
  );

  it('ningún endpoint queda sin roles declarados', () => {
    const reflector = new Reflector();
    const todos = { ...adminYColaborador, ...socioYAdmin };

    const sinRoles = Object.entries(todos)
      .filter(
        ([, handler]) =>
          !reflector.getAllAndOverride<string[]>('roles', [handler, PagosController]),
      )
      .map(([ruta]) => ruta);

    expect(sinRoles).toEqual([]);
  });
});
