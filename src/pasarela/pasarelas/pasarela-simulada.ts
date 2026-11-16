import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CobroCreado, PagoInformado, SolicitudCobro } from '../pasarela.types';
import type { PasarelaPago } from './pasarela-pago';

/**
 * Pasarela simulada (TASK-51): se usa sin credenciales de Mercado Pago, en
 * desarrollo y en los E2E. Redirige a la pantalla «Simulador de pago» del
 * front, donde se aprueba o rechaza el pago, y lo informa igual que una
 * pasarela real: el resto del circuito (confirmar, acreditar) es el mismo.
 *
 * Guarda los pagos en memoria: alcanza para una réplica y un reinicio solo
 * pierde pagos simulados.
 */
@Injectable()
export class PasarelaSimulada implements PasarelaPago {
  readonly nombre = 'SIMULADA';
  private readonly pagos = new Map<string, PagoInformado>();
  private secuencia = 0;

  constructor(private readonly config: ConfigService) {}

  crearCobro(solicitud: SolicitudCobro): Promise<CobroCreado> {
    const front = this.config.get<string>('APP_URL') ?? 'http://localhost:5173';
    return Promise.resolve({
      idCobroExterno: `SIM-${solicitud.referencia}`,
      urlPago: `${front}/pagos/simulador?referencia=${encodeURIComponent(solicitud.referencia)}`,
    });
  }

  /** Lo llama el simulador del front: deja informado el pago de la orden. */
  simular(referencia: string, monto: number, aprobado: boolean): PagoInformado {
    const pago: PagoInformado = {
      idPagoExterno: `SIM-PAGO-${++this.secuencia}`,
      referencia,
      estado: aprobado ? 'APROBADO' : 'RECHAZADO',
      monto,
      detalle: aprobado ? 'Pago simulado aprobado' : 'Pago simulado rechazado',
    };
    // Un pago aprobado no se pisa con un rechazo posterior.
    if (this.pagos.get(referencia)?.estado !== 'APROBADO') this.pagos.set(referencia, pago);
    return pago;
  }

  consultarPago(idPagoExterno: string): Promise<PagoInformado | null> {
    const pago = [...this.pagos.values()].find((p) => p.idPagoExterno === idPagoExterno);
    return Promise.resolve(pago ?? null);
  }

  buscarPago(referencia: string): Promise<PagoInformado | null> {
    return Promise.resolve(this.pagos.get(referencia) ?? null);
  }

  /** No hay webhooks: el simulador informa el pago directamente. */
  leerNotificacion(): string | null {
    return null;
  }
}
