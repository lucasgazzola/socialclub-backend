import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EstadoDocumentalService } from '../documentacion/estado-documental.service';
import { MailService } from '../notificaciones/mail.service';
import { AlertasService } from './alertas.service';

/**
 * US-26 · AlertasService: arma las alertas desde el estado documental y avisa
 * por email a los delegados solo lo que todavía no se avisó.
 */
describe('US-26 · AlertasService', () => {
  let service: AlertasService;
  const hoy = new Date(2026, 9, 3);

  const txMock = {
    alertaDocumentacionNotificada: { createMany: jest.fn() },
  };
  const prismaMock = {
    persona: { findMany: jest.fn() },
    usuario: { findMany: jest.fn() },
    alertaDocumentacionNotificada: { findMany: jest.fn() },
    $transaction: jest.fn((fn: (tx: typeof txMock) => unknown) => fn(txMock)),
  };
  const estadoMock = { porPersonas: jest.fn() };
  const mailMock = { enviar: jest.fn() };
  const auditoriaMock = { registrar: jest.fn() };
  const configMock = {
    get: jest.fn((k: string) => (k === 'APP_URL' ? 'https://club.test' : undefined)),
  };

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
            fechaVencimiento: new Date(2026, 9, 8),
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
            fechaLimite: new Date(2026, 9, 10),
          },
        ],
      },
    ],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.persona.findMany.mockResolvedValue([{ id: 10, nombre: 'Lola', apellido: 'Gómez' }]);
    estadoMock.porPersonas.mockResolvedValue(new Map([[10, estadoLola]]));
    prismaMock.alertaDocumentacionNotificada.findMany.mockResolvedValue([]);
    prismaMock.usuario.findMany.mockResolvedValue([
      { email: 'delegado1@club.test' },
      { email: 'delegado2@club.test' },
    ]);
    mailMock.enviar.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertasService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EstadoDocumentalService, useValue: estadoMock },
        { provide: MailService, useValue: mailMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
        { provide: ConfigService, useValue: configMock },
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
    it('avisa a los delegados las alertas nuevas, las registra y audita', async () => {
      const r = await service.notificar(hoy);

      expect(r).toEqual({ alertas: 2, nuevas: 2, destinatarios: 2, enviado: true });
      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { activo: true, roles: { some: { rol: { nombre: 'DELEGADO' } } } },
        }),
      );
      const email = mailMock.enviar.mock.calls[0][0];
      expect(email.destinatarios).toEqual(['delegado1@club.test', 'delegado2@club.test']);
      expect(email.asunto).toBe('SocialClub · 2 alertas de documentación');
      expect(email.texto).toContain(
        'Gómez, Lola (Fútbol · Sub-15): Certificado médico de aptitud física',
      );
      expect(email.texto).toContain('https://club.test');
      expect(txMock.alertaDocumentacionNotificada.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            clave: '5:CERTIFICADO_MEDICO_APTITUD_FISICA:POR_VENCER:2026-10-08',
            inscripcionId: 5,
            tipoAlerta: 'POR_VENCER',
            fechaReferencia: new Date('2026-10-08T00:00:00.000Z'),
          }),
          expect.objectContaining({ tipoAlerta: 'PRESENTACION_POR_VENCER' }),
        ],
        skipDuplicates: true,
      });
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'CREAR', entidad: 'AlertaDocumentacion' }),
        txMock,
      );
    });

    it('no repite lo que ya se avisó', async () => {
      prismaMock.alertaDocumentacionNotificada.findMany.mockResolvedValue([
        { clave: '5:CERTIFICADO_MEDICO_APTITUD_FISICA:POR_VENCER:2026-10-08' },
      ]);

      const r = await service.notificar(hoy);

      expect(r.nuevas).toBe(1);
      expect(mailMock.enviar.mock.calls[0][0].asunto).toBe(
        'SocialClub · 1 alerta de documentación',
      );
    });

    it('si todo ya se avisó no manda email', async () => {
      prismaMock.alertaDocumentacionNotificada.findMany.mockResolvedValue([
        { clave: '5:CERTIFICADO_MEDICO_APTITUD_FISICA:POR_VENCER:2026-10-08' },
        { clave: '5:AUTORIZACION_PADRES_TUTORES:PRESENTACION_POR_VENCER:2026-10-10' },
      ]);

      const r = await service.notificar(hoy);

      expect(r).toEqual({ alertas: 2, nuevas: 0, destinatarios: 0, enviado: false });
      expect(mailMock.enviar).not.toHaveBeenCalled();
    });

    it('sin delegados activos no envía ni marca', async () => {
      prismaMock.usuario.findMany.mockResolvedValue([]);

      const r = await service.notificar(hoy);

      expect(r.enviado).toBe(false);
      expect(mailMock.enviar).not.toHaveBeenCalled();
      expect(txMock.alertaDocumentacionNotificada.createMany).not.toHaveBeenCalled();
    });

    it('si el SMTP no está configurado no las marca, para avisarlas cuando lo esté', async () => {
      mailMock.enviar.mockResolvedValue(false);

      const r = await service.notificar(hoy);

      expect(r.enviado).toBe(false);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(auditoriaMock.registrar).not.toHaveBeenCalled();
    });

    it('sin alertas no consulta nada más', async () => {
      prismaMock.persona.findMany.mockResolvedValue([]);

      await expect(service.notificar(hoy)).resolves.toEqual({
        alertas: 0,
        nuevas: 0,
        destinatarios: 0,
        enviado: false,
      });
      expect(prismaMock.alertaDocumentacionNotificada.findMany).not.toHaveBeenCalled();
    });
  });
});
