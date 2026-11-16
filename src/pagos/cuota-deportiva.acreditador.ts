import { ConflictException, Injectable } from '@nestjs/common';
import type { OrdenPago, Prisma } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Acreditador, type AcreditadorCobro } from '../pasarela/acreditadores/acreditador-cobro';

/** Lo que guarda la orden de pago de cuotas deportivas (`OrdenPago.datos`). */
export interface DatosCobroCuotaDeportiva {
  personaId: number;
  items: { disciplinaId: number; periodo: string; monto: number }[];
}

/**
 * DT-35 — Acredita el pago online de cuotas deportivas: un
 * `PagoCuotaDeportiva` por disciplina y período, con el monto cotizado.
 */
@Acreditador()
@Injectable()
export class CuotaDeportivaAcreditador implements AcreditadorCobro {
  readonly concepto = 'CUOTA_DEPORTIVA' as const;

  constructor(private readonly auditoria: AuditoriaService) {}

  async acreditar(orden: OrdenPago, tx: Prisma.TransactionClient) {
    const datos = orden.datos as unknown as DatosCobroCuotaDeportiva;

    const yaPagados = await tx.pagoCuotaDeportiva.findMany({
      where: {
        personaId: datos.personaId,
        OR: datos.items.map((item) => ({
          disciplinaId: item.disciplinaId,
          periodo: item.periodo,
        })),
      },
    });
    if (yaPagados.length > 0) {
      throw new ConflictException(
        `el/los período(s) [${yaPagados.map((p) => `${p.disciplinaId}/${p.periodo}`).join(', ')}] ya figuraban como pagados`,
      );
    }

    const fechaPago = new Date();
    for (const item of datos.items) {
      const pago = await tx.pagoCuotaDeportiva.create({
        data: {
          personaId: datos.personaId,
          disciplinaId: item.disciplinaId,
          periodo: item.periodo,
          monto: item.monto,
          metodoPago: orden.pasarela,
          fechaPago,
          responsableId: orden.usuarioId,
          ordenPagoId: orden.id,
        },
      });
      await this.auditoria.registrar(
        {
          accion: 'CREAR',
          entidad: 'PagoCuotaDeportiva',
          idEntidad: pago.id,
          responsableId: orden.usuarioId,
          detalle: `Pago online de cuota deportiva (orden ${orden.referencia}). Persona #${datos.personaId}, Disciplina #${item.disciplinaId}, Período: ${item.periodo}, Monto: $${item.monto}, Método: ${orden.pasarela}`,
        },
        tx,
      );
    }
  }
}
