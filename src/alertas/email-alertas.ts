import { formatear } from '../documentacion/estado-documental';
import type { AlertaDocumentacion, TipoAlerta } from './alertas-documentacion';

/** US-26 — Contenido del email con las alertas nuevas (texto plano + HTML). */

const ETIQUETA: Record<TipoAlerta, string> = {
  POR_VENCER: 'Por vencer',
  VENCIDO: 'Vencido',
  PRESENTACION_POR_VENCER: 'Falta presentar',
  PRESENTACION_VENCIDA: 'Plazo vencido',
};

const COLOR: Record<TipoAlerta, string> = {
  POR_VENCER: '#92400e',
  VENCIDO: '#b91c1c',
  PRESENTACION_POR_VENCER: '#92400e',
  PRESENTACION_VENCIDA: '#b91c1c',
};

function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function disciplinaDe(a: AlertaDocumentacion): string {
  return a.categoria ? `${a.disciplina} · ${a.categoria}` : a.disciplina;
}

export function asuntoAlertas(alertas: AlertaDocumentacion[]): string {
  const n = alertas.length;
  return `SocialClub · ${n} ${n === 1 ? 'alerta' : 'alertas'} de documentación`;
}

export function emailAlertas(alertas: AlertaDocumentacion[], urlApp?: string) {
  const texto = [
    'Hay documentación de participantes que necesita atención:',
    '',
    ...alertas.map(
      (a) =>
        `- ${a.participante} (${disciplinaDe(a)}): ${a.documento}. ${ETIQUETA[a.tipo]}: ${formatear(a.fecha)}.`,
    ),
    ...(urlApp ? ['', `Revisalo en ${urlApp}`] : []),
  ].join('\n');

  const filas = alertas
    .map(
      (a) => `<tr>
<td style="padding:8px 10px;border-top:1px solid #e2e8f0">${escapar(a.participante)}</td>
<td style="padding:8px 10px;border-top:1px solid #e2e8f0">${escapar(disciplinaDe(a))}</td>
<td style="padding:8px 10px;border-top:1px solid #e2e8f0">${escapar(a.documento)}</td>
<td style="padding:8px 10px;border-top:1px solid #e2e8f0;white-space:nowrap">${formatear(a.fecha)}</td>
<td style="padding:8px 10px;border-top:1px solid #e2e8f0;color:${COLOR[a.tipo]};font-weight:600;white-space:nowrap">${ETIQUETA[a.tipo]}</td>
</tr>`,
    )
    .join('\n');

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>
<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:720px">
<h2 style="color:#005fc2;margin:0 0 8px">Alertas de documentación</h2>
<p style="margin:0 0 16px;color:#475569">Hay documentación de participantes que necesita atención.</p>
<table style="border-collapse:collapse;width:100%;font-size:14px">
<thead><tr style="background:#f8fafc;text-align:left;color:#64748b;font-size:12px;text-transform:uppercase">
<th style="padding:8px 10px">Participante</th><th style="padding:8px 10px">Disciplina</th><th style="padding:8px 10px">Documento</th><th style="padding:8px 10px">Fecha</th><th style="padding:8px 10px">Estado</th>
</tr></thead>
<tbody>
${filas}
</tbody>
</table>
${urlApp ? `<p style="margin:16px 0 0"><a href="${escapar(urlApp)}" style="color:#005fc2">Abrir SocialClub</a></p>` : ''}
</div>
</body></html>`;

  return { texto, html };
}
