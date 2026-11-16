import type { BloqueoAgenda } from '@prisma/client';
import {
  conflictosDe,
  diaCompleto,
  ESTADOS_QUE_OCUPAN,
  fechaClub,
  generarCodigoReserva,
  instanteClub,
  intervalosDeBloqueo,
  obtenerIdsEspaciosRelacionados,
  seSolapan,
} from './agenda';

/** TASK-52 · Reglas de la agenda de espacios (decisión 0004). */
describe('TASK-52 · agenda de espacios', () => {
  const fecha = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const bloqueo = (extra: Partial<BloqueoAgenda>) =>
    ({
      id: 1,
      tipo: 'RECURRENTE',
      diasSemana: [],
      fecha: null,
      horaInicio: '18:00',
      horaFin: '20:00',
      vigenteDesde: null,
      vigenteHasta: null,
      activo: true,
      motivo: 'Entrenamiento de fútbol',
      ...extra,
    }) as BloqueoAgenda;

  describe('horas del club (UTC−3)', () => {
    it('las 18:00 del club son las 21:00 UTC', () => {
      expect(instanteClub(2026, 11, 3, '18:00').toISOString()).toBe('2026-11-03T21:00:00.000Z');
    });

    it('un día completo va de 00:00 a 24:00 hora argentina', () => {
      expect(diaCompleto(fecha('2026-11-03'))).toEqual({
        inicio: new Date('2026-11-03T03:00:00Z'),
        fin: new Date('2026-11-04T03:00:00Z'),
      });
    });

    it('las 23:30 del club siguen siendo el mismo día aunque en UTC ya sea el siguiente', () => {
      expect(fechaClub(new Date('2026-11-04T02:30:00Z'))).toEqual(fecha('2026-11-03'));
    });
  });

  describe('solapamiento', () => {
    const t = (h: number) => new Date(Date.UTC(2026, 10, 3, h));

    it('dos turnos que se pisan se solapan', () => {
      expect(seSolapan({ inicio: t(10), fin: t(12) }, { inicio: t(11), fin: t(13) })).toBe(true);
    });

    it('un turno que empieza cuando termina el otro no se solapa', () => {
      expect(seSolapan({ inicio: t(10), fin: t(12) }, { inicio: t(12), fin: t(14) })).toBe(false);
    });
  });

  describe('bloqueos', () => {
    // Martes 03/11/2026, de 00:00 a 24:00 del club.
    const martes = diaCompleto(fecha('2026-11-03'));

    it('un recurrente ocupa sus horas en los días de la semana indicados', () => {
      const intervalos = intervalosDeBloqueo(bloqueo({ diasSemana: [2, 4] }), martes);
      expect(intervalos).toEqual([
        { inicio: instanteClub(2026, 11, 3, '18:00'), fin: instanteClub(2026, 11, 3, '20:00') },
      ]);
    });

    it('un recurrente no ocupa otros días ni fuera de su vigencia', () => {
      expect(intervalosDeBloqueo(bloqueo({ diasSemana: [1] }), martes)).toEqual([]);
      expect(
        intervalosDeBloqueo(
          bloqueo({ diasSemana: [2], vigenteHasta: fecha('2026-11-02') }),
          martes,
        ),
      ).toEqual([]);
      expect(
        intervalosDeBloqueo(
          bloqueo({ diasSemana: [2], vigenteDesde: fecha('2026-11-04') }),
          martes,
        ),
      ).toEqual([]);
    });

    it('un puntual sin horas ocupa el día completo de su fecha', () => {
      const puntual = bloqueo({
        tipo: 'PUNTUAL',
        fecha: fecha('2026-11-03'),
        horaInicio: null,
        horaFin: null,
      });
      expect(intervalosDeBloqueo(puntual, martes)).toEqual([martes]);
    });

    it('un bloqueo inactivo no ocupa nada', () => {
      expect(intervalosDeBloqueo(bloqueo({ diasSemana: [2], activo: false }), martes)).toEqual([]);
    });
  });

  describe('conflictos de un turno', () => {
    const turno = {
      inicio: instanteClub(2026, 11, 3, '19:00'),
      fin: instanteClub(2026, 11, 3, '21:00'),
    };
    const reserva = (
      id: number,
      estado: (typeof ESTADOS_QUE_OCUPAN)[number] | 'PENDIENTE_APROBACION' | 'CANCELADA_USUARIO',
    ) => ({
      id,
      codigo: `RES-00000${id}`,
      estado,
      inicio: instanteClub(2026, 11, 3, '20:00'),
      fin: instanteClub(2026, 11, 3, '22:00'),
    });

    it('solo ocupan las reservas aprobadas o confirmadas (una pendiente no bloquea)', () => {
      const conflictos = conflictosDe(turno, {
        reservas: [
          reserva(1, 'APROBADA_PENDIENTE_PAGO'),
          reserva(2, 'CONFIRMADA'),
          reserva(3, 'PENDIENTE_APROBACION'),
          reserva(4, 'CANCELADA_USUARIO'),
        ],
        bloqueos: [],
      });
      expect(conflictos.map((c) => c.id)).toEqual([1, 2]);
    });

    it('al aprobar se excluye la propia reserva', () => {
      expect(
        conflictosDe(turno, { reservas: [reserva(1, 'CONFIRMADA')], bloqueos: [] }, 1),
      ).toEqual([]);
    });

    it('un bloqueo del club choca con el turno, sin importar la disciplina (RN-ESP01)', () => {
      const conflictos = conflictosDe(turno, {
        reservas: [],
        bloqueos: [bloqueo({ diasSemana: [2] })],
      });
      expect(conflictos).toEqual([
        expect.objectContaining({ tipo: 'BLOQUEO', detalle: 'Entrenamiento de fútbol' }),
      ]);
    });

    it('indica el espacio de origen en el detalle si proviene de un espacio relacionado (padre o hijo)', () => {
      const conflictos = conflictosDe(
        turno,
        {
          reservas: [
            {
              id: 5,
              codigo: 'RES-HIJO01',
              estado: 'CONFIRMADA',
              inicio: instanteClub(2026, 11, 3, '19:30'),
              fin: instanteClub(2026, 11, 3, '20:30'),
              espacioId: 11,
              espacio: { id: 11, nombre: 'Parrilla 1' },
            },
          ],
          bloqueos: [
            {
              ...bloqueo({ diasSemana: [2], motivo: null }),
              id: 99,
              espacioId: 10,
              espacio: { id: 10, nombre: 'Sector Parrillas' },
            },
          ],
        },
        undefined,
        12, // Evaluando Parrilla 2 (espacio 12)
      );

      expect(conflictos).toEqual([
        expect.objectContaining({
          tipo: 'BLOQUEO',
          id: 99,
          detalle: 'Bloqueo de agenda (Sector Parrillas)',
        }),
        expect.objectContaining({
          tipo: 'RESERVA',
          id: 5,
          detalle: 'Reserva RES-HIJO01 (Parrilla 1)',
        }),
      ]);
    });

    it('conserva el detalle estándar sin paréntesis si el conflicto es del mismo espacio', () => {
      const conflictos = conflictosDe(
        turno,
        {
          reservas: [
            {
              id: 5,
              codigo: 'RES-MISMO',
              estado: 'CONFIRMADA',
              inicio: instanteClub(2026, 11, 3, '19:30'),
              fin: instanteClub(2026, 11, 3, '20:30'),
              espacioId: 10,
              espacio: { id: 10, nombre: 'Sector Parrillas' },
            },
          ],
          bloqueos: [
            {
              ...bloqueo({ diasSemana: [2], motivo: 'Mantenimiento' }),
              id: 88,
              espacioId: 10,
              espacio: { id: 10, nombre: 'Sector Parrillas' },
            },
          ],
        },
        undefined,
        10, // Mismo espacio
      );

      expect(conflictos[0].detalle).toBe('Mantenimiento');
      expect(conflictos[1].detalle).toBe('Reserva RES-MISMO');
    });
  });

  describe('obtenerIdsEspaciosRelacionados (Patrón Composite RN-ESP01)', () => {
    it('devuelve solo su ID si es un espacio individual sin padre ni hijos', async () => {
      const prismaMock = {
        espacio: {
          findUnique: jest.fn().mockResolvedValue({
            id: 1,
            espacioPadreId: null,
            subespacios: [],
          }),
        },
      };

      const ids = await obtenerIdsEspaciosRelacionados(prismaMock, 1);
      expect(ids).toEqual([1]);
    });

    it('para un espacio padre devuelve su ID y los IDs de sus hijos activos, omitiendo inactivos', async () => {
      const prismaMock = {
        espacio: {
          findUnique: jest.fn().mockResolvedValue({
            id: 10,
            espacioPadreId: null,
            subespacios: [
              { id: 11, activo: true },
              { id: 12, activo: true },
              { id: 13, activo: false },
            ],
          }),
        },
      };

      const ids = await obtenerIdsEspaciosRelacionados(prismaMock, 10);
      expect(ids).toEqual([10, 11, 12]);
    });

    it('para un espacio hijo devuelve su ID y el de su padre, pero NO el de sus hermanos', async () => {
      const prismaMock = {
        espacio: {
          findUnique: jest.fn().mockResolvedValue({
            id: 11,
            espacioPadreId: 10,
            subespacios: [],
          }),
        },
      };

      const ids = await obtenerIdsEspaciosRelacionados(prismaMock, 11);
      expect(ids).toEqual([11, 10]);
      expect(ids).not.toContain(12);
    });

    it('soporta recibir directamente el objeto de espacio en memoria sin llamar a Prisma', async () => {
      const prismaMock = { espacio: { findUnique: jest.fn() } };
      const espacioObj = {
        id: 20,
        espacioPadreId: null,
        subespacios: [
          { id: 21, activo: true },
          { id: 22, activo: false },
        ],
      };

      const ids = await obtenerIdsEspaciosRelacionados(prismaMock, espacioObj);
      expect(ids).toEqual([20, 21]);
      expect(prismaMock.espacio.findUnique).not.toHaveBeenCalled();
    });

    it('devuelve [espacioId] si el espacio no existe o si no hay findUnique configurado', async () => {
      const prismaMock = {
        espacio: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };

      const ids = await obtenerIdsEspaciosRelacionados(prismaMock, 999);
      expect(ids).toEqual([999]);

      const idsSinPrisma = await obtenerIdsEspaciosRelacionados({} as any, 5);
      expect(idsSinPrisma).toEqual([5]);
    });
  });

  it('genera códigos de seguimiento legibles y distintos', () => {
    const codigos = Array.from({ length: 200 }, generarCodigoReserva);
    expect(codigos.every((c) => /^RES-[A-HJ-NP-Z2-9]{6}$/.test(c))).toBe(true);
    expect(new Set(codigos).size).toBeGreaterThan(195);
  });
});
