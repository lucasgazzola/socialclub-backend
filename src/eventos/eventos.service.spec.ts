import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EventosService } from './eventos.service';

/**
 * US-29 · Crear evento / lectura de eventos — tests unitarios del EventosService.
 * Se enfocan en el comportamiento real: el mapeo de `_count.entradas` a
 * `entradasVendidas`, el 404 y la auditoría del alta.
 */
describe('US-29 · EventosService', () => {
  let service: EventosService;

  const prismaMock = {
    evento: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
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
    it('expone la cantidad de entradas vendidas y no filtra _count', async () => {
      prismaMock.evento.findMany.mockResolvedValue([
        { id: 1, nombre: 'Peña', entradasDisponibles: 8, _count: { entradas: 12 } },
      ]);

      const res = await service.findAll();

      expect(res).toEqual([
        { id: 1, nombre: 'Peña', entradasDisponibles: 8, entradasVendidas: 12 },
      ]);
      // Ordenado por nombre e incluyendo el conteo de entradas.
      expect(prismaMock.evento.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { nombre: 'asc' } }),
      );
      // `_count` no debe filtrarse en la respuesta.
      expect(res[0]).not.toHaveProperty('_count');
    });
  });

  describe('findOne', () => {
    it('devuelve el evento con entradasVendidas', async () => {
      prismaMock.evento.findUnique.mockResolvedValue({
        id: 2,
        nombre: 'Cena',
        entradasDisponibles: 5,
        _count: { entradas: 3 },
      });

      const res = await service.findOne(2);

      expect(res).toEqual({ id: 2, nombre: 'Cena', entradasDisponibles: 5, entradasVendidas: 3 });
      expect(res).not.toHaveProperty('_count');
    });

    it('lanza 404 si el evento no existe', async () => {
      prismaMock.evento.findUnique.mockResolvedValue(null);

      await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('crea el evento y audita la acción CREAR', async () => {
      prismaMock.evento.create.mockResolvedValue({ id: 10, nombre: 'Torneo' });

      const res = await service.create(
        { nombre: 'Torneo', descripcion: 'Anual', entradasDisponibles: 100 },
        7,
      );

      expect(prismaMock.evento.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { nombre: 'Torneo', descripcion: 'Anual', entradasDisponibles: 100 },
        }),
      );
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'CREAR',
          entidad: 'Evento',
          idEntidad: 10,
          responsableId: 7,
        }),
      );
      expect(res.id).toBe(10);
    });
  });
});
