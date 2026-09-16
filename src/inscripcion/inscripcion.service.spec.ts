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
    findMany: jest.fn(),
    count: jest.fn(),
  },
  inscripcion: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
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
      // El choque es sólo contra una inscripción vigente: la respuesta de la
      // segunda búsqueda tiene que traer `activo: true`.
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

  describe('US-08 - Buscar y filtrar participantes (una fila por participante)', () => {
    const personaBase = {
      id: 10,
      nombre: 'Juan',
      apellido: 'Perez',
      dni: '12345678',
      fechaNacimiento: new Date('1990-01-01'),
      email: 'juan@test.com',
      telefono: '1111111111',
    };

    const inscripcionFutbol = {
      id: 1,
      personaId: 10,
      disciplinaId: 1,
      disciplina: { id: 1, nombre: 'Futbol' },
      categoriaDisciplinaId: 2,
      categoriaDisciplina: { id: 2, nombre: 'Sub-15' },
      fechaInscripcion: new Date('2026-01-10'),
      activo: true,
    };

    const inscripcionVoley = {
      id: 2,
      personaId: 10,
      disciplinaId: 2,
      disciplina: { id: 2, nombre: 'Voley' },
      categoriaDisciplinaId: null,
      categoriaDisciplina: null,
      fechaInscripcion: new Date('2026-02-10'),
      activo: true,
    };

    const participanteDosDisciplinas = {
      ...personaBase,
      inscripciones: [inscripcionFutbol, inscripcionVoley],
    };
    it('TC-0801: busca por coincidencia parcial y agrupa por participante', async () => {
      mockPrisma.persona.findMany.mockResolvedValue([participanteDosDisciplinas]);
      mockPrisma.persona.count.mockResolvedValue(1);

      const result = await service.findAll({ busqueda: 'PER', pagina: 1, porPagina: 10 });

      const where = mockPrisma.persona.findMany.mock.calls[0][0].where;
      expect(where.AND[0]).toEqual({ inscripciones: { some: {} } });
      expect(where.AND[1].OR).toEqual(
        expect.arrayContaining([
          { nombre: { contains: 'PER', mode: 'insensitive' } },
          { apellido: { contains: 'PER', mode: 'insensitive' } },
        ]),
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0].personaId).toBe(10);
      expect(result.items[0].disciplinas).toHaveLength(2);
      expect(result.items[0].cantidadDisciplinas).toBe(2);
      expect(result.total).toBe(1);
    });

    it('TC-0802: valida la coincidencia exacta por DNI', async () => {
      mockPrisma.persona.findMany.mockResolvedValue([participanteDosDisciplinas]);
      mockPrisma.persona.count.mockResolvedValue(1);

      await service.findAll({ busqueda: '12345678', pagina: 1, porPagina: 10 });

      const where = mockPrisma.persona.findMany.mock.calls[0][0].where;
      expect(where.AND[1].OR).toEqual(expect.arrayContaining([{ dni: { equals: '12345678' } }]));
    });

    it('TC-0803: filtra por disciplina y muestra todas las del participante', async () => {
      mockPrisma.persona.findMany.mockResolvedValue([participanteDosDisciplinas]);
      mockPrisma.persona.count.mockResolvedValue(1);

      const result = await service.findAll({ disciplinaId: 3, pagina: 1, porPagina: 10 });

      const where = mockPrisma.persona.findMany.mock.calls[0][0].where;
      expect(where.AND).toEqual(
        expect.arrayContaining([{ inscripciones: { some: { disciplinaId: 3 } } }]),
      );
      expect(result.items[0].disciplinas).toHaveLength(2);
    });

    it('TC-0804: filtra por estado INSCRIPTO', async () => {
      mockPrisma.persona.findMany.mockResolvedValue([participanteDosDisciplinas]);
      mockPrisma.persona.count.mockResolvedValue(1);

      const result = await service.findAll({
        estado: EstadoInscripcionFiltro.INSCRIPTO,
        pagina: 1,
        porPagina: 10,
      });

      const where = mockPrisma.persona.findMany.mock.calls[0][0].where;
      expect(where.AND).toEqual(
        expect.arrayContaining([{ inscripciones: { some: { activo: true } } }]),
      );
      expect(result.items[0].estado).toBe('INSCRIPTO');
    });

    it('TC-0805: filtra por estado BAJA y expone el estado agregado', async () => {
      const participanteBaja = {
        ...personaBase,
        inscripciones: [{ ...inscripcionFutbol, activo: false }],
      };
      mockPrisma.persona.findMany.mockResolvedValue([participanteBaja]);
      mockPrisma.persona.count.mockResolvedValue(1);

      const result = await service.findAll({
        estado: EstadoInscripcionFiltro.BAJA,
        pagina: 1,
        porPagina: 10,
      });

      const where = mockPrisma.persona.findMany.mock.calls[0][0].where;
      expect(where.AND).toEqual(
        expect.arrayContaining([{ inscripciones: { none: { activo: true } } }]),
      );
      expect(result.items[0].estado).toBe('BAJA');
    });

    it('TC-0806: combina busqueda, disciplina y estado (AND)', async () => {
      mockPrisma.persona.findMany.mockResolvedValue([]);
      mockPrisma.persona.count.mockResolvedValue(0);

      await service.findAll({
        busqueda: 'perez',
        disciplinaId: 1,
        estado: EstadoInscripcionFiltro.INSCRIPTO,
        pagina: 1,
        porPagina: 10,
      });

      const where = mockPrisma.persona.findMany.mock.calls[0][0].where;
      expect(where.AND).toHaveLength(4);
      expect(where.AND[1].OR).toBeDefined();
      expect(where.AND).toEqual(
        expect.arrayContaining([
          { inscripciones: { some: { disciplinaId: 1 } } },
          { inscripciones: { some: { activo: true } } },
        ]),
      );
    });

    it('TC-0807: sin coincidencias devuelve una lista vacia', async () => {
      mockPrisma.persona.findMany.mockResolvedValue([]);
      mockPrisma.persona.count.mockResolvedValue(0);

      const result = await service.findAll({ busqueda: 'zzz', pagina: 1, porPagina: 10 });

      expect(result).toEqual({ items: [], total: 0, pagina: 1, porPagina: 10 });
    });

    it('TC-0808: sin filtros lista personas paginado y respeta skip/take', async () => {
      mockPrisma.persona.findMany.mockResolvedValue([participanteDosDisciplinas]);
      mockPrisma.persona.count.mockResolvedValue(15);

      const result = await service.findAll({ pagina: 2, porPagina: 5 });

      const args = mockPrisma.persona.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ AND: [{ inscripciones: { some: {} } }] });
      expect(args.skip).toBe(5);
      expect(args.take).toBe(5);
      expect(result.total).toBe(15);
      expect(result.pagina).toBe(2);
      expect(result.porPagina).toBe(5);
    });
  });
  describe('US-07 · Dar de baja participante (estado propio + baja en todas sus disciplinas)', () => {
    const personaBaja = {
      id: 10,
      nombre: 'Juan',
      apellido: 'Perez',
      dni: '12345678',
      activo: true,
      fechaNacimiento: null,
      email: 'juan@test.com',
      telefono: '1111111111',
    };

    function inscripcionVigente(id: number, disciplinaId: number, nombre: string) {
      return {
        id,
        personaId: 10,
        disciplinaId,
        disciplina: { id: disciplinaId, nombre },
        categoriaDisciplinaId: null,
        categoriaDisciplina: null,
        fechaInscripcion: new Date('2026-01-10'),
        activo: true,
      };
    }

    /** Deja el escenario de un participante con dos disciplinas vigentes. */
    function conDosDisciplinasVigentes() {
      mockPrisma.persona.findUnique.mockResolvedValue(personaBaja);
      mockPrisma.inscripcion.findMany.mockResolvedValue([
        inscripcionVigente(1, 1, 'Fútbol'),
        inscripcionVigente(2, 2, 'Vóley'),
      ]);
      mockPrisma.inscripcion.updateMany.mockResolvedValue({ count: 2 });
    }

    it('TC-0701: desactiva el estado del participante y da de baja todas sus disciplinas', async () => {
      conDosDisciplinasVigentes();

      const resultado = await service.darDeBajaParticipante(10, 99);

      expect(mockPrisma.persona.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { activo: false },
      });
      expect(mockPrisma.inscripcion.findMany).toHaveBeenCalledWith({
        where: { personaId: 10, activo: true },
        include: { disciplina: true },
      });
      expect(mockPrisma.inscripcion.updateMany).toHaveBeenCalledWith({
        where: { personaId: 10, activo: true },
        data: { activo: false },
      });
      expect(resultado).toEqual({
        personaId: 10,
        activo: false,
        disciplinasDadasDeBaja: 2,
        disciplinas: [
          { inscripcionId: 1, disciplinaId: 1, disciplina: 'Fútbol' },
          { inscripcionId: 2, disciplinaId: 2, disciplina: 'Vóley' },
        ],
      });
    });

    it('TC-0702: audita la baja de cada disciplina y la baja del participante', async () => {
      conDosDisciplinasVigentes();

      await service.darDeBajaParticipante(10, 99);

      expect(mockAuditoria.registrar).toHaveBeenCalledTimes(3);
      expect(mockAuditoria.registrar).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          accion: 'BAJA',
          entidad: 'Inscripcion',
          idEntidad: 1,
          responsableId: 99,
          detalle: expect.stringContaining('Fútbol'),
        }),
        mockPrisma,
      );
      expect(mockAuditoria.registrar).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ accion: 'BAJA', entidad: 'Inscripcion', idEntidad: 2 }),
        mockPrisma,
      );
      expect(mockAuditoria.registrar).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          accion: 'BAJA',
          entidad: 'Persona',
          idEntidad: 10,
          detalle: expect.stringContaining('2 disciplina(s)'),
        }),
        mockPrisma,
      );
    });

    it('TC-0703: rechaza la baja si el participante ya está dado de baja', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue({ ...personaBaja, activo: false });

      await expect(service.darDeBajaParticipante(10, 99)).rejects.toThrow(
        'El participante ya está dado de baja',
      );

      expect(mockPrisma.inscripcion.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.persona.update).not.toHaveBeenCalled();
      expect(mockPrisma.inscripcion.updateMany).not.toHaveBeenCalled();
      expect(mockAuditoria.registrar).not.toHaveBeenCalled();
    });

    it('TC-0704: informa que el participante no existe', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(null);

      await expect(service.darDeBajaParticipante(999, 99)).rejects.toThrow(
        'Participante no encontrado',
      );
      expect(mockPrisma.inscripcion.findMany).not.toHaveBeenCalled();
    });

    it('TC-0705: da de baja al participante aunque no tenga disciplinas vigentes', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(personaBaja);
      mockPrisma.inscripcion.findMany.mockResolvedValue([]);

      const resultado = await service.darDeBajaParticipante(10, 99);

      expect(mockPrisma.persona.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { activo: false },
      });
      expect(resultado).toEqual({
        personaId: 10,
        activo: false,
        disciplinasDadasDeBaja: 0,
        disciplinas: [],
      });
      // Con cero disciplinas solo se audita la baja del participante.
      expect(mockAuditoria.registrar).toHaveBeenCalledTimes(1);
      expect(mockAuditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'BAJA', entidad: 'Persona', idEntidad: 10 }),
        mockPrisma,
      );
    });

    it('TC-0706: rechaza inscribir a un participante dado de baja (US-05)', async () => {
      mockPrisma.disciplina.findUnique.mockResolvedValue({
        id: 1,
        nombre: 'Fútbol',
        activo: true,
        categorias: [],
      });
      mockPrisma.persona.findUnique.mockResolvedValue({ ...personaBaja, activo: false });

      await expect(service.create({ personaId: 10, disciplinaId: 1 }, 99)).rejects.toThrow(
        'El participante está dado de baja: hay que reactivarlo antes de inscribirlo',
      );

      expect(mockPrisma.inscripcion.create).not.toHaveBeenCalled();
      expect(mockPrisma.inscripcion.update).not.toHaveBeenCalled();
    });

    it('TC-0707: permite editar los datos de un participante activo (regresión US-06)', async () => {
      const inscripcion = {
        id: 1,
        personaId: 10,
        disciplinaId: 1,
        categoriaDisciplinaId: null,
        activo: true,
        persona: { ...personaBaja },
        disciplina: { id: 1, nombre: 'Fútbol', activo: true, categorias: [] },
        categoriaDisciplina: null,
      };
      mockPrisma.inscripcion.findUnique.mockResolvedValue(inscripcion);
      mockPrisma.disciplina.findUnique.mockResolvedValue(inscripcion.disciplina);
      mockPrisma.persona.update.mockResolvedValue({ ...personaBaja, nombre: 'Juancito' });
      mockPrisma.inscripcion.update.mockResolvedValue({
        ...inscripcion,
        persona: { ...personaBaja, nombre: 'Juancito' },
      });

      const resultado = await service.update(1, { nombre: 'Juancito' }, 99);

      expect(resultado.persona.nombre).toBe('Juancito');
    });
  });

  describe('US-07 · Reactivar participante', () => {
    const participanteInactivo = {
      id: 10,
      nombre: 'Juan',
      apellido: 'Perez',
      dni: '12345678',
      activo: false,
    };

    it('TC-0708: reactiva el estado del participante y lo audita', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(participanteInactivo);
      mockPrisma.persona.update.mockResolvedValue({ ...participanteInactivo, activo: true });

      const resultado = await service.activarParticipante(10, 99);

      expect(mockPrisma.persona.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { activo: true },
      });
      expect(mockAuditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'REACTIVAR',
          entidad: 'Persona',
          idEntidad: 10,
          responsableId: 99,
          detalle: expect.stringContaining('Reactivación'),
        }),
        mockPrisma,
      );
      expect(resultado).toEqual({ personaId: 10, activo: true });
      // La reactivación no re-inscribe: no toca inscripciones.
      expect(mockPrisma.inscripcion.update).not.toHaveBeenCalled();
      expect(mockPrisma.inscripcion.updateMany).not.toHaveBeenCalled();
    });

    it('TC-0709: rechaza reactivar a un participante que ya está activo', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue({ ...participanteInactivo, activo: true });

      await expect(service.activarParticipante(10, 99)).rejects.toThrow(
        'El participante ya está activo',
      );
      expect(mockPrisma.persona.update).not.toHaveBeenCalled();
      expect(mockAuditoria.registrar).not.toHaveBeenCalled();
    });

    it('TC-0710: informa que el participante a reactivar no existe', async () => {
      mockPrisma.persona.findUnique.mockResolvedValue(null);

      await expect(service.activarParticipante(999, 99)).rejects.toThrow(
        'Participante no encontrado',
      );
    });
  });

  describe('findByPersonaId — incluir bajas (US-07)', () => {
    it('por defecto devuelve solo inscripciones vigentes', async () => {
      mockPrisma.inscripcion.findMany.mockResolvedValue([]);

      await service.findByPersonaId(10);

      expect(mockPrisma.inscripcion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { personaId: 10, activo: true } }),
      );
    });

    it('con incluirBajas devuelve también las dadas de baja', async () => {
      mockPrisma.inscripcion.findMany.mockResolvedValue([]);

      await service.findByPersonaId(10, true);

      expect(mockPrisma.inscripcion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { personaId: 10 } }),
      );
    });
  });
});
