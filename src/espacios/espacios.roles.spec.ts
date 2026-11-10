import { Reflector } from '@nestjs/core';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { EspaciosController } from './espacios.controller';

/**
 * US-55 · EspaciosController · Control de acceso y RBAC
 */
describe('US-55 · EspaciosController · Control de acceso (RBAC)', () => {
  const guard = new RolesGuard(new Reflector());

  function contextoPara(handler: any, roles: string[]): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => EspaciosController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 1, roles } }),
      }),
    } as unknown as ExecutionContext;
  }

  describe('POST /espacios (create) — Exclusivo ADMIN', () => {
    const handler = EspaciosController.prototype.create;

    it('permite el acceso al rol ADMIN', () => {
      expect(guard.canActivate(contextoPara(handler, ['ADMIN']))).toBe(true);
    });

    it.each(['COLABORADOR', 'SOCIO', 'DELEGADO', 'PROFESOR'])(
      'rechaza al rol %s con 403 ForbiddenException',
      (rol) => {
        expect(() => guard.canActivate(contextoPara(handler, [rol]))).toThrow(ForbiddenException);
      },
    );
  });

  describe('POST /espacios/:id/bloqueos (agregarBloqueo) — Exclusivo ADMIN', () => {
    const handler = EspaciosController.prototype.agregarBloqueo;

    it('permite el acceso al rol ADMIN', () => {
      expect(guard.canActivate(contextoPara(handler, ['ADMIN']))).toBe(true);
    });

    it.each(['COLABORADOR', 'SOCIO', 'DELEGADO', 'PROFESOR'])(
      'rechaza al rol %s con 403 ForbiddenException',
      (rol) => {
        expect(() => guard.canActivate(contextoPara(handler, [rol]))).toThrow(ForbiddenException);
      },
    );
  });

  describe('GET /espacios (findAll) — ADMIN, COLABORADOR, SOCIO, DELEGADO', () => {
    const handler = EspaciosController.prototype.findAll;

    it.each(['ADMIN', 'COLABORADOR', 'SOCIO', 'DELEGADO'])('permite el acceso al rol %s', (rol) => {
      expect(guard.canActivate(contextoPara(handler, [rol]))).toBe(true);
    });

    it.each(['PROFESOR', 'INVITADO'])('rechaza a roles no autorizados (%s)', (rol) => {
      expect(() => guard.canActivate(contextoPara(handler, [rol]))).toThrow(ForbiddenException);
    });
  });

  describe('GET /espacios/:id (findOne) — ADMIN, COLABORADOR, SOCIO, DELEGADO', () => {
    const handler = EspaciosController.prototype.findOne;

    it.each(['ADMIN', 'COLABORADOR', 'SOCIO', 'DELEGADO'])('permite el acceso al rol %s', (rol) => {
      expect(guard.canActivate(contextoPara(handler, [rol]))).toBe(true);
    });

    it.each(['PROFESOR', 'INVITADO'])('rechaza a roles no autorizados (%s)', (rol) => {
      expect(() => guard.canActivate(contextoPara(handler, [rol]))).toThrow(ForbiddenException);
    });
  });

  describe('PATCH /espacios/:id (update) — Exclusivo ADMIN', () => {
    const handler = EspaciosController.prototype.update;

    it('permite el acceso al rol ADMIN', () => {
      expect(guard.canActivate(contextoPara(handler, ['ADMIN']))).toBe(true);
    });

    it.each(['COLABORADOR', 'SOCIO', 'DELEGADO', 'PROFESOR'])(
      'rechaza al rol %s con 403 ForbiddenException',
      (rol) => {
        expect(() => guard.canActivate(contextoPara(handler, [rol]))).toThrow(ForbiddenException);
      },
    );
  });

  describe('PATCH /espacios/:id/bloqueos/:bloqueoId (updateBloqueo) — Exclusivo ADMIN', () => {
    const handler = EspaciosController.prototype.updateBloqueo;

    it('permite el acceso al rol ADMIN', () => {
      expect(guard.canActivate(contextoPara(handler, ['ADMIN']))).toBe(true);
    });

    it.each(['COLABORADOR', 'SOCIO', 'DELEGADO', 'PROFESOR'])(
      'rechaza al rol %s con 403 ForbiddenException',
      (rol) => {
        expect(() => guard.canActivate(contextoPara(handler, [rol]))).toThrow(ForbiddenException);
      },
    );
  });

  describe('DELETE /espacios/:id/bloqueos/:bloqueoId (deleteBloqueo) — Exclusivo ADMIN', () => {
    const handler = EspaciosController.prototype.deleteBloqueo;

    it('permite el acceso al rol ADMIN', () => {
      expect(guard.canActivate(contextoPara(handler, ['ADMIN']))).toBe(true);
    });

    it.each(['COLABORADOR', 'SOCIO', 'DELEGADO', 'PROFESOR'])(
      'rechaza al rol %s con 403 ForbiddenException',
      (rol) => {
        expect(() => guard.canActivate(contextoPara(handler, [rol]))).toThrow(ForbiddenException);
      },
    );
  });

  describe('DELETE /espacios/:id (remove) — Exclusivo ADMIN', () => {
    const handler = EspaciosController.prototype.remove;

    it('permite el acceso al rol ADMIN', () => {
      expect(guard.canActivate(contextoPara(handler, ['ADMIN']))).toBe(true);
    });

    it.each(['COLABORADOR', 'SOCIO', 'DELEGADO', 'PROFESOR'])(
      'rechaza al rol %s con 403 ForbiddenException',
      (rol) => {
        expect(() => guard.canActivate(contextoPara(handler, [rol]))).toThrow(ForbiddenException);
      },
    );
  });
});
