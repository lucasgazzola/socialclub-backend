import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EntradasService } from './entradas.service';
import { PasarelaService } from '../pasarela/pasarela.service';
import { ConfigService } from '@nestjs/config';

/**
 * US-30 · Generar entradas con QR — tests unitarios del EntradasService.
 * Dependencias mockeadas (mismo patrón que el resto de los services).
 */
describe('US-30 · EntradasService', () => {
  // Evento publicado que todavía no ocurrió (DT-33: no se generan entradas de eventos terminados).
  const eventoVigente = {
    id: 1,
    nombre: 'Peña',
    estado: 'PUBLICADO',
    fechaEvento: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    fechaFin: null,
  };

  let service: EntradasService;

  const txMock = {
    evento: { updateMany: jest.fn() },
    entrada: { createManyAndReturn: jest.fn() },
    compraEntrada: { create: jest.fn() },
  };
  const prismaMock = {
    evento: { findUnique: jest.fn() },
    entrada: { findMany: jest.fn(), count: jest.fn() },
    usuario: { findUnique: jest.fn().mockResolvedValue(null) },
    // $transaction ejecuta el callback con el cliente transaccional simulado.
    $transaction: jest.fn((arg: unknown) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return (arg as (tx: typeof txMock) => unknown)(txMock);
    }),
  };
  const auditoriaMock = { registrar: jest.fn() };
  /** H05: sin ACCESO_APERTURA_HORAS, la puerta abre 3 h antes del inicio. */
  const configMock = { get: jest.fn().mockReturnValue(undefined) };
  const pasarelaMock = {
    iniciarCobro: jest.fn().mockResolvedValue({ referencia: 'ref-1', urlPago: 'https://pagar' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((arg: unknown) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return (arg as (tx: typeof txMock) => unknown)(txMock);
    });
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        EntradasService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
        { provide: PasarelaService, useValue: pasarelaMock },
        { provide: ConfigService, useValue: configMock },
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
        ...eventoVigente,
        entradasDisponibles: 1,
      });

      await expect(service.crearMultiples({ eventoId: 1, cantidad: 5 }, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('genera N entradas, decrementa el stock de forma atómica y audita CREAR', async () => {
      prismaMock.evento.findUnique.mockResolvedValue({
        ...eventoVigente,
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
        ...eventoVigente,
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

  describe('iniciarCompra (TASK-51)', () => {
    const dto = { eventoId: 1, cantidad: 2 };

    const eventoVenta = {
      id: 1,
      nombre: 'Peña',
      precio: 1500,
      descuentoSocio: 20,
      requiereEntrada: true,
      estado: 'PUBLICADO',
      inicioVenta: new Date(Date.now() - 60_000),
      finVenta: new Date(Date.now() + 60_000),
      entradasDisponibles: 10,
      fechaEvento: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      fechaFin: null,
    };

    /** Ejecuta la reserva que el servicio le pasó a la pasarela. */
    const reservaPedida = () => pasarelaMock.iniciarCobro.mock.calls[0][0].reservar(txMock);

    it('rechaza un evento fuera de la ventana de venta sin crear la orden', async () => {
      prismaMock.evento.findUnique.mockResolvedValue({
        ...eventoVenta,
        inicioVenta: new Date(Date.now() + 60_000),
      });

      await expect(service.iniciarCompra(dto, 7)).rejects.toBeInstanceOf(BadRequestException);
      expect(pasarelaMock.iniciarCobro).not.toHaveBeenCalled();
    });

    it('pide a la pasarela el cobro con el precio del evento y los datos para acreditar', async () => {
      prismaMock.evento.findUnique.mockResolvedValue(eventoVenta);

      const orden = await service.iniciarCompra(dto, 7);

      expect(orden).toEqual({ referencia: 'ref-1', urlPago: 'https://pagar' });
      expect(pasarelaMock.iniciarCobro).toHaveBeenCalledWith(
        expect.objectContaining({
          concepto: 'ENTRADAS',
          usuarioId: 7,
          items: [{ titulo: 'Entrada — Peña', cantidad: 2, precioUnitario: 1500 }],
          datos: { eventoId: 1, cantidad: 2, precioUnitario: 1500, montoTotal: 3000 },
        }),
      );
    });

    it('a un socio le aplica el descuento del evento', async () => {
      prismaMock.evento.findUnique.mockResolvedValue(eventoVenta);
      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        roles: [{ rol: { nombre: 'SOCIO' } }],
        persona: { membresias: [] },
      });

      await service.iniciarCompra(dto, 7);

      expect(pasarelaMock.iniciarCobro.mock.calls[0][0].datos).toEqual(
        expect.objectContaining({ precioUnitario: 1200, montoTotal: 2400 }),
      );
    });

    it('TC-264 · reserva el cupo de forma atómica junto con la orden', async () => {
      prismaMock.evento.findUnique.mockResolvedValue(eventoVenta);
      txMock.evento.updateMany.mockResolvedValue({ count: 1 });

      await service.iniciarCompra(dto, 7);
      await reservaPedida();

      expect(txMock.evento.updateMany).toHaveBeenCalledWith({
        where: { id: 1, estado: 'PUBLICADO', entradasDisponibles: { gte: 2 } },
        data: { entradasDisponibles: { decrement: 2 } },
      });
    });

    it('TC-265 · la reserva falla si el cupo se agotó mientras tanto (no se crea la orden)', async () => {
      prismaMock.evento.findUnique.mockResolvedValue(eventoVenta);
      txMock.evento.updateMany.mockResolvedValue({ count: 0 });

      await service.iniciarCompra(dto, 7);

      await expect(reservaPedida()).rejects.toThrow(
        'Las entradas se agotaron. Actualizá la página e intentá nuevamente.',
      );
    });

    it('un evento sin cupo definido no reserva nada', async () => {
      prismaMock.evento.findUnique.mockResolvedValue({ ...eventoVenta, entradasDisponibles: null });

      await service.iniciarCompra(dto, 7);
      await reservaPedida();

      expect(txMock.evento.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('listarMisEntradas', () => {
    it('filtra las entradas por el usuario comprador y devuelve estructura paginada', async () => {
      prismaMock.entrada.findMany.mockResolvedValue([{ id: 1, token: 't1' }]);
      prismaMock.entrada.count = jest.fn().mockResolvedValue(1);

      const resultado = await service.listarMisEntradas(7, { pagina: 1, porPagina: 10 });

      expect(prismaMock.entrada.findMany).toHaveBeenCalledWith({
        where: { compra: { usuarioId: 7 } },
        orderBy: [{ creadoEn: 'desc' }],
        skip: 0,
        take: 10,
        include: { evento: true, compra: true },
      });
      expect(prismaMock.entrada.count).toHaveBeenCalledWith({
        where: { compra: { usuarioId: 7 } },
      });
      expect(resultado).toEqual({
        items: [{ id: 1, token: 't1' }],
        total: 1,
        pagina: 1,
        porPagina: 10,
        totalPaginas: 1,
      });
    });

    it('aplica búsqueda por nombre de evento y filtro por estado', async () => {
      prismaMock.entrada.findMany.mockResolvedValue([]);
      prismaMock.entrada.count = jest.fn().mockResolvedValue(0);

      await service.listarMisEntradas(7, { search: 'Torneo', estado: 'USADA', page: 2, limit: 5 });

      expect(prismaMock.entrada.findMany).toHaveBeenCalledWith({
        where: {
          compra: { usuarioId: 7 },
          AND: [
            { evento: { nombre: { contains: 'Torneo', mode: 'insensitive' } } },
            { estado: 'USADA' },
          ],
        },
        orderBy: [{ creadoEn: 'desc' }],
        skip: 5,
        take: 5,
        include: { evento: true, compra: true },
      });
    });

    describe('TASK-60 · vigencia calculada por fecha', () => {
      const DIA = 24 * 60 * 60 * 1000;
      const entradaDe = (estado: string, evento: Record<string, unknown>) => ({
        id: 1,
        token: 't',
        estado,
        evento: { estado: 'PUBLICADO', fechaFin: null, ...evento },
      });

      it('devuelve como EXPIRADA una entrada VALIDA de un evento terminado o cancelado', async () => {
        prismaMock.entrada.findMany.mockResolvedValue([
          entradaDe('VALIDA', { fechaEvento: new Date(Date.now() - 2 * DIA) }),
          entradaDe('VALIDA', { fechaEvento: new Date(Date.now() + DIA), estado: 'CANCELADO' }),
          entradaDe('VALIDA', { fechaEvento: new Date(Date.now() + DIA) }),
          entradaDe('USADA', { fechaEvento: new Date(Date.now() - 2 * DIA) }),
        ]);
        prismaMock.entrada.count = jest.fn().mockResolvedValue(4);

        const { items } = await service.listarMisEntradas(7);

        expect(items.map((e) => e.estado)).toEqual(['EXPIRADA', 'EXPIRADA', 'VALIDA', 'USADA']);
      });

      it('Próximas: solo válidas de eventos vigentes y no cancelados, por fecha del evento', async () => {
        prismaMock.entrada.findMany.mockResolvedValue([]);
        prismaMock.entrada.count = jest.fn().mockResolvedValue(0);

        await service.listarMisEntradas(7, { vigencia: 'PROXIMAS' });

        const llamada = prismaMock.entrada.findMany.mock.calls[0][0];
        expect(llamada.orderBy).toEqual([{ evento: { fechaEvento: 'asc' } }, { id: 'asc' }]);
        expect(llamada.where.AND).toEqual([
          {
            estado: 'VALIDA',
            evento: { estado: { not: 'CANCELADO' }, NOT: expect.objectContaining({ OR: expect.any(Array) }) },
          },
        ]);
      });

      it('Historial: todo lo que no es una entrada vigente, del evento más reciente al más viejo', async () => {
        prismaMock.entrada.findMany.mockResolvedValue([]);
        prismaMock.entrada.count = jest.fn().mockResolvedValue(0);

        await service.listarMisEntradas(7, { vigencia: 'HISTORIAL' });

        const llamada = prismaMock.entrada.findMany.mock.calls[0][0];
        expect(llamada.orderBy).toEqual([{ evento: { fechaEvento: 'desc' } }, { id: 'asc' }]);
        expect(llamada.where.AND[0]).toEqual({ NOT: expect.objectContaining({ estado: 'VALIDA' }) });
      });

      it('filtrar por EXPIRADA incluye las válidas de eventos terminados o cancelados', async () => {
        prismaMock.entrada.findMany.mockResolvedValue([]);
        prismaMock.entrada.count = jest.fn().mockResolvedValue(0);

        await service.listarMisEntradas(7, { estado: 'EXPIRADA' });

        const { where } = prismaMock.entrada.findMany.mock.calls[0][0];
        expect(where.AND[0].OR).toEqual([
          { estado: 'EXPIRADA' },
          {
            estado: 'VALIDA',
            evento: { OR: [{ estado: 'CANCELADO' }, expect.objectContaining({ OR: expect.any(Array) })] },
          },
        ]);
      });
    });
  });
});
