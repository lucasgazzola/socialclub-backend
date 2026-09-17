import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { PagosService } from './pagos.service';

const mockPrisma: any = {
  usuario: {
    findUnique: jest.fn(),
  },
  configuracionCuotaSocial: {
    findFirst: jest.fn(),
  },
  pago: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(mockPrisma))),
};

const mockAuditoria = { registrar: jest.fn() };

describe('US-10 · PagosService', () => {
  let service: PagosService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PagosService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditoriaService, useValue: mockAuditoria },
      ],
    }).compile();

    service = moduleRef.get<PagosService>(PagosService);
  });

  describe('getCuotasPendientes (CA 1 & RN05/RN06)', () => {
    it('debe lanzar NotFoundException si el usuario no tiene persona asociada', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);
      await expect(service.getCuotasPendientes(1)).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar BadRequestException si el socio no tiene membresía activa', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        id: 1,
        persona: { id: 10, membresias: [], pagos: [] },
      });
      await expect(service.getCuotasPendientes(1)).rejects.toThrow(BadRequestException);
    });

    it('debe devolver estado MOROSO y cuotas pendientes cuando hay períodos adeudados', async () => {
      const hoy = new Date();
      const mesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);

      mockPrisma.usuario.findUnique.mockResolvedValue({
        id: 1,
        persona: {
          id: 10,
          nombre: 'Juan',
          apellido: 'Pérez',
          membresias: [
            {
              id: 100,
              activo: true,
              fechaAlta: mesAnterior,
              categoriaId: 2,
              categoria: { nombre: 'General' },
            },
          ],
          pagos: [],
        },
      });

      mockPrisma.configuracionCuotaSocial.findFirst.mockResolvedValue({
        monto: 5000,
      });

      const res = await service.getCuotasPendientes(1);
      expect(res.estadoFinanciero).toBe('MOROSO');
      expect(res.cuotasPendientes.length).toBeGreaterThanOrEqual(1);
      expect(res.totalAdeudado).toBeGreaterThan(0);
    });

    it('debe devolver estado AL_DIA cuando no quedan períodos pendientes', async () => {
      const hoy = new Date();
      const mesActualStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;

      mockPrisma.usuario.findUnique.mockResolvedValue({
        id: 1,
        persona: {
          id: 10,
          nombre: 'Juan',
          apellido: 'Pérez',
          membresias: [
            {
              id: 100,
              activo: true,
              fechaAlta: hoy,
              categoriaId: 2,
              categoria: { nombre: 'General' },
            },
          ],
          pagos: [{ id: 1, periodo: mesActualStr, monto: 5000 }],
        },
      });

      const res = await service.getCuotasPendientes(1);
      expect(res.estadoFinanciero).toBe('AL_DIA');
      expect(res.cuotasPendientes).toHaveLength(0);
      expect(res.totalAdeudado).toBe(0);
    });
  });

  describe('registrarPago (CA 2, 3, 4, 5, 6 & RN14)', () => {
    it('debe lanzar ConflictException si un período ya figura como pagado (CA 5)', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        id: 1,
        persona: {
          id: 10,
          membresias: [
            {
              id: 100,
              activo: true,
              categoriaId: 2,
              categoria: { nombre: 'General' },
              fechaAlta: new Date(),
            },
          ],
          pagos: [],
        },
      });

      mockPrisma.pago.findMany.mockResolvedValue([{ id: 1, periodo: '2026-09' }]);

      await expect(service.registrarPago(1, { periodos: ['2026-09'] })).rejects.toThrow(
        ConflictException,
      );
    });

    it('debe registrar el pago de múltiples períodos, auditarlo y actualizar el estado financiero (CA 2, 3, 4, 6 & RN14)', async () => {
      const hoy = new Date();
      const mesActualStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;

      mockPrisma.usuario.findUnique.mockResolvedValue({
        id: 1,
        persona: {
          id: 10,
          nombre: 'Juan',
          apellido: 'Pérez',
          membresias: [
            {
              id: 100,
              activo: true,
              categoriaId: 2,
              categoria: { nombre: 'General' },
              fechaAlta: hoy,
            },
          ],
          pagos: [],
        },
      });

      mockPrisma.pago.findMany.mockResolvedValue([]);
      mockPrisma.configuracionCuotaSocial.findFirst.mockResolvedValue({ monto: 6000 });
      mockPrisma.pago.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 99, ...data, fechaPago: new Date() }),
      );

      const res = await service.registrarPago(1, {
        periodos: [mesActualStr],
        metodoPago: 'MOCK_TARJETA',
      });

      expect(res.mensaje).toContain('exitosamente');
      expect(mockPrisma.pago.create).toHaveBeenCalledTimes(1);
      expect(mockAuditoria.registrar).toHaveBeenCalledTimes(1);
      expect(mockAuditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'CREAR',
          entidad: 'Pago',
          responsableId: 1,
        }),
        expect.anything(),
      );
    });
  });

  describe('getHistorialPagos', () => {
    it('debe devolver la lista de pagos del socio', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        id: 1,
        persona: {
          id: 10,
          membresias: [{ id: 100, activo: true }],
          pagos: [],
        },
      });

      mockPrisma.pago.findMany.mockResolvedValue([
        {
          id: 1,
          periodo: '2026-08',
          monto: 5000,
          fechaPago: new Date(),
          metodoPago: 'MOCK_TARJETA',
        },
      ]);

      const historial = await service.getHistorialPagos(1);
      expect(historial).toHaveLength(1);
      expect(historial[0].periodo).toBe('2026-08');
    });
  });
});
