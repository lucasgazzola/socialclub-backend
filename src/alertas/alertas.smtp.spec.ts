import type { AddressInfo, Server } from 'node:net';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EstadoDocumentalService } from '../documentacion/estado-documental.service';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { AlertasService } from './alertas.service';
import { AlertasDocumentacionPlantilla } from './alertas-documentacion.plantilla';
import {
  encabezado,
  parteHtml,
  servidorSmtp,
  type MensajeRecibido,
} from '../../test/utils/servidor-smtp';

/**
 * US-26 · DT-36 · Integración: las alertas salen por el servicio de
 * notificaciones real (facade, canal de email y proveedor SMTP) hasta un
 * servidor SMTP en memoria. Solo se simula la base de datos.
 */
describe('US-26 · DT-36 · Aviso de alertas por SMTP (integración)', () => {
  const recibidos: MensajeRecibido[] = [];
  let servidor: Server;
  let puerto: number;
  const hoy = new Date(2026, 9, 3);

  const prismaMock = {
    persona: { findMany: jest.fn() },
    usuario: { findMany: jest.fn() },
    notificacion: { findMany: jest.fn(), update: jest.fn(), createManyAndReturn: jest.fn() },
    $transaction: jest.fn(),
  };
  const estadoMock = { porPersonas: jest.fn() };
  const auditoriaMock = { registrar: jest.fn() };

  beforeAll(async () => {
    servidor = servidorSmtp(recibidos);
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
    puerto = (servidor.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise((r) => servidor.close(r));
  });

  beforeEach(() => {
    recibidos.length = 0;
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prismaMock));
    prismaMock.notificacion.createManyAndReturn.mockImplementation(({ data }: { data: object[] }) =>
      data.map((d, i) => ({ id: i + 1, ...d })),
    );
    prismaMock.persona.findMany.mockResolvedValue([{ id: 10, nombre: 'Lola', apellido: 'Gómez' }]);
    estadoMock.porPersonas.mockResolvedValue(
      new Map([
        [
          10,
          {
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
                ],
              },
            ],
          },
        ],
      ]),
    );
    prismaMock.notificacion.findMany.mockResolvedValue([]);
    // Los delegados con sus disciplinas (DT-42) y luego, por cada envío, los
    // datos de su destinatario.
    prismaMock.usuario.findMany
      .mockResolvedValueOnce([
        { id: 4, disciplinasDelegadas: [{ disciplinaId: 1 }] },
        { id: 9, disciplinasDelegadas: [{ disciplinaId: 1 }] },
      ])
      .mockResolvedValueOnce([{ id: 4, email: 'delegado1@club.test' }])
      .mockResolvedValueOnce([{ id: 9, email: 'delegada2@club.test' }]);
  });

  async function alertasCon(env: Record<string, string>) {
    // Lo que en la app proveen los módulos globales (Config, Prisma, Auditoría).
    const servicios = [
      { provide: ConfigService, useValue: new ConfigService(env) },
      { provide: PrismaService, useValue: prismaMock },
      { provide: AuditoriaService, useValue: auditoriaMock },
    ];
    @Global()
    @Module({ providers: servicios, exports: servicios.map((s) => s.provide) })
    class GlobalesDePrueba {}

    const modulo = await Test.createTestingModule({
      imports: [GlobalesDePrueba, NotificacionesModule],
      providers: [
        AlertasService,
        AlertasDocumentacionPlantilla,
        { provide: EstadoDocumentalService, useValue: estadoMock },
      ],
    }).compile();
    return modulo.get(AlertasService);
  }

  it('envía un email a cada delegado con las alertas nuevas y los marca enviados', async () => {
    const alertas = await alertasCon({
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(puerto),
      MAIL_FROM: 'avisos@socialclub.test',
      APP_URL: 'https://socialclub.test',
    });

    const r = await alertas.notificar(hoy);

    expect(r).toEqual({
      alertas: 1,
      nuevas: 1,
      destinatarios: 2,
      sinDelegado: 0,
      creadas: 2,
      enviadas: 2,
      fallidas: 0,
      pendientes: 0,
    });
    expect(recibidos.map((m) => m.destinatarios).sort()).toEqual([
      ['delegada2@club.test'],
      ['delegado1@club.test'],
    ]);
    const [mensaje] = recibidos;
    expect(mensaje.remitente).toBe('avisos@socialclub.test');
    expect(encabezado(mensaje.crudo, 'Subject')).toBe('SocialClub · 1 alerta de documentación');
    const html = parteHtml(mensaje.crudo);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('Gómez, Lola');
    expect(html).toContain('Fútbol · Sub-15');
    expect(html).toContain('Certificado médico de aptitud física');
    expect(html).toContain('08/10/2026');
    expect(html).toContain('Por vencer');
    expect(html).toContain('href="https://socialclub.test"');
    expect(prismaMock.notificacion.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.notificacion.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'ENVIADA' }) }),
    );
  });

  it('sin SMTP_HOST no se conecta: las notificaciones quedan pendientes', async () => {
    const alertas = await alertasCon({});

    const r = await alertas.notificar(hoy);

    expect(r).toMatchObject({ creadas: 2, enviadas: 0, pendientes: 2 });
    expect(recibidos).toHaveLength(0);
    expect(prismaMock.notificacion.update).not.toHaveBeenCalled();
  });

  it('si el SMTP no responde quedan FALLIDAS con el error, para reintentarlas', async () => {
    const alertas = await alertasCon({ SMTP_HOST: '127.0.0.1', SMTP_PORT: '1' });

    const r = await alertas.notificar(hoy);

    expect(r).toMatchObject({ creadas: 2, enviadas: 0, fallidas: 2 });
    expect(prismaMock.notificacion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: 'FALLIDA', ultimoError: expect.any(String) }),
      }),
    );
  });
});
