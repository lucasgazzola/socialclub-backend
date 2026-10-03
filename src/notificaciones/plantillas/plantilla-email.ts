import type { CanalNotificacion } from '@prisma/client';
import type {
  ContenidoEmail,
  ContextoPlantilla,
  Plantilla,
  TipoNotificacion,
} from '../notificaciones.types';

/** Escapa texto para insertarlo en HTML. */
export function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Template Method (DT-36): todos los emails comparten el esqueleto (charset,
 * título con la marca, introducción, enlace a la app y pie). Cada tipo de aviso
 * completa solo lo propio. Así ningún email se arma "a mano" distinto del resto.
 */
export abstract class PlantillaEmail<D> implements Plantilla<D> {
  abstract readonly tipo: TipoNotificacion;

  protected abstract asunto(datos: D): string;
  protected abstract titulo(datos: D): string;
  protected abstract introduccion(datos: D): string;
  /** Cuerpo en HTML (ya escapado). */
  protected abstract cuerpoHtml(datos: D): string;
  /** Cuerpo en texto plano, para los clientes que no muestran HTML. */
  protected abstract cuerpoTexto(datos: D): string;

  contenidoPara(canal: CanalNotificacion, datos: D, contexto: ContextoPlantilla): unknown {
    return canal === 'EMAIL' ? this.email(datos, contexto) : null;
  }

  /** El método plantilla: arma el email con el mismo esqueleto para todos. */
  email(datos: D, { appUrl }: ContextoPlantilla): ContenidoEmail {
    const enlaceHtml = appUrl
      ? `<p style="margin:16px 0 0"><a href="${escapar(appUrl)}" style="color:#005fc2">Abrir SocialClub</a></p>`
      : '';
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>
<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:720px">
<h2 style="color:#005fc2;margin:0 0 8px">${escapar(this.titulo(datos))}</h2>
<p style="margin:0 0 16px;color:#475569">${escapar(this.introduccion(datos))}</p>
${this.cuerpoHtml(datos)}
${enlaceHtml}
<p style="margin:24px 0 0;color:#94a3b8;font-size:12px">SocialClub · Aviso automático, no respondas este email.</p>
</div>
</body></html>`;
    const texto = [
      this.introduccion(datos),
      '',
      this.cuerpoTexto(datos),
      ...(appUrl ? ['', `Revisalo en ${appUrl}`] : []),
    ].join('\n');
    return { asunto: this.asunto(datos), html, texto };
  }
}
