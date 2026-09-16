import { Reflector } from '@nestjs/core';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { InscripcionController } from './inscripcion.controller';

/**
 * DT-16 · Control de acceso de los endpoints de inscripción.
 *
 * `GET /inscripcion`, `GET /inscripcion/:id` y `DELETE /inscripcion/:id` no
 * declaraban `@Roles`, y `RolesGuard` deja pasar cuando no hay roles
 * requeridos: cualquier usuario autenticado —incluido un SOCIO— podía listar a
 * todos los participantes con su DNI y borrar inscripciones.
 *
 * Estos casos ejercen el guard real contra los handlers reales del controller,
 * que es donde estaba el agujero: la metadata y el guard juntos. Si alguien
 * vuelve a agregar un handler sin cobertura de roles, o quita el `@Roles` de
 * la clase, estos tests fallan.
 */
describe('DT-16 · InscripcionController · control de acceso', () => {
  const guard = new RolesGuard(new Reflector());

  /** Arma un ExecutionContext con el handler real y los roles del usuario. */
  function contextoPara(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    handler: Function,
    roles: string[],
  ): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => InscripcionController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 7, email: 'quien@sea.local', roles } }),
      }),
    } as unknown as ExecutionContext;
  }

  const handlers = {
    'POST /inscripcion': InscripcionController.prototype.create,
    'PATCH /inscripcion/:id': InscripcionController.prototype.update,
    'GET /inscripcion': InscripcionController.prototype.findAll,
    'GET /inscripcion/persona/:personaId': InscripcionController.prototype.findByPersonaId,
    'GET /inscripcion/:id': InscripcionController.prototype.findOne,
    'DELETE /inscripcion/:id': InscripcionController.prototype.remove,
    'DELETE /inscripcion/persona/:personaId': InscripcionController.prototype.darDeBajaParticipante,
    'PATCH /inscripcion/persona/:personaId/activar':
      InscripcionController.prototype.activarParticipante,
  };

  describe.each(Object.entries(handlers))('%s', (_ruta, handler) => {
    it('rechaza a un SOCIO', () => {
      expect(() => guard.canActivate(contextoPara(handler, ['SOCIO']))).toThrow(ForbiddenException);
    });

    it('rechaza a un usuario sin roles', () => {
      expect(() => guard.canActivate(contextoPara(handler, []))).toThrow(ForbiddenException);
    });

    it('permite a un DELEGADO', () => {
      expect(guard.canActivate(contextoPara(handler, ['DELEGADO']))).toBe(true);
    });

    it('permite a un ADMIN', () => {
      expect(guard.canActivate(contextoPara(handler, ['ADMIN']))).toBe(true);
    });
  });

  it('todos los handlers declaran los roles esperados', () => {
    const reflector = new Reflector();

    const rolesPorRuta = Object.fromEntries(
      Object.entries(handlers).map(([ruta, handler]) => [
        ruta,
        reflector.getAllAndOverride<string[]>('roles', [handler, InscripcionController]) ?? null,
      ]),
    );

    // Un `null` acá significa que ese handler quedó abierto a cualquier
    // usuario autenticado, que es exactamente el bug de DT-16.
    // El listado es el único handler que amplía los roles: lo usan los roles
    // operativos (COLABORADOR y DELEGADO) para encontrar al participante
    // —US-08 y, desde US-07, para poder darlo de baja—.
    expect(rolesPorRuta).toEqual({
      'POST /inscripcion': ['ADMIN', 'DELEGADO'],
      'PATCH /inscripcion/:id': ['ADMIN', 'DELEGADO'],
      'GET /inscripcion': ['ADMIN', 'COLABORADOR', 'DELEGADO'],
      'GET /inscripcion/persona/:personaId': ['ADMIN', 'DELEGADO'],
      'GET /inscripcion/:id': ['ADMIN', 'DELEGADO'],
      'DELETE /inscripcion/:id': ['ADMIN', 'DELEGADO'],
      'DELETE /inscripcion/persona/:personaId': ['ADMIN', 'DELEGADO'],
      'PATCH /inscripcion/persona/:personaId/activar': ['ADMIN', 'DELEGADO'],
    });
  });

  it('US-07: el COLABORADOR puede listar participantes pero no darlos de baja ni reactivarlos', () => {
    expect(
      guard.canActivate(contextoPara(InscripcionController.prototype.findAll, ['COLABORADOR'])),
    ).toBe(true);

    expect(() =>
      guard.canActivate(
        contextoPara(InscripcionController.prototype.darDeBajaParticipante, ['COLABORADOR']),
      ),
    ).toThrow(ForbiddenException);

    expect(() =>
      guard.canActivate(
        contextoPara(InscripcionController.prototype.activarParticipante, ['COLABORADOR']),
      ),
    ).toThrow(ForbiddenException);
  });
});
