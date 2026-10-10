import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { PagosDeportivosService } from './pagos-deportivos.service';
import { CriterioOrdenMorosos, SentidoOrden } from './dto/find-morosos-query.dto';

/**
 * US-23 · Ver morosos de cuota deportiva. Un moroso tiene al menos una cuota
 * vencida (después del día 10 de su mes) e impaga; la deuda se separa por
 * disciplina y usa la misma tarifa que el cobro (US-21).
 */
describe('US-23 · PagosDeportivosService.getMorosos', () => {
  let service: PagosDeportivosService;
  const mockPrisma = {
    persona: { findMany: jest.fn() },
    configuracionCuotaDeportiva: { findMany: jest.fn() },
    pagoCuotaDeportiva: { findMany: jest.fn() },
  };

  /** 15/10/2026: la cuota de octubre ya venció (día 10). */
  const HOY = new Date(2026, 9, 15);

  const FUTBOL = 1;
  const NATACION = 2;

  function inscripcion(
    disciplinaId: number,
    desde: Date,
    extra: Partial<Record<string, unknown>> = {},
  ) {
    return {
      disciplinaId,
      categoriaDisciplinaId: null,
      fechaInscripcion: desde,
      fechaBaja: null,
      activo: true,
      periodos: [{ desde, hasta: null }],
      disciplina: { id: disciplinaId, nombre: disciplinaId === FUTBOL ? 'Fútbol' : 'Natación' },
      categoriaDisciplina: null,
      ...extra,
    };
  }

  function persona(
    id: number,
    apellido: string,
    inscripciones: unknown[],
    membresias: unknown[] = [],
  ) {
    return {
      id,
      nombre: 'Ana',
      apellido,
      dni: `3000000${id}`,
      email: null,
      telefono: null,
      inscripciones,
      membresias,
    };
  }

  function tarifa(disciplinaId: number, monto: number, descuento = 0) {
    return {
      id: disciplinaId,
      disciplinaId,
      categoriaDisciplinaId: null,
      periodoAplicacion: '2026-01',
      monto,
      descuentoSocioPorcentaje: descuento,
      activo: true,
    };
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.configuracionCuotaDeportiva.findMany.mockResolvedValue([
      tarifa(FUTBOL, 10000, 20),
      tarifa(NATACION, 15000),
    ]);
    mockPrisma.pagoCuotaDeportiva.findMany.mockResolvedValue([]);
    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        PagosDeportivosService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditoriaService, useValue: { registrar: jest.fn() } },
      ],
    }).compile();
    service = modulo.get(PagosDeportivosService);
  });

  it('muestra nombre, DNI, disciplina, períodos adeudados y monto total de cada moroso', async () => {
    mockPrisma.persona.findMany.mockResolvedValue([
      persona(1, 'Gómez', [inscripcion(FUTBOL, new Date(2026, 7, 5))]),
    ]);

    const r = await service.getMorosos({}, HOY);

    expect(r.total).toBe(1);
    expect(r.items[0]).toMatchObject({
      personaId: 1,
      nombreCompleto: 'Ana Gómez',
      dni: '30000001',
      cantidadPeriodos: 3,
      montoTotalDeuda: 30000,
    });
    expect(r.items[0].disciplinas).toEqual([
      expect.objectContaining({
        disciplinaNombre: 'Fútbol',
        cantidadPeriodos: 3,
        montoAdeudado: 30000,
      }),
    ]);
  });

  it('identifica cada período adeudado con su importe, vencimiento y estado', async () => {
    mockPrisma.persona.findMany.mockResolvedValue([
      persona(1, 'Gómez', [inscripcion(FUTBOL, new Date(2026, 8, 3))]),
    ]);

    const r = await service.getMorosos({}, HOY);

    expect(r.items[0].disciplinas[0].cuotas).toEqual([
      { periodo: '2026-09', fechaVencimiento: '2026-09-10', monto: 10000, estado: 'VENCIDA' },
      { periodo: '2026-10', fechaVencimiento: '2026-10-10', monto: 10000, estado: 'VENCIDA' },
    ]);
  });

  it('no cuenta las cuotas que todavía no vencieron (el mes en curso hasta el día 10)', async () => {
    mockPrisma.persona.findMany.mockResolvedValue([
      persona(1, 'Gómez', [inscripcion(FUTBOL, new Date(2026, 8, 3))]),
    ]);

    const r = await service.getMorosos({}, new Date(2026, 9, 10));

    expect(r.items[0].disciplinas[0].cuotas.map((c) => c.periodo)).toEqual(['2026-09']);
    expect(r.items[0].montoTotalDeuda).toBe(10000);
  });

  it('no lista a quien solo debe una cuota que todavía no venció', async () => {
    mockPrisma.persona.findMany.mockResolvedValue([
      persona(1, 'Nuevo', [inscripcion(FUTBOL, new Date(2026, 9, 2))]),
    ]);

    const r = await service.getMorosos({}, new Date(2026, 9, 8));

    expect(r).toMatchObject({ total: 0, deudaTotal: 0, items: [] });
  });

  it('no lista a quien tiene todas sus cuotas vencidas pagas', async () => {
    mockPrisma.persona.findMany.mockResolvedValue([
      persona(1, 'AlDía', [inscripcion(FUTBOL, new Date(2026, 8, 3))]),
    ]);
    mockPrisma.pagoCuotaDeportiva.findMany.mockResolvedValue([
      { personaId: 1, disciplinaId: FUTBOL, periodo: '2026-09' },
      { personaId: 1, disciplinaId: FUTBOL, periodo: '2026-10' },
    ]);

    await expect(service.getMorosos({}, HOY)).resolves.toMatchObject({ total: 0, items: [] });
  });

  it('el total suma solo las cuotas vencidas e impagas, con el descuento de socio de cada mes', async () => {
    const socio = [{ activo: true, fechaAlta: new Date(2020, 0, 1), fechaBaja: null }];
    mockPrisma.persona.findMany.mockResolvedValue([
      persona(1, 'Socia', [inscripcion(FUTBOL, new Date(2026, 7, 1))], socio),
    ]);
    mockPrisma.pagoCuotaDeportiva.findMany.mockResolvedValue([
      { personaId: 1, disciplinaId: FUTBOL, periodo: '2026-09' },
    ]);

    const r = await service.getMorosos({}, HOY);

    // ago y oct impagos, con 20 % de descuento: 2 × 8.000
    expect(r.items[0].disciplinas[0].cuotas.map((c) => [c.periodo, c.monto])).toEqual([
      ['2026-08', 8000],
      ['2026-10', 8000],
    ]);
    expect(r.items[0].montoTotalDeuda).toBe(16000);
  });

  it('un mes sin tarifa no se puede cobrar y no cuenta como deuda', async () => {
    mockPrisma.configuracionCuotaDeportiva.findMany.mockResolvedValue([]);
    mockPrisma.persona.findMany.mockResolvedValue([
      persona(1, 'SinTarifa', [inscripcion(FUTBOL, new Date(2026, 7, 1))]),
    ]);

    await expect(service.getMorosos({}, HOY)).resolves.toMatchObject({ total: 0 });
  });

  it('separa la deuda de cada disciplina cuando la persona está en más de una', async () => {
    mockPrisma.persona.findMany.mockResolvedValue([
      persona(1, 'Doble', [
        inscripcion(FUTBOL, new Date(2026, 8, 1)),
        inscripcion(NATACION, new Date(2026, 9, 1)),
      ]),
    ]);

    const r = await service.getMorosos({}, HOY);

    expect(
      r.items[0].disciplinas.map((d) => [d.disciplinaNombre, d.cantidadPeriodos, d.montoAdeudado]),
    ).toEqual([
      ['Fútbol', 2, 20000],
      ['Natación', 1, 15000],
    ]);
    expect(r.items[0]).toMatchObject({ cantidadPeriodos: 3, montoTotalDeuda: 35000 });
  });

  it('conserva la deuda de una disciplina dada de baja (DT-41)', async () => {
    mockPrisma.persona.findMany.mockResolvedValue([
      persona(1, 'Baja', [
        inscripcion(FUTBOL, new Date(2026, 5, 1), {
          activo: false,
          fechaBaja: new Date(2026, 6, 20),
          periodos: [{ desde: new Date(2026, 5, 1), hasta: new Date(2026, 6, 20) }],
        }),
      ]),
    ]);

    const r = await service.getMorosos({}, HOY);

    expect(r.items[0].disciplinas[0]).toMatchObject({
      inscripcionActiva: false,
      cantidadPeriodos: 2,
    });
  });

  it('filtra por disciplina: consulta solo esa disciplina', async () => {
    mockPrisma.persona.findMany.mockResolvedValue([]);

    await service.getMorosos({ disciplinaId: NATACION }, HOY);

    const consulta = mockPrisma.persona.findMany.mock.calls[0][0];
    expect(consulta.where.inscripciones).toEqual({ some: { disciplinaId: NATACION } });
    expect(consulta.include.inscripciones.where).toEqual({ disciplinaId: NATACION });
  });

  it('busca por nombre, apellido o DNI', async () => {
    mockPrisma.persona.findMany.mockResolvedValue([]);

    await service.getMorosos({ busqueda: '  Gómez ' }, HOY);

    expect(mockPrisma.persona.findMany.mock.calls[0][0].where.OR).toEqual([
      { nombre: { contains: 'Gómez', mode: 'insensitive' } },
      { apellido: { contains: 'Gómez', mode: 'insensitive' } },
      { dni: { contains: 'Gómez' } },
    ]);
  });

  describe('orden', () => {
    beforeEach(() => {
      mockPrisma.persona.findMany.mockResolvedValue([
        // 3 períodos de Fútbol: 30.000
        persona(1, 'MuchosPeriodos', [inscripcion(FUTBOL, new Date(2026, 7, 1))]),
        // Natación sep y oct (2 × 15.000) + Fútbol oct (10.000): 3 períodos, 40.000
        persona(2, 'MasDeuda', [
          inscripcion(NATACION, new Date(2026, 8, 1)),
          inscripcion(FUTBOL, new Date(2026, 9, 1)),
        ]),
        // 1 período de Fútbol: 10.000
        persona(3, 'Poca', [inscripcion(FUTBOL, new Date(2026, 9, 1))]),
      ]);
    });

    it('por monto total, de mayor a menor por defecto', async () => {
      const r = await service.getMorosos({}, HOY);
      expect(r.items.map((m) => [m.apellido, m.montoTotalDeuda])).toEqual([
        ['MasDeuda', 40000],
        ['MuchosPeriodos', 30000],
        ['Poca', 10000],
      ]);
      expect(r.deudaTotal).toBe(80000);
    });

    it('por cantidad de períodos, ascendente', async () => {
      const r = await service.getMorosos(
        { ordenarPor: CriterioOrdenMorosos.PERIODOS, orden: SentidoOrden.ASC },
        HOY,
      );
      expect(r.items.map((m) => [m.apellido, m.cantidadPeriodos])).toEqual([
        ['Poca', 1],
        ['MuchosPeriodos', 3],
        ['MasDeuda', 3],
      ]);
    });
  });
});
