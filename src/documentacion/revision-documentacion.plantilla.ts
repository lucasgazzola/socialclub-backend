import { Injectable } from '@nestjs/common';
import { escapar, PlantillaEmail } from '../notificaciones/plantillas/plantilla-email';
import type { TipoNotificacion } from '../notificaciones/notificaciones.types';

export interface DatosRevisionDocumentacion {
  resultado: 'APROBADO' | 'RECHAZADO';
  /** Nombre del documento («Certificado médico de aptitud física»). */
  documento: string;
  motivo?: string | null;
}

/** TASK-60 — Aviso al titular cuando se revisa un documento que subió desde Mi club. */
@Injectable()
export class RevisionDocumentacionPlantilla extends PlantillaEmail<DatosRevisionDocumentacion> {
  readonly tipo: TipoNotificacion = 'REVISION_DOCUMENTACION';

  protected asunto(d: DatosRevisionDocumentacion): string {
    return d.resultado === 'APROBADO'
      ? `SocialClub · Aprobamos tu ${d.documento}`
      : `SocialClub · Tu ${d.documento} necesita una corrección`;
  }

  protected titulo(d: DatosRevisionDocumentacion): string {
    return d.resultado === 'APROBADO' ? 'Documento aprobado' : 'Documento rechazado';
  }

  protected introduccion(d: DatosRevisionDocumentacion): string {
    return d.resultado === 'APROBADO'
      ? `Revisamos tu ${d.documento} y quedó aprobado. Ya cuenta para tu habilitación.`
      : `Revisamos tu ${d.documento} y no pudimos aprobarlo. Podés volver a subirlo desde Mi club.`;
  }

  protected cuerpoTexto(d: DatosRevisionDocumentacion): string {
    return d.motivo ? `Motivo: ${d.motivo}` : '';
  }

  protected cuerpoHtml(d: DatosRevisionDocumentacion): string {
    return d.motivo
      ? `<p style="font-size:14px"><strong>Motivo:</strong> ${escapar(d.motivo)}</p>`
      : '';
  }
}
