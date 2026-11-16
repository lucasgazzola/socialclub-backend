import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { TareasController } from './tareas.controller';
import { TareasTokenGuard } from './tareas-token.guard';

/**
 * DT-22 · Control de acceso de las tareas automáticas: consultar y ejecutar a
 * mano solo ADMIN; el disparador programado solo con el token.
 */
describe('DT-22 · TareasController · control de acceso', () => {
  describe('endpoints de ADMIN', () => {
    const guard = new RolesGuard(new Reflector());
    const proto = TareasController.prototype;
    const handlers = {
      'GET /tareas': proto.listar,
      'GET /tareas/:nombre/ejecuciones': proto.ejecuciones,
      'POST /tareas/:nombre/ejecutar': proto.ejecutarManual,
    };
    const contexto = (
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      handler: Function,
      roles: string[],
    ) =>
      ({
        getHandler: () => handler,
        getClass: () => TareasController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { id: 1, email: 'x@club.test', roles } }),
        }),
      }) as unknown as ExecutionContext;

    describe.each(Object.entries(handlers))('%s', (_ruta, handler) => {
      it('permite a un ADMIN', () => {
        expect(guard.canActivate(contexto(handler, ['ADMIN']))).toBe(true);
      });

      it.each(['COLABORADOR', 'DELEGADO', 'SOCIO'])('rechaza a un %s', (rol) => {
        expect(() => guard.canActivate(contexto(handler, [rol]))).toThrow(ForbiddenException);
      });
    });
  });

  describe('POST /tareas/:nombre/programada (TareasTokenGuard)', () => {
    const SECRETO = 'un-secreto-de-prueba-largo';
    const guardCon = (env: Record<string, string>) => new TareasTokenGuard(new ConfigService(env));
    const contexto = (cabeceras: Record<string, string>) =>
      ({
        switchToHttp: () => ({ getRequest: () => ({ headers: cabeceras }) }),
      }) as unknown as ExecutionContext;

    it('permite con el token correcto en x-tareas-token', () => {
      expect(
        guardCon({ TAREAS_TOKEN: SECRETO }).canActivate(contexto({ 'x-tareas-token': SECRETO })),
      ).toBe(true);
    });

    it('acepta los nombres de US-26 (ALERTAS_CRON_TOKEN y x-cron-token) mientras se migran los entornos', () => {
      expect(
        guardCon({ ALERTAS_CRON_TOKEN: SECRETO }).canActivate(
          contexto({ 'x-cron-token': SECRETO }),
        ),
      ).toBe(true);
    });

    it('rechaza un token incorrecto o ausente', () => {
      const guard = guardCon({ TAREAS_TOKEN: SECRETO });
      expect(() => guard.canActivate(contexto({ 'x-tareas-token': 'otro' }))).toThrow(
        new UnauthorizedException('Token de tareas automáticas inválido'),
      );
      expect(() => guard.canActivate(contexto({}))).toThrow(UnauthorizedException);
    });

    it('queda cerrado si el entorno no configuró el token', () => {
      expect(() => guardCon({}).canActivate(contexto({ 'x-tareas-token': 'x' }))).toThrow(
        'La ejecución programada de tareas no está configurada',
      );
    });
  });
});
