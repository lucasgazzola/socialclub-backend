import { Injectable } from '@nestjs/common';
import { formatear } from '../documentacion/estado-documental';
import { escapar, PlantillaEmail } from '../notificaciones/plantillas/plantilla-email';
import type { TipoNotificacion } from '../notificaciones/notificaciones.types';
import type { AlertaDocumentacion, TipoAlerta } from './alertas-documentacion';

export interface DatosAlertasDocumentacion {
  alertas: AlertaDocumentacion[];
}

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

function disciplinaDe(a: AlertaDocumentacion): string {
  return a.categoria ? `${a.disciplina} · ${a.categoria}` : a.disciplina;
}

const CELDA = 'padding:8px 10px;border-top:1px solid #e2e8f0';

/** US-26 — Email con las alertas de documentación nuevas. */
@Injectable()
export class AlertasDocumentacionPlantilla extends PlantillaEmail<DatosAlertasDocumentacion> {
  readonly tipo: TipoNotificacion = 'ALERTAS_DOCUMENTACION';

  protected asunto({ alertas }: DatosAlertasDocumentacion): string {
    const n = alertas.length;
    return `SocialClub · ${n} ${n === 1 ? 'alerta' : 'alertas'} de documentación`;
  }

  protected titulo(): string {
    return 'Alertas de documentación';
  }

  protected introduccion(): string {
    return 'Hay documentación de participantes que necesita atención:';
  }

  protected cuerpoTexto({ alertas }: DatosAlertasDocumentacion): string {
    return alertas
      .map(
        (a) =>
          `- ${a.participante} (${disciplinaDe(a)}): ${a.documento}. ${ETIQUETA[a.tipo]}: ${formatear(a.fecha)}.`,
      )
      .join('\n');
  }

  protected cuerpoHtml({ alertas }: DatosAlertasDocumentacion): string {
    const filas = alertas
      .map(
        (a) => `<tr>
<td style="${CELDA}">${escapar(a.participante)}</td>
<td style="${CELDA}">${escapar(disciplinaDe(a))}</td>
<td style="${CELDA}">${escapar(a.documento)}</td>
<td style="${CELDA};white-space:nowrap">${formatear(a.fecha)}</td>
<td style="${CELDA};color:${COLOR[a.tipo]};font-weight:600;white-space:nowrap">${ETIQUETA[a.tipo]}</td>
</tr>`,
      )
      .join('\n');
    return `<table style="border-collapse:collapse;width:100%;font-size:14px">
<thead><tr style="background:#f8fafc;text-align:left;color:#64748b;font-size:12px;text-transform:uppercase">
<th style="padding:8px 10px">Participante</th><th style="padding:8px 10px">Disciplina</th><th style="padding:8px 10px">Documento</th><th style="padding:8px 10px">Fecha</th><th style="padding:8px 10px">Estado</th>
</tr></thead>
<tbody>
${filas}
</tbody>
</table>`;
  }
}
