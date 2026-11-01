import { SetMetadata } from '@nestjs/common';
import type { ConceptoCobro, OrdenPago, Prisma } from '@prisma/client';

export interface ContextoAcreditacion {
  /**
   * False si la orden había vencido o se había cancelado (y por eso se
   * liberó lo reservado) cuando llegó el pago aprobado: el acreditador tiene
   * que volver a reservar o fallar.
   */
  reservaVigente: boolean;
}

/**
 * Strategy (TASK-51, decisión 0003): qué significa, para un dominio, que se
 * aprobó el pago de una orden. Vive en el módulo de dominio (las cuotas en
 * `pagos`, las entradas en `entradas`) y se registra con `@Acreditador()`:
 * `PasarelaService` no conoce ningún dominio.
 */
export interface AcreditadorCobro {
  readonly concepto: ConceptoCobro;

  /**
   * Crea los registros del dominio (pagos, compra y entradas) dentro de la
   * transacción en que la orden pasa a APROBADA. Si lanza, no se acredita
   * nada y la orden queda REQUIERE_REVISION con el motivo.
   */
  acreditar(
    orden: OrdenPago,
    tx: Prisma.TransactionClient,
    contexto: ContextoAcreditacion,
  ): Promise<void>;

  /** Libera lo reservado al iniciar (p. ej. el cupo) si la orden no se paga. */
  liberar?(orden: OrdenPago, tx: Prisma.TransactionClient): Promise<void>;
}

export const ACREDITADOR_COBRO = 'acreditador-cobro';

/**
 * Marca un provider como acreditador de cobros. `PasarelaService` los
 * descubre al arrancar (Registry), igual que `@Tarea()`.
 */
export const Acreditador = () => SetMetadata(ACREDITADOR_COBRO, true);
