import { Reflector } from '@nestjs/core';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { DocumentacionController } from './documentacion.controller';

/**
 * US-24 / US-25 / DT-28 · Control de acceso de la documentación:
 * - La carga sigue protegida para ADMIN y DELEGADO.
 * - La consulta y descarga de archivo se habilita para ADMIN, DELEGADO, COLABORADOR y SOCIO (DT-28).
 */
describe('US-24/25 · DT-28 · DocumentacionController · control de acceso', () => {
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

  describe('POST /documentacion (alta de documentación)', () => {
    it.each(['ADMIN', 'DELEGADO'])('US-24 · TC-248: permite a un %s', (rol) => {
      expect(guard.canActivate(contextoPara(proto.create, [rol]))).toBe(true);
    });

    it.each(['COLABORADOR', 'SOCIO'])('US-24 · TC-248: rechaza a un %s', (rol) => {
      expect(() => guard.canActivate(contextoPara(proto.create, [rol]))).toThrow(
        ForbiddenException,
      );
    });
  });

  const handlersLectura = {
    'GET /documentacion/persona/:personaId': proto.findByPersona,
    'GET /documentacion/persona/:personaId/estado': proto.estadoPorPersona,
    'GET /documentacion/:id/archivo': proto.descargarArchivo,
    'GET /documentacion/mi-documentacion': proto.miDocumentacion,
    'GET /documentacion/mi-documentacion/estado': proto.miEstadoDocumental,
  };

  describe.each(Object.entries(handlersLectura))('%s (consulta y descarga)', (_ruta, handler) => {
    it.each(['ADMIN', 'DELEGADO', 'COLABORADOR', 'SOCIO'])('DT-28: permite a un %s', (rol) => {
      expect(guard.canActivate(contextoPara(handler, [rol]))).toBe(true);
    });

    it('DT-58: deja pasar a un participante sin rol (el servicio exige que sea su propia persona)', () => {
      expect(guard.canActivate(contextoPara(handler, []))).toBe(true);
    });
  });

  describe('TASK-60 · POST /documentacion/mi-documentacion (el titular sube su documento)', () => {
    it.each([[['SOCIO']], [[]]])('permite a cualquier usuario con sesión (roles %j)', (roles) => {
      expect(guard.canActivate(contextoPara(proto.subirMiDocumentacion, roles))).toBe(true);
    });
  });

  describe.each([
    ['GET /documentacion/pendientes-revision', proto.pendientesRevision],
    ['PATCH /documentacion/:id/aprobar', proto.aprobar],
    ['PATCH /documentacion/:id/rechazar', proto.rechazar],
  ])('TASK-60 · %s (revisión)', (_ruta, handler) => {
    it.each(['ADMIN', 'DELEGADO'])('permite a un %s', (rol) => {
      expect(guard.canActivate(contextoPara(handler, [rol]))).toBe(true);
    });

    it.each(['COLABORADOR', 'SOCIO'])('rechaza a un %s', (rol) => {
      expect(() => guard.canActivate(contextoPara(handler, [rol]))).toThrow(ForbiddenException);
    });
  });
});
