import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EstadoSolicitudInscripcion } from '@prisma/client';
import { InscripcionService } from './inscripcion.service';

describe('InscripcionService - cancelarSolicitud (US-65)', () => {
  let service: InscripcionService;
  const prisma: any = {
    usuario: { findUnique: jest.fn() },
    inscripcion: { findFirst: jest.fn(), update: jest.fn() },
    periodoInscripcion: { updateMany: jest.fn() },
    solicitudInscripcion: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (tx: any) => Promise<unknown>) => callback(prisma)),
  };
  const auditoria = { registrar: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InscripcionService(prisma, auditoria as any, {} as any, {} as any);
  });

  it('cancela una solicitud pendiente propia y registra auditoría', async () => {
    prisma.usuario.findUnique.mockResolvedValue({ personaId: 10 });
    prisma.solicitudInscripcion.findUnique
      .mockResolvedValueOnce({
        id: 5,
        personaId: 10,
        estado: EstadoSolicitudInscripcion.PENDIENTE,
        disciplina: { nombre: 'Básquet' },
      })
      .mockResolvedValueOnce({ id: 5, estado: EstadoSolicitudInscripcion.CANCELADA });
    prisma.solicitudInscripcion.updateMany.mockResolvedValue({ count: 1 });
    auditoria.registrar.mockResolvedValue(undefined);

    const resultado = await service.cancelarSolicitud(5, 99);

    expect(prisma.solicitudInscripcion.updateMany).toHaveBeenCalledWith({
      where: { id: 5, personaId: 10, estado: EstadoSolicitudInscripcion.PENDIENTE },
      data: { estado: EstadoSolicitudInscripcion.CANCELADA },
    });
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'BAJA',
        entidad: 'SolicitudInscripcion',
        idEntidad: 5,
        responsableId: 99,
      }),
      prisma,
    );
    expect(resultado).toEqual({ id: 5, estado: EstadoSolicitudInscripcion.CANCELADA });
  });

  it('rechaza una solicitud ajena como no encontrada', async () => {
    prisma.usuario.findUnique.mockResolvedValue({ personaId: 10 });
    prisma.solicitudInscripcion.findUnique.mockResolvedValue({
      id: 5,
      personaId: 11,
      estado: EstadoSolicitudInscripcion.PENDIENTE,
      disciplina: { nombre: 'Básquet' },
    });

    await expect(service.cancelarSolicitud(5, 99)).rejects.toThrow(NotFoundException);
    expect(prisma.solicitudInscripcion.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    EstadoSolicitudInscripcion.RECHAZADA,
    EstadoSolicitudInscripcion.CANCELADA,
  ])('rechaza una solicitud en estado %s', async (estado) => {
    prisma.usuario.findUnique.mockResolvedValue({ personaId: 10 });
    prisma.solicitudInscripcion.findUnique.mockResolvedValue({
      id: 5,
      personaId: 10,
      estado,
      disciplina: { nombre: 'Básquet' },
    });

    await expect(service.cancelarSolicitud(5, 99)).rejects.toThrow(BadRequestException);
    expect(prisma.solicitudInscripcion.updateMany).not.toHaveBeenCalled();
  });

  it('cancela una solicitud pendiente de documentación', async () => {
    prisma.usuario.findUnique.mockResolvedValue({ personaId: 10 });
    prisma.solicitudInscripcion.findUnique
      .mockResolvedValueOnce({
        id: 5,
        personaId: 10,
        estado: EstadoSolicitudInscripcion.PENDIENTE_DOCUMENTACION,
        disciplina: { nombre: 'Básquet' },
      })
      .mockResolvedValueOnce({ id: 5, estado: EstadoSolicitudInscripcion.CANCELADA });
    prisma.solicitudInscripcion.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.cancelarSolicitud(5, 99)).resolves.toEqual({
      id: 5,
      estado: EstadoSolicitudInscripcion.CANCELADA,
    });
  });

  it('cancela una solicitud aprobada y da de baja la inscripción activa', async () => {
    prisma.usuario.findUnique.mockResolvedValue({ personaId: 10 });
    prisma.solicitudInscripcion.findUnique
      .mockResolvedValueOnce({
        id: 5,
        personaId: 10,
        disciplinaId: 7,
        estado: EstadoSolicitudInscripcion.APROBADA,
        disciplina: { nombre: 'Básquet' },
      })
      .mockResolvedValueOnce({ id: 5, estado: EstadoSolicitudInscripcion.CANCELADA });
    prisma.solicitudInscripcion.updateMany.mockResolvedValue({ count: 1 });
    prisma.inscripcion.findFirst.mockResolvedValue({ id: 20 });
    prisma.inscripcion.update.mockResolvedValue(undefined);
    auditoria.registrar.mockResolvedValue(undefined);

    await service.cancelarSolicitud(5, 99);

    expect(prisma.inscripcion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 20 },
        data: expect.objectContaining({ activo: false }),
      }),
    );
  });
});
