import { ConflictException, Injectable } from '@nestjs/common';
import type { OrdenPago, Prisma } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Acreditador, type AcreditadorCobro } from '../pasarela/acreditadores/acreditador-cobro';

/** Lo que guarda la orden de pago de cuotas sociales (`OrdenPago.datos`). */
export interface DatosCobroCuotaSocial {
  personaId: number;
  periodos: { periodo: string; monto: number }[];
}

/**
 * TASK-51 — Acredita el pago online de cuotas sociales: registra un `Pago`
 * por período, con el monto cotizado al iniciar (el que el socio pagó).
 */
@Acreditador()
@Injectable()
export class CuotaSocialAcreditador implements AcreditadorCobro {
  readonly concepto = 'CUOTA_SOCIAL' as const;

  constructor(private readonly auditoria: AuditoriaService) {}

  async acreditar(orden: OrdenPago, tx: Prisma.TransactionClient) {
    const datos = orden.datos as unknown as DatosCobroCuotaSocial;
    const periodos = datos.periodos.map((p) => p.periodo);

    // Mientras el socio pagaba, secretaría pudo haber cobrado algún período.
    const yaPagados = await tx.pago.findMany({
      where: { personaId: datos.personaId, periodo: { in: periodos } },
    });
    if (yaPagados.length > 0) {
      throw new ConflictException(
        `el/los período(s) [${yaPagados.map((p) => p.periodo).join(', ')}] ya figuraban como pagados`,
      );
    }

    const fechaPago = new Date();
    for (const item of datos.periodos) {
      const pago = await tx.pago.create({
        data: {
          personaId: datos.personaId,
          periodo: item.periodo,
          monto: item.monto,
          metodoPago: orden.pasarela,
          fechaPago,
          ordenPagoId: orden.id,
        },
      });
      await this.auditoria.registrar(
        {
          accion: 'CREAR',
          entidad: 'Pago',
          idEntidad: pago.id,
          responsableId: orden.usuarioId,
          detalle: `Pago online de cuota social (orden ${orden.referencia}). Persona #${datos.personaId}, Período: ${item.periodo}, Monto: $${item.monto}, Método: ${orden.pasarela}`,
        },
        tx,
      );
    }
  }
}
