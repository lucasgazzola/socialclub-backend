import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { InscripcionService } from './inscripcion.service';
import { UpdateInscripcionDto } from './dto/update-inscripcion.dto';

const mockPrisma: any = {
  disciplina: {
    findUnique: jest.fn(),
  },
  persona: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  inscripcion: {
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
  },
  categoriaDisciplina: {
    findUnique: jest.fn(),
  },
  registroAuditoria: {
    create: jest.fn(),
  },
  $transaction: jest.fn(async (fn: any) => fn(mockPrisma)),
};

const mockAuditoria = {
  registrar: jest.fn(),
};

describe('InscripcionService', () => {
  let service: InscripcionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InscripcionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditoriaService, useValue: mockAuditoria },
      ],
    }).compile();

    service = module.get<InscripcionService>(InscripcionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('update', () => {
    const inscripcionExistente = {
      id: 1,
      personaId: 10,
      disciplinaId: 1,
      categoriaDisciplinaId: 2,
      persona: {
        id: 10,
        nombre: 'Juan',
        apellido: 'Perez',
        dni: '12345678',
        fechaNacimiento: new Date('1990-01-01'),
        email: 'juan@test.com',
        telefono: '1111111111',
      },
      disciplina: {
        id: 1,
        nombre: 'Fútbol',
        activo: true,
        categorias: [
          { id: 2, nombre: 'Sub-15', activo: true },
          { id: 3, nombre: 'Primera', activo: true },
        ],
      },
      categoriaDisciplina: {
        id: 2,
        nombre: 'Sub-15',
        activo: true,
      },
    };

    const dtoBasico: UpdateInscripcionDto = {
      nombre: 'Juan Carlos',
      apellido: 'Perez Gomez',
    };

    it('should update basic person data (same discipline, same category)', async () => {
      mockPrisma.inscripcion.findUnique.mockResolvedValue(inscripcionExistente);
      mockPrisma.disciplina.findUnique.mockResolvedValue(inscripcionExistente.disciplina);
      mockPrisma.persona.update.mockResolvedValue({
        ...inscripcionExistente.persona,
        nombre: 'Juan Carlos',
        apellido: 'Perez Gomez',
      });
      mockPrisma.inscripcion.update.mockResolvedValue({
        ...inscripcionExistente,
        persona: { ...inscripcionExistente.persona, nombre: 'Juan Carlos', apellido: 'Perez Gomez' },
        disciplina: inscripcionExistente.disciplina,
        categoriaDisciplina: inscripcionExistente.categoriaDisciplina,
      });
      mockPrisma.categoriaDisciplina.findUnique.mockResolvedValue(inscripcionExistente.categoriaDisciplina);

      const result = await service.update(1, dtoBasico, 99);

      expect(result.persona.nombre).toBe('Juan Carlos');
      expect(result.persona.apellido).toBe('Perez Gomez');
      expect(result.inscripcion.disciplinaId).toBe(1);
      expect(result.inscripcion.categoriaDisciplinaId).toBe(2);
      expect(mockPrisma.registroAuditoria.create).toHaveBeenCalled();
      const auditCall = mockPrisma.registroAuditoria.create.mock.calls[0][0];
      expect(auditCall.data.accion).toBe('EDITAR');
      expect(auditCall.data.entidad).toBe('Inscripcion');
      expect(auditCall.data.idEntidad).toBe(1);
    });

    it('should update DNI (unique in same discipline)', async () => {
      mockPrisma.inscripcion.findUnique.mockResolvedValue(inscripcionExistente);
      mockPrisma.disciplina.findUnique.mockResolvedValue(inscripcionExistente.disciplina);
      mockPrisma.persona.findUnique.mockResolvedValue(null);
      mockPrisma.persona.update.mockResolvedValue({
        ...inscripcionExistente.persona,
        dni: '87654321',
      });
      mockPrisma.inscripcion.update.mockResolvedValue({
        ...inscripcionExistente,
        persona: { ...inscripcionExistente.persona, dni: '87654321' },
        disciplina: inscripcionExistente.disciplina,
        categoriaDisciplina: inscripcionExistente.categoriaDisciplina,
      });
      mockPrisma.categoriaDisciplina.findUnique.mockResolvedValue(inscripcionExistente.categoriaDisciplina);

      const result = await service.update(1, { dni: '87654321' }, 99);

      expect(result.persona.dni).toBe('87654321');
      expect(mockPrisma.persona.findUnique).toHaveBeenCalledWith({ where: { dni: '87654321' } });
    });

    it('should throw ConflictException if DNI already exists in same discipline', async () => {
      mockPrisma.inscripcion.findUnique.mockResolvedValue(inscripcionExistente);
      mockPrisma.disciplina.findUnique.mockResolvedValue(inscripcionExistente.disciplina);
      mockPrisma.persona.findUnique.mockResolvedValue({ id: 999, dni: '87654321' });
      mockPrisma.inscripcion.findUnique.mockResolvedValueOnce(inscripcionExistente).mockResolvedValueOnce({ id: 999 });

      await expect(service.update(1, { dni: '87654321' }, 99)).rejects.toThrow(ConflictException);
    });

    it('should change discipline (valid, active)', async () => {
      const nuevaDisciplina = {
        id: 2,
        nombre: 'Vóley',
        activo: true,
        categorias: [],
      };
      const inscripcionSinCategoria = {
        ...inscripcionExistente,
        categoriaDisciplinaId: null,
        categoriaDisciplina: null,
      };
      mockPrisma.inscripcion.findUnique.mockResolvedValue(inscripcionSinCategoria);
      mockPrisma.disciplina.findUnique.mockResolvedValue(nuevaDisciplina);
      mockPrisma.persona.findUnique.mockResolvedValue(null);
      mockPrisma.inscripcion.findUnique.mockResolvedValueOnce(inscripcionSinCategoria).mockResolvedValueOnce(null);
      mockPrisma.persona.update.mockResolvedValue(inscripcionExistente.persona);
      mockPrisma.inscripcion.update.mockResolvedValue({
        ...inscripcionSinCategoria,
        disciplinaId: 2,
        categoriaDisciplinaId: null,
        disciplina: nuevaDisciplina,
        categoriaDisciplina: null,
      });
      mockPrisma.categoriaDisciplina.findUnique.mockResolvedValue(null);

      const result = await service.update(1, { disciplinaId: 2 }, 99);

      expect(result.inscripcion.disciplinaId).toBe(2);
      expect(result.inscripcion.categoriaDisciplinaId).toBeNull();
    });

    it('should throw NotFoundException if new discipline not found', async () => {
      mockPrisma.inscripcion.findUnique.mockResolvedValue(inscripcionExistente);
      mockPrisma.disciplina.findUnique.mockResolvedValue(null);

      await expect(service.update(1, { disciplinaId: 999 }, 99)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if new discipline is inactive', async () => {
      mockPrisma.inscripcion.findUnique.mockResolvedValue(inscripcionExistente);
      mockPrisma.disciplina.findUnique.mockResolvedValue({ id: 2, nombre: 'Vóley', activo: false, categorias: [] });

      await expect(service.update(1, { disciplinaId: 2 }, 99)).rejects.toThrow(BadRequestException);
    });

    it('should change discipline with category', async () => {
      const nuevaDisciplina = {
        id: 2,
        nombre: 'Vóley',
        activo: true,
        categorias: [{ id: 5, nombre: 'Sub-18', activo: true }],
      };
      mockPrisma.inscripcion.findUnique.mockResolvedValue(inscripcionExistente);
      mockPrisma.disciplina.findUnique.mockResolvedValue(nuevaDisciplina);
      mockPrisma.persona.findUnique.mockResolvedValue(null);
      mockPrisma.inscripcion.findUnique.mockResolvedValueOnce(inscripcionExistente).mockResolvedValueOnce(null);
      mockPrisma.persona.update.mockResolvedValue(inscripcionExistente.persona);
      mockPrisma.inscripcion.update.mockResolvedValue({
        ...inscripcionExistente,
        disciplinaId: 2,
        categoriaDisciplinaId: 5,
        disciplina: nuevaDisciplina,
        categoriaDisciplina: { id: 5, nombre: 'Sub-18', activo: true },
      });
      mockPrisma.categoriaDisciplina.findUnique.mockResolvedValue({ id: 5, nombre: 'Sub-18', activo: true });

      const result = await service.update(1, { disciplinaId: 2, categoriaDisciplinaId: 5 }, 99);

      expect(result.inscripcion.disciplinaId).toBe(2);
      expect(result.inscripcion.categoriaDisciplinaId).toBe(5);
    });

    it('should throw BadRequestException if new discipline requires category but none provided', async () => {
      mockPrisma.inscripcion.findUnique.mockReset();
      const nuevaDisciplina = {
        id: 2,
        nombre: 'Vóley',
        activo: true,
        categorias: [{ id: 5, nombre: 'Sub-18', activo: true }],
      };
      const inscripcionSinCategoria = {
        ...inscripcionExistente,
        categoriaDisciplinaId: null,
        categoriaDisciplina: null,
      };
      mockPrisma.inscripcion.findUnique.mockResolvedValue(inscripcionSinCategoria);
      mockPrisma.disciplina.findUnique.mockResolvedValue(nuevaDisciplina);

      await expect(service.update(1, { disciplinaId: 2 }, 99)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if category does not belong to new discipline', async () => {
      const nuevaDisciplina = {
        id: 2,
        nombre: 'Vóley',
        activo: true,
        categorias: [{ id: 5, nombre: 'Sub-18', activo: true }],
      };
      mockPrisma.inscripcion.findUnique.mockResolvedValue(inscripcionExistente);
      mockPrisma.disciplina.findUnique.mockResolvedValue(nuevaDisciplina);

      await expect(service.update(1, { disciplinaId: 2, categoriaDisciplinaId: 999 }, 99)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if category is inactive', async () => {
      const nuevaDisciplina = {
        id: 2,
        nombre: 'Vóley',
        activo: true,
        categorias: [{ id: 5, nombre: 'Sub-18', activo: false }],
      };
      mockPrisma.inscripcion.findUnique.mockResolvedValue(inscripcionExistente);
      mockPrisma.disciplina.findUnique.mockResolvedValue(nuevaDisciplina);

      await expect(service.update(1, { disciplinaId: 2, categoriaDisciplinaId: 5 }, 99)).rejects.toThrow(BadRequestException);
    });

    it('should change category within same discipline', async () => {
      mockPrisma.inscripcion.findUnique.mockResolvedValue(inscripcionExistente);
      mockPrisma.disciplina.findUnique.mockResolvedValue(inscripcionExistente.disciplina);
      mockPrisma.persona.update.mockResolvedValue(inscripcionExistente.persona);
      mockPrisma.inscripcion.update.mockResolvedValue({
        ...inscripcionExistente,
        categoriaDisciplinaId: 3,
        disciplina: inscripcionExistente.disciplina,
        categoriaDisciplina: { id: 3, nombre: 'Primera', activo: true },
      });
      mockPrisma.categoriaDisciplina.findUnique.mockResolvedValue({ id: 3, nombre: 'Primera', activo: true });

      const result = await service.update(1, { categoriaDisciplinaId: 3 }, 99);

      expect(result.inscripcion.categoriaDisciplinaId).toBe(3);
    });

    it('should remove category (set null) if discipline does not require it', async () => {
      mockPrisma.inscripcion.findUnique.mockReset();
      const disciplinaSinCats = {
        id: 1,
        nombre: 'Fútbol',
        activo: true,
        categorias: [],
      };
      const inscripcionSinCategoria = {
        ...inscripcionExistente,
        categoriaDisciplinaId: null,
        categoriaDisciplina: null,
      };
      mockPrisma.inscripcion.findUnique.mockResolvedValue(inscripcionSinCategoria);
      mockPrisma.disciplina.findUnique.mockResolvedValue(disciplinaSinCats);
      mockPrisma.persona.update.mockResolvedValue(inscripcionExistente.persona);
      mockPrisma.inscripcion.update.mockResolvedValue({
        ...inscripcionSinCategoria,
        categoriaDisciplinaId: null,
        disciplina: disciplinaSinCats,
        categoriaDisciplina: null,
      });
      mockPrisma.categoriaDisciplina.findUnique.mockResolvedValue(null);

      const result = await service.update(1, { categoriaDisciplinaId: null as any }, 99);

      expect(result.inscripcion.categoriaDisciplinaId).toBeNull();
    });

    it('should throw NotFoundException if inscription not found', async () => {
      mockPrisma.inscripcion.findUnique.mockResolvedValue(null);

      await expect(service.update(999, dtoBasico, 99)).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException on P2002 race condition', async () => {
      mockPrisma.inscripcion.findUnique.mockResolvedValue(inscripcionExistente);
      mockPrisma.disciplina.findUnique.mockResolvedValue(inscripcionExistente.disciplina);
      mockPrisma.persona.findUnique.mockResolvedValue(null);
      const error = new PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: '1.0' });
      mockPrisma.$transaction.mockRejectedValueOnce(error);

      await expect(service.update(1, { dni: '87654321' }, 99)).rejects.toThrow(ConflictException);
    });
  });
});