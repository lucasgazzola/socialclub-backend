/**
 * US-23 — Vencimiento de la cuota deportiva.
 *
 * La cuota de un mes vence el día DIA_VENCIMIENTO_CUOTA_DEPORTIVA de ese mes
 * (decisión del equipo, 10/10/2026). Hasta ese día inclusive se puede pagar sin
 * ser moroso; desde el día siguiente la cuota impaga es deuda vencida. Los meses
 * futuros nunca vencieron.
 *
 * Las fechas se comparan por día en la hora del servidor, igual que el resto
 * del cálculo de períodos (`cuotas/tarifas.ts`).
 */
export const DIA_VENCIMIENTO_CUOTA_DEPORTIVA = 10;

/** Fecha de vencimiento ("AAAA-MM-DD") de la cuota del período "AAAA-MM". */
export function fechaVencimiento(periodo: string): string {
  return `${periodo}-${String(DIA_VENCIMIENTO_CUOTA_DEPORTIVA).padStart(2, '0')}`;
}

/** true si la cuota del período ya venció a la fecha `hoy`. */
export function cuotaVencida(periodo: string, hoy: Date = new Date()): boolean {
  const actual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  if (periodo < actual) return true;
  if (periodo > actual) return false;
  return hoy.getDate() > DIA_VENCIMIENTO_CUOTA_DEPORTIVA;
}
