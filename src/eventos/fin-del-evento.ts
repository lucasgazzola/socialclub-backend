/**
 * DT-32 / DT-33 — Cuándo termina un evento y, por lo tanto, cuándo vencen
 * sus entradas.
 *
 * Si el evento no informa `fechaFin`, se toma que dura `DURACION_POR_DEFECTO_HORAS`
 * desde su inicio: alcanza para un partido o una cena y cubre los eventos
 * nocturnos que terminan pasada la medianoche. La validación de las fechas
 * al crear o editar la hace `EventosService.validarFechas`.
 */
export const DURACION_POR_DEFECTO_HORAS = 12;

const MS_HORA = 60 * 60 * 1000;

export interface FechasDelEvento {
  fechaEvento: Date;
  fechaFin: Date | null;
}

export function finDelEvento({ fechaEvento, fechaFin }: FechasDelEvento): Date {
  return fechaFin ?? new Date(fechaEvento.getTime() + DURACION_POR_DEFECTO_HORAS * MS_HORA);
}

export function eventoTerminado(evento: FechasDelEvento, ahora: Date = new Date()): boolean {
  return finDelEvento(evento).getTime() < ahora.getTime();
}

/**
 * Filtro de Prisma para «el evento ya terminó» a la fecha dada: tiene fin y ya
 * pasó, o no tiene fin y pasaron las horas por defecto desde que empezó.
 */
export function filtroEventoTerminado(ahora: Date = new Date()) {
  return {
    OR: [
      { fechaFin: { lt: ahora } },
      {
        fechaFin: null,
        fechaEvento: { lt: new Date(ahora.getTime() - DURACION_POR_DEFECTO_HORAS * MS_HORA) },
      },
    ],
  };
}
