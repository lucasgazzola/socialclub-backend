import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EstadoDocumentalService } from '../documentacion/estado-documental.service';
import { InscripcionService } from './inscripcion.service';

const mockPrisma: any = {
  inscripcion: {
    findUnique: jest.fn(),
  },
  habilitacionExcepcional: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(async (arg: any) =>
    typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg),
  ),
};

const mockAuditoria = {
  registrar: jest.fn(),
};

const mockEstadoDocumental = {
  porInscripcion: jest.fn(),
  estaBloqueada: jest.fn(),
  porPersona: jest.fn(),
};

describe('US-28 · InscripcionService.habilitarExcepcional', () => {
  let service: InscripcionService;

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

  const mockInscripcion = {
    id: 10,
    activo: true,
    personaId: 1,
    disciplinaId: 2,
    persona: { id: 1, nombre: 'Juan', apellido: 'Pérez', dni: '30111222', activo: true },
    disciplina: { id: 2, nombre: 'Fútbol' },
    categoriaDisciplina: { id: 3, nombre: 'Primera' },
  };

  it('US-28 · TC-220: rechaza si la inscripción no existe (404 Not Found)', async () => {
    mockPrisma.inscripcion.findUnique.mockResolvedValue(null);

    await expect(
      service.habilitarExcepcional(999, { motivo: 'Excepción justificada', dias: 15 }, 1),
    ).rejects.toThrow(NotFoundException);
  });

  it('US-28 · TC-220: rechaza si la inscripción está dada de baja (400 Bad Request)', async () => {
    mockPrisma.inscripcion.findUnique.mockResolvedValue({
      ...mockInscripcion,
      activo: false,
    });

    await expect(
      service.habilitarExcepcional(10, { motivo: 'Excepción justificada', dias: 15 }, 1),
    ).rejects.toThrow(BadRequestException);
  });

  it('US-28 · TC-220: rechaza si el participante está dado de baja (400 Bad Request)', async () => {
    mockPrisma.inscripcion.findUnique.mockResolvedValue({
      ...mockInscripcion,
      persona: { ...mockInscripcion.persona, activo: false },
    });

    await expect(
      service.habilitarExcepcional(10, { motivo: 'Excepción justificada', dias: 15 }, 1),
    ).rejects.toThrow(BadRequestException);
  });

  it('US-28 · TC-223: rechaza si la inscripción NO se encuentra bloqueada por documentación (400 Bad Request)', async () => {
    mockPrisma.inscripcion.findUnique.mockResolvedValue(mockInscripcion);
    mockEstadoDocumental.porInscripcion.mockResolvedValue({
      inscripcionId: 10,
      bloqueada: false,
      estado: 'HABILITADO',
      motivos: [],
      documentos: [],
    });

    await expect(
      service.habilitarExcepcional(10, { motivo: 'Excepción justificada', dias: 15 }, 1),
    ).rejects.toThrow('La inscripción no se encuentra bloqueada por documentación');
  });

  it('US-28 · TC-222: crea la habilitación excepcional calculando correctamente la fecha hasta según los días indicados', async () => {
    mockPrisma.inscripcion.findUnique.mockResolvedValue(mockInscripcion);
    mockEstadoDocumental.porInscripcion.mockResolvedValue({
      inscripcionId: 10,
      bloqueada: true,
      estado: 'BLOQUEADO',
      motivos: ['Apto médico vencido'],
      documentos: [],
    });

    const mockHabilitacionCreada = {
      id: 55,
      inscripcionId: 10,
      motivo: 'Turno médico otorgado para el 25/10/2026',
      hasta: new Date('2026-10-30T23:59:59.999Z'),
      responsableId: 1,
      creadoEn: new Date(),
    };
    mockPrisma.habilitacionExcepcional.create.mockResolvedValue(mockHabilitacionCreada);

    const res = await service.habilitarExcepcional(
      10,
      { motivo: 'Turno médico otorgado para el 25/10/2026', dias: 15 },
      1,
    );

    expect(res).toEqual(mockHabilitacionCreada);
    expect(mockPrisma.habilitacionExcepcional.create).toHaveBeenCalled();
    const createCall = mockPrisma.habilitacionExcepcional.create.mock.calls[0][0];
    expect(createCall.data.inscripcionId).toBe(10);
    expect(createCall.data.motivo).toBe('Turno médico otorgado para el 25/10/2026');
    expect(createCall.data.responsableId).toBe(1);

    // Verifica que fecha hasta sea mayor a hoy y aproximadamente 15 días posteriores
    const hoy = new Date();
    const hastaGenerado: Date = createCall.data.hasta;
    expect(hastaGenerado.getTime()).toBeGreaterThan(hoy.getTime());
  });

  it('US-28 · TC-224: registra auditoría inalterable de la excepción concedida', async () => {
    mockPrisma.inscripcion.findUnique.mockResolvedValue(mockInscripcion);
    mockEstadoDocumental.porInscripcion.mockResolvedValue({
      inscripcionId: 10,
      bloqueada: true,
      estado: 'BLOQUEADO',
      motivos: ['Apto médico vencido'],
      documentos: [],
    });

    mockPrisma.habilitacionExcepcional.create.mockResolvedValue({
      id: 77,
      inscripcionId: 10,
      motivo: 'Autorización firmada en trámite',
      hasta: new Date('2026-10-25T23:59:59.999Z'),
      responsableId: 1,
    });

    await service.habilitarExcepcional(
      10,
      { motivo: 'Autorización firmada en trámite', dias: 10 },
      1,
    );

    expect(mockAuditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'CREAR',
        entidad: 'HabilitacionExcepcional',
        idEntidad: 77,
        responsableId: 1,
        detalle: expect.stringContaining('Autorización firmada en trámite'),
      }),
      mockPrisma,
    );
  });

  it('US-28: listarHabilitacionesExcepcionales devuelve el historial ordenado', async () => {
    mockPrisma.inscripcion.findUnique.mockResolvedValue({ id: 10 });
    const historial = [
      { id: 2, motivo: 'Reciente', creadoEn: new Date(2026, 9, 15) },
      { id: 1, motivo: 'Anterior', creadoEn: new Date(2026, 8, 10) },
    ];
    mockPrisma.habilitacionExcepcional.findMany.mockResolvedValue(historial);

    const res = await service.listarHabilitacionesExcepcionales(10);
    expect(res).toEqual(historial);
    expect(mockPrisma.habilitacionExcepcional.findMany).toHaveBeenCalledWith({
      where: { inscripcionId: 10 },
      orderBy: { creadoEn: 'desc' },
      include: {
        responsable: {
          select: { id: true, nombre: true, apellido: true, email: true },
        },
      },
    });
  });
});
