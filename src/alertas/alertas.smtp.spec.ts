import { createServer, type AddressInfo, type Server } from 'node:net';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EstadoDocumentalService } from '../documentacion/estado-documental.service';
import { MailService } from '../notificaciones/mail.service';
import { AlertasService } from './alertas.service';

/**
 * US-26 · Integración: el aviso sale por SMTP de verdad. Se levanta un
 * servidor SMTP mínimo en memoria (sin dependencias) y se verifica lo que
 * recibe: destinatarios, asunto y contenido del email de alertas.
 */

interface MensajeRecibido {
  remitente: string;
  destinatarios: string[];
  crudo: string;
}

/** Servidor SMTP de prueba: acepta todo y guarda cada mensaje. */
function servidorSmtp(recibidos: MensajeRecibido[]): Server {
  return createServer((socket) => {
    let buffer = '';
    let enDatos = false;
    let actual: MensajeRecibido = { remitente: '', destinatarios: [], crudo: '' };
    socket.write('220 smtp-de-prueba\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      while (true) {
        if (enDatos) {
          const fin = buffer.indexOf('\r\n.\r\n');
          if (fin === -1) return;
          actual.crudo = buffer.slice(0, fin);
          recibidos.push(actual);
          actual = { remitente: '', destinatarios: [], crudo: '' };
          buffer = buffer.slice(fin + 5);
          enDatos = false;
          socket.write('250 OK\r\n');
          continue;
        }
        const nl = buffer.indexOf('\r\n');
        if (nl === -1) return;
        const linea = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 2);
        const cmd = linea.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO' || cmd === 'HELO') socket.write('250 smtp-de-prueba\r\n');
        else if (cmd === 'MAIL') {
          actual.remitente = /<(.*)>/.exec(linea)?.[1] ?? '';
          socket.write('250 OK\r\n');
        } else if (cmd === 'RCPT') {
          actual.destinatarios.push(/<(.*)>/.exec(linea)?.[1] ?? '');
          socket.write('250 OK\r\n');
        } else if (cmd === 'DATA') {
          enDatos = true;
          socket.write('354 Fin con <CRLF>.<CRLF>\r\n');
        } else if (cmd === 'QUIT') {
          socket.end('221 Chau\r\n');
          return;
        } else socket.write('250 OK\r\n');
      }
    });
  });
}

