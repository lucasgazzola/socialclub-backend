import { Reflector } from '@nestjs/core';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { CategoriasDisciplinaController } from './categorias-disciplina.controller';

/**
 * US-48 a US-51 · Control de acceso: solo ADMIN agrega, edita o da de baja
 * categorías; la consulta también la usan COLABORADOR y DELEGADO (este último
 * para inscribir participantes). Un SOCIO no accede.
 */
describe('US-48/51 · CategoriasDisciplinaController · control de acceso', () => {
  const guard = new RolesGuard(new Reflector());

  function contextoPara(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    handler: Function,
    roles: string[],
  ): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => CategoriasDisciplinaController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 7, email: 'quien@sea.local', roles } }),
      }),
    } as unknown as ExecutionContext;
  }

  const proto = CategoriasDisciplinaController.prototype;
  const escritura = {
    'POST /disciplinas/:disciplinaId/categorias': proto.create,
    'PATCH /disciplinas/:disciplinaId/categorias/:id': proto.update,
    'PATCH /disciplinas/:disciplinaId/categorias/:id/reactivar': proto.reactivate,
    'DELETE /disciplinas/:disciplinaId/categorias/:id': proto.deactivate,
  };
  const lectura = {
    'GET /disciplinas/:disciplinaId/categorias': proto.findAll,
    'GET /disciplinas/:disciplinaId/categorias/:id': proto.findOne,
  };

  describe.each(Object.entries(escritura))('%s', (_ruta, handler) => {
    it('permite a un ADMIN', () => {
      expect(guard.canActivate(contextoPara(handler, ['ADMIN']))).toBe(true);
    });

    it.each(['COLABORADOR', 'DELEGADO', 'SOCIO'])('rechaza a un %s', (rol) => {
      expect(() => guard.canActivate(contextoPara(handler, [rol]))).toThrow(ForbiddenException);
    });
  });

  describe.each(Object.entries(lectura))('%s', (_ruta, handler) => {
    it.each(['ADMIN', 'COLABORADOR', 'DELEGADO'])('permite a un %s', (rol) => {
      expect(guard.canActivate(contextoPara(handler, [rol]))).toBe(true);
    });

    it('rechaza a un SOCIO', () => {
      expect(() => guard.canActivate(contextoPara(handler, ['SOCIO']))).toThrow(ForbiddenException);
    });
  });
});
