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
      update: jest.fn(),
      updateBloqueo: jest.fn(),
      deleteBloqueo: jest.fn(),
      remove: jest.fn(),
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

    const resultado = await controller.findAll({ tipo: TipoEspacio.DEPORTIVO }, mockUser);

    expect(resultado).toHaveLength(1);
    expect(service.findAll).toHaveBeenCalledWith({ tipo: TipoEspacio.DEPORTIVO }, 'ADMIN');
  });

  it('findAll · delega con filtros de jerarquía composite soloRaiz y espacioPadreId', async () => {
    service.findAll.mockResolvedValue([{ id: 10, nombre: 'Padre' }] as any);

    const resultado = await controller.findAll({ soloRaiz: true, espacioPadreId: 10 }, mockUser);

    expect(resultado).toHaveLength(1);
    expect(service.findAll).toHaveBeenCalledWith({ soloRaiz: true, espacioPadreId: 10 }, 'ADMIN');
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

  describe('US-56 · Endpoints de edición', () => {
    it('update · delega en service.update con id y body', async () => {
      service.update.mockResolvedValue({ id: 1, nombre: 'Modificado' } as any);

      const res = await controller.update(1, { nombre: 'Modificado' }, mockUser);
      expect(res.nombre).toBe('Modificado');
      expect(service.update).toHaveBeenCalledWith(1, { nombre: 'Modificado' }, 1);
    });

    it('updateBloqueo · delega en service.updateBloqueo', async () => {
      service.updateBloqueo.mockResolvedValue({ id: 50, motivo: 'Nuevo motivo' } as any);

      const res = await controller.updateBloqueo(1, 50, { motivo: 'Nuevo motivo' }, mockUser);
      expect(res.motivo).toBe('Nuevo motivo');
      expect(service.updateBloqueo).toHaveBeenCalledWith(1, 50, { motivo: 'Nuevo motivo' }, 1);
    });

    it('deleteBloqueo · delega en service.deleteBloqueo', async () => {
      service.deleteBloqueo.mockResolvedValue({ mensaje: 'Bloqueo eliminado exitosamente', bloqueoId: 50 } as any);

      const res = await controller.deleteBloqueo(1, 50, mockUser);
      expect(res.mensaje).toBe('Bloqueo eliminado exitosamente');
      expect(service.deleteBloqueo).toHaveBeenCalledWith(1, 50, 1);
    });

    it('remove · delega en service.remove (US-57 baja lógica)', async () => {
      service.remove.mockResolvedValue({ mensaje: 'Espacio dado de baja exitosamente', id: 1 } as any);

      const res = await controller.remove(1, mockUser);
      expect(res.mensaje).toBe('Espacio dado de baja exitosamente');
      expect(service.remove).toHaveBeenCalledWith(1, 1);
    });
  });
});
