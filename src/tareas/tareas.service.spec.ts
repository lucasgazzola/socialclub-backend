import { Injectable, NotFoundException } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Tarea, type TareaAutomatica } from './tarea-automatica';
import { TareasService } from './tareas.service';

/**
 * DT-22 · TareasService (Invoker): descubre las tareas marcadas con @Tarea(),
 * las ejecuta con un lock por tarea y registra cada ejecución.
 */
describe('DT-22 · TareasService', () => {
  const ejecutarMock = jest.fn();

  @Tarea()
  @Injectable()
  class TareaDePrueba implements TareaAutomatica {
    readonly nombre = 'tarea-de-prueba';
    readonly descripcion = 'Prueba';
    readonly horario = 'Cada tanto';
    ejecutar = ejecutarMock;
  }

  @Injectable()
  class ProviderComun {}

  const txMock = { $queryRaw: jest.fn() };
  const prismaMock = {
    ejecucionTarea: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn((fn: (tx: typeof txMock) => unknown) => fn(txMock)),
  };
  const auditoriaMock = { registrar: jest.fn() };
  const hoy = new Date(2026, 9, 3);
  let service: TareasService;

  beforeEach(async () => {
    jest.clearAllMocks();
    txMock.$queryRaw.mockResolvedValue([{ libre: true }]);
    prismaMock.ejecucionTarea.create.mockImplementation(({ data }: { data: object }) => ({
      id: 30,
      estado: 'EN_CURSO',
      ...data,
    }));
    prismaMock.ejecucionTarea.update.mockImplementation(({ data }: { data: object }) => ({
      id: 30,
      tarea: 'tarea-de-prueba',
      ...data,
    }));

    const modulo = await Test.createTestingModule({
      imports: [DiscoveryModule],
      providers: [
        TareasService,
        TareaDePrueba,
        ProviderComun,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
      ],
    }).compile();
    await modulo.init();
    service = modulo.get(TareasService);
  });

  it('descubre solo los providers marcados con @Tarea()', async () => {
    prismaMock.ejecucionTarea.findFirst.mockResolvedValue(null);

    await expect(service.listar()).resolves.toEqual([
      {
        nombre: 'tarea-de-prueba',
        descripcion: 'Prueba',
        horario: 'Cada tanto',
        ultimaEjecucion: null,
      },
    ]);
  });

  it('ejecuta la tarea con lock y la registra EXITOSA con su resultado', async () => {
    ejecutarMock.mockResolvedValue({ avisadas: 3 });

    const r = await service.ejecutar('tarea-de-prueba', { origen: 'PROGRAMADA', hoy });

    expect(txMock.$queryRaw).toHaveBeenCalled();
    expect(ejecutarMock).toHaveBeenCalledWith({ hoy });
    expect(prismaMock.ejecucionTarea.create).toHaveBeenCalledWith({
      data: { tarea: 'tarea-de-prueba', origen: 'PROGRAMADA', usuarioId: null },
    });
    expect(r).toMatchObject({ estado: 'EXITOSA', resultado: { avisadas: 3 } });
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 10 * 60 * 1000,
    });
    // Las programadas no se auditan: quedan en ejecuciones_tareas.
    expect(auditoriaMock.registrar).not.toHaveBeenCalled();
  });

  it('marca FALLIDAS las ejecuciones que quedaron EN_CURSO por un corte', async () => {
    ejecutarMock.mockResolvedValue({});

    await service.ejecutar('tarea-de-prueba', { origen: 'PROGRAMADA', hoy });

    expect(prismaMock.ejecucionTarea.updateMany).toHaveBeenCalledWith({
      where: { tarea: 'tarea-de-prueba', estado: 'EN_CURSO' },
      data: expect.objectContaining({ estado: 'FALLIDA' }),
    });
  });

  it('si la tarea falla la registra FALLIDA con el error, sin propagarlo', async () => {
    ejecutarMock.mockRejectedValue(new Error('Se cayó la base'));

    const r = await service.ejecutar('tarea-de-prueba', { origen: 'PROGRAMADA', hoy });

    expect(r).toMatchObject({ estado: 'FALLIDA', error: 'Se cayó la base' });
  });

  it('si la misma tarea ya está corriendo no la ejecuta y queda OMITIDA', async () => {
    txMock.$queryRaw.mockResolvedValue([{ libre: false }]);

    const r = await service.ejecutar('tarea-de-prueba', { origen: 'PROGRAMADA', hoy });

    expect(ejecutarMock).not.toHaveBeenCalled();
    expect(r).toMatchObject({ estado: 'OMITIDA', error: 'La tarea ya se estaba ejecutando' });
  });

  it('una ejecución manual guarda quién la hizo y queda auditada', async () => {
    ejecutarMock.mockResolvedValue({});

    await service.ejecutar('tarea-de-prueba', { origen: 'MANUAL', usuarioId: 7, hoy });

    expect(prismaMock.ejecucionTarea.create).toHaveBeenCalledWith({
      data: { tarea: 'tarea-de-prueba', origen: 'MANUAL', usuarioId: 7 },
    });
    expect(auditoriaMock.registrar).toHaveBeenCalledWith({
      accion: 'CREAR',
      entidad: 'EjecucionTarea',
      idEntidad: 30,
      responsableId: 7,
      detalle: 'Ejecución manual de «tarea-de-prueba»: EXITOSA',
    });
  });

  it('rechaza una tarea que no existe', async () => {
    await expect(service.ejecutar('no-existe', { origen: 'MANUAL' })).rejects.toThrow(
      new NotFoundException('No existe la tarea automática «no-existe»'),
    );
    await expect(service.ejecuciones('no-existe')).rejects.toThrow(NotFoundException);
  });

  it('lista las últimas ejecuciones de una tarea', async () => {
    prismaMock.ejecucionTarea.findMany.mockResolvedValue([{ id: 2 }, { id: 1 }]);

    await expect(service.ejecuciones('tarea-de-prueba')).resolves.toEqual([{ id: 2 }, { id: 1 }]);
    expect(prismaMock.ejecucionTarea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tarea: 'tarea-de-prueba' }, take: 20 }),
    );
  });
});

describe('DT-22 · TareasService · nombres duplicados', () => {
  it('no arranca si dos tareas usan el mismo nombre', async () => {
    @Tarea()
    @Injectable()
    class A implements TareaAutomatica {
      nombre = 'repetida';
      descripcion = '';
      horario = '';
      ejecutar = jest.fn();
    }
    @Tarea()
    @Injectable()
    class B extends A {}

    const modulo = await Test.createTestingModule({
      imports: [DiscoveryModule],
      providers: [
        TareasService,
        A,
        B,
        { provide: PrismaService, useValue: {} },
        { provide: AuditoriaService, useValue: {} },
      ],
    }).compile();

    await expect(modulo.init()).rejects.toThrow(
      'Hay dos tareas automáticas con el nombre «repetida»',
    );
  });
});