/** Decodifica quoted-printable (cuerpo) a texto UTF-8. */
function desdeQuotedPrintable(texto: string): string {
  const sinCortes = texto.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < sinCortes.length; i++) {
    const c = sinCortes[i];
    if (c === '=' && /^[0-9A-F]{2}$/i.test(sinCortes.slice(i + 1, i + 3))) {
      bytes.push(parseInt(sinCortes.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(...Buffer.from(c, 'utf8'));
  }
  return Buffer.from(bytes).toString('utf8');
}

/** Decodifica un encabezado RFC 2047 (=?UTF-8?Q?...?=) o lo deja como está. */
function desdeEncabezado(valor: string): string {
  return valor.replace(/=\?UTF-8\?([QB])\?(.*?)\?=\s*/gi, (_m, tipo: string, dato: string) =>
    tipo.toUpperCase() === 'B'
      ? Buffer.from(dato, 'base64').toString('utf8')
      : desdeQuotedPrintable(dato.replace(/_/g, ' ')),
  );
}

function encabezado(crudo: string, nombre: string): string | undefined {
  const cabecera = crudo.split(/\r\n\r\n/)[0].replace(/\r\n[ \t]+/g, ' ');
  const linea = cabecera
    .split('\r\n')
    .find((l) => l.toLowerCase().startsWith(`${nombre.toLowerCase()}:`));
  return linea ? desdeEncabezado(linea.slice(nombre.length + 1).trim()) : undefined;
}

/** Parte HTML del mensaje multipart, decodificada. */
function parteHtml(crudo: string): string {
  const partes = crudo.split(/\r\n--[^\r\n]+/);
  const html = partes.find((p) => /content-type:\s*text\/html/i.test(p)) ?? '';
  const [cab, ...cuerpo] = html.split(/\r\n\r\n/);
  const contenido = cuerpo.join('\r\n\r\n');
  return /quoted-printable/i.test(cab)
    ? desdeQuotedPrintable(contenido)
    : /base64/i.test(cab)
      ? Buffer.from(contenido.replace(/\s/g, ''), 'base64').toString('utf8')
      : contenido;
}

describe('US-26 · Aviso de alertas por SMTP (integración)', () => {
  const recibidos: MensajeRecibido[] = [];
  let servidor: Server;
  let puerto: number;
  const hoy = new Date(2026, 9, 3);

  const prismaMock = {
    persona: { findMany: jest.fn() },
    usuario: { findMany: jest.fn() },
    alertaDocumentacionNotificada: { findMany: jest.fn(), createMany: jest.fn() },
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
    prismaMock.alertaDocumentacionNotificada.findMany.mockResolvedValue([]);
    prismaMock.usuario.findMany.mockResolvedValue([
      { email: 'delegado1@club.test' },
      { email: 'delegada2@club.test' },
    ]);
  });

  async function servicio(env: Record<string, string>) {
    const modulo = await Test.createTestingModule({
      providers: [
        AlertasService,
        MailService,
        { provide: ConfigService, useValue: new ConfigService(env) },
        { provide: PrismaService, useValue: prismaMock },
        { provide: EstadoDocumentalService, useValue: estadoMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
      ],
    }).compile();
    return modulo.get(AlertasService);
  }

  it('envía un email a cada delegado (en copia oculta) con las alertas nuevas', async () => {
    const alertas = await servicio({
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(puerto),
      MAIL_FROM: 'avisos@socialclub.test',
      APP_URL: 'https://socialclub.test',
    });

    const r = await alertas.notificar(hoy);

    expect(r).toEqual({ alertas: 1, nuevas: 1, destinatarios: 2, enviado: true });
    expect(recibidos).toHaveLength(1);
    const [mensaje] = recibidos;
    expect(mensaje.remitente).toBe('avisos@socialclub.test');
    // El remitente va en "Para" y los delegados en CCO: no ven las direcciones de los demás.
    expect(mensaje.destinatarios.sort()).toEqual(
      ['avisos@socialclub.test', 'delegada2@club.test', 'delegado1@club.test'].sort(),
    );
    expect(encabezado(mensaje.crudo, 'Bcc')).toBeUndefined();
    expect(encabezado(mensaje.crudo, 'Subject')).toBe('SocialClub · 1 alerta de documentación');

    const html = parteHtml(mensaje.crudo);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('Gómez, Lola');
    expect(html).toContain('Fútbol · Sub-15');
    expect(html).toContain('Certificado médico de aptitud física');
    expect(html).toContain('08/10/2026');
    expect(html).toContain('Por vencer');
    expect(html).toContain('href="https://socialclub.test"');

    expect(prismaMock.alertaDocumentacionNotificada.createMany).toHaveBeenCalled();
  });

  it('sin SMTP_HOST no se conecta a ningún servidor ni marca las alertas', async () => {
    const alertas = await servicio({});

    const r = await alertas.notificar(hoy);

    expect(r.enviado).toBe(false);
    expect(recibidos).toHaveLength(0);
    expect(prismaMock.alertaDocumentacionNotificada.createMany).not.toHaveBeenCalled();
  });

  it('si el servidor SMTP falla, el error sube y las alertas no quedan marcadas', async () => {
    const alertas = await servicio({ SMTP_HOST: '127.0.0.1', SMTP_PORT: '1' });

    await expect(alertas.notificar(hoy)).rejects.toThrow();
    expect(prismaMock.alertaDocumentacionNotificada.createMany).not.toHaveBeenCalled();
  });
});
