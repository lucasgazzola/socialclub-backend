import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { PagosDeportivosService, periodoActualDeportivo } from './pagos-deportivos.service';

const mockPrisma: any = {
  persona: { findUnique: jest.fn() },
  configuracionCuotaDeportiva: { findMany: jest.fn() },
  pagoCuotaDeportiva: { findMany: jest.fn(), create: jest.fn() },
  $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(mockPrisma))),
};

const mockAuditoria = { registrar: jest.fn() };

/** Inscripción activa en Fútbol (disciplina 3), sin categoría. */
function inscripcion(overrides: Partial<any> = {}) {
  return {
    disciplinaId: 3,
    fechaInscripcion: new Date(new Date().getFullYear() - 1, 0, 1), // enero del año pasado
    fechaBaja: null,
    activo: true,
    categoriaDisciplinaId: null,
    categoriaDisciplina: null,
    disciplina: { id: 3, nombre: 'Fútbol' },
    ...overrides,
  };
}

/** Participante socio desde hace años, con una inscripción activa en Fútbol. */
function participanteBase(overrides: Partial<any> = {}) {
  return {
    id: 50,
    nombre: 'Ana',
    apellido: 'Jugadora',
    dni: '30111222',
    inscripciones: [inscripcion()],
    membresias: [
      {
        activo: true,
        fechaAlta: new Date(2020, 0, 1),
        fechaBaja: null,
        categoriaId: 1,
        categoria: { nombre: 'General' },
      },
    ],
    ...overrides,
  };
}

