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
    create: jest.fn(),
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
      activo: true,
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
        persona: {
          ...inscripcionExistente.persona,
          nombre: 'Juan Carlos',
          apellido: 'Perez Gomez',
        },
        disciplina: inscripcionExistente.disciplina,
        categoriaDisciplina: inscripcionExistente.categoriaDisciplina,
      });
      mockPrisma.categoriaDisciplina.findUnique.mockResolvedValue(
        inscripcionExistente.categoriaDisciplina,
      );

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
      mockPrisma.categoriaDisciplina.findUnique.mockResolvedValue(
        inscripcionExistente.categoriaDisciplina,
      );

      const result = await service.update(1, { dni: '87654321' }, 99);

      expect(result.persona.dni).toBe('87654321');
      expect(mockPrisma.persona.findUnique).toHaveBeenCalledWith({ where: { dni: '87654321' } });
    });

    it('should throw ConflictException if DNI already exists in same discipline', async () => {
      mockPrisma.inscripcion.findUnique.mockResolvedValue(inscripcionExistente);
      mockPrisma.disciplina.findUnique.mockResolvedValue(inscripcionExistente.disciplina);
      mockPrisma.persona.findUnique.mockResolvedValue({ id: 999, dni: '87654321' });
      mockPrisma.inscripcion.findUnique
        .mockResolvedValueOnce(inscripcionExistente)
        .mockResolvedValueOnce({ id: 999, activo: true });

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
      mockPrisma.inscripcion.findUnique
        .mockResolvedValueOnce(inscripcionSinCategoria)
        .mockResolvedValueOnce(null);
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
      mockPrisma.disciplina.findUnique.mockResolvedValue({
        id: 2,
        nombre: 'Vóley',
        activo: false,
        categorias: [],
      });

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
      mockPrisma.inscripcion.findUnique
        .mockResolvedValueOnce(inscripcionExistente)
        .mockResolvedValueOnce(null);
      mockPrisma.persona.update.mockResolvedValue(inscripcionExistente.persona);
      mockPrisma.inscripcion.update.mockResolvedValue({
        ...inscripcionExistente,
        disciplinaId: 2,
        categoriaDisciplinaId: 5,
        disciplina: nuevaDisciplina,
        categoriaDisciplina: { id: 5, nombre: 'Sub-18', activo: true },
      });
      mockPrisma.categoriaDisciplina.findUnique.mockResolvedValue({
        id: 5,
        nombre: 'Sub-18',
        activo: true,
      });

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

      await expect(
        service.update(1, { disciplinaId: 2, categoriaDisciplinaId: 999 }, 99),
      ).rejects.toThrow(BadRequestException);
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

      await expect(
        service.update(1, { disciplinaId: 2, categoriaDisciplinaId: 5 }, 99),
      ).rejects.toThrow(BadRequestException);
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
      mockPrisma.categoriaDisciplina.findUnique.mockResolvedValue({
        id: 3,
        nombre: 'Primera',
        activo: true,
      });

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
      const error = new PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '1.0',
      });
      mockPrisma.$transaction.mockRejectedValueOnce(error);

      await expect(service.update(1, { dni: '87654321' }, 99)).rejects.toThrow(ConflictException);
    });
  });
  // ─────────────────────────────────────────────────────────────────────────
  // DT-16 · Baja lógica y auditada
  // ─────────────────────────────────────────────────────────────────────────
  describe('DT-16 · remove (baja lógica)', () => {
    const inscripcionVigente = {
      id: 5,
      personaId: 10,
      disciplinaId: 1,
      activo: true,
      persona: { id: 10, nombre: 'Juan', apellido: 'Perez', dni: '12345678' },
      disciplina: { id: 1, nombre: 'Fútbol' },
      categoriaDisciplina: null,
    };

    beforeEach(() => {
      mockPrisma.inscripcion.findUnique.mockReset();
      mockPrisma.inscripcion.update.mockReset();
    });

    it('marca la inscripción como inactiva en lugar de borrarla', async () => {
      mockPrisma.inscripcion.findUnique.mockResolvedValue(inscripcionVigente);
      mockPrisma.inscripcion.update.mockResolvedValue({ ...inscripcionVigente, activo: false });

      const resultado = await service.remove(5, 99);

      expect(mockPrisma.inscripcion.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 5 }, data: { activo: false } }),
      );
      // Lo importante: no queda ningún borrado físico.
      expect(mockPrisma.inscripcion.delete).not.toHaveBeenCalled();
      expect(resultado.activo).toBe(false);
    });

    it('audita la baja con la acción BAJA y el responsable', async () => {
      mockPrisma.inscripcion.findUnique.mockResolvedValue(inscripcionVigente);
      mockPrisma.inscripcion.update.mockResolvedValue({ ...inscripcionVigente, activo: false });

      await service.remove(5, 99);

      expect(mockAuditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'BAJA',
          entidad: 'Inscripcion',
          idEntidad: 5,
          responsableId: 99,
        }),
        expect.anything(),
      );
    });

    it('rechaza dar de baja una inscripción ya dada de baja', async () => {
      mockPrisma.inscripcion.findUnique.mockResolvedValue({
        ...inscripcionVigente,
        activo: false,
      });

      await expect(service.remove(5, 99)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.inscripcion.update).not.toHaveBeenCalled();
    });

    it('propaga NotFoundException si la inscripción no existe', async () => {
      mockPrisma.inscripcion.findUnique.mockResolvedValue(null);

      await expect(service.remove(999, 99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('DT-16 · listados', () => {
    it('findAll devuelve solo las inscripciones vigentes', async () => {
      mockPrisma.inscripcion.findMany.mockResolvedValue([]);

      await service.findAll();

      expect(mockPrisma.inscripcion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { activo: true } }),
      );
    });

    it('findByPersonaId devuelve solo las inscripciones vigentes de la persona', async () => {
      mockPrisma.inscripcion.findMany.mockResolvedValue([]);

      await service.findByPersonaId(10);

      expect(mockPrisma.inscripcion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { personaId: 10, activo: true } }),
      );
    });
  });

  describe('DT-16 · re-inscripción tras una baja', () => {
    const disciplina = { id: 1, nombre: 'Fútbol', activo: true, categorias: [] };
    const persona = { id: 10, nombre: 'Juan', apellido: 'Perez', dni: '12345678' };

    beforeEach(() => {
      mockPrisma.inscripcion.findUnique.mockReset();
      mockPrisma.inscripcion.update.mockReset();
      mockPrisma.inscripcion.create.mockReset();
      mockPrisma.disciplina.findUnique.mockResolvedValue(disciplina);
      mockPrisma.persona.findUnique.mockResolvedValue(persona);
    });

    it('reactiva la inscripción dada de baja en vez de insertar otra', async () => {
      // El unique (personaId, disciplinaId) hace que la fila siga existiendo.
      mockPrisma.inscripcion.findUnique.mockResolvedValue({ id: 5, activo: false });
      mockPrisma.inscripcion.update.mockResolvedValue({ id: 5, activo: true });

      const resultado = await service.create({ personaId: 10, disciplinaId: 1 }, 99);

      expect(mockPrisma.inscripcion.create).not.toHaveBeenCalled();
      expect(mockPrisma.inscripcion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 5 },
          data: expect.objectContaining({ activo: true }),
        }),
      );
      expect(mockAuditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'REACTIVAR', entidad: 'Inscripcion', idEntidad: 5 }),
        expect.anything(),
      );
      expect(resultado.inscripcion.activo).toBe(true);
    });

    it('sigue rechazando si la inscripción existente está vigente', async () => {
      mockPrisma.inscripcion.findUnique.mockResolvedValue({ id: 5, activo: true });

      await expect(service.create({ personaId: 10, disciplinaId: 1 }, 99)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrisma.inscripcion.update).not.toHaveBeenCalled();
    });

    it('crea una inscripción nueva si no existe ninguna', async () => {
      mockPrisma.inscripcion.findUnique.mockResolvedValue(null);
      mockPrisma.inscripcion.create.mockResolvedValue({ id: 7, activo: true });

      await service.create({ personaId: 10, disciplinaId: 1 }, 99);

      expect(mockPrisma.inscripcion.create).toHaveBeenCalled();
      expect(mockPrisma.registroAuditoria.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ accion: 'CREAR' }) }),
      );
    });
  });

  describe('DT-16 · update sobre inscripciones dadas de baja', () => {
    beforeEach(() => {
      mockPrisma.inscripcion.findUnique.mockReset();
      mockPrisma.inscripcion.update.mockReset();
    });

    it('rechaza editar una inscripción dada de baja', async () => {
      mockPrisma.inscripcion.findUnique.mockResolvedValue({
        id: 1,
        personaId: 10,
        disciplinaId: 1,
        activo: false,
        persona: { id: 10, dni: '12345678', nombre: 'Juan', apellido: 'Perez' },
        disciplina: { id: 1, nombre: 'Fútbol', activo: true, categorias: [] },
        categoriaDisciplina: null,
      });

      await expect(service.update(1, { nombre: 'Otro' }, 99)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.inscripcion.update).not.toHaveBeenCalled();
    });

    it('al trasladar a una disciplina con una baja previa, reactiva esa y da de baja la actual', async () => {
      const actual = {
        id: 1,
        personaId: 10,
        disciplinaId: 1,
        categoriaDisciplinaId: null,
        activo: true,
        persona: { id: 10, dni: '12345678', nombre: 'Juan', apellido: 'Perez' },
        disciplina: { id: 1, nombre: 'Fútbol', activo: true, categorias: [] },
        categoriaDisciplina: null,
      };
      const destino = { id: 2, nombre: 'Vóley', activo: true, categorias: [] };

      mockPrisma.inscripcion.findUnique
        .mockResolvedValueOnce(actual)
        // La fila que quedó en la disciplina destino, dada de baja.
        .mockResolvedValueOnce({ id: 8, activo: false });
      mockPrisma.disciplina.findUnique.mockResolvedValue(destino);
      mockPrisma.persona.update.mockResolvedValue(actual.persona);
      mockPrisma.inscripcion.update
        .mockResolvedValueOnce({ id: 8, disciplinaId: 2, activo: true, persona: actual.persona })
        .mockResolvedValueOnce({ id: 1, activo: false });

      const resultado = await service.update(1, { disciplinaId: 2 }, 99);

      // La inscripción resultante es la del destino, reactivada.
      expect(resultado.inscripcion.id).toBe(8);
      expect(mockPrisma.inscripcion.update).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { id: 8 },
          data: expect.objectContaining({ activo: true }),
        }),
      );
      // Y la de origen queda dada de baja, no borrada.
      expect(mockPrisma.inscripcion.update).toHaveBeenNthCalledWith(2, {
        where: { id: 1 },
        data: { activo: false },
      });
      expect(mockPrisma.inscripcion.delete).not.toHaveBeenCalled();

      const acciones = mockAuditoria.registrar.mock.calls.map((c: any) => c[0].accion);
      expect(acciones).toEqual(expect.arrayContaining(['BAJA', 'REACTIVAR']));
    });

    it('rechaza el traslado si ya hay una inscripción vigente en el destino', async () => {
      const actual = {
        id: 1,
        personaId: 10,
        disciplinaId: 1,
        categoriaDisciplinaId: null,
        activo: true,
        persona: { id: 10, dni: '12345678', nombre: 'Juan', apellido: 'Perez' },
        disciplina: { id: 1, nombre: 'Fútbol', activo: true, categorias: [] },
        categoriaDisciplina: null,
      };

      mockPrisma.inscripcion.findUnique
        .mockResolvedValueOnce(actual)
        .mockResolvedValueOnce({ id: 8, activo: true });
      mockPrisma.disciplina.findUnique.mockResolvedValue({
        id: 2,
        nombre: 'Vóley',
        activo: true,
        categorias: [],
      });

      await expect(service.update(1, { disciplinaId: 2 }, 99)).rejects.toThrow(ConflictException);
      expect(mockPrisma.inscripcion.update).not.toHaveBeenCalled();
    });
  });
});
