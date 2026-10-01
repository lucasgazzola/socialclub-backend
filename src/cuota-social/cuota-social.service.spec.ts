import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CuotaSocialService, periodoActual, proximoPeriodo } from './cuota-social.service';

/**
 * US-16 · Configurar cuota social por categoría de socio.
 *
 * El módulo se mergeó con 236 líneas de service en 0 % de cobertura. Reglas
 * que cubren estos casos: monto mayor a cero, los cambios aplican a partir del
 * período siguiente, una sola configuración vigente por categoría, y toda
 * configuración queda auditada.
 */
const mockPrisma: any = {
  categoriaSocio: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  configuracionCuotaSocial: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  // `findAll` usa la forma de array de $transaction, no la de callback.
  $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(mockPrisma))),
};

const mockAuditoria = { registrar: jest.fn() };

const CATEGORIA = { id: 1, nombre: 'Cuota General' };

describe('US-16 · CuotaSocialService', () => {
  let service: CuotaSocialService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.categoriaSocio.findUnique.mockResolvedValue(CATEGORIA);
    mockPrisma.configuracionCuotaSocial.findUnique.mockResolvedValue(null);
    mockPrisma.configuracionCuotaSocial.findMany.mockResolvedValue([]);
    mockPrisma.configuracionCuotaSocial.count.mockResolvedValue(0);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CuotaSocialService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditoriaService, useValue: mockAuditoria },
      ],
    }).compile();

    service = moduleRef.get<CuotaSocialService>(CuotaSocialService);
  });

  describe('cálculo de períodos', () => {
    it('el período siguiente es el mes que viene', () => {
      expect(proximoPeriodo(new Date(2026, 8, 16))).toBe('2026-10');
    });

    it('en diciembre el período siguiente rueda a enero del año próximo', () => {
      // El caso clásico donde se rompe un cálculo de meses.
      expect(proximoPeriodo(new Date(2026, 11, 31))).toBe('2027-01');
    });

    it('el período actual es el mes en curso, con el mes en dos dígitos', () => {
      expect(periodoActual(new Date(2026, 0, 5))).toBe('2026-01');
    });
  });

  describe('configurar', () => {
    it('crea la configuración para el período siguiente y la deja inactiva hasta que llegue', async () => {
      mockPrisma.configuracionCuotaSocial.create.mockResolvedValue({
        id: 10,
        monto: 15000,
        categoria: CATEGORIA,
      });

      const resultado = await service.configurar({ categoriaId: 1, monto: 15000 }, 99);

      expect(mockPrisma.configuracionCuotaSocial.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            categoriaId: 1,
            periodoAplicacion: proximoPeriodo(),
            monto: 15000,
            // Todavía no rige: no se activa hasta que llegue su período.
            activo: false,
          }),
        }),
      );
      // El monto se serializa a number, no queda como Decimal de Prisma.
      expect(resultado.monto).toBe(15000);
    });

    it('audita la creación con categoría, período y monto', async () => {
      mockPrisma.configuracionCuotaSocial.create.mockResolvedValue({
        id: 10,
        monto: 15000,
        categoria: CATEGORIA,
      });

      await service.configurar({ categoriaId: 1, monto: 15000 }, 99);

      expect(mockAuditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'CREAR',
          entidad: 'ConfiguracionCuotaSocial',
          idEntidad: 10,
          responsableId: 99,
          detalle: expect.stringContaining('Cuota General'),
        }),
      );
    });

    it('rechaza un período anterior al siguiente', async () => {
      await expect(
        service.configurar({ categoriaId: 1, monto: 15000, periodoAplicacion: '2020-01' }, 99),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.configuracionCuotaSocial.create).not.toHaveBeenCalled();
    });

    it('rechaza el período actual: los cambios aplican desde el siguiente', async () => {
      await expect(
        service.configurar(
          { categoriaId: 1, monto: 15000, periodoAplicacion: periodoActual() },
          99,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza una categoría de socio inexistente', async () => {
      mockPrisma.categoriaSocio.findUnique.mockResolvedValue(null);

      await expect(service.configurar({ categoriaId: 999, monto: 15000 }, 99)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('actualiza el monto si ya hay configuración para esa categoría y período, sin duplicarla', async () => {
      mockPrisma.configuracionCuotaSocial.findUnique.mockResolvedValue({
        id: 7,
        activo: false,
        monto: 12000,
      });
      mockPrisma.configuracionCuotaSocial.update.mockResolvedValue({
        id: 7,
        monto: 18000,
        categoria: CATEGORIA,
      });

      const resultado = await service.configurar({ categoriaId: 1, monto: 18000 }, 99);

      expect(mockPrisma.configuracionCuotaSocial.create).not.toHaveBeenCalled();
      expect(mockPrisma.configuracionCuotaSocial.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 7 } }),
      );
      expect(mockAuditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'EDITAR', idEntidad: 7 }),
      );
      expect(resultado.monto).toBe(18000);
    });
  });

  describe('actualizar', () => {
    beforeEach(() => {
      mockPrisma.configuracionCuotaSocial.findUnique.mockResolvedValue({
        id: 7,
        categoriaId: 1,
        periodoAplicacion: '2026-10',
        monto: 12000,
        activo: false,
        categoria: CATEGORIA,
      });
      mockPrisma.configuracionCuotaSocial.update.mockResolvedValue({
        id: 7,
        monto: 18000,
        categoria: CATEGORIA,
      });
    });

    it('al activar una configuración desactiva las demás de la categoría', async () => {
      await service.actualizar(7, { activo: true }, 99);

      // Una sola cuota vigente por categoría.
      expect(mockPrisma.configuracionCuotaSocial.updateMany).toHaveBeenCalledWith({
        where: { categoriaId: 1, activo: true, id: { not: 7 } },
        data: { activo: false },
      });
    });

    it('al cambiar solo el monto no toca el estado de las demás', async () => {
      await service.actualizar(7, { monto: 18000 }, 99);

      expect(mockPrisma.configuracionCuotaSocial.updateMany).not.toHaveBeenCalled();
    });

    it('audita la edición dejando el monto anterior y el nuevo en el detalle', async () => {
      await service.actualizar(7, { monto: 18000 }, 99);

      const detalle = mockAuditoria.registrar.mock.calls[0][0].detalle;
      expect(detalle).toContain('12000.00');
      expect(detalle).toContain('18000.00');
    });

    it('propaga NotFoundException si la configuración no existe', async () => {
      mockPrisma.configuracionCuotaSocial.findUnique.mockResolvedValue(null);

      await expect(service.actualizar(999, { monto: 1 }, 99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('vigencia', () => {
    it('la cuota vigente es la del período más reciente que ya rige', async () => {
      mockPrisma.configuracionCuotaSocial.findFirst.mockResolvedValue({
        id: 3,
        monto: 15000,
        categoria: CATEGORIA,
      });

      const vigente = await service.getVigente(1);

      expect(mockPrisma.configuracionCuotaSocial.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { categoriaId: 1, periodoAplicacion: { lte: periodoActual() } },
          orderBy: { periodoAplicacion: 'desc' },
        }),
      );
      expect(vigente?.monto).toBe(15000);
    });

    it('devuelve null si la categoría todavía no tiene ninguna cuota vigente', async () => {
      mockPrisma.configuracionCuotaSocial.findFirst.mockResolvedValue(null);

      await expect(service.getVigente(1)).resolves.toBeNull();
    });

    it('getVigentes omite las categorías sin cuota vigente', async () => {
      mockPrisma.categoriaSocio.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      mockPrisma.configuracionCuotaSocial.findFirst
        .mockResolvedValueOnce({ id: 3, monto: 15000, categoria: CATEGORIA })
        .mockResolvedValueOnce(null);

      const vigentes = await service.getVigentes();

      expect(vigentes).toHaveLength(1);
    });
  });

  describe('sincronizarVigentes', () => {
    it('activa la cuota que pasó a regir y desactiva las anteriores de la categoría', async () => {
      mockPrisma.categoriaSocio.findMany.mockResolvedValue([{ id: 1 }]);
      mockPrisma.configuracionCuotaSocial.findFirst.mockResolvedValue({ id: 4, activo: false });

      await service.sincronizarVigentes(new Date(2026, 9, 1));

      expect(mockPrisma.configuracionCuotaSocial.updateMany).toHaveBeenCalledWith({
        where: { categoriaId: 1, activo: true, id: { not: 4 } },
        data: { activo: false },
      });
      expect(mockPrisma.configuracionCuotaSocial.update).toHaveBeenCalledWith({
        where: { id: 4 },
        data: { activo: true },
      });
    });

    it('no reescribe la cuota que ya estaba activa', async () => {
      mockPrisma.categoriaSocio.findMany.mockResolvedValue([{ id: 1 }]);
      mockPrisma.configuracionCuotaSocial.findFirst.mockResolvedValue({ id: 4, activo: true });

      await service.sincronizarVigentes(new Date(2026, 9, 1));

      expect(mockPrisma.configuracionCuotaSocial.update).not.toHaveBeenCalled();
    });

    it('ignora las categorías que no tienen ninguna cuota configurada', async () => {
      mockPrisma.categoriaSocio.findMany.mockResolvedValue([{ id: 1 }]);
      mockPrisma.configuracionCuotaSocial.findFirst.mockResolvedValue(null);

      await service.sincronizarVigentes(new Date(2026, 9, 1));

      expect(mockPrisma.configuracionCuotaSocial.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.configuracionCuotaSocial.update).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('sin filtros consulta sin condiciones y devuelve el total', async () => {
      mockPrisma.configuracionCuotaSocial.count.mockResolvedValue(3);

      const resultado = await service.findAll({ pagina: 1, porPagina: 10 });

      expect(mockPrisma.configuracionCuotaSocial.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {}, skip: 0, take: 10 }),
      );
      expect(resultado.total).toBe(3);
    });

    it('filtra por categoría y período', async () => {
      await service.findAll({
        categoriaId: 1,
        periodoAplicacion: '2026-10',
        pagina: 2,
        porPagina: 10,
      });

      expect(mockPrisma.configuracionCuotaSocial.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { categoriaId: 1, periodoAplicacion: '2026-10' },
          skip: 10,
        }),
      );
    });

    it('serializa el monto de cada item a número', async () => {
      mockPrisma.configuracionCuotaSocial.findMany.mockResolvedValue([
        { id: 1, monto: '15000', categoria: CATEGORIA },
      ]);

      const resultado = await service.findAll({ pagina: 1, porPagina: 10 });

      expect(resultado.items[0].monto).toBe(15000);
    });
  });
});
