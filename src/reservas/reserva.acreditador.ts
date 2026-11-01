import { BadRequestException, Injectable } from '@nestjs/common';
import type { OrdenPago, Prisma } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Acreditador, type AcreditadorCobro } from '../pasarela/acreditadores/acreditador-cobro';

/** Lo que guarda la orden de pago de una seña (`OrdenPago.datos`). */
export interface DatosCobroReserva {
  reservaId: number;
}

/**
 * US-60 · decisión 0004 — Acredita la seña pagada online: la reserva aprobada
 * pasa a CONFIRMADA. Si mientras tanto se canceló (o venció la seña), no se
 * confirma y la orden queda en revisión para devolver el pago.
 */
@Acreditador()
@Injectable()
export class ReservaAcreditador implements AcreditadorCobro {
  readonly concepto = 'RESERVA' as const;

  constructor(private readonly auditoria: AuditoriaService) {}

  async acreditar(orden: OrdenPago, tx: Prisma.TransactionClient) {
    const { reservaId } = orden.datos as unknown as DatosCobroReserva;
    const { count } = await tx.reserva.updateMany({
      where: { id: reservaId, estado: 'APROBADA_PENDIENTE_PAGO' },
      data: {
        estado: 'CONFIRMADA',
        senaPagadaEn: new Date(),
        metodoPagoSena: orden.pasarela,
        ordenPagoId: orden.id,
      },
    });
    if (count === 0) {
      throw new BadRequestException('la reserva ya no estaba aprobada pendiente de pago');
    }
    await this.auditoria.registrar(
      {
        accion: 'EDITAR',
        entidad: 'Reserva',
        idEntidad: reservaId,
        responsableId: orden.usuarioId,
        detalle: `Seña pagada online (orden ${orden.referencia}, ${orden.pasarela}, $${Number(orden.monto).toFixed(2)}). Reserva confirmada.`,
      },
      tx,
    );
  }
}
