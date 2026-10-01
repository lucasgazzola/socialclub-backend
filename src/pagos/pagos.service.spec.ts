import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { PagosService, periodoActual } from './pagos.service';

const mockPrisma: any = {
  usuario: {
    findUnique: jest.fn(),
  },
  persona: {
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

describe('PagosService · US-17 & US-10', () => {
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

  describe('US-17 · getCuotasPendientesPorSocio (Secretaría)', () => {
    it('debe lanzar NotFoundException si el socio no existe o no tiene membresías', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(null);
      await expect(service.getCuotasPendientesPorSocio(999)).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar NotFoundException si la persona existe pero no tiene membresías registradas', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue({
        id: 10,
        nombre: 'Carlos',
        apellido: 'SinMembresia',
        membresias: [],
        pagos: [],
      });
      await expect(service.getCuotasPendientesPorSocio(10)).rejects.toThrow(NotFoundException);
    });

    it('debe devolver estado MOROSO y cuotas pendientes cuando hay períodos adeudados', async () => {
      const hoy = new Date();
      const mesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);

      mockPrisma.persona.findUnique.mockResolvedValue({
        id: 20,
        nombre: 'Carlos',
        apellido: 'SinCuenta',
        dni: '20000002',
        membresias: [
          {
            id: 100,
            activo: true,
            fechaAlta: mesAnterior,
            categoriaId: 3,
            categoria: { nombre: 'Cuota Senior' },
          },
        ],
        pagos: [],
      });

      mockPrisma.configuracionCuotaSocial.findFirst.mockResolvedValue({
        monto: 15000,
      });

      const res = await service.getCuotasPendientesPorSocio(20);
      expect(res.personaId).toBe(20);
      expect(res.socioNombre).toBe('Carlos SinCuenta');
      expect(res.dni).toBe('20000002');
      expect(res.categoria).toBe('Cuota Senior');
      expect(res.estadoFinanciero).toBe('MOROSO');
      expect(res.cuotasPendientes.length).toBeGreaterThanOrEqual(1);
      expect(res.totalAdeudado).toBeGreaterThan(0);
    });

    it('debe devolver estado AL_DIA y totalAdeudado 0 cuando no quedan períodos pendientes', async () => {
      const hoy = new Date();
      const mesActualStr = periodoActual(hoy);

      mockPrisma.persona.findUnique.mockResolvedValue({
        id: 20,
        nombre: 'Carlos',
        apellido: 'SinCuenta',
        dni: '20000002',
        membresias: [
          {
            id: 100,
            activo: true,
            fechaAlta: hoy,
            categoriaId: 3,
            categoria: { nombre: 'Cuota Senior' },
          },
        ],
        pagos: [{ id: 1, periodo: mesActualStr, monto: 15000 }],
      });

      const res = await service.getCuotasPendientesPorSocio(20);
      expect(res.estadoFinanciero).toBe('AL_DIA');
      expect(res.cuotasPendientes).toHaveLength(0);
      expect(res.totalAdeudado).toBe(0);
    });
  });

  describe('US-17 · registrarPagoPorSocio (Secretaría - Criterios de Aceptación)', () => {
    const hoy = new Date();
    const mesActualStr = periodoActual(hoy);

    const mockPersonaConMembresia = {
      id: 20,
      nombre: 'Carlos',
      apellido: 'SinCuenta',
      dni: '20000002',
      membresias: [
        {
          id: 100,
          activo: true,
          categoriaId: 3,
          categoria: { nombre: 'Cuota Senior' },
          fechaAlta: new Date('2026-01-01'),
        },
      ],
      pagos: [],
    };

    it('CA 10: debe lanzar BadRequestException si no se seleccionó al menos un período', async () => {
      await expect(service.registrarPagoPorSocio(20, { periodos: [] }, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('CA 4: debe lanzar BadRequestException si se intenta abonar un período futuro', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(mockPersonaConMembresia);

      const anioFuturo = hoy.getFullYear() + 2;
      const periodoFuturo = `${anioFuturo}-01`;

      await expect(
        service.registrarPagoPorSocio(20, { periodos: [periodoFuturo] }, 1),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.registrarPagoPorSocio(20, { periodos: [periodoFuturo] }, 1),
      ).rejects.toThrow(/períodos futuros/);
    });

    it('CA 3: debe lanzar ConflictException si un período ya figura como pagado', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(mockPersonaConMembresia);
      mockPrisma.pago.findMany.mockResolvedValue([{ id: 1, periodo: mesActualStr }]);

      await expect(
        service.registrarPagoPorSocio(20, { periodos: [mesActualStr] }, 1),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.registrarPagoPorSocio(20, { periodos: [mesActualStr] }, 1),
      ).rejects.toThrow(/ya figuran como pagados/);
    });

    it('CA 11: debe lanzar BadRequestException si el monto de la cuota vigente es <= 0 o inexistente', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(mockPersonaConMembresia);
      mockPrisma.pago.findMany.mockResolvedValue([]);
      mockPrisma.configuracionCuotaSocial.findFirst.mockResolvedValue(null);

      await expect(
        service.registrarPagoPorSocio(20, { periodos: [mesActualStr] }, 1),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.registrarPagoPorSocio(20, { periodos: [mesActualStr] }, 1),
      ).rejects.toThrow(/montos iguales o inferiores a cero/);
    });

    it('CA 1, 5, 6, 7, 8, 9, 13: debe registrar el pago de múltiples períodos en una sola operación atómica con auditoría y nuevo estado', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(mockPersonaConMembresia);
      mockPrisma.pago.findMany.mockResolvedValue([]);
      mockPrisma.configuracionCuotaSocial.findFirst.mockResolvedValue({ monto: 12000 });

      mockPrisma.pago.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 101, ...data, fechaPago: new Date() }),
      );

      const periodos = [mesActualStr];
      const res = await service.registrarPagoPorSocio(
        20,
        {
          periodos,
          metodoPago: 'EFECTIVO',
          observaciones: 'Pago en secretaría',
        },
        7, // responsableId (Secretario/Admin)
      );

      expect(res.mensaje).toContain('exitosamente');
      expect(res.montoTotal).toBe(12000);
      expect(res.usuarioResponsableId).toBe(7);
      expect(res.socio.id).toBe(20);
      expect(mockPrisma.pago.create).toHaveBeenCalledTimes(1);
      expect(mockAuditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'CREAR',
          entidad: 'Pago',
          responsableId: 7,
          detalle: expect.stringContaining('Cobro de cuota social'),
        }),
        expect.anything(),
      );
    });

    it('debe utilizar EFECTIVO por defecto si no se especifica metodoPago', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(mockPersonaConMembresia);
      mockPrisma.pago.findMany.mockResolvedValue([]);
      mockPrisma.configuracionCuotaSocial.findFirst.mockResolvedValue({ monto: 8000 });
      mockPrisma.pago.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 102, ...data, fechaPago: new Date() }),
      );

      const res = await service.registrarPagoPorSocio(20, { periodos: [mesActualStr] }, 1);

      expect(res.pagos[0].metodoPago).toBe('EFECTIVO');
    });
  });

  describe('US-17 · getHistorialPagosPorSocio', () => {
    it('debe devolver el historial de pagos de un socio', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue({
        id: 20,
        membresias: [{ id: 1, activo: true }],
      });

      mockPrisma.pago.findMany.mockResolvedValue([
        {
          id: 1,
          periodo: '2026-08',
          monto: 10000,
          fechaPago: new Date(),
          metodoPago: 'EFECTIVO',
        },
      ]);

      const historial = await service.getHistorialPagosPorSocio(20);
      expect(historial).toHaveLength(1);
      expect(historial[0].periodo).toBe('2026-08');
      expect(historial[0].monto).toBe(10000);
      expect(historial[0].metodoPago).toBe('EFECTIVO');
    });
  });

  describe('US-10 · Autoservicio del socio (compatibilidad retroactiva)', () => {
    it('debe delegar getCuotasPendientes en la persona del usuario', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        id: 1,
        persona: {
          id: 10,
          membresias: [{ id: 1, activo: true, fechaAlta: new Date(), categoriaId: 1 }],
          pagos: [],
        },
      });
      mockPrisma.persona.findUnique.mockResolvedValue({
        id: 10,
        nombre: 'Lucía',
        apellido: 'Registrada',
        membresias: [
          {
            id: 1,
            activo: true,
            fechaAlta: new Date(),
            categoriaId: 1,
            categoria: { nombre: 'General' },
          },
        ],
        pagos: [],
      });
      mockPrisma.configuracionCuotaSocial.findFirst.mockResolvedValue({ monto: 5000 });

      const res = await service.getCuotasPendientes(1);
      expect(res.personaId).toBe(10);
    });

    it('debe delegar getHistorialPagos en la persona del usuario', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        id: 1,
        persona: {
          id: 10,
          membresias: [{ id: 1, activo: true }],
          pagos: [],
        },
      });
      mockPrisma.persona.findUnique.mockResolvedValue({
        id: 10,
        membresias: [{ id: 1, activo: true }],
        pagos: [],
      });
      mockPrisma.pago.findMany.mockResolvedValue([]);

      const historial = await service.getHistorialPagos(1);
      expect(Array.isArray(historial)).toBe(true);
    });
  });
});
