import { Reflector } from '@nestjs/core';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { PagosDeportivosController } from './pagos-deportivos.controller';

/**
 * US-21 · El registro de pagos de cuota deportiva (secretaría) es accesible para
 * ADMIN y COLABORADOR; rechaza con 403 a usuarios con solo rol SOCIO o DELEGADO.
 */
describe('US-21 · PagosDeportivosController · control de acceso', () => {
  const guard = new RolesGuard(new Reflector());

  function contextoPara(handler: unknown, roles: string[]): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => PagosDeportivosController,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 7, roles } }) }),
    } as unknown as ExecutionContext;
  }

  const endpoints = {
    'GET /pagos-deportivos/morosos (US-23)': PagosDeportivosController.prototype.getMorosos,
    'GET /pagos-deportivos/persona/:id/pendientes':
      PagosDeportivosController.prototype.getPendientes,
    'POST /pagos-deportivos/persona/:id': PagosDeportivosController.prototype.registrarPago,
    'GET /pagos-deportivos/persona/:id/historial': PagosDeportivosController.prototype.getHistorial,
  };

  describe.each(Object.entries(endpoints))('%s (ADMIN y COLABORADOR)', (_ruta, handler) => {
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

  it('ningún endpoint queda sin roles declarados', () => {
    const reflector = new Reflector();
    const sinRoles = Object.entries(endpoints)
      .filter(
        ([, handler]) =>
          !reflector.getAllAndOverride<string[]>('roles', [handler, PagosDeportivosController]),
      )
      .map(([ruta]) => ruta);
    expect(sinRoles).toEqual([]);
  });
});
