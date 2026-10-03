import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { EstadoDocumentalService } from '../documentacion/estado-documental.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { AlertasService } from './alertas.service';
import { AlertasDocumentacionPlantilla } from './alertas-documentacion.plantilla';

/**
 * US-26 · AlertasService: arma las alertas desde el estado documental y le
 * pide al servicio de notificaciones (DT-36) avisar a los delegados solo lo
 * que todavía no se avisó.
 */
describe('US-26 · AlertasService', () => {
  let service: AlertasService;
  const hoy = new Date(2026, 9, 3);

  const prismaMock = { persona: { findMany: jest.fn() } };
  const estadoMock = { porPersonas: jest.fn() };
  const notificacionesMock = {
    filtrarNuevas: jest.fn(),
    usuariosConRol: jest.fn(),
    notificar: jest.fn(),
  };
  const envio = { creadas: 2, enviadas: 2, fallidas: 0, pendientes: 0 };

  const CLAVE_CERT = '5:CERTIFICADO_MEDICO_APTITUD_FISICA:POR_VENCER:2026-10-08';
  const CLAVE_AUT = '5:AUTORIZACION_PADRES_TUTORES:PRESENTACION_POR_VENCER:2026-10-10';

  const estadoLola = {
    personaId: 10,
    inscripciones: [
      {
        inscripcionId: 5,
        disciplina: { id: 1, nombre: 'Fútbol' },
        categoriaDisciplina: { id: 7, nombre: 'Sub-15' },
        documentos: [
          {
            tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA',
            etiqueta: 'Certificado médico de aptitud física',
            origen: 'DISCIPLINA',
            plazoDiasTolerancia: 30,
            estado: 'POR_VENCER',
            documentoId: 3,
            fechaVencimiento: new Date('2026-10-08T00:00:00.000Z'),
            fechaLimite: null,
          },
          {
            tipoDocumento: 'AUTORIZACION_PADRES_TUTORES',
            etiqueta: 'Autorización de padres/tutores',
            origen: 'CATEGORIA',
            plazoDiasTolerancia: 15,
            estado: 'FALTANTE',
            documentoId: null,
            fechaVencimiento: null,
            fechaLimite: new Date('2026-10-10T00:00:00.000Z'),
          },
        ],
      },
    ],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.persona.findMany.mockResolvedValue([{ id: 10, nombre: 'Lola', apellido: 'Gómez' }]);
    estadoMock.porPersonas.mockResolvedValue(new Map([[10, estadoLola]]));
    notificacionesMock.filtrarNuevas.mockImplementation(
      (_tipo: string, claves: string[]) => claves,
    );
    notificacionesMock.usuariosConRol.mockResolvedValue([4, 9]);
    notificacionesMock.notificar.mockResolvedValue(envio);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertasService,
        AlertasDocumentacionPlantilla,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EstadoDocumentalService, useValue: estadoMock },
        { provide: NotificacionesService, useValue: notificacionesMock },
      ],
    }).compile();
    service = module.get(AlertasService);
  });

  describe('listar', () => {
    it('devuelve, por alerta, participante, disciplina, documento y fecha', async () => {
      const alertas = await service.listar(hoy);

      expect(prismaMock.persona.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { inscripciones: { some: { activo: true } } } }),
      );
      expect(estadoMock.porPersonas).toHaveBeenCalledWith([10], hoy);
      expect(
        alertas.map((a) => [a.participante, a.disciplina, a.categoria, a.documento, a.tipo]),
      ).toEqual([
        ['Gómez, Lola', 'Fútbol', 'Sub-15', 'Certificado médico de aptitud física', 'POR_VENCER'],
        [
          'Gómez, Lola',
          'Fútbol',
          'Sub-15',
          'Autorización de padres/tutores',
          'PRESENTACION_POR_VENCER',
        ],
      ]);
    });

    it('sin participantes activos no calcula nada', async () => {
      prismaMock.persona.findMany.mockResolvedValue([]);
      await expect(service.listar(hoy)).resolves.toEqual([]);
      expect(estadoMock.porPersonas).not.toHaveBeenCalled();
    });
  });

  describe('notificar', () => {
    it('avisa a los delegados las alertas nuevas, con sus claves como referencias', async () => {
      const r = await service.notificar(hoy);

      expect(r).toEqual({ alertas: 2, nuevas: 2, destinatarios: 2, ...envio });
      expect(notificacionesMock.filtrarNuevas).toHaveBeenCalledWith('ALERTAS_DOCUMENTACION', [
        CLAVE_CERT,
        CLAVE_AUT,
      ]);
      expect(notificacionesMock.usuariosConRol).toHaveBeenCalledWith('DELEGADO');
      const solicitud = notificacionesMock.notificar.mock.calls[0][0];
      expect(solicitud.plantilla).toBeInstanceOf(AlertasDocumentacionPlantilla);
      expect(solicitud.destinatarios).toEqual([4, 9]);
      expect(solicitud.referencias).toEqual([CLAVE_CERT, CLAVE_AUT]);
      expect(solicitud.datos.alertas).toHaveLength(2);
    });

    it('no repite lo que ya se avisó', async () => {
      notificacionesMock.filtrarNuevas.mockResolvedValue([CLAVE_AUT]);

      const r = await service.notificar(hoy);

      expect(r.nuevas).toBe(1);
      const solicitud = notificacionesMock.notificar.mock.calls[0][0];
      expect(solicitud.datos.alertas.map((a: { clave: string }) => a.clave)).toEqual([CLAVE_AUT]);
      expect(solicitud.referencias).toEqual([CLAVE_AUT]);
    });

    it('si todo ya se avisó no notifica', async () => {
      notificacionesMock.filtrarNuevas.mockResolvedValue([]);

      const r = await service.notificar(hoy);

      expect(r).toMatchObject({ alertas: 2, nuevas: 0, destinatarios: 0, creadas: 0 });
      expect(notificacionesMock.notificar).not.toHaveBeenCalled();
    });

    it('sin delegados activos no notifica', async () => {
      notificacionesMock.usuariosConRol.mockResolvedValue([]);

      const r = await service.notificar(hoy);

      expect(r).toMatchObject({ nuevas: 2, destinatarios: 0, creadas: 0 });
      expect(notificacionesMock.notificar).not.toHaveBeenCalled();
    });

    it('sin alertas no notifica', async () => {
      prismaMock.persona.findMany.mockResolvedValue([]);

      const r = await service.notificar(hoy);

      expect(r).toMatchObject({ alertas: 0, nuevas: 0 });
      expect(notificacionesMock.notificar).not.toHaveBeenCalled();
    });
  });
});
