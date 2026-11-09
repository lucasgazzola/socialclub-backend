import { Test, TestingModule } from '@nestjs/testing';
import { ModalidadReserva, TipoEspacio } from '@prisma/client';
import { EspaciosController } from './espacios.controller';
import { EspaciosService } from './espacios.service';
import { CreateEspacioDto } from './dto/create-espacio.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

describe('US-55 · EspaciosController', () => {
  let controller: EspaciosController;
  let service: jest.Mocked<EspaciosService>;

  const mockUser = {
    id: 1,
    email: 'admin@socialclub.local',
    rol: 'ADMIN',
  } as any;

  beforeEach(async () => {
    const mockService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      agregarBloqueo: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EspaciosController],
      providers: [{ provide: EspaciosService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<EspaciosController>(EspaciosController);
    service = module.get(EspaciosService);
  });

  it('create · delega en service.create con el ID del usuario autenticado', async () => {
    const dto: CreateEspacioDto = {
      nombre: 'Salón de Fiestas',
      tipo: TipoEspacio.SOCIAL,
      capacidadMaxima: 100,
      modalidad: ModalidadReserva.DIA_COMPLETO,
      precio: 80000,
      montoSena: 30000,
    };

    service.create.mockResolvedValue({ id: 5, ...dto } as any);

    const resultado = await controller.create(dto, mockUser);

    expect(resultado.id).toBe(5);
    expect(service.create).toHaveBeenCalledWith(dto, 1);
  });

  it('findAll · delega en service.findAll con los filtros recibidos', async () => {
    service.findAll.mockResolvedValue([{ id: 1, nombre: 'Cancha 1' }] as any);

    const resultado = await controller.findAll({ tipo: TipoEspacio.DEPORTIVO });

    expect(resultado).toHaveLength(1);
    expect(service.findAll).toHaveBeenCalledWith({ tipo: TipoEspacio.DEPORTIVO });
  });

  it('findAll · delega con filtros de jerarquía composite soloRaiz y espacioPadreId', async () => {
    service.findAll.mockResolvedValue([{ id: 10, nombre: 'Padre' }] as any);

    const resultado = await controller.findAll({ soloRaiz: true, espacioPadreId: 10 });

    expect(resultado).toHaveLength(1);
    expect(service.findAll).toHaveBeenCalledWith({ soloRaiz: true, espacioPadreId: 10 });
  });

  it('findOne · delega en service.findOne con el ID numérico', async () => {
    service.findOne.mockResolvedValue({ id: 2, nombre: 'Cancha 2' } as any);

    const resultado = await controller.findOne(2);

    expect(resultado.id).toBe(2);
    expect(service.findOne).toHaveBeenCalledWith(2);
  });

  it('agregarBloqueo · delega en service.agregarBloqueo', async () => {
    const dtoBloqueo = { tipo: 'PUNTUAL', fecha: '2026-11-20', motivo: 'Mantenimiento' } as any;
    service.agregarBloqueo.mockResolvedValue({ id: 50, ...dtoBloqueo });

    const resultado = await controller.agregarBloqueo(2, dtoBloqueo, mockUser);

    expect(resultado.id).toBe(50);
    expect(service.agregarBloqueo).toHaveBeenCalledWith(2, dtoBloqueo, 1);
  });
});
