import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CuotasService, periodoActual, proximoPeriodo } from './cuotas.service';

/**
 * US-20 · TASK-33 — Tarifa mensual de la cuota deportiva por disciplina (base)
 * o por categoría de la disciplina, con descuento para socios.
 */
describe('CuotasService', () => {
  let service: CuotasService;

  const prismaMock = {
    disciplina: { findUnique: jest.fn() },
    configuracionCuotaDeportiva: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const auditoriaMock = { registrar: jest.fn() };

  const futbol = { id: 1, nombre: 'Fútbol', categorias: [{ id: 7, nombre: 'Sub-15' }] };
  const guardada = {
    id: 1,
    disciplinaId: 1,
    categoriaDisciplinaId: null,
    monto: 18000,
    descuentoSocioPorcentaje: 20,
    activo: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-15T12:00:00'));

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CuotasService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
      ],
    }).compile();

    service = moduleRef.get(CuotasService);
    prismaMock.disciplina.findUnique.mockResolvedValue(futbol);
    prismaMock.configuracionCuotaDeportiva.findFirst.mockResolvedValue(null);
    prismaMock.configuracionCuotaDeportiva.create.mockResolvedValue(guardada);
    prismaMock.configuracionCuotaDeportiva.update.mockResolvedValue(guardada);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('el próximo período es el mes siguiente al actual', () => {
    expect(proximoPeriodo(new Date('2026-08-15T12:00:00'))).toBe('2026-09');
    expect(proximoPeriodo(new Date('2026-12-01T12:00:00'))).toBe('2027-01');
    expect(periodoActual(new Date('2026-08-15T12:00:00'))).toBe('2026-08');
  });

  it('crea la tarifa base de la disciplina con su descuento para socios y audita CREAR', async () => {
    prismaMock.configuracionCuotaDeportiva.count.mockResolvedValue(1); // ya tenía tarifas

    const res = await service.configurar(
      { disciplinaId: 1, monto: 18000, descuentoSocioPorcentaje: 20 },
      9,
    );

    expect(prismaMock.configuracionCuotaDeportiva.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          disciplinaId: 1,
          categoriaDisciplinaId: null,
          periodoAplicacion: '2026-09', // los cambios aplican desde el período siguiente
          monto: 18000,
          descuentoSocioPorcentaje: 20,
        },
      }),
    );
    expect(res.monto).toBe(18000);
    expect(auditoriaMock.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'CREAR',
        entidad: 'ConfiguracionCuotaDeportiva',
        detalle: 'Tarifa Fútbol (tarifa base) desde 2026-09: $18000, descuento socios 20 %',
      }),
    );
  });

  it('la primera tarifa de una disciplina rige desde el período actual', async () => {
    prismaMock.configuracionCuotaDeportiva.count.mockResolvedValue(0);

    await service.configurar({ disciplinaId: 1, monto: 18000 }, 9);

    expect(prismaMock.configuracionCuotaDeportiva.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          periodoAplicacion: '2026-08',
          descuentoSocioPorcentaje: 0,
        }) as object,
      }),
    );
  });

  it('crea la tarifa propia de una categoría de la disciplina', async () => {
    prismaMock.configuracionCuotaDeportiva.count.mockResolvedValue(0);

    await service.configurar({ disciplinaId: 1, categoriaDisciplinaId: 7, monto: 12000 }, 9);

    expect(prismaMock.configuracionCuotaDeportiva.count).toHaveBeenCalledWith({
      where: { disciplinaId: 1, categoriaDisciplinaId: 7 },
    });
    expect(prismaMock.configuracionCuotaDeportiva.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ categoriaDisciplinaId: 7, monto: 12000 }) as object,
      }),
    );
  });

  it('si ya hay tarifa para ese alcance y período, la actualiza en lugar de duplicarla', async () => {
    prismaMock.configuracionCuotaDeportiva.count.mockResolvedValue(1);
    prismaMock.configuracionCuotaDeportiva.findFirst.mockResolvedValue({ id: 1 });

    await service.configurar({ disciplinaId: 1, monto: 20000, periodoAplicacion: '2026-09' }, 9);

    expect(prismaMock.configuracionCuotaDeportiva.create).not.toHaveBeenCalled();
    expect(prismaMock.configuracionCuotaDeportiva.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: { monto: 20000, descuentoSocioPorcentaje: 0, activo: true },
      }),
    );
    expect(auditoriaMock.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'EDITAR' }),
    );
  });

  it('rechaza cambiar una tarifa existente desde el período actual o uno pasado', async () => {
    prismaMock.configuracionCuotaDeportiva.count.mockResolvedValue(1);

    await expect(
      service.configurar({ disciplinaId: 1, monto: 18000, periodoAplicacion: '2026-08' }, 9),
    ).rejects.toThrow('los cambios de cuota aplican a partir del período siguiente (2026-09)');
  });

  it('rechaza que la primera tarifa rija desde un período pasado', async () => {
    prismaMock.configuracionCuotaDeportiva.count.mockResolvedValue(0);

    await expect(
      service.configurar({ disciplinaId: 1, monto: 18000, periodoAplicacion: '2026-07' }, 9),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza una disciplina inexistente', async () => {
    prismaMock.disciplina.findUnique.mockResolvedValue(null);

    await expect(service.configurar({ disciplinaId: 99, monto: 18000 }, 9)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rechaza una categoría que no es de la disciplina', async () => {
    await expect(
      service.configurar({ disciplinaId: 1, categoriaDisciplinaId: 99, monto: 18000 }, 9),
    ).rejects.toThrow('La categoría no pertenece a esta disciplina');
  });

  it('lista tarifas filtrando por disciplina, categoría y período', async () => {
    prismaMock.configuracionCuotaDeportiva.findMany.mockReturnValue([
      { ...guardada, monto: '18000' },
    ]);
    prismaMock.configuracionCuotaDeportiva.count.mockReturnValue(1);
    prismaMock.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));

    const res = await service.findAll({
      disciplinaId: 1,
      categoriaDisciplinaId: 7,
      periodoAplicacion: '2026-09',
      pagina: 1,
      porPagina: 20,
    });

    expect(prismaMock.configuracionCuotaDeportiva.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { disciplinaId: 1, categoriaDisciplinaId: 7, periodoAplicacion: '2026-09' },
      }),
    );
    expect(res.items[0].monto).toBe(18000);
    expect(res.total).toBe(1);
  });
});
