import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'http';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { EstadoEvento } from '@prisma/client';

describe('ReportesController (Unit & E2E) — US-35 & US-36', () => {
  let controller: ReportesController;
  let app: INestApplication;

  const mockReportesService = {
    estadoFinanciero: jest.fn(),
    asistenciaEventos: jest.fn(),
  };

  const mockJwtGuard = {
    canActivate: jest.fn<boolean, [ExecutionContext]>().mockReturnValue(true),
  };

  const mockRolesGuard = {
    canActivate: jest.fn<boolean, [ExecutionContext]>().mockReturnValue(true),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ReportesController],
      providers: [
        {
          provide: ReportesService,
          useValue: mockReportesService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockRolesGuard)
      .compile();

    controller = moduleFixture.get<ReportesController>(ReportesController);
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockJwtGuard.canActivate.mockImplementation((context: ExecutionContext) => {
      const req = context.switchToHttp().getRequest();
      req.user = { id: 1, email: 'admin@socialclub.com', roles: ['ADMIN'] };
      return true;
    });
    mockRolesGuard.canActivate.mockImplementation(() => true);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('Unidad: ReportesController', () => {
    it('estadoFinanciero delega al servicio y retorna su valor', async () => {
      const mockResult = { totales: { recaudado: 1000 } } as any;
      mockReportesService.estadoFinanciero.mockResolvedValue(mockResult);

      const query = { desde: '2026-01', hasta: '2026-06' };
      const res = await controller.estadoFinanciero(query);

      expect(mockReportesService.estadoFinanciero).toHaveBeenCalledWith(query);
      expect(res).toBe(mockResult);
    });

    it('asistenciaEventos delega al servicio y retorna su valor', async () => {
      const mockResult = { totales: { totalEventos: 5 } } as any;
      mockReportesService.asistenciaEventos.mockResolvedValue(mockResult);

      const query = { eventoId: 3, estado: EstadoEvento.FINALIZADO };
      const res = await controller.asistenciaEventos(query);

      expect(mockReportesService.asistenciaEventos).toHaveBeenCalledWith(query);
      expect(res).toBe(mockResult);
    });
  });

  describe('Integración / E2E: GET /reportes/asistencia-eventos (US-36)', () => {
    const mockReporteAsistencia = {
      generadoEn: '2026-10-22T20:00:00.000Z',
      filtros: { eventoId: null, desde: null, hasta: null, estado: null },
      totales: {
        totalEventos: 2,
        totalCapacidad: 150,
        totalEntradas: 120,
        totalAsistentes: 100,
        totalAusentes: 20,
        porcentajeOcupacionPromedio: 66.7,
        porcentajeAsistenciaPromedio: 83.3,
        totalRecaudado: 300000,
      },
      eventos: [],
    };

    it('CP-01 (Sin sesión): retorna 401 si no está autenticado', async () => {
      mockJwtGuard.canActivate.mockImplementation(() => {
        throw new UnauthorizedException();
      });

      const server = app.getHttpServer() as Server;
      await request(server).get('/reportes/asistencia-eventos').expect(401);
    });

    it('CP-02 (Rol no autorizado): retorna 403 si el rol no es ADMIN ni COLABORADOR', async () => {
      mockJwtGuard.canActivate.mockImplementation((context: ExecutionContext) => {
        const req = context.switchToHttp().getRequest();
        req.user = { id: 2, email: 'socio@club.com', roles: ['SOCIO'] };
        return true;
      });
      mockRolesGuard.canActivate.mockImplementation(() => {
        throw new ForbiddenException();
      });

      const server = app.getHttpServer() as Server;
      await request(server).get('/reportes/asistencia-eventos').expect(403);
    });

    it('CP-03 (Acceso ADMIN): retorna 200 y el reporte consolidado', async () => {
      mockReportesService.asistenciaEventos.mockResolvedValue(mockReporteAsistencia);

      const server = app.getHttpServer() as Server;
      const res = await request(server).get('/reportes/asistencia-eventos').expect(200);

      expect(res.body).toEqual(mockReporteAsistencia);
    });

    it('CP-03b (Acceso COLABORADOR): retorna 200 para rol COLABORADOR', async () => {
      mockJwtGuard.canActivate.mockImplementation((context: ExecutionContext) => {
        const req = context.switchToHttp().getRequest();
        req.user = { id: 3, email: 'colab@club.com', roles: ['COLABORADOR'] };
        return true;
      });
      mockReportesService.asistenciaEventos.mockResolvedValue(mockReporteAsistencia);

      const server = app.getHttpServer() as Server;
      await request(server).get('/reportes/asistencia-eventos').expect(200);
    });

    it('CP-04 (Filtros válidos): parsea correctamente eventoId, estado, desde y hasta', async () => {
      mockReportesService.asistenciaEventos.mockResolvedValue(mockReporteAsistencia);

      const server = app.getHttpServer() as Server;
      await request(server)
        .get('/reportes/asistencia-eventos')
        .query({
          eventoId: 10,
          estado: 'FINALIZADO',
          desde: '2026-08-01',
          hasta: '2026-09-30',
        })
        .expect(200);

      expect(mockReportesService.asistenciaEventos).toHaveBeenCalledWith(
        expect.objectContaining({
          eventoId: 10,
          estado: EstadoEvento.FINALIZADO,
          desde: '2026-08-01',
          hasta: '2026-09-30',
        }),
      );
    });

    it('CP-05 (Validación DTO): rechaza eventoId no numérico con 400 Bad Request', async () => {
      const server = app.getHttpServer() as Server;
      await request(server)
        .get('/reportes/asistencia-eventos')
        .query({ eventoId: 'no-es-numero' })
        .expect(400);
    });

    it('CP-06 (Validación DTO): rechaza estado inexistente con 400 Bad Request', async () => {
      const server = app.getHttpServer() as Server;
      await request(server)
        .get('/reportes/asistencia-eventos')
        .query({ estado: 'ESTADO_INEXISTENTE' })
        .expect(400);
    });
  });

  describe('Integración / E2E: GET /reportes/estado-financiero (US-35)', () => {
    it('retorna 200 y delega parámetros a estadoFinanciero', async () => {
      mockReportesService.estadoFinanciero.mockResolvedValue({
        desde: '2026-01',
        hasta: '2026-03',
      });

      const server = app.getHttpServer() as Server;
      const res = await request(server)
        .get('/reportes/estado-financiero')
        .query({ desde: '2026-01', hasta: '2026-03' })
        .expect(200);

      expect(res.body).toEqual({ desde: '2026-01', hasta: '2026-03' });
    });
  });
});
