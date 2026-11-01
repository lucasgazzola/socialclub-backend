import { randomInt } from 'node:crypto';
import type { BloqueoAgenda, EstadoReserva } from '@prisma/client';

/**
 * TASK-52 · Reglas de la agenda de espacios (decisión 0004). Funciones puras:
 * las usan la solicitud de reserva (US-59), su evaluación (US-60), la carga
 * de bloqueos (US-55, US-56) y las cancelaciones (US-61), así todos deciden
 * igual qué está ocupado.
 */

/**
 * Huso del club: Argentina (UTC−3, sin horario de verano). Los bloqueos se
 * cargan en hora de reloj del club; las reservas se guardan como instantes.
 */
export const HUSO_CLUB_MINUTOS = -180;

/**
 * Estados que ocupan la agenda. Una solicitud PENDIENTE_APROBACION no bloquea
 * el turno: lo bloquea la aprobación (US-60, «bloquea definitivamente»), que
 * antes verifica que siga libre.
 */
export const ESTADOS_QUE_OCUPAN: readonly EstadoReserva[] = [
  'APROBADA_PENDIENTE_PAGO',
  'CONFIRMADA',
];

/** Estados en los que la reserva sigue viva (todavía puede usarse o cancelarse). */
export const ESTADOS_VIGENTES: readonly EstadoReserva[] = [
  'PENDIENTE_APROBACION',
  'APROBADA_PENDIENTE_PAGO',
  'CONFIRMADA',
];

export interface Intervalo {
  inicio: Date;
  fin: Date;
}

/** Dos intervalos [inicio, fin) se solapan si uno empieza antes de que termine el otro. */
export function seSolapan(a: Intervalo, b: Intervalo): boolean {
  return a.inicio < b.fin && b.inicio < a.fin;
}

const MS_MINUTO = 60_000;
const MS_DIA = 24 * 60 * MS_MINUTO;

/** Instante de una fecha (año, mes 1-12, día) y hora "HH:MM" del reloj del club. */
export function instanteClub(anio: number, mes: number, dia: number, hora = '00:00'): Date {
  const [h, m] = hora.split(':').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia, h, m) - HUSO_CLUB_MINUTOS * MS_MINUTO);
}

/** Fecha del club (a medianoche UTC, como `@db.Date`) en la que cae un instante. */
export function fechaClub(instante: Date): Date {
  const local = new Date(instante.getTime() + HUSO_CLUB_MINUTOS * MS_MINUTO);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/** Día completo en el club (de 00:00 a 24:00 hora argentina) de una fecha. */
export function diaCompleto(fecha: Date): Intervalo {
  const inicio = instanteClub(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, fecha.getUTCDate());
  return { inicio, fin: new Date(inicio.getTime() + MS_DIA) };
}

/** Intervalo de un bloqueo en una fecha del club (con sus horas, o el día entero). */
function intervaloEnFecha(
  bloqueo: Pick<BloqueoAgenda, 'horaInicio' | 'horaFin'>,
  fecha: Date,
): Intervalo {
  if (!bloqueo.horaInicio || !bloqueo.horaFin) return diaCompleto(fecha);
  const [a, m, d] = [fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, fecha.getUTCDate()];
  return {
    inicio: instanteClub(a, m, d, bloqueo.horaInicio),
    fin: instanteClub(a, m, d, bloqueo.horaFin),
  };
}

type BloqueoDeAgenda = Pick<
  BloqueoAgenda,
  | 'tipo'
  | 'diasSemana'
  | 'fecha'
  | 'horaInicio'
  | 'horaFin'
  | 'vigenteDesde'
  | 'vigenteHasta'
  | 'activo'
>;

/**
 * Intervalos concretos que ocupa un bloqueo dentro de un rango: un puntual,
 * su fecha; un recurrente, cada día de la semana indicado dentro de su
 * vigencia. Un bloqueo inactivo no ocupa nada.
 */
export function intervalosDeBloqueo(bloqueo: BloqueoDeAgenda, rango: Intervalo): Intervalo[] {
  if (!bloqueo.activo) return [];
  const fechas: Date[] = [];
  if (bloqueo.tipo === 'PUNTUAL') {
    if (bloqueo.fecha) fechas.push(bloqueo.fecha);
  } else {
    // Se recorren las fechas del club que toca el rango (un día antes por el huso).
    const desde = fechaClub(new Date(rango.inicio.getTime() - MS_DIA));
    const hasta = fechaClub(rango.fin);
    for (let f = desde; f <= hasta; f = new Date(f.getTime() + MS_DIA)) {
      if (bloqueo.vigenteDesde && f < bloqueo.vigenteDesde) continue;
      if (bloqueo.vigenteHasta && f > bloqueo.vigenteHasta) continue;
      if (bloqueo.diasSemana.includes(f.getUTCDay())) fechas.push(f);
    }
  }
  return fechas.map((f) => intervaloEnFecha(bloqueo, f)).filter((i) => seSolapan(i, rango));
}

export interface ConflictoAgenda {
  tipo: 'RESERVA' | 'BLOQUEO';
  id: number;
  inicio: Date;
  fin: Date;
  detalle: string;
}

/**
 * Qué ocupa un intervalo de un espacio: reservas en estado que ocupa y
 * bloqueos (RN-ESP01: el espacio compartido se ocupa entero, sin importar la
 * disciplina). `excluirReservaId` deja fuera la propia reserva al aprobarla.
 */
export function conflictosDe(
  intervalo: Intervalo,
  ocupacion: {
    reservas: { id: number; codigo: string; estado: EstadoReserva; inicio: Date; fin: Date }[];
    bloqueos: (BloqueoDeAgenda & { id: number; motivo: string | null })[];
  },
  excluirReservaId?: number,
): ConflictoAgenda[] {
  const conflictos: ConflictoAgenda[] = [];
  for (const r of ocupacion.reservas) {
    if (r.id === excluirReservaId || !ESTADOS_QUE_OCUPAN.includes(r.estado)) continue;
    if (seSolapan(intervalo, r)) {
      conflictos.push({
        tipo: 'RESERVA',
        id: r.id,
        inicio: r.inicio,
        fin: r.fin,
        detalle: `Reserva ${r.codigo}`,
      });
    }
  }
  for (const b of ocupacion.bloqueos) {
    for (const i of intervalosDeBloqueo(b, intervalo)) {
      conflictos.push({
        tipo: 'BLOQUEO',
        id: b.id,
        ...i,
        detalle: b.motivo ?? 'Bloqueo de agenda',
      });
    }
  }
  return conflictos.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}

/** Sin 0/O ni 1/I: se dicta por teléfono sin confundirse. */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Código de seguimiento de una reserva, p. ej. `RES-7KQ4ZP` (US-59, US-62). */
export function generarCodigoReserva(): string {
  return `RES-${Array.from({ length: 6 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('')}`;
}
