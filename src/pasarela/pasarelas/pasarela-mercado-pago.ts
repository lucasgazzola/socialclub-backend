import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadGatewayException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CobroCreado,
  EstadoPagoPasarela,
  NotificacionEntrante,
  PagoInformado,
  SolicitudCobro,
} from '../pasarela.types';
import type { PasarelaPago } from './pasarela-pago';

const API = 'https://api.mercadopago.com';

/** Pago tal como lo devuelve `GET /v1/payments/:id` (solo lo que usamos). */
interface PagoMercadoPago {
  id: number;
  status: string;
  status_detail?: string;
  external_reference?: string | null;
  transaction_amount?: number;
}

/** Estados de Mercado Pago → estados propios. */
const ESTADOS: Record<string, EstadoPagoPasarela> = {
  approved: 'APROBADO',
  authorized: 'PENDIENTE',
  pending: 'PENDIENTE',
  in_process: 'PENDIENTE',
  in_mediation: 'PENDIENTE',
  rejected: 'RECHAZADO',
  cancelled: 'RECHAZADO',
  refunded: 'RECHAZADO',
  charged_back: 'RECHAZADO',
};

/**
 * Adapter de Mercado Pago, Checkout Pro (TASK-51). Habla con la API REST con
 * `fetch`: son tres llamadas y así ningún otro archivo depende del SDK.
 *
 * - Con un Access Token `TEST-…` (credenciales de prueba) redirige al sandbox.
 * - Con el `APP_USR-…` de un usuario de prueba (lo que Mercado Pago recomienda
 *   hoy) usa `init_point`: no mueve dinero real porque la cuenta es de prueba.
 * - `MP_WEBHOOK_SECRET` valida la firma `x-signature` de los webhooks.
 *
 * Guía para crear las credenciales de prueba: docs/decisiones/0003.
 */
@Injectable()
export class PasarelaMercadoPago implements PasarelaPago {
  readonly nombre = 'MERCADO_PAGO';
  private readonly logger = new Logger(PasarelaMercadoPago.name);

  constructor(private readonly config: ConfigService) {}

  private get token(): string {
    return this.config.get<string>('MP_ACCESS_TOKEN') ?? '';
  }

  private get esSandbox(): boolean {
    return this.token.startsWith('TEST-');
  }

