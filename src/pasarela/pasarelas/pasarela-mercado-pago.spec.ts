import { createHmac } from 'node:crypto';
import { BadGatewayException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PasarelaMercadoPago } from './pasarela-mercado-pago';
import type { SolicitudCobro } from '../pasarela.types';

/**
 * TASK-51 · Adapter de Mercado Pago (Checkout Pro). `fetch` simulado: se
 * verifica qué se le pide a la API, cómo se traducen sus estados y la firma
 * de los webhooks.
 */
describe('TASK-51 · PasarelaMercadoPago', () => {
  let config: Record<string, string | undefined>;
  let pasarela: PasarelaMercadoPago;
  const fetchMock = jest.fn();

  const responder = (status: number, cuerpo: unknown) =>
    fetchMock.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(cuerpo),
      text: () => Promise.resolve(JSON.stringify(cuerpo)),
    });

  const solicitud = (extra: Partial<SolicitudCobro> = {}): SolicitudCobro => ({
    referencia: 'ref-1',
    descripcion: 'Cuota social 2026-10',
    items: [{ titulo: 'Cuota social 2026-10', cantidad: 1, precioUnitario: 12000 }],
    pagador: { nombre: 'Ana', apellido: 'Paz' },
    urlRetorno: 'http://localhost:5173/pagos/resultado?referencia=ref-1',
    urlNotificacion: null,
    expiraEn: new Date('2026-11-01T12:00:00Z'),
    ...extra,
  });

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    config = { MP_ACCESS_TOKEN: 'TEST-123' };
    pasarela = new PasarelaMercadoPago({
      get: (k: string) => config[k],
    } as unknown as ConfigService);
  });

  describe('crearCobro', () => {
    it('crea la preferencia con los ítems, la referencia y la vuelta al front', async () => {
      responder(201, {
        id: 'pref-1',
        init_point: 'https://mp/prod',
        sandbox_init_point: 'https://mp/sandbox',
      });

      const cobro = await pasarela.crearCobro(solicitud());

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.mercadopago.com/checkout/preferences');
      expect(init.headers).toEqual(
        expect.objectContaining({ Authorization: 'Bearer TEST-123', 'X-Idempotency-Key': 'ref-1' }),
      );
      const cuerpo = JSON.parse(init.body);
      expect(cuerpo).toEqual(
        expect.objectContaining({
          external_reference: 'ref-1',
          items: [
            {
              id: 'ref-1-1',
              title: 'Cuota social 2026-10',
              quantity: 1,
              unit_price: 12000,
              currency_id: 'ARS',
            },
          ],
          payer: { name: 'Ana', surname: 'Paz' },
          expires: true,
          expiration_date_to: '2026-11-01T12:00:00.000Z',
        }),
      );
      expect(cuerpo.back_urls.success).toContain('/pagos/resultado');
      // Con token de prueba, al sandbox.
      expect(cobro).toEqual({ idCobroExterno: 'pref-1', urlPago: 'https://mp/sandbox' });
    });

    it('en local (http) no pide auto_return ni webhook; en https sí', async () => {
      responder(201, { id: 'p', init_point: 'a', sandbox_init_point: 'b' });
      await pasarela.crearCobro(solicitud());
      const local = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(local.auto_return).toBeUndefined();
      expect(local.notification_url).toBeUndefined();

      responder(201, { id: 'p', init_point: 'a', sandbox_init_point: 'b' });
      await pasarela.crearCobro(
        solicitud({
          urlRetorno: 'https://socialclub.app/pagos/resultado',
          urlNotificacion: 'https://api/x',
        }),
      );
      const publico = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(publico.auto_return).toBe('approved');
      expect(publico.notification_url).toBe('https://api/x');
    });

    it('con credenciales productivas usa init_point', async () => {
      config.MP_ACCESS_TOKEN = 'APP_USR-123';
      responder(201, {
        id: 'p',
        init_point: 'https://mp/prod',
        sandbox_init_point: 'https://mp/sandbox',
      });

      expect((await pasarela.crearCobro(solicitud())).urlPago).toBe('https://mp/prod');
    });

    it('si Mercado Pago responde error, 502 sin exponer el detalle', async () => {
      responder(400, { message: 'invalid unit_price' });
      await expect(pasarela.crearCobro(solicitud())).rejects.toThrow(
        new BadGatewayException('La pasarela de pagos rechazó la operación.'),
      );
    });

    it('si Mercado Pago no responde, 502', async () => {
      fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
      await expect(pasarela.crearCobro(solicitud())).rejects.toThrow(
        new BadGatewayException('La pasarela de pagos no respondió. Intentá nuevamente.'),
      );
    });
  });

  describe('consultarPago y buscarPago', () => {
    it('traduce un pago aprobado', async () => {
      responder(200, {
        id: 999,
        status: 'approved',
        status_detail: 'accredited',
        external_reference: 'ref-1',
        transaction_amount: 12000,
      });

      await expect(pasarela.consultarPago('999')).resolves.toEqual({
        idPagoExterno: '999',
        referencia: 'ref-1',
        estado: 'APROBADO',
        monto: 12000,
        detalle: 'approved · accredited',
      });
      expect(fetchMock.mock.calls[0][0]).toBe('https://api.mercadopago.com/v1/payments/999');
    });

    it.each([
      ['rejected', 'RECHAZADO'],
      ['cancelled', 'RECHAZADO'],
      ['in_process', 'PENDIENTE'],
      ['pending', 'PENDIENTE'],
      ['algo_nuevo', 'PENDIENTE'],
    ])('el estado %s se traduce como %s', async (status, estado) => {
      responder(200, { id: 1, status, external_reference: 'ref-1' });
      expect((await pasarela.consultarPago('1'))?.estado).toBe(estado);
    });

    it('un pago inexistente devuelve null', async () => {
      responder(404, { message: 'not found' });
      await expect(pasarela.consultarPago('1')).resolves.toBeNull();
    });

    it('buscarPago prefiere el aprobado entre los intentos de la orden', async () => {
      responder(200, {
        results: [
          { id: 2, status: 'rejected', external_reference: 'ref-1' },
          { id: 1, status: 'approved', external_reference: 'ref-1' },
        ],
      });

      const pago = await pasarela.buscarPago('ref-1');

      expect(fetchMock.mock.calls[0][0]).toContain('/v1/payments/search?external_reference=ref-1');
      expect(pago).toEqual(expect.objectContaining({ idPagoExterno: '1', estado: 'APROBADO' }));
    });

    it('buscarPago sin intentos devuelve null', async () => {
      responder(200, { results: [] });
      await expect(pasarela.buscarPago('ref-1')).resolves.toBeNull();
    });
  });

  describe('leerNotificacion (webhook)', () => {
    const SECRETO = 'clave-del-webhook';
    const firmar = (id: string, requestId: string, ts: string) =>
      createHmac('sha256', SECRETO)
        .update(`id:${id};request-id:${requestId};ts:${ts};`)
        .digest('hex');

    it('devuelve el id del pago de una notificación de tipo payment', () => {
      expect(
        pasarela.leerNotificacion({
          headers: {},
          query: { 'data.id': '999', type: 'payment' },
          body: {},
        }),
      ).toBe('999');
      expect(
        pasarela.leerNotificacion({
          headers: {},
          query: {},
          body: { type: 'payment', data: { id: 5 } },
        }),
      ).toBe('5');
    });

    it('ignora las notificaciones que no son de pagos', () => {
      expect(
        pasarela.leerNotificacion({
          headers: {},
          query: { topic: 'merchant_order', id: '1' },
          body: {},
        }),
      ).toBeNull();
    });

    it('TC-268 · con MP_WEBHOOK_SECRET acepta una firma válida', () => {
      config.MP_WEBHOOK_SECRET = SECRETO;
      const headers = {
        'x-signature': `ts=1704908010,v1=${firmar('999', 'req-1', '1704908010')}`,
        'x-request-id': 'req-1',
      };

      expect(
        pasarela.leerNotificacion({
          headers,
          query: { 'data.id': '999', type: 'payment' },
          body: {},
        }),
      ).toBe('999');
    });

    it('TC-268 · con MP_WEBHOOK_SECRET rechaza una firma inválida o ausente (401)', () => {
      config.MP_WEBHOOK_SECRET = SECRETO;
      const query = { 'data.id': '999', type: 'payment' };

      expect(() =>
        pasarela.leerNotificacion({
          headers: { 'x-signature': `ts=1,v1=${'0'.repeat(64)}`, 'x-request-id': 'req-1' },
          query,
          body: {},
        }),
      ).toThrow(UnauthorizedException);
      expect(() => pasarela.leerNotificacion({ headers: {}, query, body: {} })).toThrow(
        UnauthorizedException,
      );
    });
  });
});