/** Tarifa base de Fútbol: $5.000 con 20 % de descuento para socios, desde 2020. */
function tarifa(overrides: Partial<any> = {}) {
  return {
    id: 1,
    disciplinaId: 3,
    categoriaDisciplinaId: null,
    periodoAplicacion: '2020-01',
    monto: 5000,
    descuentoSocioPorcentaje: 20,
    activo: true,
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
      mockPrisma.persona.findUnique.mockResolvedValue(participanteBase({ inscripciones: [] }));
      mockPrisma.pagoCuotaDeportiva.findMany.mockResolvedValue([]);
      const res = await service.getPendientesPorPersona(50);
      expect(res.estadoDeuda).toBe('AL_DIA');
      expect(res.cuotasPendientes).toHaveLength(0);
    });

    it('devuelve MOROSO con períodos pendientes valorizados', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(participanteBase());
      mockPrisma.pagoCuotaDeportiva.findMany.mockResolvedValue([]);
      mockPrisma.configuracionCuotaDeportiva.findMany.mockResolvedValue([tarifa()]);
      const res = await service.getPendientesPorPersona(50);
      expect(res.estadoDeuda).toBe('MOROSO');
      expect(res.cuotasPendientes.length).toBeGreaterThan(0);
      expect(res.totalAdeudado).toBeGreaterThan(0);
      expect(res.cuotasPendientes[0]).toMatchObject({
        disciplinaId: 3,
        disciplinaNombre: 'Fútbol',
      });
    });
  });

  describe('registrarPago', () => {
    const periodo = periodoActualDeportivo();

    it('rechaza lista de períodos vacía (BadRequest)', async () => {
      await expect(service.registrarPago(50, { disciplinaId: 3, periodos: [] }, 1)).rejects.toThrow(
        BadRequestException,
      );
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

    it('TASK-33: rechaza un período sin tarifa configurada (BadRequest)', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(participanteBase());
      mockPrisma.pagoCuotaDeportiva.findMany.mockResolvedValue([]);
      mockPrisma.configuracionCuotaDeportiva.findMany.mockResolvedValue([]);
      await expect(
        service.registrarPago(50, { disciplinaId: 3, periodos: [periodo] }, 1),
      ).rejects.toThrow(`No hay una tarifa configurada para Fútbol en el período ${periodo}`);
    });

    it('CA: registra el pago, audita y recalcula el estado a AL_DIA', async () => {
      // Participante inscripto este mismo período (solo debe 1 período: el actual).
      const inicioEsteMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      mockPrisma.persona.findUnique.mockResolvedValue(
        participanteBase({
          inscripciones: [inscripcion({ fechaInscripcion: inicioEsteMes })],
        }),
      );
      // 1a llamada (validación de existentes): ninguno; 2a (recalcular pendientes): ya pagado.
      mockPrisma.pagoCuotaDeportiva.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ disciplinaId: 3, periodo }]);
      mockPrisma.configuracionCuotaDeportiva.findMany.mockResolvedValue([tarifa()]);
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
        expect.objectContaining({
          accion: 'CREAR',
          entidad: 'PagoCuotaDeportiva',
          responsableId: 7,
        }),
        expect.anything(),
      );
      // Socio: $5.000 con 20 % de descuento.
      expect(res.montoTotal).toBe(4000);
      expect(mockPrisma.pagoCuotaDeportiva.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ periodo, monto: 4000 }) as object,
      });
      expect(res.usuarioResponsableId).toBe(7);
      expect(res.estadoDeudaActual).toBe('AL_DIA');
      expect(res.cuotasPendientesRestantes).toBe(0);
    });
  });

  describe('getHistorialPorPersona · US-22', () => {
    const pagoConResponsable = {
      id: 1,
      disciplinaId: 3,
      disciplina: { nombre: 'Fútbol' },
      periodo: '2026-01',
      monto: 5000,
      fechaPago: new Date('2026-01-15T10:00:00'),
      metodoPago: 'EFECTIVO',
      responsableId: 7,
      responsable: { id: 7, nombre: 'Lucas', apellido: 'Gazzola' },
    };

    it('CA: devuelve pagos (con el usuario que registró) y períodos adeudados', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(participanteBase());
      mockPrisma.configuracionCuotaDeportiva.findMany.mockResolvedValue([tarifa()]);
      mockPrisma.pagoCuotaDeportiva.findMany
        .mockResolvedValueOnce([]) // 1a llamada: cálculo de pendientes
        .mockResolvedValueOnce([pagoConResponsable]); // 2a: historial de pagos

      const res = await service.getHistorialPorPersona(50);

      expect(res.pagos).toHaveLength(1);
      expect(res.pagos[0]).toMatchObject({
        disciplinaNombre: 'Fútbol',
        monto: 5000,
        registradoPor: { id: 7, nombre: 'Lucas Gazzola' },
      });
      expect(res.totalPagado).toBe(5000);
      expect(Array.isArray(res.adeudados)).toBe(true);
      expect(res.adeudados.length).toBeGreaterThan(0); // deuda vigente presente
      expect(res.estadoDeuda).toBe('MOROSO');
    });

    it('registradoPor es null cuando el pago no tiene responsable asociado', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(participanteBase());
      mockPrisma.configuracionCuotaDeportiva.findMany.mockResolvedValue([tarifa()]);
      mockPrisma.pagoCuotaDeportiva.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ ...pagoConResponsable, responsable: null, responsableId: null }]);

      const res = await service.getHistorialPorPersona(50);
      expect(res.pagos[0].registradoPor).toBeNull();
    });

    it('CA: filtra el historial por rango de fechas (fechaPago gte/lte)', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(participanteBase());
      mockPrisma.configuracionCuotaDeportiva.findMany.mockResolvedValue([tarifa()]);
      mockPrisma.pagoCuotaDeportiva.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([pagoConResponsable]);

      await service.getHistorialPorPersona(50, { desde: '2026-01-01', hasta: '2026-01-31' });

      // La 2a invocación (historial) debe incluir el filtro por fechaPago.
      const args = mockPrisma.pagoCuotaDeportiva.findMany.mock.calls[1][0];
      expect(args.where.fechaPago.gte).toBeInstanceOf(Date);
      expect(args.where.fechaPago.lte).toBeInstanceOf(Date);
      expect(args.where.fechaPago.gte.getFullYear()).toBe(2026);
    });

    it('sin filtros no agrega condición de fecha al historial', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(participanteBase());
      mockPrisma.configuracionCuotaDeportiva.findMany.mockResolvedValue([tarifa()]);
      mockPrisma.pagoCuotaDeportiva.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([pagoConResponsable]);

      const res = await service.getHistorialPorPersona(50);
      const args = mockPrisma.pagoCuotaDeportiva.findMany.mock.calls[1][0];
      expect(args.where.fechaPago).toBeUndefined();
      expect(res.filtro).toEqual({ desde: null, hasta: null });
    });
  });

  describe('TASK-33 · tarifa por disciplina y categoría, descuento para socios', () => {
    const anio = new Date().getFullYear();
    const mesActual = new Date().getMonth();

    beforeEach(() => {
      mockPrisma.pagoCuotaDeportiva.findMany.mockResolvedValue([]);
    });

    it('un participante que no es socio paga la tarifa completa (antes figuraba $0)', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(participanteBase({ membresias: [] }));
      mockPrisma.configuracionCuotaDeportiva.findMany.mockResolvedValue([tarifa()]);

      const res = await service.getPendientesPorPersona(50);

      expect(res.esSocio).toBe(false);
      expect(res.cuotasPendientes.every((c) => c.monto === 5000 && !c.esSocio)).toBe(true);
    });

    it('a un socio le aplica el descuento en los meses en que era socio', async () => {
      const inicio = new Date(anio, mesActual - 2, 1);
      const altaSocio = new Date(anio, mesActual - 1, 10);
      mockPrisma.persona.findUnique.mockResolvedValue(
        participanteBase({
          inscripciones: [inscripcion({ fechaInscripcion: inicio })],
          membresias: [
            {
              activo: true,
              fechaAlta: altaSocio,
              fechaBaja: null,
              categoriaId: 1,
              categoria: { nombre: 'General' },
            },
          ],
        }),
      );
      mockPrisma.configuracionCuotaDeportiva.findMany.mockResolvedValue([tarifa()]);

      const res = await service.getPendientesPorPersona(50);

      expect(res.cuotasPendientes.map((c) => [c.monto, c.descuentoSocioPorcentaje])).toEqual([
        [5000, 0], // todavía no era socio
        [4000, 20],
        [4000, 20],
      ]);
      expect(res.totalAdeudado).toBe(13000);
    });

    it('la tarifa de la categoría reemplaza a la de la disciplina', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(
        participanteBase({
          membresias: [],
          inscripciones: [
            inscripcion({
              fechaInscripcion: new Date(anio, mesActual, 1),
              categoriaDisciplinaId: 7,
              categoriaDisciplina: { id: 7, nombre: 'Sub-15' },
            }),
          ],
        }),
      );
      mockPrisma.configuracionCuotaDeportiva.findMany.mockResolvedValue([
        tarifa(),
        tarifa({ id: 2, categoriaDisciplinaId: 7, monto: 3000 }),
      ]);

      const res = await service.getPendientesPorPersona(50);

      expect(res.cuotasPendientes).toEqual([
        expect.objectContaining({ monto: 3000, categoriaNombre: 'Sub-15', sinTarifa: false }),
      ]);
    });

    it('al dar de baja se conserva la deuda anterior y no se generan meses nuevos', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(
        participanteBase({
          membresias: [],
          inscripciones: [
            inscripcion({
              activo: false,
              fechaInscripcion: new Date(anio - 1, 0, 15),
              fechaBaja: new Date(anio - 1, 2, 3),
            }),
          ],
        }),
      );
      mockPrisma.configuracionCuotaDeportiva.findMany.mockResolvedValue([tarifa()]);

      const res = await service.getPendientesPorPersona(50);

      expect(res.cuotasPendientes.map((c) => c.periodo)).toEqual([
        `${anio - 1}-01`,
        `${anio - 1}-02`,
        `${anio - 1}-03`, // el mes de la baja se cobra completo
      ]);
      expect(res.cuotasPendientes.every((c) => c.inscripcionActiva === false)).toBe(true);
      expect(res.estadoDeuda).toBe('MOROSO');
    });

    it('un mes sin tarifa figura como "sin tarifa" y no cuenta como deuda', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(
        participanteBase({
          membresias: [],
          inscripciones: [inscripcion({ fechaInscripcion: new Date(anio, mesActual, 1) })],
        }),
      );
      mockPrisma.configuracionCuotaDeportiva.findMany.mockResolvedValue([]);

      const res = await service.getPendientesPorPersona(50);

      expect(res.cuotasPendientes).toEqual([
        expect.objectContaining({ sinTarifa: true, monto: null }),
      ]);
      expect(res.totalAdeudado).toBe(0);
      expect(res.estadoDeuda).toBe('AL_DIA');
    });

    it('permite cobrar la deuda de una disciplina dada de baja, pero no meses posteriores a la baja', async () => {
      const dadaDeBaja = participanteBase({
        membresias: [],
        inscripciones: [
          inscripcion({
            activo: false,
            fechaInscripcion: new Date(anio - 1, 0, 15),
            fechaBaja: new Date(anio - 1, 2, 3),
          }),
        ],
      });
      mockPrisma.persona.findUnique.mockResolvedValue(dadaDeBaja);
      mockPrisma.configuracionCuotaDeportiva.findMany.mockResolvedValue([tarifa()]);

      await expect(
        service.registrarPago(50, { disciplinaId: 3, periodos: [`${anio - 1}-05`] }, 1),
      ).rejects.toThrow('No se permite registrar pagos posteriores a la baja de la disciplina');

      mockPrisma.pagoCuotaDeportiva.create.mockResolvedValue({
        id: 9,
        periodo: `${anio - 1}-02`,
        monto: 5000,
        fechaPago: new Date(),
        metodoPago: 'EFECTIVO',
      });
      const res = await service.registrarPago(
        50,
        { disciplinaId: 3, periodos: [`${anio - 1}-02`] },
        1,
      );
      expect(res.montoTotal).toBe(5000);
    });
  });
});
