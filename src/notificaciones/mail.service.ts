import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export interface EmailSaliente {
  destinatarios: string[];
  asunto: string;
  texto: string;
  html: string;
}

/**
 * Envío de emails por SMTP (US-26). Funciona con cualquier proveedor que dé
 * SMTP, incluidos los gratuitos (Brevo, Gmail con contraseña de aplicación,
 * Mailtrap para pruebas). Sin `SMTP_HOST` no envía nada: lo deja en el log,
 * así desarrollo y tests no necesitan un servidor de correo.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
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

  /** Envía un email; devuelve false si el SMTP no está configurado. */
  async enviar(email: EmailSaliente): Promise<boolean> {
    if (!this.configurado) {
      this.logger.warn(
        `SMTP no configurado: no se envió "${email.asunto}" a ${email.destinatarios.length} destinatario(s).`,
      );
      return false;
    }
    const remitente = this.config.get<string>('MAIL_FROM') ?? this.config.get<string>('SMTP_USER');
    // Los destinatarios van en copia oculta: no se exponen los emails entre sí.
    await this.transporte().sendMail({
      from: remitente,
      to: remitente,
      bcc: email.destinatarios,
      subject: email.asunto,
      text: email.texto,
      html: email.html,
    });
    return true;
  }
}
