import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { PagosDeportivosService, periodoActualDeportivo } from './pagos-deportivos.service';

const mockPrisma: any = {
  persona: { findUnique: jest.fn() },
  configuracionCuotaDeportiva: { findFirst: jest.fn() },
  pagoCuotaDeportiva: { findMany: jest.fn(), create: jest.fn() },
  $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(mockPrisma))),
};

const mockAuditoria = { registrar: jest.fn() };

/** Participante con una inscripción activa en la disciplina 3 y categoría de socio 1. */
function participanteBase(overrides: Partial<any> = {}) {
  const inicio = new Date(new Date().getFullYear() - 1, 0, 1); // enero del año pasado
  return {
    id: 50,
    nombre: 'Ana',
    apellido: 'Jugadora',
    dni: '30111222',
    inscripciones: [
      { disciplinaId: 3, fechaInscripcion: inicio, disciplina: { id: 3, nombre: 'Fútbol' } },
    ],
    membresias: [{ activo: true, categoriaId: 1, categoria: { nombre: 'General' } }],
    ...overrides,
  };
}

describe('PagosDeportivosService · US-21', () => {
  let service: PagosDeportivosService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PagosDeportivosService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditoriaService, useValue: mockAuditoria },
      ],
    }).compile();
    service = moduleRef.get(PagosDeportivosService);
  });

  describe('getPendientesPorPersona', () => {
    it('lanza NotFoundException si el participante no existe', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(null);
      await expect(service.getPendientesPorPersona(999)).rejects.toThrow(NotFoundException);
    });

    it('devuelve AL_DIA cuando no hay inscripciones activas', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(
        participanteBase({ inscripciones: [] }),
      );
      mockPrisma.pagoCuotaDeportiva.findMany.mockResolvedValue([]);
      const res = await service.getPendientesPorPersona(50);
      expect(res.estadoDeuda).toBe('AL_DIA');
      expect(res.cuotasPendientes).toHaveLength(0);
    });

    it('devuelve MOROSO con períodos pendientes valorizados', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(participanteBase());
      mockPrisma.pagoCuotaDeportiva.findMany.mockResolvedValue([]);
      mockPrisma.configuracionCuotaDeportiva.findFirst.mockResolvedValue({ monto: 5000 });
      const res = await service.getPendientesPorPersona(50);
      expect(res.estadoDeuda).toBe('MOROSO');
      expect(res.cuotasPendientes.length).toBeGreaterThan(0);
      expect(res.totalAdeudado).toBeGreaterThan(0);
      expect(res.cuotasPendientes[0]).toMatchObject({ disciplinaId: 3, disciplinaNombre: 'Fútbol' });
    });
  });

  describe('registrarPago', () => {
    const periodo = periodoActualDeportivo();

    it('rechaza lista de períodos vacía (BadRequest)', async () => {
      await expect(
        service.registrarPago(50, { disciplinaId: 3, periodos: [] }, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza períodos repetidos en la misma operación (BadRequest)', async () => {
      await expect(
        service.registrarPago(50, { disciplinaId: 3, periodos: [periodo, periodo] }, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza si el participante no está inscripto en la disciplina (BadRequest)', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(participanteBase());
      await expect(
        service.registrarPago(50, { disciplinaId: 99, periodos: [periodo] }, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza períodos futuros (BadRequest)', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(participanteBase());
      const futuro = `${new Date().getFullYear() + 1}-01`;
      await expect(
        service.registrarPago(50, { disciplinaId: 3, periodos: [futuro] }, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('CA: rechaza un período ya pagado (Conflict)', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(participanteBase());
      mockPrisma.pagoCuotaDeportiva.findMany.mockResolvedValue([{ periodo }]);
      await expect(
        service.registrarPago(50, { disciplinaId: 3, periodos: [periodo] }, 1),
      ).rejects.toThrow(ConflictException);
    });

    it('rechaza si el participante no tiene categoría de socio (BadRequest)', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(participanteBase({ membresias: [] }));
      mockPrisma.pagoCuotaDeportiva.findMany.mockResolvedValue([]);
      await expect(
        service.registrarPago(50, { disciplinaId: 3, periodos: [periodo] }, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza si no hay cuota deportiva configurada (monto 0) (BadRequest)', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(participanteBase());
      mockPrisma.pagoCuotaDeportiva.findMany.mockResolvedValue([]);
      mockPrisma.configuracionCuotaDeportiva.findFirst.mockResolvedValue(null);
      await expect(
        service.registrarPago(50, { disciplinaId: 3, periodos: [periodo] }, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('CA: registra el pago, audita y recalcula el estado a AL_DIA', async () => {
      // Participante inscripto este mismo período (solo debe 1 período: el actual).
      const inicioEsteMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      mockPrisma.persona.findUnique.mockResolvedValue(
        participanteBase({
          inscripciones: [
            {
              disciplinaId: 3,
              fechaInscripcion: inicioEsteMes,
              disciplina: { id: 3, nombre: 'Fútbol' },
            },
          ],
        }),
      );
      // 1a llamada (validación de existentes): ninguno; 2a (recalcular pendientes): ya pagado.
      mockPrisma.pagoCuotaDeportiva.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ disciplinaId: 3, periodo }]);
      mockPrisma.configuracionCuotaDeportiva.findFirst.mockResolvedValue({ monto: 5000 });
      mockPrisma.pagoCuotaDeportiva.create.mockResolvedValue({
        id: 1,
        periodo,
        monto: 5000,
        fechaPago: new Date(),
        metodoPago: 'EFECTIVO',
      });

      const res = await service.registrarPago(50, { disciplinaId: 3, periodos: [periodo] }, 7);

      expect(mockPrisma.pagoCuotaDeportiva.create).toHaveBeenCalledTimes(1);
      expect(mockAuditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'CREAR', entidad: 'PagoCuotaDeportiva', responsableId: 7 }),
        expect.anything(),
      );
      expect(res.montoTotal).toBe(5000);
      expect(res.usuarioResponsableId).toBe(7);
      expect(res.estadoDeudaActual).toBe('AL_DIA');
      expect(res.cuotasPendientesRestantes).toBe(0);
    });
  });

  describe('getHistorialPorPersona', () => {
    it('devuelve los pagos ordenados y serializados', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(participanteBase());
      mockPrisma.pagoCuotaDeportiva.findMany.mockResolvedValue([
        {
          id: 1,
          disciplinaId: 3,
          disciplina: { nombre: 'Fútbol' },
          periodo: '2026-01',
          monto: 5000,
          fechaPago: new Date(),
          metodoPago: 'EFECTIVO',
          responsableId: 7,
        },
      ]);
      const res = await service.getHistorialPorPersona(50);
      expect(res).toHaveLength(1);
      expect(res[0]).toMatchObject({ disciplinaNombre: 'Fútbol', monto: 5000, responsableId: 7 });
    });
  });
});
