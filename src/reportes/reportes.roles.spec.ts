import { Reflector } from '@nestjs/core';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { ReportesController } from './reportes.controller';

/** US-35 · El reporte de estado financiero es para ADMIN y COLABORADOR. */
describe('US-35 · ReportesController · control de acceso', () => {
  const guard = new RolesGuard(new Reflector());
  const handler = ReportesController.prototype.estadoFinanciero;

  function contextoPara(roles: string[]): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => ReportesController,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 7, roles } }) }),
    } as unknown as ExecutionContext;
  }

  it.each(['ADMIN', 'COLABORADOR'])('permite el acceso a %s', (rol) => {
    expect(guard.canActivate(contextoPara([rol]))).toBe(true);
  });

  it.each(['DELEGADO', 'SOCIO'])('rechaza a %s con 403', (rol) => {
    expect(() => guard.canActivate(contextoPara([rol]))).toThrow(ForbiddenException);
  });
});
