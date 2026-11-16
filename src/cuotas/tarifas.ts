/**
 * Tarifas de la cuota deportiva (US-20 · TASK-33). Funciones puras: las usan
 * la configuración (US-20), el cobro (US-21), el historial (US-22) y los
 * morosos (US-23).
 *
 * Reglas acordadas por el equipo (02/10/2026):
 * - Tarifa mensual por disciplina; una categoría puede tener tarifa propia que
 *   reemplaza a la de la disciplina.
 * - Cada tarifa rige desde su `periodoAplicacion` hasta que otra la reemplace.
 * - Descuento para socios (porcentaje) en los meses en que la persona tenía la
 *   membresía activa.
 */

export interface TarifaDeportiva {
  id: number;
  categoriaDisciplinaId: number | null;
  periodoAplicacion: string;
  monto: number;
  descuentoSocioPorcentaje: number;
  activo: boolean;
}

export interface MembresiaPeriodo {
  fechaAlta: Date;
  fechaBaja: Date | null;
  activo: boolean;
}

/**
 * Período "YYYY-MM" de una fecha. Se lee en UTC para que las fechas guardadas
 * a las 00:00 UTC del día 1 no caigan en el mes anterior en Argentina (UTC-3)
 * (DT-44).
 */
export function aPeriodo(fecha: Date): string {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Períodos "YYYY-MM" desde `desde` hasta `hasta`, ambos inclusive. */
export function periodosEntre(desde: Date, hasta: Date): string[] {
  const periodos: string[] = [];
  const actual = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), 1));
  const fin = new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), 1));
  while (actual <= fin) {
    periodos.push(aPeriodo(actual));
    actual.setUTCMonth(actual.getUTCMonth() + 1);
  }
  return periodos;
}

/** La tarifa que rige en un período: la más reciente con periodoAplicacion <= período. */
function ultimaVigente(tarifas: TarifaDeportiva[], periodo: string) {
  return (
    tarifas
      .filter((t) => t.activo && t.periodoAplicacion <= periodo)
      .sort((a, b) => b.periodoAplicacion.localeCompare(a.periodoAplicacion))[0] ?? null
  );
}

/**
 * Tarifa de una inscripción en un período: la de su categoría si la categoría
 * tiene una vigente; si no, la de la disciplina. null = sin tarifa configurada.
 */
export function tarifaVigente(
  tarifas: TarifaDeportiva[],
  categoriaDisciplinaId: number | null,
  periodo: string,
): TarifaDeportiva | null {
  if (categoriaDisciplinaId !== null) {
    const deCategoria = ultimaVigente(
      tarifas.filter((t) => t.categoriaDisciplinaId === categoriaDisciplinaId),
      periodo,
    );
    if (deCategoria) return deCategoria;
  }
  return ultimaVigente(
    tarifas.filter((t) => t.categoriaDisciplinaId === null),
    periodo,
  );
}

/** ¿Tenía la persona una membresía activa en algún momento de ese mes? */
export function eraSocioEn(membresias: MembresiaPeriodo[], periodo: string): boolean {
  return membresias.some((m) => {
    if (aPeriodo(m.fechaAlta) > periodo) return false;
    if (m.fechaBaja) return aPeriodo(m.fechaBaja) >= periodo;
    return m.activo;
  });
}

/** Monto a cobrar: la tarifa con el descuento de socio si corresponde, redondeado a centavos. */
export function montoACobrar(tarifa: TarifaDeportiva, esSocio: boolean): number {
  const descuento = esSocio ? tarifa.descuentoSocioPorcentaje : 0;
  return Math.round(tarifa.monto * (100 - descuento)) / 100;
}
