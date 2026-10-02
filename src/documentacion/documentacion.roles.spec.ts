import { Reflector } from '@nestjs/core';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { DocumentacionController } from './documentacion.controller';

/**
 * US-24 / US-25 · Control de acceso de la documentación: la cargan y la
 * consultan ADMIN y DELEGADO. Ni COLABORADOR ni SOCIO acceden (DT-28 queda
 * pendiente para que el propio participante vea la suya).
 */
describe('US-24/25 · DocumentacionController · control de acceso', () => {
  const guard = new RolesGuard(new Reflector());

  function contextoPara(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    handler: Function,
    roles: string[],
  ): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => DocumentacionController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 7, email: 'quien@sea.local', roles } }),
      }),
    } as unknown as ExecutionContext;
  }

  const proto = DocumentacionController.prototype;
  const handlers = {
    'POST /documentacion': proto.create,
    'GET /documentacion/persona/:personaId': proto.findByPersona,
    'GET /documentacion/persona/:personaId/estado': proto.estadoPorPersona,
    'GET /documentacion/:id/archivo': proto.descargarArchivo,
  };

  describe.each(Object.entries(handlers))('%s', (_ruta, handler) => {
    it.each(['ADMIN', 'DELEGADO'])('permite a un %s', (rol) => {
      expect(guard.canActivate(contextoPara(handler, [rol]))).toBe(true);
    });

    it.each(['COLABORADOR', 'SOCIO'])('rechaza a un %s', (rol) => {
      expect(() => guard.canActivate(contextoPara(handler, [rol]))).toThrow(ForbiddenException);
    });
  });
});
