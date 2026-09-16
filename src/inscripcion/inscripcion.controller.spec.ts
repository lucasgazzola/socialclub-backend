import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InscripcionController } from './inscripcion.controller';
import { InscripcionService } from './inscripcion.service';
import { UpdateInscripcionDto } from './dto/update-inscripcion.dto';
import {
  EstadoInscripcionFiltro,
  FindParticipantesQueryDto,
} from './dto/find-participantes-query.dto';

const mockInscripcionService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  darDeBajaParticipante: jest.fn(),
  activarParticipante: jest.fn(),
};

describe('InscripcionController', () => {
  let controller: InscripcionController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InscripcionController],
      providers: [{ provide: InscripcionService, useValue: mockInscripcionService }],
    }).compile();

    controller = module.get<InscripcionController>(InscripcionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('update', () => {
    const mockUser = { id: 99, email: 'delegado@test.com', roles: ['DELEGADO'] };

    it('should call service.update with correct params', async () => {
      const dto: UpdateInscripcionDto = { nombre: 'Nuevo Nombre' };
      const expectedResult = {
        persona: { id: 10, nombre: 'Nuevo Nombre' },
        inscripcion: { id: 1 },
      };
      mockInscripcionService.update.mockResolvedValue(expectedResult);

      const result = await controller.update(1, dto, mockUser);

      expect(mockInscripcionService.update).toHaveBeenCalledWith(1, dto, 99);
      expect(result).toEqual(expectedResult);
    });

    it('should propagate NotFoundException from service', async () => {
      mockInscripcionService.update.mockRejectedValue(
        new NotFoundException('Inscripción no encontrada'),
      );

      await expect(controller.update(999, { nombre: 'X' }, mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should propagate ConflictException from service', async () => {
      mockInscripcionService.update.mockRejectedValue(
        new ConflictException('Ya existe un participante con ese DNI en esta disciplina'),
      );

      await expect(controller.update(1, { dni: '12345678' }, mockUser)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should propagate BadRequestException from service', async () => {
      mockInscripcionService.update.mockRejectedValue(
        new BadRequestException('Disciplina inactiva'),
      );

      await expect(controller.update(1, { disciplinaId: 2 }, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findAll (US-08)', () => {
    it('delega la búsqueda y los filtros en el service', async () => {
      const query: FindParticipantesQueryDto = {
        busqueda: 'perez',
        disciplinaId: 1,
        estado: EstadoInscripcionFiltro.INSCRIPTO,
        pagina: 1,
        porPagina: 10,
      };
      const expected = { items: [], total: 0, pagina: 1, porPagina: 10 };
      mockInscripcionService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(query);

      expect(mockInscripcionService.findAll).toHaveBeenCalledWith(query);
      expect(result).toEqual(expected);
    });

    it('permite el acceso a los roles operativos (COLABORADOR y DELEGADO)', () => {
      const rolesPermitidos = Reflect.getMetadata('roles', InscripcionController.prototype.findAll);
      expect(rolesPermitidos).toEqual(['ADMIN', 'COLABORADOR', 'DELEGADO']);
    });
  });

  describe('darDeBajaParticipante (US-07)', () => {
    const mockUser = { id: 99, email: 'delegado@test.com', roles: ['DELEGADO'] };

    it('delega la baja del participante en el service con el responsable', async () => {
      const esperado = {
        personaId: 10,
        activo: false,
        disciplinasDadasDeBaja: 2,
        disciplinas: [],
      };
      mockInscripcionService.darDeBajaParticipante.mockResolvedValue(esperado);

      const result = await controller.darDeBajaParticipante(10, mockUser);

      expect(mockInscripcionService.darDeBajaParticipante).toHaveBeenCalledWith(10, 99);
      expect(result).toEqual(esperado);
    });

    it('propaga el BadRequestException de un participante ya dado de baja', async () => {
      mockInscripcionService.darDeBajaParticipante.mockRejectedValue(
        new BadRequestException('El participante ya está dado de baja'),
      );

      await expect(controller.darDeBajaParticipante(10, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('propaga el NotFoundException de un participante inexistente', async () => {
      mockInscripcionService.darDeBajaParticipante.mockRejectedValue(
        new NotFoundException('Participante no encontrado'),
      );

      await expect(controller.darDeBajaParticipante(999, mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('activarParticipante (US-07)', () => {
    const mockUser = { id: 99, email: 'delegado@test.com', roles: ['DELEGADO'] };

    it('delega la reactivación en el service con el responsable', async () => {
      mockInscripcionService.activarParticipante.mockResolvedValue({
        personaId: 10,
        activo: true,
      });

      const result = await controller.activarParticipante(10, mockUser);

      expect(mockInscripcionService.activarParticipante).toHaveBeenCalledWith(10, 99);
      expect(result).toEqual({ personaId: 10, activo: true });
    });

    it('propaga el BadRequestException de un participante ya activo', async () => {
      mockInscripcionService.activarParticipante.mockRejectedValue(
        new BadRequestException('El participante ya está activo'),
      );

      await expect(controller.activarParticipante(10, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
