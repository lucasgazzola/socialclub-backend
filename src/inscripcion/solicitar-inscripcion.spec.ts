import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EstadoSolicitudInscripcion, GeneroDisciplina } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EstadoDocumentalService } from '../documentacion/estado-documental.service';
import { InscripcionService } from './inscripcion.service';

describe('US-63 — Solicitar inscripción a una disciplina', () => {
  let service: InscripcionService;

  const mockPrisma: any = {
    usuario: {
      findUnique: jest.fn(),
    },
    persona: {
      findUnique: jest.fn(),
    },
    disciplina: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    categoriaDisciplina: {
      findUnique: jest.fn(),
    },
    inscripcion: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    solicitudInscripcion: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(async (arg: any) =>
      typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg),
    ),
  };

  const mockAuditoria = {
    registrar: jest.fn(),
  };

  const mockEstadoDocumental = {
    porPersona: jest.fn(),
    porInscripcion: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InscripcionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditoriaService, useValue: mockAuditoria },
        { provide: EstadoDocumentalService, useValue: mockEstadoDocumental },
      ],
    }).compile();

    service = module.get<InscripcionService>(InscripcionService);
  });

  const usuarioMock = {
    id: 10,
    email: 'socio@club.com',
    persona: {
      id: 20,
      nombre: 'Lucas',
      apellido: 'Gazzola',
      dni: '38123456',
      activo: true,
      genero: GeneroDisciplina.MASCULINO,
      fechaNacimiento: new Date('2000-05-15'),
      membresias: [{ id: 1, activo: true }],
      inscripciones: [],
      solicitudesInscripcion: [],
    },
  };

  const disciplinaMock = {
    id: 1,
    nombre: 'Fútbol',
    descripcion: 'Fútbol recreativo y competitivo',
    activo: true,
    genero: null,
    edadMinima: null,
    edadMaxima: null,
    solicitaDocumentacion: true,
    categorias: [
      {
        id: 100,
        disciplinaId: 1,
        nombre: 'Mayores Masculino',
        activo: true,
        genero: GeneroDisciplina.MASCULINO,
        edadMinima: 18,
        edadMaxima: 40,
        requerimientosDoc: [
          { id: 2, tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA', plazoDiasTolerancia: 15 },
        ],
      },
    ],
    requerimientosDoc: [{ id: 1, tipoDocumento: 'DNI', plazoDiasTolerancia: 0 }],
    configuracionesCuotaDeportiva: [
      {
        id: 5,
        categoriaDisciplinaId: null,
        periodoAplicacion: '2026-01',
        monto: 15000,
        descuentoSocioPorcentaje: 20,
        activo: true,
      },
    ],
  };

  describe('TC-289: US-63 · Validar restricciones de edad y género al solicitar inscripción', () => {
    it('rechaza la solicitud si el género del socio no cumple la restricción de la categoría', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        ...usuarioMock,
        persona: {
          ...usuarioMock.persona,
          genero: GeneroDisciplina.FEMENINO,
        },
      });
      mockPrisma.disciplina.findUnique.mockResolvedValue(disciplinaMock);

      await expect(
        service.solicitar({ disciplinaId: 1, categoriaDisciplinaId: 100 }, 10),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza la solicitud si la edad del socio está fuera del rango de la categoría', async () => {
      const anioActual = new Date().getFullYear();
      // Nacido hace 10 años -> edad 10 < edadMinima 18
      const fechaMenor = new Date(`${anioActual - 10}-01-01`);
      mockPrisma.usuario.findUnique.mockResolvedValue({
        ...usuarioMock,
        persona: {
          ...usuarioMock.persona,
          fechaNacimiento: fechaMenor,
        },
      });
      mockPrisma.disciplina.findUnique.mockResolvedValue(disciplinaMock);

      await expect(
        service.solicitar({ disciplinaId: 1, categoriaDisciplinaId: 100 }, 10),
      ).rejects.toThrow(BadRequestException);
    });

    it('exige seleccionar una categoría si la disciplina posee categorías activas', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(usuarioMock);
      mockPrisma.disciplina.findUnique.mockResolvedValue(disciplinaMock);

      await expect(service.solicitar({ disciplinaId: 1 }, 10)).rejects.toThrow(
        'Debe seleccionar una categoría para inscribirse en esta disciplina',
      );
    });
  });

  describe('TC-290: US-63 · Registrar solicitud de inscripción en estado Pendiente y auditar la operación', () => {
    it('crea la solicitud en estado PENDIENTE con fecha actual y registra la auditoría inalterable', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(usuarioMock);
      mockPrisma.disciplina.findUnique.mockResolvedValue(disciplinaMock);
      mockPrisma.inscripcion.findFirst.mockResolvedValue(null);
      mockPrisma.solicitudInscripcion.findFirst.mockResolvedValue(null);

      const solicitudCreada = {
        id: 77,
        personaId: 20,
        disciplinaId: 1,
        categoriaDisciplinaId: 100,
        estado: EstadoSolicitudInscripcion.PENDIENTE,
        fechaSolicitud: new Date(),
        disciplina: { id: 1, nombre: 'Fútbol' },
        categoriaDisciplina: { id: 100, nombre: 'Mayores Masculino' },
        persona: { id: 20, nombre: 'Lucas', apellido: 'Gazzola', dni: '38123456' },
      };
      mockPrisma.solicitudInscripcion.create.mockResolvedValue(solicitudCreada);

      const resultado = await service.solicitar(
        { disciplinaId: 1, categoriaDisciplinaId: 100 },
        10,
      );

      expect(resultado).toEqual(solicitudCreada);
      expect(mockPrisma.solicitudInscripcion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            personaId: 20,
            disciplinaId: 1,
            categoriaDisciplinaId: 100,
            estado: EstadoSolicitudInscripcion.PENDIENTE,
          }),
        }),
      );

      expect(mockAuditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'CREAR',
          entidad: 'SolicitudInscripcion',
          idEntidad: 77,
          responsableId: 10,
          detalle: expect.stringContaining('Solicitud de inscripción a Fútbol'),
        }),
        expect.anything(),
      );
    });
  });

  describe('TC-291: US-63 · Listar catálogo de disciplinas y categorías activas con arancel y documentos obligatorios', () => {
    it('retorna el catálogo informando arancel con descuento de socio y documentos obligatorios', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(usuarioMock);
      mockPrisma.disciplina.findMany.mockResolvedValue([disciplinaMock]);

      const catalogo = await service.catalogo(10);

      expect(catalogo.esSocio).toBe(true);
      expect(catalogo.items).toHaveLength(1);
      const disc = catalogo.items[0];
      expect(disc.nombre).toBe('Fútbol');
      // $15.000 con 20% descuento socio = $12.000
      expect(disc.arancelMensual).toBe(12000);
      expect(disc.documentosObligatorios).toEqual([
        expect.objectContaining({ tipoDocumento: 'DNI', nombre: 'DNI' }),
      ]);
      expect(disc.categorias).toHaveLength(1);
      const cat = disc.categorias[0];
      expect(cat.nombre).toBe('Mayores Masculino');
      expect(cat.documentosObligatorios).toHaveLength(2); // DNI + Certificado médico
      expect(cat.cumpleRestricciones).toBe(true);
    });
  });

  describe('TC-292: US-63 · Validar duplicidad impidiendo solicitar inscripción si ya está inscripto o tiene solicitud pendiente', () => {
    it('rechaza si el socio ya posee una inscripción activa en la disciplina', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(usuarioMock);
      mockPrisma.disciplina.findUnique.mockResolvedValue(disciplinaMock);
      mockPrisma.inscripcion.findFirst.mockResolvedValue({
        id: 50,
        personaId: 20,
        disciplinaId: 1,
        activo: true,
      });

      await expect(
        service.solicitar({ disciplinaId: 1, categoriaDisciplinaId: 100 }, 10),
      ).rejects.toThrow(new ConflictException('Ya te encontrás inscripto en esta disciplina'));
    });

    it('rechaza si el socio ya tiene una solicitud pendiente para la disciplina', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(usuarioMock);
      mockPrisma.disciplina.findUnique.mockResolvedValue(disciplinaMock);
      mockPrisma.inscripcion.findFirst.mockResolvedValue(null);
      mockPrisma.solicitudInscripcion.findFirst.mockResolvedValue({
        id: 88,
        personaId: 20,
        disciplinaId: 1,
        estado: EstadoSolicitudInscripcion.PENDIENTE,
      });

      await expect(
        service.solicitar({ disciplinaId: 1, categoriaDisciplinaId: 100 }, 10),
      ).rejects.toThrow(
        new ConflictException(
          'Ya tenés una solicitud de inscripción pendiente para esta disciplina',
        ),
      );
    });
  });

  describe('TC-294: US-63 · Bloquear solicitud de inscripción a participantes inactivos o sin sesión', () => {
    it('rechaza la solicitud si el usuario no tiene una ficha de persona asociada', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({ id: 99, persona: null });

      await expect(
        service.solicitar({ disciplinaId: 1, categoriaDisciplinaId: 100 }, 99),
      ).rejects.toThrow(
        new NotFoundException('No se encontró una ficha de persona asociada al usuario'),
      );
    });

    it('rechaza la solicitud si la persona se encuentra dada de baja (inactiva)', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        ...usuarioMock,
        persona: {
          ...usuarioMock.persona,
          activo: false,
        },
      });

      await expect(
        service.solicitar({ disciplinaId: 1, categoriaDisciplinaId: 100 }, 10),
      ).rejects.toThrow(
        new BadRequestException(
          'El participante está dado de baja: hay que reactivarlo antes de postularse',
        ),
      );
    });

    it('rechaza la solicitud si la disciplina está inactiva', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(usuarioMock);
      mockPrisma.disciplina.findUnique.mockResolvedValue({
        ...disciplinaMock,
        activo: false,
      });

      await expect(
        service.solicitar({ disciplinaId: 1, categoriaDisciplinaId: 100 }, 10),
      ).rejects.toThrow('Disciplina inactiva');
    });
  });

  describe('Consultar mis solicitudes de inscripción', () => {
    it('retorna la lista de solicitudes del usuario ordenadas cronológicamente', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({ id: 10, personaId: 20 });
      const solicitudes = [
        {
          id: 1,
          disciplinaId: 1,
          estado: EstadoSolicitudInscripcion.PENDIENTE,
          fechaSolicitud: new Date(),
          disciplina: { id: 1, nombre: 'Fútbol', descripcion: 'Fútbol' },
          categoriaDisciplina: { id: 100, nombre: 'Mayores' },
        },
      ];
      mockPrisma.solicitudInscripcion.findMany.mockResolvedValue(solicitudes);

      const result = await service.misSolicitudes(10);
      expect(result).toEqual(solicitudes);
      expect(mockPrisma.solicitudInscripcion.findMany).toHaveBeenCalledWith({
        where: { personaId: 20 },
        orderBy: { fechaSolicitud: 'desc' },
        include: {
          disciplina: { select: { id: true, nombre: true, descripcion: true } },
          categoriaDisciplina: { select: { id: true, nombre: true } },
        },
      });
    });
  });
});
