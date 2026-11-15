import { NotFoundException } from '@nestjs/common';
import { EstadoSolicitudInscripcion } from '@prisma/client';
import { InscripcionService } from './inscripcion.service';

describe('InscripcionService - misSolicitudes (US-64)', () => {
  let service: InscripcionService;
  let prismaMock: any;
  let auditoriaMock: any;

  beforeEach(() => {
    prismaMock = {
      usuario: {
        findUnique: jest.fn(),
      },
      solicitudInscripcion: {
        findMany: jest.fn(),
      },
    };

    auditoriaMock = {
      registrar: jest.fn().mockResolvedValue(undefined),
    };

    const estadoDocumentalMock = {} as any;

    service = new InscripcionService(prismaMock, auditoriaMock, estadoDocumentalMock);
  });

  it('TC-US64-01: lista las solicitudes del socio ordenadas cronológicamente (DESC)', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({ personaId: 10 });
    const solicitudesMock = [
      {
        id: 2,
        personaId: 10,
        disciplinaId: 3,
        categoriaDisciplinaId: 5,
        estado: EstadoSolicitudInscripcion.PENDIENTE,
        fechaSolicitud: new Date('2026-11-13T10:00:00Z'),
        motivoRechazo: null,
        disciplina: { id: 3, nombre: 'Tenis', descripcion: 'Tenis recreativo' },
        categoriaDisciplina: { id: 5, nombre: 'Adultos' },
      },
      {
        id: 1,
        personaId: 10,
        disciplinaId: 2,
        categoriaDisciplinaId: null,
        estado: EstadoSolicitudInscripcion.APROBADA,
        fechaSolicitud: new Date('2026-11-10T15:30:00Z'),
        motivoRechazo: null,
        disciplina: { id: 2, nombre: 'Natación', descripcion: 'Pileta olímpica' },
        categoriaDisciplina: null,
      },
    ];
    prismaMock.solicitudInscripcion.findMany.mockResolvedValue(solicitudesMock);

    const res = await service.misSolicitudes(1);

    expect(prismaMock.usuario.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: { personaId: true },
    });
    expect(prismaMock.solicitudInscripcion.findMany).toHaveBeenCalledWith({
      where: { personaId: 10 },
      orderBy: { fechaSolicitud: 'desc' },
      include: {
        disciplina: { select: { id: true, nombre: true, descripcion: true } },
        categoriaDisciplina: { select: { id: true, nombre: true } },
      },
    });
    expect(res).toEqual(solicitudesMock);
    expect(res).toHaveLength(2);
  });

  it('TC-US64-02: permite filtrar por estado específico', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({ personaId: 10 });
    const solicitudesRechazadas = [
      {
        id: 3,
        personaId: 10,
        disciplinaId: 4,
        categoriaDisciplinaId: 8,
        estado: EstadoSolicitudInscripcion.RECHAZADA,
        fechaSolicitud: new Date('2026-11-12T14:00:00Z'),
        motivoRechazo: 'Cupo completo en el turno tarde',
        disciplina: { id: 4, nombre: 'Básquet', descripcion: null },
        categoriaDisciplina: { id: 8, nombre: 'Sub-18' },
      },
    ];
    prismaMock.solicitudInscripcion.findMany.mockResolvedValue(solicitudesRechazadas);

    const res = await service.misSolicitudes(1, EstadoSolicitudInscripcion.RECHAZADA);

    expect(prismaMock.solicitudInscripcion.findMany).toHaveBeenCalledWith({
      where: {
        personaId: 10,
        estado: EstadoSolicitudInscripcion.RECHAZADA,
      },
      orderBy: { fechaSolicitud: 'desc' },
      include: {
        disciplina: { select: { id: true, nombre: true, descripcion: true } },
        categoriaDisciplina: { select: { id: true, nombre: true } },
      },
    });
    expect(res).toEqual(solicitudesRechazadas);
    expect(res[0].motivoRechazo).toBe('Cupo completo en el turno tarde');
  });

  it('TC-US64-03: soporta el estado PENDIENTE_DOCUMENTACION', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({ personaId: 10 });
    const solicitudesDoc = [
      {
        id: 4,
        personaId: 10,
        disciplinaId: 5,
        categoriaDisciplinaId: null,
        estado: EstadoSolicitudInscripcion.PENDIENTE_DOCUMENTACION,
        fechaSolicitud: new Date('2026-11-11T12:00:00Z'),
        motivoRechazo: null,
        disciplina: { id: 5, nombre: 'Fútbol', descripcion: null },
        categoriaDisciplina: null,
      },
    ];
    prismaMock.solicitudInscripcion.findMany.mockResolvedValue(solicitudesDoc);

    const res = await service.misSolicitudes(1, EstadoSolicitudInscripcion.PENDIENTE_DOCUMENTACION);

    expect(prismaMock.solicitudInscripcion.findMany).toHaveBeenCalledWith({
      where: {
        personaId: 10,
        estado: EstadoSolicitudInscripcion.PENDIENTE_DOCUMENTACION,
      },
      orderBy: { fechaSolicitud: 'desc' },
      include: {
        disciplina: { select: { id: true, nombre: true, descripcion: true } },
        categoriaDisciplina: { select: { id: true, nombre: true } },
      },
    });
    expect(res[0].estado).toBe(EstadoSolicitudInscripcion.PENDIENTE_DOCUMENTACION);
  });

  it('TC-US64-04: lanza NotFoundException si el usuario no tiene ficha de persona', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);

    await expect(service.misSolicitudes(99)).rejects.toThrow(NotFoundException);
    expect(prismaMock.solicitudInscripcion.findMany).not.toHaveBeenCalled();
  });
});
