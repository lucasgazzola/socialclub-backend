import { Reflector } from '@nestjs/core';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { ReservasController } from './reservas.controller';

/**
 * US-60 · US-61 — La bandeja y las acciones de la administración son de ADMIN
 * y COLABORADOR. US-62 — «Mis Reservas», la cancelación propia y el pago de
 * la seña son de cualquier usuario con sesión (el servicio controla que la
 * reserva sea suya).
 */
describe('TC-280 · US-60/61/62 · ReservasController · control de acceso', () => {
  const guard = new RolesGuard(new Reflector());
  const P = ReservasController.prototype;

  const contextoPara = (handler: unknown, roles: string[]) =>
    ({
      getHandler: () => handler,
      getClass: () => ReservasController,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 7, roles } }) }),
    }) as unknown as ExecutionContext;

  const administracion = {
    'GET /reservas/solicitudes': P.listarSolicitudes,
    'PATCH /reservas/:id/aprobar': P.aprobar,
    'PATCH /reservas/:id/rechazar': P.rechazar,
    'POST /reservas/:id/sena': P.registrarSena,
    'POST /reservas/:id/cancelar-institucion': P.cancelarPorInstitucion,
    'POST /reservas/:id/cancelar-falta-pago': P.cancelarPorFaltaPago,
  };

  describe.each(Object.entries(administracion))('%s', (_ruta, handler) => {
    it.each([['ADMIN'], ['COLABORADOR']])('permite a %s', (rol) => {
      expect(guard.canActivate(contextoPara(handler, [rol]))).toBe(true);
    });

    it.each([['SOCIO'], ['DELEGADO']])('rechaza a %s con 403', (rol) => {
      expect(() => guard.canActivate(contextoPara(handler, [rol]))).toThrow(ForbiddenException);
    });
  });

  const solicitante = {
    'GET /reservas/mias': P.misReservas,
    'POST /reservas/:id/cancelar': P.cancelar,
    'POST /reservas/:id/sena/checkout': P.pagarSena,
  };

  describe.each(Object.entries(solicitante))('%s', (_ruta, handler) => {
    it('permite a cualquier usuario con sesión (también a un usuario sin roles)', () => {
      expect(guard.canActivate(contextoPara(handler, ['SOCIO']))).toBe(true);
      expect(guard.canActivate(contextoPara(handler, []))).toBe(true);
    });
  });
});
