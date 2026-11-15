import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { DocumentacionService } from './documentacion.service';
import { EstadoDocumentalService } from './estado-documental.service';
import { RevisionDocumentacionPlantilla } from './revision-documentacion.plantilla';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

const enUnMes = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('TASK-60 · Documentación subida por el titular, con revisión', () => {
  let service: DocumentacionService;
  const prismaMock = {
    persona: { findUnique: jest.fn() },
    usuario: { findUnique: jest.fn() },
    documentacion: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    delegadoDisciplina: { findMany: jest.fn() },
    inscripcion: { count: jest.fn() },
  };
  const auditoriaMock = { registrar: jest.fn() };
  const estadoDocumentalMock = { tiposExigidos: jest.fn() };
  const notificacionesMock = { notificar: jest.fn() };
  const archivo = { originalname: 'apto.pdf', filename: 'abc.pdf', mimetype: 'application/pdf', size: 1200 };
  const admin: AuthenticatedUser = { id: 1, email: 'a@club', roles: ['ADMIN'] } as AuthenticatedUser;
  const delegado: AuthenticatedUser = { id: 2, email: 'd@club', roles: ['DELEGADO'] } as AuthenticatedUser;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        DocumentacionService,
        RevisionDocumentacionPlantilla,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
        { provide: EstadoDocumentalService, useValue: estadoDocumentalMock },
        { provide: NotificacionesService, useValue: notificacionesMock },
      ],
    }).compile();
    service = moduleRef.get(DocumentacionService);
    prismaMock.usuario.findUnique.mockResolvedValue({ personaId: 10 });
    prismaMock.persona.findUnique.mockResolvedValue({ id: 10 });
    estadoDocumentalMock.tiposExigidos.mockResolvedValue(['CERTIFICADO_MEDICO_APTITUD_FISICA']);
    prismaMock.documentacion.findFirst.mockResolvedValue(null);
    prismaMock.documentacion.create.mockImplementation(({ data }) => Promise.resolve({ id: 50, ...data }));
  });

  describe('subirPropia', () => {
    it('crea el documento de la propia persona en revisión y lo audita', async () => {
      const doc = await service.subirPropia(
        7,
        { tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA', fechaVencimiento: enUnMes() },
        archivo as never,
      );

      expect(prismaMock.documentacion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          personaId: 10,
          estadoRevision: 'PENDIENTE_REVISION',
          cargadoPorTitular: true,
          archivoRuta: 'abc.pdf',
        }),
      });
      expect(doc.estadoRevision).toBe('PENDIENTE_REVISION');
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'CREAR', responsableId: 7, idEntidad: 50 }),
      );
    });

    it('exige el archivo', async () => {
      await expect(
        service.subirPropia(7, { tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA', fechaVencimiento: enUnMes() }),
      ).rejects.toThrow(new BadRequestException('Adjuntá el archivo del documento (PDF o imagen).'));
    });

    it('no deja mandar el mismo tipo dos veces mientras está en revisión', async () => {
      prismaMock.documentacion.findFirst.mockResolvedValue({ id: 49 });
      await expect(
        service.subirPropia(7, { tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA', fechaVencimiento: enUnMes() }, archivo as never),
      ).rejects.toThrow(ConflictException);
      expect(prismaMock.documentacion.create).not.toHaveBeenCalled();
    });

    it('aplica las mismas reglas que la carga del club (tipo exigido)', async () => {
      await expect(
        service.subirPropia(7, { tipoDocumento: 'SEGURO_COBERTURA_MEDICA', fechaVencimiento: enUnMes() } as never, archivo as never),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('pendientesRevision', () => {
    it('el admin ve todos los pendientes', async () => {
      prismaMock.documentacion.findMany.mockResolvedValue([]);
      await service.pendientesRevision(admin);
      expect(prismaMock.documentacion.findMany.mock.calls[0][0].where).toEqual({
        estadoRevision: 'PENDIENTE_REVISION',
      });
    });

    it('el delegado ve solo los de participantes inscriptos en sus disciplinas', async () => {
      prismaMock.delegadoDisciplina.findMany.mockResolvedValue([{ disciplinaId: 3 }]);
      prismaMock.documentacion.findMany.mockResolvedValue([]);
      await service.pendientesRevision(delegado);
      expect(prismaMock.documentacion.findMany.mock.calls[0][0].where).toEqual({
        estadoRevision: 'PENDIENTE_REVISION',
        persona: { inscripciones: { some: { activo: true, disciplinaId: { in: [3] } } } },
      });
    });

    it('un delegado sin disciplinas a cargo no ve nada', async () => {
      prismaMock.delegadoDisciplina.findMany.mockResolvedValue([]);
      await expect(service.pendientesRevision(delegado)).resolves.toEqual([]);
      expect(prismaMock.documentacion.findMany).not.toHaveBeenCalled();
    });
  });

  describe('revisar', () => {
    const pendiente = {
      id: 50,
      tipo: 'Certificado médico',
      personaId: 10,
      estadoRevision: 'PENDIENTE_REVISION',
      persona: { id: 10, usuario: { id: 7 } },
    };

    it('aprobar: queda APROBADO, se audita y se avisa al titular', async () => {
      prismaMock.documentacion.findUnique.mockResolvedValue(pendiente);
      prismaMock.documentacion.update.mockResolvedValue({ ...pendiente, estadoRevision: 'APROBADO' });

      await service.revisar(50, admin, { aprobar: true });

      expect(prismaMock.documentacion.update).toHaveBeenCalledWith({
        where: { id: 50 },
        data: expect.objectContaining({ estadoRevision: 'APROBADO', motivoRechazo: null, revisadoPorId: 1 }),
      });
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'EDITAR', detalle: 'Documento "Certificado médico" aprobado' }),
      );
      expect(notificacionesMock.notificar).toHaveBeenCalledWith(
        expect.objectContaining({
          destinatarios: [7],
          datos: { resultado: 'APROBADO', documento: 'Certificado médico', motivo: null },
        }),
      );
    });

    it('rechazar: guarda el motivo y se lo informa al titular', async () => {
      prismaMock.documentacion.findUnique.mockResolvedValue(pendiente);
      prismaMock.documentacion.update.mockResolvedValue({});

      await service.revisar(50, admin, { aprobar: false, motivo: '  Foto borrosa  ' });

      expect(prismaMock.documentacion.update.mock.calls[0][0].data).toMatchObject({
        estadoRevision: 'RECHAZADO',
        motivoRechazo: 'Foto borrosa',
      });
      expect(notificacionesMock.notificar.mock.calls[0][0].datos).toEqual({
        resultado: 'RECHAZADO',
        documento: 'Certificado médico',
        motivo: 'Foto borrosa',
      });
    });

    it('no revisa dos veces el mismo documento', async () => {
      prismaMock.documentacion.findUnique.mockResolvedValue({ ...pendiente, estadoRevision: 'APROBADO' });
      await expect(service.revisar(50, admin, { aprobar: true })).rejects.toThrow(
        new ConflictException('El documento ya fue revisado.'),
      );
    });

    it('el delegado no revisa documentos de participantes de otra disciplina', async () => {
      prismaMock.documentacion.findUnique.mockResolvedValue(pendiente);
      prismaMock.delegadoDisciplina.findMany.mockResolvedValue([{ disciplinaId: 3 }]);
      prismaMock.inscripcion.count.mockResolvedValue(0);
      await expect(service.revisar(50, delegado, { aprobar: true })).rejects.toThrow(ForbiddenException);
      expect(prismaMock.documentacion.update).not.toHaveBeenCalled();
    });

    it('si el email falla, la revisión igual queda hecha', async () => {
      prismaMock.documentacion.findUnique.mockResolvedValue(pendiente);
      prismaMock.documentacion.update.mockResolvedValue({ id: 50, estadoRevision: 'APROBADO' });
      notificacionesMock.notificar.mockRejectedValueOnce(new Error('SMTP caído'));
      await expect(service.revisar(50, admin, { aprobar: true })).resolves.toMatchObject({ estadoRevision: 'APROBADO' });
    });
  });
});
