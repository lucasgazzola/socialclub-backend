import { createServer, type Server } from 'node:net';

/**
 * Servidor SMTP mínimo en memoria para tests de integración (DT-36): acepta
 * cualquier mensaje y lo guarda, sin dependencias externas.
 */

export interface MensajeRecibido {
  remitente: string;
  destinatarios: string[];
  crudo: string;
}

/** Servidor SMTP de prueba: acepta todo y guarda cada mensaje. */
export function servidorSmtp(recibidos: MensajeRecibido[]): Server {
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
export function desdeQuotedPrintable(texto: string): string {
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
export function desdeEncabezado(valor: string): string {
  return valor.replace(/=\?UTF-8\?([QB])\?(.*?)\?=\s*/gi, (_m, tipo: string, dato: string) =>
    tipo.toUpperCase() === 'B'
      ? Buffer.from(dato, 'base64').toString('utf8')
      : desdeQuotedPrintable(dato.replace(/_/g, ' ')),
  );
}

export function encabezado(crudo: string, nombre: string): string | undefined {
  const cabecera = crudo.split(/\r\n\r\n/)[0].replace(/\r\n[ \t]+/g, ' ');
  const linea = cabecera
    .split('\r\n')
    .find((l) => l.toLowerCase().startsWith(`${nombre.toLowerCase()}:`));
  return linea ? desdeEncabezado(linea.slice(nombre.length + 1).trim()) : undefined;
}

/** Parte HTML del mensaje multipart, decodificada. */
export function parteHtml(crudo: string): string {
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
