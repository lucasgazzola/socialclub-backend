import {
  DURACION_POR_DEFECTO_HORAS,
  eventoTerminado,
  filtroEventoTerminado,
  finDelEvento,
} from './fin-del-evento';

/** DT-32 / DT-33 · Cuándo termina un evento (y vencen sus entradas). */
describe('DT-33 · fin del evento', () => {
  const inicio = new Date('2026-10-18T23:00:00.000Z');

  it('usa la fecha de fin si el evento la tiene', () => {
    const fin = new Date('2026-10-19T03:00:00.000Z');
    expect(finDelEvento({ fechaEvento: inicio, fechaFin: fin })).toEqual(fin);
  });

  it('sin fecha de fin, termina 12 horas después de empezar', () => {
    expect(DURACION_POR_DEFECTO_HORAS).toBe(12);
    expect(finDelEvento({ fechaEvento: inicio, fechaFin: null })).toEqual(
      new Date('2026-10-19T11:00:00.000Z'),
    );
  });

  it('está terminado recién después de su fin', () => {
    const evento = { fechaEvento: inicio, fechaFin: new Date('2026-10-19T03:00:00.000Z') };
    expect(eventoTerminado(evento, new Date('2026-10-19T02:59:00.000Z'))).toBe(false);
    expect(eventoTerminado(evento, new Date('2026-10-19T03:00:00.000Z'))).toBe(false);
    expect(eventoTerminado(evento, new Date('2026-10-19T03:01:00.000Z'))).toBe(true);
  });

  it('el filtro de Prisma contempla los eventos con y sin fecha de fin', () => {
    const ahora = new Date('2026-10-19T12:00:00.000Z');
    expect(filtroEventoTerminado(ahora)).toEqual({
      OR: [
        { fechaFin: { lt: ahora } },
        { fechaFin: null, fechaEvento: { lt: new Date('2026-10-19T00:00:00.000Z') } },
      ],
    });
  });
});