  private async pedir<T>(ruta: string, init: RequestInit = {}): Promise<T | null> {
    let respuesta: Response;
    try {
      respuesta = await fetch(`${API}${ruta}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
      });
    } catch (error) {
      this.logger.error(`Mercado Pago no respondió (${ruta}): ${(error as Error).message}`);
      throw new BadGatewayException('La pasarela de pagos no respondió. Intentá nuevamente.');
    }
    if (respuesta.status === 404) return null;
    if (!respuesta.ok) {
      const cuerpo = await respuesta.text();
      this.logger.error(`Mercado Pago respondió ${respuesta.status} (${ruta}): ${cuerpo}`);
      throw new BadGatewayException('La pasarela de pagos rechazó la operación.');
    }
    return (await respuesta.json()) as T;
  }

  async crearCobro(solicitud: SolicitudCobro): Promise<CobroCreado> {
    // Mercado Pago rechaza `auto_return` si la URL de vuelta no es https
    // (en local es http://localhost): ahí el usuario vuelve con el botón.
    const vuelveSolo = solicitud.urlRetorno.startsWith('https://');
    const preferencia = await this.pedir<{
      id: string;
      init_point: string;
      sandbox_init_point: string;
    }>('/checkout/preferences', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': solicitud.referencia },
      body: JSON.stringify({
        items: solicitud.items.map((item, i) => ({
          id: `${solicitud.referencia}-${i + 1}`,
          title: item.titulo,
          quantity: item.cantidad,
          unit_price: item.precioUnitario,
          currency_id: 'ARS',
        })),
        // Sin email a propósito: en el sandbox, un email que no es de un
        // usuario de prueba hace fallar el pago.
        payer: { name: solicitud.pagador.nombre, surname: solicitud.pagador.apellido },
        external_reference: solicitud.referencia,
        back_urls: {
          success: solicitud.urlRetorno,
          pending: solicitud.urlRetorno,
          failure: solicitud.urlRetorno,
        },
        ...(vuelveSolo ? { auto_return: 'approved' } : {}),
        ...(solicitud.urlNotificacion ? { notification_url: solicitud.urlNotificacion } : {}),
        expires: true,
        expiration_date_to: solicitud.expiraEn.toISOString(),
        statement_descriptor: 'SOCIALCLUB',
      }),
    });
    if (!preferencia) throw new BadGatewayException('La pasarela de pagos rechazó la operación.');
    return {
      idCobroExterno: preferencia.id,
      urlPago: this.esSandbox ? preferencia.sandbox_init_point : preferencia.init_point,
    };
  }

  async consultarPago(idPagoExterno: string): Promise<PagoInformado | null> {
    const pago = await this.pedir<PagoMercadoPago>(
      `/v1/payments/${encodeURIComponent(idPagoExterno)}`,
    );
    return pago ? this.traducir(pago) : null;
  }

  async buscarPago(referencia: string): Promise<PagoInformado | null> {
    const busqueda = await this.pedir<{ results: PagoMercadoPago[] }>(
      `/v1/payments/search?external_reference=${encodeURIComponent(referencia)}&sort=date_created&criteria=desc`,
    );
    const pagos = busqueda?.results ?? [];
    const elegido = pagos.find((p) => p.status === 'approved') ?? pagos[0];
    return elegido ? this.traducir(elegido) : null;
  }

  leerNotificacion({ headers, query, body }: NotificacionEntrante): string | null {
    const cuerpo = (body ?? {}) as { type?: string; data?: { id?: string | number } };
    const tipo = cuerpo.type ?? (query.type as string) ?? (query.topic as string);
    if (tipo !== 'payment') return null;
    const id = String(query['data.id'] ?? cuerpo.data?.id ?? query.id ?? '');
    if (!id) return null;
    this.verificarFirma(id, headers);
    return id;
  }

  /**
   * Firma de Mercado Pago: `x-signature: ts=…,v1=…` es un HMAC-SHA256 del
   * manifiesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` con la
   * clave secreta del webhook. Sin `MP_WEBHOOK_SECRET` no se valida (local).
   */
  private verificarFirma(id: string, headers: NotificacionEntrante['headers']) {
    const secreto = this.config.get<string>('MP_WEBHOOK_SECRET');
    if (!secreto) {
      this.logger.warn('Webhook de Mercado Pago sin validar: falta MP_WEBHOOK_SECRET.');
      return;
    }
    const firma = String(headers['x-signature'] ?? '');
    const partes = Object.fromEntries(
      firma.split(',').map((parte) => parte.trim().split('=') as [string, string]),
    );
    if (!partes.ts || !partes.v1) throw new UnauthorizedException('Firma del webhook inválida');
    const idFirmado = /^[a-z0-9]+$/i.test(id) ? id.toLowerCase() : id;
    const manifiesto = `id:${idFirmado};request-id:${String(headers['x-request-id'] ?? '')};ts:${partes.ts};`;
    const esperada = createHmac('sha256', secreto).update(manifiesto).digest('hex');
    const a = Buffer.from(esperada);
    const b = Buffer.from(partes.v1);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Firma del webhook inválida');
    }
  }

  private traducir(pago: PagoMercadoPago): PagoInformado {
    return {
      idPagoExterno: String(pago.id),
      referencia: pago.external_reference ?? '',
      estado: ESTADOS[pago.status] ?? 'PENDIENTE',
      monto: Number(pago.transaction_amount ?? 0),
      detalle: [pago.status, pago.status_detail].filter(Boolean).join(' · '),
    };
  }
}
