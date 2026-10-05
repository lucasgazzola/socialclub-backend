import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EventosService } from './eventos.service';
import { DEFAULT_EVENT_IMAGE_URL } from './eventos.mapper';

describe('US-29 · EventosService', () => {
  let service: EventosService;

  const prismaMock = {
    evento: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const auditoriaMock = { registrar: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        EventosService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
      ],
    }).compile();
    service = moduleRef.get(EventosService);
  });

  describe('findAll', () => {
    it('devuelve eventos paginados sin BORRADOR ordenados por fechaEvento asc', async () => {
      const mockItems = [
        {
          id: 1,
          nombre: 'Peña',
          requiereEntrada: true,
          capacidadMaxima: 100,
          entradasDisponibles: 8,
          precio: '1000',
          descuentoSocio: 10,
          estado: 'PUBLICADO',
          _count: { entradas: 12 },
        },
      ];

      prismaMock.$transaction.mockResolvedValue([mockItems, 1]);

      const res = await service.findAll();

      expect(res).toEqual({
        items: [
          {
            id: 1,
            nombre: 'Peña',
            requiereEntrada: true,
            capacidadMaxima: 100,
            entradasDisponibles: 8,
            precio: '1000',
            descuentoSocio: 10,
            estado: 'PUBLICADO',
            entradasVendidas: 12,
            imageUrl: DEFAULT_EVENT_IMAGE_URL,
          },
        ],
        total: 1,
        pagina: 1,
        porPagina: 5,
        totalPaginas: 1,
      });
      expect(prismaMock.$transaction).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('devuelve el evento con entradasVendidas e imageUrl', async () => {
      prismaMock.evento.findUnique.mockResolvedValue({
        id: 2,
        nombre: 'Cena',
        requiereEntrada: true,
        capacidadMaxima: 50,
        entradasDisponibles: 5,
        precio: '500',
        descuentoSocio: 0,
        estado: 'PUBLICADO',
        _count: { entradas: 3 },
      });

      const res = await service.findOne(2);

      expect(res).toEqual({
        id: 2,
        nombre: 'Cena',
        requiereEntrada: true,
        capacidadMaxima: 50,
        entradasDisponibles: 5,
        precio: '500',
        descuentoSocio: 0,
        estado: 'PUBLICADO',
        entradasVendidas: 3,
        imageUrl: DEFAULT_EVENT_IMAGE_URL,
      });
    });

    it('lanza 404 si el evento no existe o es BORRADOR para un usuario común', async () => {
      prismaMock.evento.findUnique.mockResolvedValue(null);

      await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('crea el evento validando fechas y seteando imagen: null', async () => {
      const fechaEvento = new Date('2027-01-15T18:00:00Z');
      const fechaFin = new Date('2027-01-15T22:00:00Z');
      const inicioVenta = new Date('2027-01-01T00:00:00Z');
      const finVenta = new Date('2027-01-14T23:59:59Z');

      prismaMock.evento.create.mockResolvedValue({
        id: 10,
        nombre: 'Torneo',
        precio: '1500',
        imagen: null,
      });

      const dto: any = {
        nombre: 'Torneo',
        descripcion: 'Anual',
        requiereEntrada: true,
        entradasDisponibles: 100,
        capacidadMaxima: 100,
        fechaEvento,
        fechaFin,
        inicioVenta,
        finVenta,
        lugarAcreditacion: 'Sede central',
        precio: 1500,
        descuentoSocio: 10,
        imagen: 'algo-a-ignorar',
      };
      const res = await service.create(dto, 7);

      expect(prismaMock.evento.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nombre: 'Torneo',
            fechaEvento,
            fechaFin,
            imagen: null,
            estado: 'PUBLICADO',
            inicioVenta,
            finVenta,
          }),
        }),
      );
      expect(res.imageUrl).toBe(DEFAULT_EVENT_IMAGE_URL);
    });

    it('normaliza campos si requiereEntrada es false', async () => {
      const fechaEvento = new Date('2027-01-15T18:00:00Z');
      prismaMock.evento.create.mockResolvedValue({
        id: 11,
        nombre: 'Jornada Libre',
        requiereEntrada: false,
        capacidadMaxima: null,
        entradasDisponibles: null,
        precio: '0',
        descuentoSocio: 0,
      });

      const dto: any = {
        nombre: 'Jornada Libre',
        requiereEntrada: false,
        fechaEvento,
        lugarAcreditacion: 'Parque',
      };

      await service.create(dto, 1);

      expect(prismaMock.evento.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requiereEntrada: false,
            capacidadMaxima: null,
            entradasDisponibles: null,
            precio: 0,
            descuentoSocio: 0,
            inicioVenta: null,
            finVenta: null,
          }),
        }),
      );
    });
  });

  describe('update', () => {
    it('rechaza cambiar estado de FINALIZADO a PUBLICADO', async () => {
      prismaMock.evento.findUnique.mockResolvedValue({
        id: 5,
        estado: 'FINALIZADO',
        requiereEntrada: true,
        fechaEvento: new Date('2026-08-01T10:00:00Z'),
        _count: { entradas: 0 },
      });

      await expect(
        service.update(5, { estado: 'PUBLICADO' as any }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
