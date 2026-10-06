import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EstadoDocumentalService } from './estado-documental.service';

/**
 * US-25 / DT-27 · EstadoDocumentalService: arma, desde la base, lo exigido a
 * cada inscripción (disciplina + su categoría) y lo cruza con lo presentado.
 */
describe('EstadoDocumentalService', () => {
  let service: EstadoDocumentalService;
  const hoy = new Date(2026, 9, 1);

  const prismaMock = {
    persona: { findUnique: jest.fn() },
    inscripcion: { findUnique: jest.fn(), findMany: jest.fn() },
    disciplinaRequerimientoDoc: { findMany: jest.fn() },
    documentacion: { findMany: jest.fn() },
  };

  const inscripcionFutbolSub15 = {
    id: 5,
    personaId: 10,
    disciplinaId: 1,
    categoriaDisciplinaId: 7,
    fechaInscripcion: new Date(2026, 8, 20),
    requisitosDesde: null,
    disciplina: { id: 1, nombre: 'Fútbol' },
    categoriaDisciplina: { id: 7, nombre: 'Sub-15' },
    habilitacionesExcepcionales: [],
  };
  const requisitos = [
    // De la disciplina: lo exige a todas sus categorías.
    {
      disciplinaId: 1,
      categoriaDisciplinaId: null,
      tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA',
      plazoDiasTolerancia: 30,
      creadoEn: new Date(2026, 0, 1),
    },
    // Adicional de Sub-15.
    {
      disciplinaId: 1,
      categoriaDisciplinaId: 7,
      tipoDocumento: 'AUTORIZACION_PADRES_TUTORES',
      plazoDiasTolerancia: 30,
      creadoEn: new Date(2026, 0, 1),
    },
    // Adicional de otra categoría: no se le exige.
    {
      disciplinaId: 1,
      categoriaDisciplinaId: 8,
      tipoDocumento: 'CARNET_FEDERATIVO_LICENCIA_DEPORTIVA',
      plazoDiasTolerancia: 0,
      creadoEn: new Date(2026, 0, 1),
    },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [EstadoDocumentalService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(EstadoDocumentalService);
    prismaMock.persona.findUnique.mockResolvedValue({ id: 10 });
    prismaMock.inscripcion.findMany.mockResolvedValue([inscripcionFutbolSub15]);
    prismaMock.disciplinaRequerimientoDoc.findMany.mockResolvedValue(requisitos);
    prismaMock.documentacion.findMany.mockResolvedValue([
      {
        id: 3,
        personaId: 10,
        tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA',
        fechaVencimiento: new Date(2027, 2, 1),
        creadoEn: new Date(2026, 8, 21),
      },
    ]);
  });

  it('US-25 · TC-180: exige lo de la disciplina más lo adicional de la categoría (no lo de otras categorías)', async () => {
    const r = await service.porPersona(10, hoy);

    expect(r.inscripciones).toHaveLength(1);
    expect(r.inscripciones[0].documentos.map((d) => [d.tipoDocumento, d.origen, d.estado])).toEqual(
      [
        ['CERTIFICADO_MEDICO_APTITUD_FISICA', 'DISCIPLINA', 'VIGENTE'],
        ['AUTORIZACION_PADRES_TUTORES', 'CATEGORIA', 'FALTANTE'],
      ],
    );
    expect(r.inscripciones[0].estado).toBe('PENDIENTE');
    expect(r.estado).toBe('PENDIENTE');
  });

  it('expone los tipos exigidos para el selector de carga, con el documento actual', async () => {
    const r = await service.porPersona(10, hoy);

    expect(r.tiposExigidos).toEqual([
      {
        tipoDocumento: 'AUTORIZACION_PADRES_TUTORES',
        etiqueta: 'Autorización de padres/tutores',
        documentoActualId: null,
      },
      {
        tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA',
        etiqueta: 'Certificado médico de aptitud física',
        documentoActualId: 3,
      },
    ]);
    await expect(service.tiposExigidos(10)).resolves.toEqual([
      'AUTORIZACION_PADRES_TUTORES',
      'CERTIFICADO_MEDICO_APTITUD_FISICA',
    ]);
  });

  it('solo considera inscripciones activas', async () => {
    await service.porPersona(10, hoy);

    expect(prismaMock.inscripcion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { personaId: { in: [10] }, activo: true } }),
    );
  });

  it('sin inscripciones activas no hay estado ni tipos exigidos', async () => {
    prismaMock.inscripcion.findMany.mockResolvedValue([]);

    const r = await service.porPersona(10, hoy);

    expect(r).toEqual({ personaId: 10, estado: null, inscripciones: [], tiposExigidos: [] });
    expect(prismaMock.disciplinaRequerimientoDoc.findMany).not.toHaveBeenCalled();
  });

  it('lanza 404 si la persona no existe', async () => {
    prismaMock.persona.findUnique.mockResolvedValue(null);

    await expect(service.porPersona(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('calcula varias personas en una sola consulta para el listado', async () => {
    const mapa = await service.porPersonas([10, 11], hoy);

    expect(prismaMock.inscripcion.findMany).toHaveBeenCalledTimes(1);
    expect(mapa.get(10)?.estado).toBe('PENDIENTE');
    expect(mapa.get(11)?.estado).toBeNull();
  });

  it('previsualiza lo exigido antes de inscribir, con lo que la persona ya presentó', async () => {
    prismaMock.disciplinaRequerimientoDoc.findMany.mockResolvedValue(requisitos.slice(0, 2));

    const r = await service.previsualizar(1, 7, 10, hoy);

    expect(prismaMock.disciplinaRequerimientoDoc.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          disciplinaId: 1,
          OR: [{ categoriaDisciplinaId: null }, { categoriaDisciplinaId: 7 }],
        },
      }),
    );
    expect(r.documentos.map((d) => d.estado)).toEqual(['VIGENTE', 'FALTANTE']);
    expect(r.documentos[1].fechaLimite).toEqual(new Date(2026, 9, 31));
  });

  it('previsualiza sin persona (alta nueva): todo figura como faltante', async () => {
    prismaMock.disciplinaRequerimientoDoc.findMany.mockResolvedValue(requisitos.slice(0, 1));

    const r = await service.previsualizar(1, null, null, hoy);

    expect(prismaMock.documentacion.findMany).not.toHaveBeenCalled();
    expect(r.documentos[0].estado).toBe('FALTANTE');
    expect(r.estado).toBe('PENDIENTE');
  });

  describe('US-27 · evaluación de bloqueo por inscripción', () => {
    it('porInscripcion devuelve el detalle y si la inscripción está bloqueada', async () => {
      prismaMock.inscripcion.findUnique.mockResolvedValue({ id: 5, personaId: 10 });
      const r = await service.porInscripcion(5, hoy);
      expect(r.inscripcionId).toBe(5);
      expect(r.bloqueada).toBe(false);
    });

    it('estaBloqueada devuelve true cuando el estado es BLOQUEADO', async () => {
      prismaMock.inscripcion.findUnique.mockResolvedValue({ id: 5, personaId: 10 });
      prismaMock.documentacion.findMany.mockResolvedValue([
        {
          id: 3,
          personaId: 10,
          tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA',
          fechaVencimiento: new Date(2026, 8, 20),
          creadoEn: new Date(2026, 8, 1),
        },
      ]);
      const bloqueada = await service.estaBloqueada(5, hoy);
      expect(bloqueada).toBe(true);
    });

    it('lanza 404 si la inscripción no existe', async () => {
      prismaMock.inscripcion.findUnique.mockResolvedValue(null);
      await expect(service.porInscripcion(999, hoy)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
