import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CuotasService, proximoPeriodo } from './cuotas.service';

describe('CuotasService', () => {
  let service: CuotasService;

  const prismaMock = {
    disciplina: { findUnique: jest.fn() },
    categoriaSocio: { findUnique: jest.fn() },
    configuracionCuotaDeportiva: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const auditoriaMock = { registrar: jest.fn() };

  const disciplina = { id: 1, nombre: 'Fútbol' };
  const categoria = { id: 1, nombre: 'Juvenil' };
  const baseConfiguracion = {
    id: 1,
    disciplinaId: 1,
    categoriaId: 1,
    monto: 18000,
    activo: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-15T12:00:00Z'));

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CuotasService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
      ],
    }).compile();

    service = moduleRef.get(CuotasService);

    prismaMock.disciplina.findUnique.mockResolvedValue(disciplina);
    prismaMock.categoriaSocio.findUnique.mockResolvedValue(categoria);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('el próximo período es el mes siguiente al actual', () => {
    expect(proximoPeriodo(new Date('2026-08-15T12:00:00Z'))).toBe('2026-09');
    expect(proximoPeriodo(new Date('2026-12-01T12:00:00Z'))).toBe('2027-01');
  });

  it('crea una configuración sin duplicado y usa el período siguiente por defecto', async () => {
    prismaMock.configuracionCuotaDeportiva.findUnique.mockResolvedValue(null);
    prismaMock.configuracionCuotaDeportiva.create.mockResolvedValue({
      ...baseConfiguracion,
      periodoAplicacion: '2026-09',
    });

    const resultado = await service.configurar(
      { disciplinaId: 1, categoriaId: 1, monto: 18000 },
      99,
    );

    expect(prismaMock.configuracionCuotaDeportiva.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ periodoAplicacion: '2026-09', monto: 18000 }),
      }),
    );
    expect(resultado.monto).toBe(18000);
    expect(auditoriaMock.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'CREAR',
        entidad: 'ConfiguracionCuotaDeportiva',
        responsableId: 99,
      }),
    );
  });

  it('regla 7: si la combinación+período ya existe, actualiza en lugar de crear duplicado', async () => {
    prismaMock.configuracionCuotaDeportiva.findUnique.mockResolvedValue({
      ...baseConfiguracion,
      id: 7,
    });
    prismaMock.configuracionCuotaDeportiva.update.mockResolvedValue({
      ...baseConfiguracion,
      id: 7,
      monto: 20000,
      periodoAplicacion: '2026-09',
    });

    const resultado = await service.configurar(
      { disciplinaId: 1, categoriaId: 1, monto: 20000 },
      99,
    );

    expect(prismaMock.configuracionCuotaDeportiva.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 }, data: { monto: 20000 } }),
    );
    expect(prismaMock.configuracionCuotaDeportiva.create).not.toHaveBeenCalled();
    expect(resultado.monto).toBe(20000);
    expect(auditoriaMock.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'EDITAR',
        entidad: 'ConfiguracionCuotaDeportiva',
        idEntidad: 7,
      }),
    );
  });

  it('rechaza configurar un período pasado o el actual (cambios aplican desde el período siguiente)', async () => {
    await expect(
      service.configurar(
        { disciplinaId: 1, categoriaId: 1, monto: 18000, periodoAplicacion: '2026-08' },
        99,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.configurar(
        { disciplinaId: 1, categoriaId: 1, monto: 18000, periodoAplicacion: '2026-07' },
        99,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza configurar cuando la disciplina no existe', async () => {
    prismaMock.disciplina.findUnique.mockResolvedValue(null);

    await expect(
      service.configurar({ disciplinaId: 99, categoriaId: 1, monto: 18000 }, 99),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza configurar cuando la categoría no existe', async () => {
    prismaMock.categoriaSocio.findUnique.mockResolvedValue(null);

    await expect(
      service.configurar({ disciplinaId: 1, categoriaId: 99, monto: 18000 }, 99),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lista configuraciones filtrando por disciplina, categoría y período de aplicación', async () => {
    prismaMock.configuracionCuotaDeportiva.findMany.mockResolvedValue([
      { ...baseConfiguracion, periodoAplicacion: '2026-09' },
    ]);
    prismaMock.configuracionCuotaDeportiva.count.mockResolvedValue(1);
    prismaMock.$transaction.mockImplementation(async (operaciones: unknown[]) =>
      Promise.all(operaciones),
    );

    const resultado = await service.findAll({
      disciplinaId: 1,
      categoriaId: 1,
      periodoAplicacion: '2026-09',
      pagina: 1,
      porPagina: 20,
    });

    const where = prismaMock.configuracionCuotaDeportiva.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      disciplinaId: 1,
      categoriaId: 1,
      periodoAplicacion: '2026-09',
    });
    expect(resultado.total).toBe(1);
    expect(resultado.items[0].monto).toBe(18000);
  });
});
