import { Reflector } from '@nestjs/core';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { PersonasController } from './personas.controller';

/**
 * US-21 · Secretaría (COLABORADOR) cobra la cuota deportiva y para eso busca
 * al participante por DNI (lo detectó el E2E de TASK-43: le respondía 403 y
 * no podía cobrar). Editar los datos sigue siendo de ADMIN y DELEGADO.
 */
describe('US-21 · PersonasController · control de acceso', () => {
  const guard = new RolesGuard(new Reflector());

  function contextoPara(handler: unknown, roles: string[]): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => PersonasController,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 7, roles } }) }),
    } as unknown as ExecutionContext;
  }

  const buscar = PersonasController.prototype.findByDni;
  const editar = PersonasController.prototype.update;

  it.each(['ADMIN', 'DELEGADO', 'COLABORADOR'])('GET /personas/dni/:dni permite a %s', (rol) => {
    expect(guard.canActivate(contextoPara(buscar, [rol]))).toBe(true);
  });

  it('GET /personas/dni/:dni rechaza a un SOCIO con 403', () => {
    expect(() => guard.canActivate(contextoPara(buscar, ['SOCIO']))).toThrow(ForbiddenException);
  });

  it('PATCH /personas/:id rechaza a un COLABORADOR con 403', () => {
    expect(() => guard.canActivate(contextoPara(editar, ['COLABORADOR']))).toThrow(
      ForbiddenException,
    );
  });
});
