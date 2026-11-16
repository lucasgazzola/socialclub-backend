import { Injectable } from '@nestjs/common';
import { escapar, PlantillaEmail } from '../notificaciones/plantillas/plantilla-email';
import type { TipoNotificacion } from '../notificaciones/notificaciones.types';

export interface DatosVerificacionEmail {
  nombre: string;
  /** Enlace completo a la pantalla de verificación, con el token. */
  enlace: string;
  horasValidez: number;
  /**
   * true si la cuenta la creó otra persona (alta administrativa, socio o
   * participante) y todavía no tiene contraseña: el enlace sirve para elegirla.
   */
  eligeContrasena: boolean;
}

/** DT-54 — Enlace para verificar el email y, si hace falta, elegir la contraseña. */
@Injectable()
export class VerificacionEmailPlantilla extends PlantillaEmail<DatosVerificacionEmail> {
  readonly tipo: TipoNotificacion = 'VERIFICACION_EMAIL';

  protected asunto(d: DatosVerificacionEmail): string {
    return d.eligeContrasena ? 'SocialClub · Activá tu cuenta' : 'SocialClub · Verificá tu email';
  }

  protected titulo(d: DatosVerificacionEmail): string {
    return `¡Hola, ${d.nombre}!`;
  }

  protected introduccion(d: DatosVerificacionEmail): string {
    return d.eligeContrasena
      ? 'Te dieron de alta en SocialClub. Para empezar a usar tu cuenta, verificá tu email y elegí tu contraseña.'
      : 'Gracias por registrarte en SocialClub. Para poder iniciar sesión, verificá tu email.';
  }

  private accion(d: DatosVerificacionEmail): string {
    return d.eligeContrasena ? 'Elegir mi contraseña' : 'Verificar mi email';
  }

  private aclaracion(d: DatosVerificacionEmail): string {
    return `El enlace vence en ${d.horasValidez} horas y sirve una sola vez. Si no esperabas este email, ignoralo.`;
  }

  protected cuerpoHtml(d: DatosVerificacionEmail): string {
    return `<p style="margin:0 0 16px"><a href="${escapar(d.enlace)}" style="display:inline-block;background:#005fc2;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">${escapar(this.accion(d))}</a></p>
<p style="margin:0 0 8px;color:#475569;font-size:13px">${escapar(this.aclaracion(d))}</p>
<p style="margin:0;color:#94a3b8;font-size:12px">Si el botón no funciona, copiá este enlace en el navegador: ${escapar(d.enlace)}</p>`;
  }

  protected cuerpoTexto(d: DatosVerificacionEmail): string {
    return `${this.accion(d)}: ${d.enlace}\n\n${this.aclaracion(d)}`;
  }
}
