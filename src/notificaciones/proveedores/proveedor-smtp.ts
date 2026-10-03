import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { ContenidoEmail } from '../notificaciones.types';
import type { ProveedorEmail } from './proveedor-email';

/**
 * Proveedor de email por SMTP (nodemailer). Sirve con cualquier servicio que
 * dé SMTP, incluidos los gratuitos (Brevo, Gmail con contraseña de aplicación,
 * Mailtrap/Mailpit para pruebas). Sin `SMTP_HOST` queda sin configurar.
 */
@Injectable()
export class ProveedorSmtp implements ProveedorEmail {
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  get configurado(): boolean {
    return !!this.config.get<string>('SMTP_HOST');
  }

  private transporte(): Transporter {
    if (!this.transporter) {
      const puerto = Number(this.config.get('SMTP_PORT') ?? 587);
      const usuario = this.config.get<string>('SMTP_USER');
      this.transporter = createTransport({
        host: this.config.get<string>('SMTP_HOST'),
        port: puerto,
        secure: puerto === 465,
        auth: usuario ? { user: usuario, pass: this.config.get<string>('SMTP_PASS') } : undefined,
      });
    }
    return this.transporter;
  }

  async enviar(para: string, contenido: ContenidoEmail): Promise<void> {
    await this.transporte().sendMail({
      from: this.config.get<string>('MAIL_FROM') ?? this.config.get<string>('SMTP_USER'),
      to: para,
      subject: contenido.asunto,
      text: contenido.texto,
      html: contenido.html,
    });
  }
}
