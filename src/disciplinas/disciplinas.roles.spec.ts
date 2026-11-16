import { Reflector } from '@nestjs/core';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { DisciplinasController } from './disciplinas.controller';

/**
 * US-05 · El delegado inscribe participantes, así que tiene que poder consultar
 * las disciplinas (lo detectó el E2E de TASK-43: el selector le quedaba vacío
 * por un 403). La gestión de disciplinas sigue siendo solo del ADMIN.
 */
describe('US-05 · DisciplinasController · control de acceso', () => {
  const guard = new RolesGuard(new Reflector());

  function contextoPara(handler: unknown, roles: string[]): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => DisciplinasController,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 7, roles } }) }),
    } as unknown as ExecutionContext;
  }

  const consulta = {
    'GET /disciplinas': DisciplinasController.prototype.findAll,
    'GET /disciplinas/:id': DisciplinasController.prototype.findOne,
  };
  const gestion = {
    'POST /disciplinas': DisciplinasController.prototype.create,
    'PATCH /disciplinas/:id': DisciplinasController.prototype.update,
    'DELETE /disciplinas/:id': DisciplinasController.prototype.deactivate,
  };

  describe.each(Object.entries(consulta))('%s', (_ruta, handler) => {
    it.each(['ADMIN', 'COLABORADOR', 'DELEGADO'])('permite el acceso a %s', (rol) => {
      expect(guard.canActivate(contextoPara(handler, [rol]))).toBe(true);
    });

    it('rechaza a un usuario con solo rol SOCIO con 403', () => {
      expect(() => guard.canActivate(contextoPara(handler, ['SOCIO']))).toThrow(ForbiddenException);
    });
  });

  describe.each(Object.entries(gestion))('%s (solo ADMIN)', (_ruta, handler) => {
    it('rechaza a un DELEGADO con 403', () => {
      expect(() => guard.canActivate(contextoPara(handler, ['DELEGADO']))).toThrow(
        ForbiddenException,
      );
    });
  });
});
