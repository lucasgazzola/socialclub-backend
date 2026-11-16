import type { ConfigService } from '@nestjs/config';
import { PasarelaSimulada } from './pasarela-simulada';
import { elegirPasarela } from '../pasarela.module';
import { PasarelaMercadoPago } from './pasarela-mercado-pago';

/** TASK-51 · Pasarela simulada y elección de la pasarela activa. */
describe('TASK-51 · PasarelaSimulada', () => {
  const config = (valores: Record<string, string>) =>
    ({ get: (k: string) => valores[k] }) as unknown as ConfigService;

  it('redirige al simulador del front con la referencia', async () => {
    const pasarela = new PasarelaSimulada(config({ APP_URL: 'https://front' }));

    const cobro = await pasarela.crearCobro({ referencia: 'ref-1' } as never);

    expect(cobro).toEqual({
      idCobroExterno: 'SIM-ref-1',
      urlPago: 'https://front/pagos/simulador?referencia=ref-1',
    });
  });

  it('informa el pago simulado como lo haría una pasarela real', async () => {
    const pasarela = new PasarelaSimulada(config({}));
    expect(await pasarela.buscarPago('ref-1')).toBeNull();

    const pago = pasarela.simular('ref-1', 3000, true);

    expect(pago).toEqual(
      expect.objectContaining({ referencia: 'ref-1', estado: 'APROBADO', monto: 3000 }),
    );
    expect(await pasarela.buscarPago('ref-1')).toEqual(pago);
    expect(await pasarela.consultarPago(pago.idPagoExterno)).toEqual(pago);
    expect(await pasarela.consultarPago('otro')).toBeNull();
  });

  it('un rechazo posterior no pisa un pago aprobado', async () => {
    const pasarela = new PasarelaSimulada(config({}));
    pasarela.simular('ref-1', 3000, true);
    pasarela.simular('ref-1', 3000, false);

    expect((await pasarela.buscarPago('ref-1'))?.estado).toBe('APROBADO');
  });

  it('no recibe webhooks', () => {
    expect(new PasarelaSimulada(config({})).leerNotificacion()).toBeNull();
  });

  describe('elegirPasarela', () => {
    const mp = new PasarelaMercadoPago(config({}));
    const sim = new PasarelaSimulada(config({}));

    it('TC-272 · sin token usa la simulada', () => {
      expect(elegirPasarela(config({}), mp, sim)).toBe(sim);
    });

    it('TC-272 · con MP_ACCESS_TOKEN usa Mercado Pago', () => {
      expect(elegirPasarela(config({ MP_ACCESS_TOKEN: 'TEST-1' }), mp, sim)).toBe(mp);
    });

    it('TC-272 · PASARELA_PAGOS manda sobre el token', () => {
      expect(
        elegirPasarela(config({ MP_ACCESS_TOKEN: 'TEST-1', PASARELA_PAGOS: 'simulada' }), mp, sim),
      ).toBe(sim);
      expect(elegirPasarela(config({ PASARELA_PAGOS: 'mercadopago' }), mp, sim)).toBe(mp);
    });
  });
});
