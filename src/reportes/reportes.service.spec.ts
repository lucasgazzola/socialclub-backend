import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PagosService } from '../pagos/pagos.service';
import { PagosDeportivosService } from '../pagos/pagos-deportivos.service';
import { mesesEntre, ReportesService } from './reportes.service';

/**
 * US-35 · Reporte de estado financiero. Se calcula sobre las cuotas de los
 * meses del rango: recaudado (cobrado de esas cuotas), adeudado (vencidas el
 * día 10 e impagas), morosos y porcentaje de cobranza.
 */
describe('US-35 · ReportesService.estadoFinanciero', () => {
  let service: ReportesService;
  /** 15/10/2026: la cuota de octubre ya venció. */
  const HOY = new Date(2026, 9, 15);

  const prisma = {
    pagoCuotaDeportiva: { findMany: jest.fn(), aggregate: jest.fn() },
    pago: { findMany: jest.fn(), aggregate: jest.fn() },
  };
  const pagos = { getMorososCuotaSocial: jest.fn() };
  const pagosDeportivos = { getMorosos: jest.fn() };

  const vencida = (periodo: string, monto: number) => ({
    periodo,
    fechaVencimiento: `${periodo}-10`,
    monto,
    estado: 'VENCIDA',
  });

  /** Como Prisma: devuelve solo las filas con período dentro de `where.periodo`. */
  const filtrarPorPeriodo =
    <T extends { periodo: string }>(filas: T[]) =>
    ({ where }: { where: { periodo: { gte: string; lte: string } } }) =>
      Promise.resolve(
        filas.filter((f) => f.periodo >= where.periodo.gte && f.periodo <= where.periodo.lte),
      );

  beforeEach(async () => {
    jest.clearAllMocks();
    // Cobrado de cuotas deportivas: Fútbol jul y ago, Natación ago.
    prisma.pagoCuotaDeportiva.findMany.mockImplementation(
      filtrarPorPeriodo([
        { monto: 10000, periodo: '2026-07', disciplinaId: 1, disciplina: { nombre: 'Fútbol' } },
        { monto: 10000, periodo: '2026-08', disciplinaId: 1, disciplina: { nombre: 'Fútbol' } },
        { monto: 15000, periodo: '2026-08', disciplinaId: 2, disciplina: { nombre: 'Natación' } },
      ]),
    );
    prisma.pago.findMany.mockImplementation(
      filtrarPorPeriodo([
        { monto: 20000, periodo: '2026-07' },
        { monto: 20000, periodo: '2026-09' },
      ]),
    );
    prisma.pagoCuotaDeportiva.aggregate.mockResolvedValue({ _sum: { monto: 30000 } });
    prisma.pago.aggregate.mockResolvedValue({ _sum: { monto: 50000 } });
    // Deuda deportiva vencida: persona 1 debe Fútbol sep y un mes fuera del rango (jun).
    pagosDeportivos.getMorosos.mockResolvedValue({
      items: [
        {
          personaId: 1,
          disciplinas: [
            {
              disciplinaId: 1,
              disciplinaNombre: 'Fútbol',
              cuotas: [vencida('2026-06', 10000), vencida('2026-09', 10000)],
            },
          ],
        },
      ],
    });
    // Deuda social: persona 1 debe ago; persona 2 debe sep.
    pagos.getMorososCuotaSocial.mockResolvedValue({
      items: [
        { personaId: 1, cuotasPendientes: [{ periodo: '2026-08', monto: 20000 }] },
        { personaId: 2, cuotasPendientes: [{ periodo: '2026-09', monto: 20000 }] },
      ],
    });

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        ReportesService,
        { provide: PrismaService, useValue: prisma },
        { provide: PagosService, useValue: pagos },
        { provide: PagosDeportivosService, useValue: pagosDeportivos },
      ],
    }).compile();
    service = modulo.get(ReportesService);
  });

  it('incluye total recaudado, total adeudado, cantidad de morosos y porcentaje de cobranza', async () => {
    const r = await service.estadoFinanciero({ desde: '2026-07', hasta: '2026-09' }, HOY);

    // Recaudado: 35.000 deportiva + 40.000 social. Adeudado: 10.000 + 40.000.
    expect(r.totales).toEqual({
      recaudado: 75000,
      adeudado: 50000,
      morosos: 2,
      porcentajeCobranza: 60,
      ingresadoPorFechaDeCobro: 80000,
    });
  });

  it('abre el resultado por concepto y por disciplina', async () => {
    const r = await service.estadoFinanciero({ desde: '2026-07', hasta: '2026-09' }, HOY);

    expect(r.porConcepto).toEqual([
      {
        concepto: 'CUOTA_SOCIAL',
        recaudado: 40000,
        adeudado: 40000,
        morosos: 2,
        porcentajeCobranza: 50,
      },
      {
        concepto: 'CUOTA_DEPORTIVA',
        recaudado: 35000,
        adeudado: 10000,
        morosos: 1,
        porcentajeCobranza: 77.8,
      },
    ]);
    expect(r.porDisciplina).toEqual([
      expect.objectContaining({
        disciplinaNombre: 'Fútbol',
        recaudado: 20000,
        adeudado: 10000,
        morosos: 1,
      }),
      expect.objectContaining({
        disciplinaNombre: 'Natación',
        recaudado: 15000,
        adeudado: 0,
        morosos: 0,
        porcentajeCobranza: 100,
      }),
    ]);
  });

  it('solo cuenta las cuotas de los meses del rango (mes, trimestre o rango personalizado)', async () => {
    const r = await service.estadoFinanciero({ desde: '2026-09', hasta: '2026-09' }, HOY);

    expect(prisma.pagoCuotaDeportiva.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { periodo: { gte: '2026-09', lte: '2026-09' } } }),
    );
    // La deuda de junio y la social de agosto quedan afuera.
    expect(r.totales.adeudado).toBe(30000);
    expect(r.porMes).toEqual([{ periodo: '2026-09', recaudado: 20000, adeudado: 30000 }]);
  });

  it('detalla recaudado y adeudado de cada mes del rango', async () => {
    const r = await service.estadoFinanciero({ desde: '2026-07', hasta: '2026-09' }, HOY);

    expect(r.porMes).toEqual([
      { periodo: '2026-07', recaudado: 30000, adeudado: 0 },
      { periodo: '2026-08', recaudado: 25000, adeudado: 20000 },
      { periodo: '2026-09', recaudado: 20000, adeudado: 30000 },
    ]);
  });

  it('con disciplina, reporta solo su cuota deportiva (sin cuota social)', async () => {
    const r = await service.estadoFinanciero(
      { desde: '2026-07', hasta: '2026-09', disciplinaId: 1 },
      HOY,
    );

    expect(pagosDeportivos.getMorosos).toHaveBeenCalledWith({ disciplinaId: 1 }, HOY);
    expect(prisma.pagoCuotaDeportiva.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { periodo: { gte: '2026-07', lte: '2026-09' }, disciplinaId: 1 },
      }),
    );
    expect(pagos.getMorososCuotaSocial).not.toHaveBeenCalled();
    expect(prisma.pago.findMany).not.toHaveBeenCalled();
    expect(r.porConcepto.map((c) => c.concepto)).toEqual(['CUOTA_DEPORTIVA']);
  });

  it('la cuota social del mes en curso no es deuda hasta que vence el día 10', async () => {
    pagos.getMorososCuotaSocial.mockResolvedValue({
      items: [{ personaId: 3, cuotasPendientes: [{ periodo: '2026-10', monto: 20000 }] }],
    });
    pagosDeportivos.getMorosos.mockResolvedValue({ items: [] });

    const antes = await service.estadoFinanciero(
      { desde: '2026-10', hasta: '2026-10' },
      new Date(2026, 9, 10),
    );
    const despues = await service.estadoFinanciero(
      { desde: '2026-10', hasta: '2026-10' },
      new Date(2026, 9, 11),
    );

    expect(antes.totales).toMatchObject({ adeudado: 0, morosos: 0 });
    expect(despues.totales).toMatchObject({ adeudado: 20000, morosos: 1 });
  });

  it('el ingreso por fecha de cobro toma los pagos con fecha dentro del rango', async () => {
    await service.estadoFinanciero({ desde: '2026-07', hasta: '2026-09' }, HOY);

    const { where } = prisma.pago.aggregate.mock.calls[0][0];
    expect(where.fechaPago.gte).toEqual(new Date(2026, 6, 1));
    expect(where.fechaPago.lt).toEqual(new Date(2026, 9, 1));
  });

  it('sin cobros ni deuda el porcentaje de cobranza es null', async () => {
    prisma.pagoCuotaDeportiva.findMany.mockResolvedValue([]);
    prisma.pago.findMany.mockResolvedValue([]);
    pagosDeportivos.getMorosos.mockResolvedValue({ items: [] });
    pagos.getMorososCuotaSocial.mockResolvedValue({ items: [] });

    const r = await service.estadoFinanciero({ desde: '2026-07', hasta: '2026-07' }, HOY);

    expect(r.totales).toMatchObject({
      recaudado: 0,
      adeudado: 0,
      morosos: 0,
      porcentajeCobranza: null,
    });
  });

  it('rechaza un rango invertido o de más de 36 meses', async () => {
    await expect(
      service.estadoFinanciero({ desde: '2026-09', hasta: '2026-07' }, HOY),
    ).rejects.toThrow(
      new BadRequestException('El período «desde» no puede ser posterior a «hasta».'),
    );
    await expect(
      service.estadoFinanciero({ desde: '2023-01', hasta: '2026-09' }, HOY),
    ).rejects.toThrow(new BadRequestException('El reporte abarca como máximo 36 meses.'));
  });

  it('mesesEntre recorre el rango cruzando el cambio de año', () => {
    expect(mesesEntre('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});
