import type { Prisma } from '@prisma/client';

/**
 * DT-41 — Historial de períodos de una inscripción.
 *
 * `Inscripcion` es única por persona y disciplina: al reinscribir se reactiva
 * la misma fila y `fechaInscripcion` se pisa. Cada alta abre un período y
 * cada baja lo cierra, así la deuda de cuota deportiva de los tramos
 * anteriores no se pierde.
 */

/** Abre un período vigente (alta o reinscripción). */
export function abrirPeriodo(tx: Prisma.TransactionClient, inscripcionId: number, desde: Date) {
  return tx.periodoInscripcion.create({ data: { inscripcionId, desde } });
}

/** Cierra los períodos vigentes de las inscripciones dadas de baja. */
export function cerrarPeriodos(
  tx: Prisma.TransactionClient,
  inscripcionIds: number[],
  hasta: Date,
) {
  return tx.periodoInscripcion.updateMany({
    where: { inscripcionId: { in: inscripcionIds }, hasta: null },
    data: { hasta },
  });
}
