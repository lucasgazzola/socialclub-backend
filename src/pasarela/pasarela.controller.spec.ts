import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PasarelaController } from './pasarela.controller';
import { WebhookController } from './webhook.controller';
import { VencerOrdenesPagoTarea } from './vencer-ordenes-pago.tarea';
import type { PasarelaService } from './pasarela.service';

/** TASK-51 · Controllers de la pasarela: delegan en la facade con el usuario de la sesión. */
describe('TASK-51 · PasarelaController y WebhookController', () => {
  const REF = '5f0c2c8e-7a51-4d0b-9f43-2a1b3c4d5e6f';
  const user = { id: 7, email: 'a@b.c', roles: ['SOCIO'] };
  const pasarela = {
    obtener: jest.fn(),
    confirmar: jest.fn(),
    cancelar: jest.fn(),
    simular: jest.fn(),
    procesarNotificacion: jest.fn(),
    vencerOrdenes: jest.fn().mockResolvedValue({ revisadas: 0, vencidas: 0, aprobadas: 0 }),
  };
  const controller = new PasarelaController(pasarela as unknown as PasarelaService);

  it('las órdenes requieren sesión; el webhook es público', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PasarelaController)).toEqual([JwtAuthGuard]);
    expect(Reflect.getMetadata(GUARDS_METADATA, WebhookController)).toBeUndefined();
  });

  it('delegan en la facade con el usuario de la sesión', async () => {
    await controller.obtener(REF, user);
    await controller.confirmar(REF, { idPago: '999' }, user);
    await controller.cancelar(REF, user);
    await controller.simular(REF, { aprobado: false }, user);

    expect(pasarela.obtener).toHaveBeenCalledWith(REF, user);
    expect(pasarela.confirmar).toHaveBeenCalledWith(REF, user, '999');
    expect(pasarela.cancelar).toHaveBeenCalledWith(REF, user);
    expect(pasarela.simular).toHaveBeenCalledWith(REF, user, false);
  });

  it('el webhook pasa headers, query y cuerpo y responde recibido', async () => {
    const webhook = new WebhookController(pasarela as unknown as PasarelaService);

    await expect(
      webhook.recibir({ 'x-signature': 's' }, { type: 'payment' }, { a: 1 }),
    ).resolves.toEqual({
      recibido: true,
    });
    expect(pasarela.procesarNotificacion).toHaveBeenCalledWith({
      headers: { 'x-signature': 's' },
      query: { type: 'payment' },
      body: { a: 1 },
    });
  });

  it('la tarea vencer-ordenes-pago delega en la facade', async () => {
    const tarea = new VencerOrdenesPagoTarea(pasarela as unknown as PasarelaService);
    const hoy = new Date();

    await expect(tarea.ejecutar({ hoy })).resolves.toEqual({
      revisadas: 0,
      vencidas: 0,
      aprobadas: 0,
    });
    expect(pasarela.vencerOrdenes).toHaveBeenCalledWith(hoy);
    expect(tarea.nombre).toBe('vencer-ordenes-pago');
  });
});
