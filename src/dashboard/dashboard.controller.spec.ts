import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardResponseDto } from './dto/dashboard-response.dto';

describe('DashboardController', () => {
  let controller: DashboardController;
  let service: DashboardService;

  const mockDashboardResponse: DashboardResponseDto = {
    totalIntegrantesActivos: 50,
    porcentajeMorosos: 10,
    cantidadMorosos: 5,
    documentosPorVencer: 3,
    inscripcionesIrregulares: {
      total: 4,
      pendientes: 3,
      bloqueadas: 1,
    },
    proximosEventos: [
      {
        id: 1,
        nombre: 'Cena Fin de Año',
        fechaEvento: new Date('2026-12-15T21:00:00.000Z'),
        fechaFin: new Date('2026-12-16T03:00:00.000Z'),
        lugarAcreditacion: 'Salón Principal',
        capacidadMaxima: 200,
        entradasDisponibles: 50,
        entradasVendidas: 150,
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        {
          provide: DashboardService,
          useValue: {
            getMetricas: jest.fn().mockResolvedValue(mockDashboardResponse),
          },
        },
      ],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
    service = module.get<DashboardService>(DashboardService);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('getMetricas debe delegar en DashboardService.getMetricas', async () => {
    const resultado = await controller.getMetricas();
    expect(service.getMetricas).toHaveBeenCalledTimes(1);
    expect(resultado).toEqual(mockDashboardResponse);
  });
});
