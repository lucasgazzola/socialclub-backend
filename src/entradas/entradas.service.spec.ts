import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EntradasService } from './entradas.service';

/**
 * US-30 · Generar entradas con QR — tests unitarios del EntradasService.
 * Dependencias mockeadas (mismo patrón que el resto de los services).
 */
describe('US-30 · EntradasService', () => {
  let service: EntradasService;

  const txMock = {
    evento: { updateMany: jest.fn() },
    entrada: { createManyAndReturn: jest.fn() },
    compraEntrada: { create: jest.fn() },
  };
  const prismaMock = {
    evento: { findUnique: jest.fn() },
    entrada: { findMany: jest.fn() },
    // $transaction ejecuta el callback con el cliente transaccional simulado.
    $transaction: jest.fn((cb: (tx: typeof txMock) => unknown) => cb(txMock)),
  };
  const auditoriaMock = { registrar: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((cb: (tx: typeof txMock) => unknown) => cb(txMock));
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        EntradasService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
      ],
    }).compile();
    service = moduleRef.get(EntradasService);
  });

  describe('crearMultiples', () => {
    it('rechaza generar entradas para un evento inexistente (404)', async () => {
      prismaMock.evento.findUnique.mockResolvedValue(null);

      await expect(service.crearMultiples({ eventoId: 99, cantidad: 2 }, 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('rechaza si no hay suficientes entradas disponibles', async () => {
      prismaMock.evento.findUnique.mockResolvedValue({
        id: 1,
        nombre: 'Peña',
        entradasDisponibles: 1,
      });

      await expect(service.crearMultiples({ eventoId: 1, cantidad: 5 }, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('genera N entradas, decrementa el stock de forma atómica y audita CREAR', async () => {
      prismaMock.evento.findUnique.mockResolvedValue({
        id: 1,
        nombre: 'Peña',
        entradasDisponibles: 10,
      });
      txMock.evento.updateMany.mockResolvedValue({ count: 1 });
      txMock.entrada.createManyAndReturn.mockResolvedValue([
        { id: 1, token: 't1', eventoId: 1 },
        { id: 2, token: 't2', eventoId: 1 },
      ]);

      const res = await service.crearMultiples({ eventoId: 1, cantidad: 2 }, 7);

      // Decremento condicionado por stock disponible (evita sobreventa).
      expect(txMock.evento.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1, entradasDisponibles: { gte: 2 } },
          data: { entradasDisponibles: { decrement: 2 } },
        }),
      );
      // Un token único por entrada.
      const dataCreada = txMock.entrada.createManyAndReturn.mock.calls[0][0].data;
      expect(dataCreada).toHaveLength(2);
      expect(new Set(dataCreada.map((e: { token: string }) => e.token)).size).toBe(2);
      // Auditoría del alta.
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'CREAR', entidad: 'Entrada', responsableId: 7 }),
      );
      // Respuesta con el resumen.
      expect(res).toEqual(
        expect.objectContaining({ eventoId: 1, eventoNombre: 'Peña', cantidad: 2 }),
      );
    });

    it('aborta si el stock cambió durante la venta (updateMany afecta 0 filas)', async () => {
      prismaMock.evento.findUnique.mockResolvedValue({
        id: 1,
        nombre: 'Peña',
        entradasDisponibles: 10,
      });
      txMock.evento.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.crearMultiples({ eventoId: 1, cantidad: 2 }, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(txMock.entrada.createManyAndReturn).not.toHaveBeenCalled();
    });
  });

  describe('listarPorEvento', () => {
    it('rechaza listar entradas de un evento inexistente (404)', async () => {
      prismaMock.evento.findUnique.mockResolvedValue(null);

      await expect(service.listarPorEvento(99)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('devuelve las entradas del evento ordenadas por fecha de creación', async () => {
      prismaMock.evento.findUnique.mockResolvedValue({ id: 1, nombre: 'Peña' });
      prismaMock.entrada.findMany.mockResolvedValue([{ id: 1, token: 't1', eventoId: 1 }]);

      const items = await service.listarPorEvento(1);

      expect(prismaMock.entrada.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventoId: 1 },
          orderBy: { creadoEn: 'desc' },
          include: { evento: true },
        }),
      );
      expect(items).toHaveLength(1);
    });
  });

  describe('comprar', () => {
    const dto = {
      eventoId: 1,
      cantidad: 2,
      titular: 'JUAN PEREZ',
      numeroTarjeta: '4500000000000000',
      vencimiento: '12/28',
      cvc: '123',
    };

    const eventoVenta = {
      id: 1,
      nombre: 'Peña',
      precio: 1500,
      estado: 'PUBLICADO',
      inicioVenta: new Date(Date.now() - 60_000),
      finVenta: new Date(Date.now() + 60_000),
      entradasDisponibles: 10,
    };

    it('rechaza un evento fuera de la ventana de venta sin tocar stock', async () => {
      prismaMock.evento.findUnique.mockResolvedValue({
        ...eventoVenta,
        inicioVenta: new Date(Date.now() + 60_000),
      });

      await expect(service.comprar(dto, 7)).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('emite entradas, descuenta stock y audita dentro de la misma transacción', async () => {
      prismaMock.evento.findUnique.mockResolvedValue(eventoVenta);
      txMock.evento.updateMany.mockResolvedValue({ count: 1 });
      txMock.compraEntrada.create.mockResolvedValue({ id: 25, eventoId: 1, cantidad: 2 });
      txMock.entrada.createManyAndReturn.mockResolvedValue([
        { id: 1, token: 't1', eventoId: 1, compraId: 25 },
        { id: 2, token: 't2', eventoId: 1, compraId: 25 },
      ]);

      const resultado = await service.comprar(dto, 7);

      expect(txMock.evento.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1, estado: 'PUBLICADO', entradasDisponibles: { gte: 2 } },
        }),
      );
      expect(txMock.compraEntrada.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ usuarioId: 7, montoTotal: 3000 }),
        }),
      );
      expect(txMock.entrada.createManyAndReturn).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([expect.objectContaining({ compraId: 25 })]),
        }),
      );
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ entidad: 'CompraEntrada', idEntidad: 25 }),
        txMock,
      );
      expect(resultado.entradas).toHaveLength(2);
    });

    it('revierte la compra si el stock cambió durante la confirmación', async () => {
      prismaMock.evento.findUnique.mockResolvedValue(eventoVenta);
      txMock.evento.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.comprar(dto, 7)).rejects.toBeInstanceOf(BadRequestException);
      expect(txMock.compraEntrada.create).not.toHaveBeenCalled();
      expect(txMock.entrada.createManyAndReturn).not.toHaveBeenCalled();
      expect(auditoriaMock.registrar).not.toHaveBeenCalled();
    });
  });

  describe('listarMisEntradas', () => {
    it('filtra las entradas por el usuario comprador y devuelve el evento asociado', async () => {
      prismaMock.entrada.findMany.mockResolvedValue([{ id: 1, token: 't1' }]);

      const resultado = await service.listarMisEntradas(7);

      expect(prismaMock.entrada.findMany).toHaveBeenCalledWith({
        where: { compra: { usuarioId: 7 } },
        orderBy: { creadoEn: 'desc' },
        include: { evento: true, compra: true },
      });
      expect(resultado).toHaveLength(1);
    });
  });
});
