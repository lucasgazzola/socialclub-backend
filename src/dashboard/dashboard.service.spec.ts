import { Test, TestingModule } from '@nestjs/testing';
import { EstadoEvento, TipoDocumentacionDisciplina } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { PagosService } from '../pagos/pagos.service';
import { PagosDeportivosService } from '../pagos/pagos-deportivos.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: {
    persona: { findMany: jest.Mock };
    documentacion: { count: jest.Mock; findMany: jest.Mock };
    evento: { findMany: jest.Mock };
    inscripcion: { findMany: jest.Mock };
    disciplinaRequerimientoDoc: { findMany: jest.Mock };
  };
  let pagosService: { getMorososCuotaSocial: jest.Mock };
  let pagosDeportivosService: { getMorosos: jest.Mock };

  beforeEach(async () => {
    prisma = {
      persona: { findMany: jest.fn() },
      documentacion: { count: jest.fn(), findMany: jest.fn() },
      evento: { findMany: jest.fn() },
      inscripcion: { findMany: jest.fn() },
      disciplinaRequerimientoDoc: { findMany: jest.fn() },
    };

    pagosService = {
      getMorososCuotaSocial: jest.fn(),
    };

    pagosDeportivosService = {
      getMorosos: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
        { provide: PagosService, useValue: pagosService },
        { provide: PagosDeportivosService, useValue: pagosDeportivosService },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('getMetricas', () => {
    const FECHA_REFERENCIA = new Date('2026-11-08T15:00:00.000Z');

    it('calcula correctamente todas las métricas en caso de éxito', async () => {
      // 1. Integrantes activos: 4 personas activas
      prisma.persona.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);

      // 2. Morosos: persona 1 y 2 en social; persona 2, 3 y 99 (inactivo) en deportivo
      pagosService.getMorososCuotaSocial.mockResolvedValue({
        items: [{ personaId: 1 }, { personaId: 2 }],
        total: 2,
      });
      pagosDeportivosService.getMorosos.mockResolvedValue({
        items: [{ personaId: 2 }, { personaId: 3 }, { personaId: 99 }],
        total: 3,
      });

      // 3. Documentos por vencer en los próximos 10 días
      prisma.documentacion.count.mockResolvedValue(5);

      // 4. Próximos eventos
      prisma.evento.findMany.mockResolvedValue([
        {
          id: 10,
          nombre: 'Torneo Apertura',
          fechaEvento: new Date('2026-11-12T10:00:00.000Z'),
          fechaFin: new Date('2026-11-12T18:00:00.000Z'),
          lugarAcreditacion: 'Gimnasio 1',
          capacidadMaxima: 100,
          entradasDisponibles: 40,
        },
        {
          id: 11,
          nombre: 'Fiesta del Club',
          fechaEvento: new Date('2026-11-20T21:00:00.000Z'),
          fechaFin: null,
          lugarAcreditacion: 'Predio Los Robles',
          capacidadMaxima: 50,
          entradasDisponibles: 10,
        },
      ]);

      // 5. Inscripciones irregulares (evaluación documental por lote)
      // Dos inscripciones:
      // - Inscripción 101 (persona 1): tiene requisito DNI con plazo de 5 días desde inscripción (hoy - 2 días) -> PENDIENTE
      // - Inscripción 102 (persona 2): tiene requisito APTO_MEDICO con plazo de 5 días desde inscripción (hoy - 10 días) y sin doc -> BLOQUEADO
      prisma.inscripcion.findMany.mockResolvedValue([
        {
          id: 101,
          personaId: 1,
          disciplinaId: 1,
          categoriaDisciplinaId: null,
          fechaInscripcion: new Date('2026-11-06T10:00:00.000Z'),
          requisitosDesde: null,
          habilitacionesExcepcionales: [],
        },
        {
          id: 102,
          personaId: 2,
          disciplinaId: 1,
          categoriaDisciplinaId: null,
          fechaInscripcion: new Date('2026-10-25T10:00:00.000Z'),
          requisitosDesde: null,
          habilitacionesExcepcionales: [],
        },
      ]);

      prisma.disciplinaRequerimientoDoc.findMany.mockResolvedValue([
        {
          disciplinaId: 1,
          categoriaDisciplinaId: null,
          tipoDocumento: 'DNI' as TipoDocumentacionDisciplina,
          plazoDiasTolerancia: 5,
          creadoEn: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      prisma.documentacion.findMany.mockResolvedValue([]);

      const resultado = await service.getMetricas(FECHA_REFERENCIA);

      // Verificación de Integrantes Activos
      expect(resultado.totalIntegrantesActivos).toBe(4);

      // Verificación de Morosos (personas únicas activas: 1, 2, 3 -> 3 personas de 4 = 75.0%)
      expect(resultado.cantidadMorosos).toBe(3);
      expect(resultado.porcentajeMorosos).toBe(75);

      // Verificación de Documentos por Vencer
      expect(resultado.documentosPorVencer).toBe(5);

      // Verificación de Inscripciones Irregulares
      expect(resultado.inscripcionesIrregulares).toEqual({
        total: 2,
        pendientes: 1,
        bloqueadas: 1,
        habilitadas: 0,
      });

      // Verificación de desglose de morosidad por concepto
      expect(resultado.morosidadPorConcepto).toEqual({
        cuotaSocial: 2,
        cuotaDeportiva: 2,
        ambasCuotas: 1,
      });

      // Verificación de Eventos (entradasVendidas = capacidadMaxima - entradasDisponibles)
      expect(resultado.proximosEventos).toEqual([
        {
          id: 10,
          nombre: 'Torneo Apertura',
          fechaEvento: new Date('2026-11-12T10:00:00.000Z'),
          fechaFin: new Date('2026-11-12T18:00:00.000Z'),
          lugarAcreditacion: 'Gimnasio 1',
          capacidadMaxima: 100,
          entradasDisponibles: 40,
          entradasVendidas: 60,
        },
        {
          id: 11,
          nombre: 'Fiesta del Club',
          fechaEvento: new Date('2026-11-20T21:00:00.000Z'),
          fechaFin: null,
          lugarAcreditacion: 'Predio Los Robles',
          capacidadMaxima: 50,
          entradasDisponibles: 10,
          entradasVendidas: 40,
        },
      ]);
    });

    it('maneja el caso de 0 integrantes activos sin dividir por cero (retorna 0.0%)', async () => {
      prisma.persona.findMany.mockResolvedValue([]);
      pagosService.getMorososCuotaSocial.mockResolvedValue({ items: [], total: 0 });
      pagosDeportivosService.getMorosos.mockResolvedValue({ items: [], total: 0 });
      prisma.documentacion.count.mockResolvedValue(0);
      prisma.evento.findMany.mockResolvedValue([]);
      prisma.inscripcion.findMany.mockResolvedValue([]);

      const resultado = await service.getMetricas(FECHA_REFERENCIA);

      expect(resultado.totalIntegrantesActivos).toBe(0);
      expect(resultado.cantidadMorosos).toBe(0);
      expect(resultado.porcentajeMorosos).toBe(0);
      expect(resultado.documentosPorVencer).toBe(0);
      expect(resultado.inscripcionesIrregulares).toEqual({
        total: 0,
        pendientes: 0,
        bloqueadas: 0,
        habilitadas: 0,
      });
      expect(resultado.proximosEventos).toEqual([]);
    });

    it('calcula correctamente el rango de fechas en horario America/Argentina/Cordoba', async () => {
      prisma.persona.findMany.mockResolvedValue([]);
      pagosService.getMorososCuotaSocial.mockResolvedValue({ items: [], total: 0 });
      pagosDeportivosService.getMorosos.mockResolvedValue({ items: [], total: 0 });
      prisma.documentacion.count.mockResolvedValue(0);
      prisma.evento.findMany.mockResolvedValue([]);
      prisma.inscripcion.findMany.mockResolvedValue([]);

      // 2026-11-08 22:00:00 UTC es 2026-11-08 19:00:00 en Córdoba (UTC-3)
      const ahora = new Date('2026-11-08T22:00:00.000Z');
      await service.getMetricas(ahora);

      expect(prisma.documentacion.count).toHaveBeenCalledWith({
        where: {
          fechaVencimiento: {
            gte: new Date('2026-11-08T00:00:00.000Z'),
            lte: new Date('2026-11-18T23:59:59.999Z'),
          },
          persona: {
            activo: true,
          },
        },
      });
    });

    it('maneja eventos sin límite de capacidad (entradasVendidas = 0)', async () => {
      prisma.persona.findMany.mockResolvedValue([]);
      pagosService.getMorososCuotaSocial.mockResolvedValue({ items: [], total: 0 });
      pagosDeportivosService.getMorosos.mockResolvedValue({ items: [], total: 0 });
      prisma.documentacion.count.mockResolvedValue(0);
      prisma.inscripcion.findMany.mockResolvedValue([]);

      prisma.evento.findMany.mockResolvedValue([
        {
          id: 20,
          nombre: 'Encuentro Gratuito',
          fechaEvento: new Date('2026-11-15T10:00:00.000Z'),
          fechaFin: null,
          lugarAcreditacion: 'Cancha Abierta',
          capacidadMaxima: null,
          entradasDisponibles: null,
        },
      ]);

      const resultado = await service.getMetricas(FECHA_REFERENCIA);

      expect(resultado.proximosEventos[0]).toEqual({
        id: 20,
        nombre: 'Encuentro Gratuito',
        fechaEvento: new Date('2026-11-15T10:00:00.000Z'),
        fechaFin: null,
        lugarAcreditacion: 'Cancha Abierta',
        capacidadMaxima: null,
        entradasDisponibles: null,
        entradasVendidas: 0,
      });
    });

    it('filtra correctamente eventos que todavía no finalizaron según fechaFin o fechaEvento', async () => {
      prisma.persona.findMany.mockResolvedValue([]);
      pagosService.getMorososCuotaSocial.mockResolvedValue({ items: [], total: 0 });
      pagosDeportivosService.getMorosos.mockResolvedValue({ items: [], total: 0 });
      prisma.documentacion.count.mockResolvedValue(0);
      prisma.inscripcion.findMany.mockResolvedValue([]);
      prisma.evento.findMany.mockResolvedValue([]);

      const ahora = new Date('2026-11-08T18:00:00.000Z');
      await service.getMetricas(ahora);

      expect(prisma.evento.findMany).toHaveBeenCalledWith({
        where: {
          estado: EstadoEvento.PUBLICADO,
          OR: [{ fechaFin: { gte: ahora } }, { fechaFin: null, fechaEvento: { gte: ahora } }],
        },
        orderBy: {
          fechaEvento: 'asc',
        },
        take: 5,
        select: {
          id: true,
          nombre: true,
          fechaEvento: true,
          fechaFin: true,
          lugarAcreditacion: true,
          capacidadMaxima: true,
          entradasDisponibles: true,
        },
      });
    });
  });
});
