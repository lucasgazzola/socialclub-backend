import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { GetUsuariosQueryDto } from './dto/get-usuarios-query.dto';

const mockUsuariosService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  deactivate: jest.fn(),
  activate: jest.fn(),
  getRoles: jest.fn(),
};

describe('UsuariosController', () => {
  let controller: UsuariosController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsuariosController],
      providers: [{ provide: UsuariosService, useValue: mockUsuariosService }],
    }).compile();

    controller = module.get<UsuariosController>(UsuariosController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create (US-01)', () => {
    const mockUser = { id: 99, email: 'admin@test.com', roles: ['ADMIN'] };

    it('should call service.create with correct params', async () => {
      const dto: CreateUsuarioDto = {
        dni: '12345678',
        email: 'nuevo@test.com',
        password: 'Password123!',
        nombre: 'Nuevo',
        apellido: 'Admin',
        roles: ['ADMIN'],
      };
      const expectedResult = { id: 1, ...dto };
      mockUsuariosService.create.mockResolvedValue(expectedResult);

      const result = await controller.create(dto, mockUser as any);

      expect(mockUsuariosService.create).toHaveBeenCalledWith(dto, 99);
      expect(result).toEqual(expectedResult);
    });

    it('should propagate ConflictException from service', async () => {
      mockUsuariosService.create.mockRejectedValue(new ConflictException('Email duplicado'));

      const dto: CreateUsuarioDto = {
        dni: '12345678',
        email: 'nuevo@test.com',
        password: 'Password123!',
        nombre: 'Nuevo',
        apellido: 'Admin',
        roles: ['ADMIN'],
      };

      await expect(controller.create(dto, mockUser as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll (US-04)', () => {
    it('should delegate search to the service', async () => {
      const query: GetUsuariosQueryDto = {
        busqueda: 'Perez',
        rolId: 2,
        pagina: 1,
        porPagina: 10,
      };
      const expectedResult = {
        items: [{ id: 1, nombre: 'Juan Perez' }],
        total: 1,
        pagina: 1,
        porPagina: 10,
        counts: { todos: 1, activos: 1, inactivos: 0 },
      };
      mockUsuariosService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.findAll(query);

      expect(mockUsuariosService.findAll).toHaveBeenCalledWith(query);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('findOne', () => {
    it('should delegate fetching to the service', async () => {
      const expectedResult = { id: 1, nombre: 'Juan' };
      mockUsuariosService.findOne.mockResolvedValue(expectedResult);

      const result = await controller.findOne(1);

      expect(mockUsuariosService.findOne).toHaveBeenCalledWith(1);
      expect(result).toEqual(expectedResult);
    });

    it('should propagate NotFoundException from service', async () => {
      mockUsuariosService.findOne.mockRejectedValue(new NotFoundException());

      await expect(controller.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update (US-02)', () => {
    const mockUser = { id: 99, email: 'admin@test.com', roles: ['ADMIN'] };

    it('should delegate update to the service', async () => {
      const dto: UpdateUsuarioDto = { nombre: 'Nuevo Nombre' };
      const expectedResult = { id: 1, nombre: 'Nuevo Nombre' };
      mockUsuariosService.update.mockResolvedValue(expectedResult);

      const result = await controller.update(1, dto, mockUser as any);

      expect(mockUsuariosService.update).toHaveBeenCalledWith(1, dto, 99);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('deactivate (US-03)', () => {
    const mockUser = { id: 99, email: 'admin@test.com', roles: ['ADMIN'] };

    it('should delegate deactivate to the service', async () => {
      const expectedResult = { id: 1, activo: false };
      mockUsuariosService.deactivate.mockResolvedValue(expectedResult);

      const result = await controller.deactivate(1, mockUser as any);

      expect(mockUsuariosService.deactivate).toHaveBeenCalledWith(1, 99);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('activate (US-03 complemento)', () => {
    const mockUser = { id: 99, email: 'admin@test.com', roles: ['ADMIN'] };

    it('should delegate activate to the service', async () => {
      const expectedResult = { id: 1, activo: true };
      mockUsuariosService.activate.mockResolvedValue(expectedResult);

      const result = await controller.activate(1, mockUser as any);

      expect(mockUsuariosService.activate).toHaveBeenCalledWith(1, 99);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getRoles', () => {
    it('debe delegar la obtención de roles al servicio', async () => {
      const rolesEsperados = [
        { id: 1, nombre: 'ADMIN', descripcion: 'Acceso total' },
        { id: 2, nombre: 'COLABORADOR', descripcion: 'Acceso operativo' },
      ];
      mockUsuariosService.getRoles.mockResolvedValue(rolesEsperados);

      const resultado = await controller.getRoles();

      expect(mockUsuariosService.getRoles).toHaveBeenCalled();
      expect(resultado).toEqual(rolesEsperados);
    });
  });
});
