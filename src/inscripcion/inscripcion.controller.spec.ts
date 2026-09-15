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

    it('permite el acceso al rol COLABORADOR (rol operativo del delegado)', () => {
      const rolesPermitidos = Reflect.getMetadata('roles', InscripcionController.prototype.findAll);
      expect(rolesPermitidos).toEqual(['ADMIN', 'COLABORADOR']);
    });
  });
});
