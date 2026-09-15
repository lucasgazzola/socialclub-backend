import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { InscripcionService } from './inscripcion.service';
import { UpdateInscripcionDto } from './dto/update-inscripcion.dto';
import { EstadoInscripcionFiltro } from './dto/find-participantes-query.dto';

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
    count: jest.fn(),
    delete: jest.fn(),
  },
  categoriaDisciplina: {
    findUnique: jest.fn(),
  },
  registroAuditoria: {
    create: jest.fn(),
  },
  $transaction: jest.fn(async (arg: any) =>
    typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg),
  ),
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
        .mockResolvedValueOnce({ id: 999 });

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

  describe('US-08 · Buscar y filtrar participantes', () => {
    const participante = {
      id: 1,
      personaId: 10,
      disciplinaId: 1,
      categoriaDisciplinaId: 2,
      fechaInscripcion: new Date('2026-01-10T00:00:00.000Z'),
      activo: true,
      persona: {
        id: 10,
        nombre: 'Juan',
        apellido: 'Perez',
        dni: '12345678',
        email: 'juan@test.com',
        telefono: '1111111111',
      },
      disciplina: { id: 1, nombre: 'Fútbol' },
      categoriaDisciplina: { id: 2, nombre: 'Sub-15' },
    };

    it('TC-0801: busca por coincidencia parcial de nombre o apellido, sin distinguir mayúsculas', async () => {
      mockPrisma.inscripcion.findMany.mockResolvedValue([participante]);
      mockPrisma.inscripcion.count.mockResolvedValue(1);

      const result = await service.findAll({ busqueda: 'PER', pagina: 1, porPagina: 10 });

      const where = mockPrisma.inscripcion.findMany.mock.calls[0][0].where;
      expect(where.AND[0].persona.OR).toEqual(
        expect.arrayContaining([
          { nombre: { contains: 'PER', mode: 'insensitive' } },
          { apellido: { contains: 'PER', mode: 'insensitive' } },
        ]),
      );
      expect(result.items[0]).toMatchObject({
        persona: { nombre: 'Juan', apellido: 'Perez', dni: '12345678' },
        disciplina: { id: 1, nombre: 'Fútbol' },
        estado: 'INSCRIPTO',
      });
    });

    it('TC-0802: valida la coincidencia exacta por DNI', async () => {
      mockPrisma.inscripcion.findMany.mockResolvedValue([participante]);
      mockPrisma.inscripcion.count.mockResolvedValue(1);

      await service.findAll({ busqueda: '12345678', pagina: 1, porPagina: 10 });

      const where = mockPrisma.inscripcion.findMany.mock.calls[0][0].where;
      expect(where.AND[0].persona.OR).toEqual(
        expect.arrayContaining([{ dni: { equals: '12345678' } }]),
      );
    });

    it('TC-0803: filtra por disciplina', async () => {
      mockPrisma.inscripcion.findMany.mockResolvedValue([]);
      mockPrisma.inscripcion.count.mockResolvedValue(0);

      await service.findAll({ disciplinaId: 3, pagina: 1, porPagina: 10 });

      const where = mockPrisma.inscripcion.findMany.mock.calls[0][0].where;
      expect(where.AND).toEqual([{ disciplinaId: 3 }]);
    });

    it('TC-0804: filtra por estado INSCRIPTO', async () => {
      mockPrisma.inscripcion.findMany.mockResolvedValue([participante]);
      mockPrisma.inscripcion.count.mockResolvedValue(1);

      await service.findAll({
        estado: EstadoInscripcionFiltro.INSCRIPTO,
        pagina: 1,
        porPagina: 10,
      });

      const where = mockPrisma.inscripcion.findMany.mock.calls[0][0].where;
      expect(where.AND).toEqual([{ activo: true }]);
    });

    it('TC-0805: filtra por estado BAJA y expone el estado legible', async () => {
      mockPrisma.inscripcion.findMany.mockResolvedValue([{ ...participante, activo: false }]);
      mockPrisma.inscripcion.count.mockResolvedValue(1);

      const result = await service.findAll({
        estado: EstadoInscripcionFiltro.BAJA,
        pagina: 1,
        porPagina: 10,
      });

      const where = mockPrisma.inscripcion.findMany.mock.calls[0][0].where;
      expect(where.AND).toEqual([{ activo: false }]);
      expect(result.items[0].estado).toBe('BAJA');
    });

    it('TC-0806: combina búsqueda, disciplina y estado (AND)', async () => {
      mockPrisma.inscripcion.findMany.mockResolvedValue([]);
      mockPrisma.inscripcion.count.mockResolvedValue(0);

      await service.findAll({
        busqueda: 'perez',
        disciplinaId: 1,
        estado: EstadoInscripcionFiltro.INSCRIPTO,
        pagina: 1,
        porPagina: 10,
      });

      const where = mockPrisma.inscripcion.findMany.mock.calls[0][0].where;
      expect(where.AND).toHaveLength(3);
      expect(where.AND).toEqual(expect.arrayContaining([{ disciplinaId: 1 }, { activo: true }]));
      expect(where.AND[0].persona.OR).toBeDefined();
    });

    it('TC-0807: sin coincidencias devuelve una lista vacía (el frontend muestra el mensaje)', async () => {
      mockPrisma.inscripcion.findMany.mockResolvedValue([]);
      mockPrisma.inscripcion.count.mockResolvedValue(0);

      const result = await service.findAll({ busqueda: 'zzz', pagina: 1, porPagina: 10 });

      expect(result).toEqual({ items: [], total: 0, pagina: 1, porPagina: 10 });
    });

    it('TC-0808: sin filtros lista paginado y respeta skip/take', async () => {
      mockPrisma.inscripcion.findMany.mockResolvedValue([participante]);
      mockPrisma.inscripcion.count.mockResolvedValue(15);

      const result = await service.findAll({ pagina: 2, porPagina: 5 });

      const args = mockPrisma.inscripcion.findMany.mock.calls[0][0];
      expect(args.where).toEqual({});
      expect(args.skip).toBe(5);
      expect(args.take).toBe(5);
      expect(result.total).toBe(15);
      expect(result.pagina).toBe(2);
      expect(result.porPagina).toBe(5);
    });
  });
});
