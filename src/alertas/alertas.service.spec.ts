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

  const prismaMock = {
    persona: { findMany: jest.fn() },
    usuario: { findMany: jest.fn() },
    delegadoDisciplina: { findMany: jest.fn() },
  };
  const estadoMock = { porPersonas: jest.fn() };
  const notificacionesMock = {
    filtrarNuevas: jest.fn(),
    notificar: jest.fn(),
  };
  const envio = { creadas: 2, enviadas: 2, fallidas: 0, pendientes: 0 };

  const CLAVE_CERT = '5:CERTIFICADO_MEDICO_APTITUD_FISICA:POR_VENCER:2026-10-08';
  const CLAVE_AUT = '5:AUTORIZACION_PADRES_TUTORES:PRESENTACION_POR_VENCER:2026-10-10';
  const CLAVE_BASQUET = '6:CERTIFICADO_MEDICO_APTITUD_FISICA:POR_VENCER:2026-10-06';

  /** Delegados activos con sus disciplinas a cargo (DT-42). */
  const delegados = (...d: [number, number[]][]) =>
    d.map(([id, ids]) => ({
      id,
      disciplinasDelegadas: ids.map((disciplinaId) => ({ disciplinaId })),
    }));

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
    prismaMock.usuario.findMany.mockResolvedValue(delegados([4, [1]], [9, [1]]));
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

      // Un envío por delegado (DT-42): los totales suman los dos.
      expect(r).toEqual({
        alertas: 2,
        nuevas: 2,
        destinatarios: 2,
        sinDelegado: 0,
        creadas: 4,
        enviadas: 4,
        fallidas: 0,
        pendientes: 0,
      });
      expect(notificacionesMock.filtrarNuevas).toHaveBeenCalledWith('ALERTAS_DOCUMENTACION', [
        CLAVE_CERT,
        CLAVE_AUT,
      ]);
      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { activo: true, roles: { some: { rol: { nombre: 'DELEGADO' } } } },
        }),
      );
      const solicitudes = notificacionesMock.notificar.mock.calls.map((c) => c[0]);
      expect(solicitudes.map((x) => x.destinatarios)).toEqual([[4], [9]]);
      const [solicitud] = solicitudes;
      expect(solicitud.plantilla).toBeInstanceOf(AlertasDocumentacionPlantilla);
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

    it('sin delegados activos no notifica y las cuenta como sin delegado', async () => {
      prismaMock.usuario.findMany.mockResolvedValue([]);

      const r = await service.notificar(hoy);

      expect(r).toMatchObject({ nuevas: 2, destinatarios: 0, sinDelegado: 2, creadas: 0 });
      expect(notificacionesMock.notificar).not.toHaveBeenCalled();
    });

    it('sin alertas no notifica', async () => {
      prismaMock.persona.findMany.mockResolvedValue([]);

      const r = await service.notificar(hoy);

      expect(r).toMatchObject({ alertas: 0, nuevas: 0 });
      expect(notificacionesMock.notificar).not.toHaveBeenCalled();
    });
  });

  describe('DT-42 · cada delegado, solo sus disciplinas', () => {
    /** Lola además juega al básquet (disciplina 2), con el certificado por vencer. */
    const conBasquet = {
      ...estadoLola,
      inscripciones: [
        ...estadoLola.inscripciones,
        {
          inscripcionId: 6,
          disciplina: { id: 2, nombre: 'Básquet' },
          categoriaDisciplina: null,
          documentos: [
            {
              ...estadoLola.inscripciones[0].documentos[0],
              fechaVencimiento: new Date('2026-10-06T00:00:00.000Z'),
            },
          ],
        },
      ],
    };

    beforeEach(() => {
      estadoMock.porPersonas.mockResolvedValue(new Map([[10, conBasquet]]));
    });

    it('el ADMIN ve todas las disciplinas', async () => {
      await expect(
        service.disciplinasVisibles({ id: 1, email: 'a@b.c', roles: ['ADMIN'] }),
      ).resolves.toBeNull();
      expect(prismaMock.delegadoDisciplina.findMany).not.toHaveBeenCalled();
    });

    it('el delegado ve solo las disciplinas que tiene a cargo', async () => {
      prismaMock.delegadoDisciplina.findMany.mockResolvedValue([{ disciplinaId: 2 }]);

      await expect(
        service.disciplinasVisibles({ id: 4, email: 'd@b.c', roles: ['DELEGADO'] }),
      ).resolves.toEqual([2]);
      expect(prismaMock.delegadoDisciplina.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { usuarioId: 4 } }),
      );
    });

    it('listar con disciplinas descarta las inscripciones de las demás', async () => {
      const alertas = await service.listar(hoy, [2]);

      expect(prismaMock.persona.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { inscripciones: { some: { activo: true, disciplinaId: { in: [2] } } } },
        }),
      );
      expect(alertas.map((a) => a.clave)).toEqual([CLAVE_BASQUET]);
      expect(alertas[0]).toMatchObject({ disciplinaId: 2, disciplina: 'Básquet' });
    });

    it('un delegado sin disciplinas a cargo no ve alertas', async () => {
      await expect(service.listar(hoy, [])).resolves.toEqual([]);
      expect(prismaMock.persona.findMany).not.toHaveBeenCalled();
    });

    it('el email de cada delegado lleva solo las alertas de sus disciplinas', async () => {
      prismaMock.usuario.findMany.mockResolvedValue(delegados([4, [1]], [9, [2]], [12, []]));

      const r = await service.notificar(hoy);

      const solicitudes = notificacionesMock.notificar.mock.calls.map((c) => c[0]);
      expect(solicitudes.map((x) => [x.destinatarios, x.referencias])).toEqual([
        [[4], [CLAVE_CERT, CLAVE_AUT]],
        [[9], [CLAVE_BASQUET]],
      ]);
      expect(r).toMatchObject({ nuevas: 3, destinatarios: 2, sinDelegado: 0 });
    });

    it('las alertas de una disciplina sin delegado no se marcan como avisadas', async () => {
      prismaMock.usuario.findMany.mockResolvedValue(delegados([4, [1]]));

      const r = await service.notificar(hoy);

      expect(notificacionesMock.notificar).toHaveBeenCalledTimes(1);
      const [solicitud] = notificacionesMock.notificar.mock.calls[0];
      expect(solicitud.referencias).not.toContain(CLAVE_BASQUET);
      expect(r).toMatchObject({ nuevas: 3, destinatarios: 1, sinDelegado: 1 });
    });
  });
});
