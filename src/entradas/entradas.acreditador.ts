import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { OrdenPago, Prisma } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import {
  Acreditador,
  type AcreditadorCobro,
  type ContextoAcreditacion,
} from '../pasarela/acreditadores/acreditador-cobro';

/** Lo que guarda la orden de pago de entradas (`OrdenPago.datos`). */
export interface DatosCobroEntradas {
  eventoId: number;
  cantidad: number;
  precioUnitario: number;
  montoTotal: number;
}

/**
 * TASK-51 (DT-31) — Acredita la compra online de entradas: crea la
 * `CompraEntrada` y una entrada con su token por unidad. El cupo se reservó
 * al iniciar; si la orden había vencido, se vuelve a reservar.
 */
@Acreditador()
@Injectable()
export class EntradasAcreditador implements AcreditadorCobro {
  readonly concepto = 'ENTRADAS' as const;

  constructor(private readonly auditoria: AuditoriaService) {}

  async acreditar(
    orden: OrdenPago,
    tx: Prisma.TransactionClient,
    { reservaVigente }: ContextoAcreditacion,
  ) {
    const datos = orden.datos as unknown as DatosCobroEntradas;
    const evento = await tx.evento.findUnique({ where: { id: datos.eventoId } });
    if (!evento) throw new BadRequestException('el evento ya no existe');

    if (!reservaVigente && evento.entradasDisponibles !== null) {
      const stock = await tx.evento.updateMany({
        where: { id: evento.id, entradasDisponibles: { gte: datos.cantidad } },
        data: { entradasDisponibles: { decrement: datos.cantidad } },
      });
      if (stock.count === 0) {
        throw new BadRequestException('la orden venció y las entradas se agotaron');
      }
    }

    const compra = await tx.compraEntrada.create({
      data: {
        usuarioId: orden.usuarioId,
        eventoId: evento.id,
        cantidad: datos.cantidad,
        precioUnitario: datos.precioUnitario,
        montoTotal: datos.montoTotal,
        metodoPago: orden.pasarela,
        ordenPagoId: orden.id,
      },
    });
    await tx.entrada.createMany({
      data: Array.from({ length: datos.cantidad }, () => ({
        token: randomUUID(),
        eventoId: evento.id,
        compraId: compra.id,
      })),
    });

    await this.auditoria.registrar(
      {
        accion: 'CREAR',
        entidad: 'CompraEntrada',
        idEntidad: compra.id,
        responsableId: orden.usuarioId,
        detalle: `Compra aprobada de ${datos.cantidad} entrada(s) para "${evento.nombre}" por $${datos.montoTotal.toFixed(2)} (orden ${orden.referencia}, ${orden.pasarela})`,
      },
      tx,
    );
  }

  /** Devuelve al evento el cupo reservado por una orden que no se pagó. */
  async liberar(orden: OrdenPago, tx: Prisma.TransactionClient) {
    const datos = orden.datos as unknown as DatosCobroEntradas;
    await tx.evento.updateMany({
      where: { id: datos.eventoId, entradasDisponibles: { not: null } },
      data: { entradasDisponibles: { increment: datos.cantidad } },
    });
  }
}
