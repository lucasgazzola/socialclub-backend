import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FeesService, proximoPeriodo } from './fees.service';

describe('FeesService', () => {
  let service: FeesService;

  const prismaMock = {
    discipline: { findUnique: jest.fn() },
    memberCategory: { findUnique: jest.fn() },
    sportsFeeConfig: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const auditMock = { record: jest.fn() };

  const disciplina = { id: 1, name: 'Fútbol' };
  const categoria = { id: 1, name: 'Juvenil' };
  const baseConfiguracion = {
    id: 1,
    disciplineId: 1,
    categoryId: 1,
    amount: 18000,
    active: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-15T12:00:00Z'));

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        FeesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();

    service = moduleRef.get(FeesService);

    prismaMock.discipline.findUnique.mockResolvedValue(disciplina);
    prismaMock.memberCategory.findUnique.mockResolvedValue(categoria);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('el próximo período es el mes siguiente al actual', () => {
    expect(proximoPeriodo(new Date('2026-08-15T12:00:00Z'))).toBe('2026-09');
    expect(proximoPeriodo(new Date('2026-12-01T12:00:00Z'))).toBe('2027-01');
  });

  it('crea una configuración sin duplicado y usa el período siguiente por defecto', async () => {
    prismaMock.sportsFeeConfig.findUnique.mockResolvedValue(null);
    prismaMock.sportsFeeConfig.create.mockResolvedValue({
      ...baseConfiguracion,
      appliedPeriod: '2026-09',
    });

    const resultado = await service.configurar(
      { disciplineId: 1, categoryId: 1, amount: 18000 },
      99,
    );

    expect(prismaMock.sportsFeeConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ appliedPeriod: '2026-09', amount: 18000 }),
      }),
    );
    expect(resultado.amount).toBe(18000);
    expect(auditMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        entity: 'SportsFeeConfig',
        responsibleId: 99,
      }),
    );
  });

  it('regla 7: si la combinación+período ya existe, actualiza en lugar de crear duplicado', async () => {
    prismaMock.sportsFeeConfig.findUnique.mockResolvedValue({
      ...baseConfiguracion,
      id: 7,
    });
    prismaMock.sportsFeeConfig.update.mockResolvedValue({
      ...baseConfiguracion,
      id: 7,
      amount: 20000,
      appliedPeriod: '2026-09',
    });

    const resultado = await service.configurar(
      { disciplineId: 1, categoryId: 1, amount: 20000 },
      99,
    );

    expect(prismaMock.sportsFeeConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 }, data: { amount: 20000 } }),
    );
    expect(prismaMock.sportsFeeConfig.create).not.toHaveBeenCalled();
    expect(resultado.amount).toBe(20000);
    expect(auditMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entity: 'SportsFeeConfig',
        entityId: 7,
      }),
    );
  });

  it('rechaza configurar un período pasado o el actual (cambios aplican desde el período siguiente)', async () => {
    await expect(
      service.configurar(
        { disciplineId: 1, categoryId: 1, amount: 18000, appliedPeriod: '2026-08' },
        99,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.configurar(
        { disciplineId: 1, categoryId: 1, amount: 18000, appliedPeriod: '2026-07' },
        99,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza configurar cuando la disciplina no existe', async () => {
    prismaMock.discipline.findUnique.mockResolvedValue(null);

    await expect(
      service.configurar({ disciplineId: 99, categoryId: 1, amount: 18000 }, 99),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza configurar cuando la categoría no existe', async () => {
    prismaMock.memberCategory.findUnique.mockResolvedValue(null);

    await expect(
      service.configurar({ disciplineId: 1, categoryId: 99, amount: 18000 }, 99),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lista configuraciones filtrando por disciplina, categoría y período de aplicación', async () => {
    prismaMock.sportsFeeConfig.findMany.mockResolvedValue([
      { ...baseConfiguracion, appliedPeriod: '2026-09' },
    ]);
    prismaMock.sportsFeeConfig.count.mockResolvedValue(1);
    prismaMock.$transaction.mockImplementation(async (operaciones: unknown[]) =>
      Promise.all(operaciones),
    );

    const resultado = await service.findAll({
      disciplineId: 1,
      categoryId: 1,
      appliedPeriod: '2026-09',
      page: 1,
      perPage: 20,
    });

    const where = prismaMock.sportsFeeConfig.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      disciplineId: 1,
      categoryId: 1,
      appliedPeriod: '2026-09',
    });
    expect(resultado.total).toBe(1);
    expect(resultado.items[0].amount).toBe(18000);
  });
});
