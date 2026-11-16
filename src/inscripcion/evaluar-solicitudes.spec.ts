import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EstadoSolicitudInscripcion, TipoDocumentacionDisciplina } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InscripcionService } from './inscripcion.service';
import { InscripcionController } from './inscripcion.controller';
import { FindSolicitudesInscripcionQueryDto } from './dto/find-solicitudes-inscripcion-query.dto';
import { RechazarSolicitudInscripcionDto } from './dto/rechazar-solicitud-inscripcion.dto';

describe('US-66 — Evaluar solicitudes de inscripción a una disciplina', () => {
  let service: InscripcionService;
  let controller: InscripcionController;
  let prismaMock: any;
  let auditoriaMock: any;
  let estadoDocumentalMock: any;

  beforeEach(() => {
    prismaMock = {
      solicitudInscripcion: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        updateMany: jest.fn(),
      },
      inscripcion: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      periodoInscripcion: {
        create: jest.fn(),
      },
      configuracionCuotaDeportiva: {
        findMany: jest.fn(),
      },
      documentacion: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      membresia: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((cb: (tx: any) => Promise<any>) => cb(prismaMock)),
    };

    auditoriaMock = {
      registrar: jest.fn().mockResolvedValue(undefined),
    };

    estadoDocumentalMock = {
      previsualizar: jest.fn(),
      porPersona: jest.fn(),
    };

    const verificacionMock = {} as any;

    service = new InscripcionService(
      prismaMock,
      auditoriaMock,
      estadoDocumentalMock,
      verificacionMock,
    );
    controller = new InscripcionController(service);
  });

  describe('CA 1 y CA 2 · listarSolicitudes (filtros y estado documental)', () => {
    it('lista las solicitudes en estado PENDIENTE por defecto e incluye el estado de documentación obligatoria (completa vs faltante)', async () => {
      prismaMock.solicitudInscripcion.findMany.mockResolvedValue([
        {
          id: 10,
          personaId: 100,
          disciplinaId: 2,
          categoriaDisciplinaId: 5,
          estado: EstadoSolicitudInscripcion.PENDIENTE,
          fechaSolicitud: new Date('2026-11-10T10:00:00Z'),
          fechaResolucion: null,
          motivoRechazo: null,
          revisadoPorId: null,
          persona: {
            id: 100,
            nombre: 'Valentina',
            apellido: 'Luna',
            dni: '42110873',
            email: 'valentina.luna@club.local',
            telefono: '3534-421714',
            activo: true,
          },
          disciplina: {
            id: 2,
            nombre: 'Natación',
            descripcion: 'Pileta climatizada',
            solicitaDocumentacion: true,
          },
          categoriaDisciplina: { id: 5, nombre: 'Adultos' },
          revisadoPor: null,
        },
        {
          id: 11,
          personaId: 101,
          disciplinaId: 3,
          categoriaDisciplinaId: 7,
          estado: EstadoSolicitudInscripcion.PENDIENTE,
          fechaSolicitud: new Date('2026-11-11T12:00:00Z'),
          fechaResolucion: null,
          motivoRechazo: null,
          revisadoPorId: null,
          persona: {
            id: 101,
            nombre: 'Emma',
            apellido: 'Roldán',
            dni: '54017662',
            email: null,
            telefono: '3534-422515',
            activo: true,
          },
          disciplina: {
            id: 3,
            nombre: 'Hockey',
            descripcion: null,
            solicitaDocumentacion: true,
          },
          categoriaDisciplina: { id: 7, nombre: 'Escuelita' },
          revisadoPor: null,
        },
      ]);

      estadoDocumentalMock.previsualizar
        .mockResolvedValueOnce({
          estado: 'HABILITADO',
          motivos: [],
          documentos: [
            {
              tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA,
              etiqueta: 'Certificado médico de aptitud física',
              origen: 'DISCIPLINA',
              plazoDiasTolerancia: 15,
              estado: 'VIGENTE',
              documentoId: 50,
              fechaVencimiento: new Date('2027-03-01T00:00:00Z'),
              fechaLimite: null,
            },
          ],
        })
        .mockResolvedValueOnce({
          estado: 'PENDIENTE',
          motivos: ['Certificado médico de aptitud física: falta presentarlo hasta el 30/11/2026'],
          documentos: [
            {
              tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA,
              etiqueta: 'Certificado médico de aptitud física',
              origen: 'DISCIPLINA',
              plazoDiasTolerancia: 15,
              estado: 'FALTANTE',
              documentoId: null,
              fechaVencimiento: null,
              fechaLimite: new Date('2026-11-30T00:00:00Z'),
            },
          ],
        });

      const res = await controller.listarSolicitudes({});

      expect(prismaMock.solicitudInscripcion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            estado: {
              in: [
                EstadoSolicitudInscripcion.PENDIENTE,
                EstadoSolicitudInscripcion.PENDIENTE_DOCUMENTACION,
              ],
            },
          },
          orderBy: { fechaSolicitud: 'asc' },
        }),
      );
      expect(res).toHaveLength(2);
      expect(res[0].documentacion).toEqual(
        expect.objectContaining({
          estado: 'HABILITADO',
          completa: true,
          requiereDocumentacion: true,
          faltantes: [],
        }),
      );
      expect(res[1].documentacion).toEqual(
        expect.objectContaining({
          estado: 'PENDIENTE',
          completa: false,
          requiereDocumentacion: true,
          faltantes: ['Certificado médico de aptitud física'],
        }),
      );
    });

    it('permite filtrar por disciplina y buscar por nombre, apellido o DNI (con o sin puntos)', async () => {
      prismaMock.solicitudInscripcion.findMany.mockResolvedValue([]);

      await service.listarSolicitudes({
        disciplinaId: 2,
        busqueda: '42.110.873',
      });

      expect(prismaMock.solicitudInscripcion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            estado: {
              in: [
                EstadoSolicitudInscripcion.PENDIENTE,
                EstadoSolicitudInscripcion.PENDIENTE_DOCUMENTACION,
              ],
            },
            disciplinaId: 2,
            persona: {
              OR: expect.arrayContaining([
                { nombre: { contains: '42.110.873', mode: 'insensitive' } },
                { apellido: { contains: '42.110.873', mode: 'insensitive' } },
                { dni: { contains: '42.110.873', mode: 'insensitive' } },
                { dni: { contains: '42110873', mode: 'insensitive' } },
              ]),
            },
          },
        }),
      );
    });

    it('permite buscar por nombre y apellido combinados', async () => {
      prismaMock.solicitudInscripcion.findMany.mockResolvedValue([]);

      await service.listarSolicitudes({
        busqueda: 'Valentina Luna',
      });

      expect(prismaMock.solicitudInscripcion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            persona: {
              OR: expect.arrayContaining([
                expect.objectContaining({
                  AND: expect.any(Array),
                }),
              ]),
            },
          }),
        }),
      );
    });
  });

  describe('CA 3 · aprobarSolicitud', () => {
    const solicitudPendienteBase = {
      id: 10,
      personaId: 100,
      disciplinaId: 2,
      categoriaDisciplinaId: 5,
      estado: EstadoSolicitudInscripcion.PENDIENTE,
      persona: {
        id: 100,
        nombre: 'Valentina',
        apellido: 'Luna',
        dni: '42110873',
        activo: true,
      },
      disciplina: {
        id: 2,
        nombre: 'Natación',
        activo: true,
        categorias: [{ id: 5, nombre: 'Adultos', activo: true }],
      },
      categoriaDisciplina: { id: 5, nombre: 'Adultos', activo: true },
    };

    it('aprueba una solicitud con documentación completa: cambia a APROBADA, crea la inscripción en estado HABILITADO y genera la cuota deportiva con descuento de socio', async () => {
      prismaMock.solicitudInscripcion.findUnique.mockResolvedValue(solicitudPendienteBase);
      prismaMock.inscripcion.findUnique.mockResolvedValue(null);
      prismaMock.solicitudInscripcion.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.solicitudInscripcion.findUniqueOrThrow.mockResolvedValue({
        id: 10,
        estado: EstadoSolicitudInscripcion.APROBADA,
        persona: { id: 100, nombre: 'Valentina', apellido: 'Luna', dni: '42110873' },
        disciplina: { id: 2, nombre: 'Natación' },
        categoriaDisciplina: { id: 5, nombre: 'Adultos' },
        revisadoPor: { id: 7, nombre: 'Laura', apellido: 'Ferreyra', email: 'laura@club.local' },
      });
      prismaMock.inscripcion.create.mockResolvedValue({
        id: 500,
        personaId: 100,
        disciplinaId: 2,
        categoriaDisciplinaId: 5,
        activo: true,
        fechaInscripcion: new Date('2026-11-16T00:00:00Z'),
      });
      prismaMock.configuracionCuotaDeportiva.findMany.mockResolvedValue([
        {
          id: 1,
          disciplinaId: 2,
          categoriaDisciplinaId: 5,
          periodoAplicacion: '2026-01',
          monto: 10000,
          descuentoSocioPorcentaje: 20,
          activo: true,
        },
      ]);
      prismaMock.membresia.findFirst.mockResolvedValue({ id: 1, personaId: 100, activo: true });
      estadoDocumentalMock.porPersona.mockResolvedValue({
        personaId: 100,
        estado: 'HABILITADO',
        inscripciones: [
          {
            inscripcionId: 500,
            estado: 'HABILITADO',
            motivos: [],
            documentos: [],
          },
        ],
      });

      const resultado = await controller.aprobarSolicitud(10, {
        id: 7,
        email: 'laura@club.local',
        roles: ['DELEGADO'],
      } as any);

      expect(resultado.solicitud.estado).toBe(EstadoSolicitudInscripcion.APROBADA);
      expect(resultado.inscripcion.id).toBe(500);
      expect(resultado.estadoDocumental?.estado).toBe('HABILITADO');
      expect(resultado.cuotaGenerada).toEqual(
        expect.objectContaining({
          monto: 8000,
          montoTarifa: 10000,
          descuentoSocioPorcentaje: 20,
          esSocio: true,
          sinTarifa: false,
        }),
      );
      expect(prismaMock.periodoInscripcion.create).toHaveBeenCalled();
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'CREAR',
          entidad: 'Inscripcion',
          idEntidad: 500,
          responsableId: 7,
        }),
        prismaMock,
      );
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'EDITAR',
          entidad: 'SolicitudInscripcion',
          idEntidad: 10,
          responsableId: 7,
        }),
        prismaMock,
      );
    });

    it('aprueba una solicitud con documentos faltantes: la inscripción queda en estado PENDIENTE de documentación', async () => {
      prismaMock.solicitudInscripcion.findUnique.mockResolvedValue(solicitudPendienteBase);
      prismaMock.inscripcion.findUnique.mockResolvedValue(null);
      prismaMock.solicitudInscripcion.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.solicitudInscripcion.findUniqueOrThrow.mockResolvedValue({
        id: 10,
        estado: EstadoSolicitudInscripcion.APROBADA,
        persona: { id: 100, nombre: 'Valentina', apellido: 'Luna', dni: '42110873' },
        disciplina: { id: 2, nombre: 'Natación' },
        categoriaDisciplina: { id: 5, nombre: 'Adultos' },
        revisadoPor: { id: 7, nombre: 'Laura', apellido: 'Ferreyra', email: 'laura@club.local' },
      });
      prismaMock.inscripcion.create.mockResolvedValue({
        id: 501,
        personaId: 100,
        disciplinaId: 2,
        categoriaDisciplinaId: 5,
        activo: true,
        fechaInscripcion: new Date('2026-11-16T00:00:00Z'),
      });
      prismaMock.configuracionCuotaDeportiva.findMany.mockResolvedValue([]);
      prismaMock.membresia.findFirst.mockResolvedValue(null);
      estadoDocumentalMock.porPersona.mockResolvedValue({
        personaId: 100,
        estado: 'PENDIENTE',
        inscripciones: [
          {
            inscripcionId: 501,
            estado: 'PENDIENTE',
            motivos: ['Certificado médico de aptitud física: falta presentarlo hasta el 01/12/2026'],
            documentos: [],
          },
        ],
      });

      const resultado = await service.aprobarSolicitud(10, 7);

      expect(resultado.solicitud.estado).toBe(EstadoSolicitudInscripcion.APROBADA);
      expect(resultado.estadoDocumental?.estado).toBe('PENDIENTE');
      expect(resultado.estadoDocumental?.motivos).toContain(
        'Certificado médico de aptitud física: falta presentarlo hasta el 01/12/2026',
      );
    });

    it('reactiva una inscripción previa dada de baja cuando se aprueba una nueva solicitud para la misma disciplina', async () => {
      prismaMock.solicitudInscripcion.findUnique.mockResolvedValue(solicitudPendienteBase);
      prismaMock.inscripcion.findUnique.mockResolvedValue({
        id: 300,
        personaId: 100,
        disciplinaId: 2,
        activo: false,
      });
      prismaMock.solicitudInscripcion.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.solicitudInscripcion.findUniqueOrThrow.mockResolvedValue({
        id: 10,
        estado: EstadoSolicitudInscripcion.APROBADA,
        persona: { id: 100, nombre: 'Valentina', apellido: 'Luna', dni: '42110873' },
        disciplina: { id: 2, nombre: 'Natación' },
        categoriaDisciplina: { id: 5, nombre: 'Adultos' },
        revisadoPor: null,
      });
      prismaMock.inscripcion.update.mockResolvedValue({
        id: 300,
        personaId: 100,
        disciplinaId: 2,
        categoriaDisciplinaId: 5,
        activo: true,
      });
      prismaMock.configuracionCuotaDeportiva.findMany.mockResolvedValue([]);
      prismaMock.membresia.findFirst.mockResolvedValue(null);
      estadoDocumentalMock.porPersona.mockResolvedValue({
        personaId: 100,
        estado: 'HABILITADO',
        inscripciones: [{ inscripcionId: 300, estado: 'HABILITADO', motivos: [], documentos: [] }],
      });

      const resultado = await service.aprobarSolicitud(10, 7);

      expect(prismaMock.inscripcion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 300 },
          data: expect.objectContaining({ activo: true, fechaBaja: null }),
        }),
      );
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'REACTIVAR',
          entidad: 'Inscripcion',
          idEntidad: 300,
        }),
        prismaMock,
      );
      expect(resultado.inscripcion.id).toBe(300);
    });

    it('lanza NotFoundException si la solicitud no existe', async () => {
      prismaMock.solicitudInscripcion.findUnique.mockResolvedValue(null);

      await expect(service.aprobarSolicitud(999, 7)).rejects.toThrow(NotFoundException);
    });

    it('impide aprobar una solicitud que ya fue APROBADA, RECHAZADA o CANCELADA', async () => {
      prismaMock.solicitudInscripcion.findUnique.mockResolvedValue({
        ...solicitudPendienteBase,
        estado: EstadoSolicitudInscripcion.CANCELADA,
      });

      await expect(service.aprobarSolicitud(10, 7)).rejects.toThrow(BadRequestException);
    });

    it('lanza ConflictException si el socio ya tiene una inscripción activa en esa disciplina', async () => {
      prismaMock.solicitudInscripcion.findUnique.mockResolvedValue(solicitudPendienteBase);
      prismaMock.inscripcion.findUnique.mockResolvedValue({
        id: 300,
        personaId: 100,
        disciplinaId: 2,
        activo: true,
      });

      await expect(service.aprobarSolicitud(10, 7)).rejects.toThrow(ConflictException);
    });
  });

  describe('CA 4 · rechazarSolicitud', () => {
    const solicitudPendiente = {
      id: 15,
      personaId: 102,
      disciplinaId: 4,
      categoriaDisciplinaId: 9,
      estado: EstadoSolicitudInscripcion.PENDIENTE,
      persona: {
        id: 102,
        nombre: 'Ricardo',
        apellido: 'Paz',
        dni: '22441807',
        activo: true,
      },
      disciplina: { id: 4, nombre: 'Fútbol' },
      categoriaDisciplina: { id: 9, nombre: 'Veteranos' },
    };

    it('rechaza una solicitud con motivo obligatorio, cambia su estado a RECHAZADA y registra auditoría', async () => {
      prismaMock.solicitudInscripcion.findUnique.mockResolvedValue(solicitudPendiente);
      prismaMock.solicitudInscripcion.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.solicitudInscripcion.findUniqueOrThrow.mockResolvedValue({
        id: 15,
        estado: EstadoSolicitudInscripcion.RECHAZADA,
        motivoRechazo: 'La categoría de Veteranos completó el cupo de este año.',
        persona: { id: 102, nombre: 'Ricardo', apellido: 'Paz', dni: '22441807' },
        disciplina: { id: 4, nombre: 'Fútbol' },
        categoriaDisciplina: { id: 9, nombre: 'Veteranos' },
        revisadoPor: { id: 8, nombre: 'Diego', apellido: 'Navarro', email: 'diego@club.local' },
      });

      const res = await controller.rechazarSolicitud(
        15,
        { motivo: '  La categoría de Veteranos completó el cupo de este año.  ' },
        { id: 8, email: 'diego@club.local', roles: ['DELEGADO'] } as any,
      );

      expect(prismaMock.solicitudInscripcion.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 15 }),
          data: expect.objectContaining({
            estado: EstadoSolicitudInscripcion.RECHAZADA,
            motivoRechazo: 'La categoría de Veteranos completó el cupo de este año.',
            revisadoPorId: 8,
          }),
        }),
      );
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'EDITAR',
          entidad: 'SolicitudInscripcion',
          idEntidad: 15,
          responsableId: 8,
          detalle: expect.stringContaining('La categoría de Veteranos completó el cupo de este año.'),
        }),
        prismaMock,
      );
      expect(res.estado).toBe(EstadoSolicitudInscripcion.RECHAZADA);
      expect(res.motivoRechazo).toBe('La categoría de Veteranos completó el cupo de este año.');
    });

    it('exige un motivo obligatorio tanto en el DTO como en el servicio', async () => {
      const dtoVacio = plainToInstance(RechazarSolicitudInscripcionDto, { motivo: '   ' });
      const errores = await validate(dtoVacio);
      expect(errores.length).toBeGreaterThan(0);

      await expect(service.rechazarSolicitud(15, { motivo: '   ' }, 8)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('valida el DTO de filtros FindSolicitudesInscripcionQueryDto', async () => {
      const queryValida = plainToInstance(FindSolicitudesInscripcionQueryDto, {
        disciplinaId: '3',
        busqueda: 'Luna',
        estado: EstadoSolicitudInscripcion.PENDIENTE,
      });
      const errores = await validate(queryValida);
      expect(errores).toHaveLength(0);
      expect(queryValida.disciplinaId).toBe(3);
    });
  });
});
