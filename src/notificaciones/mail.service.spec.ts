import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { MailService } from './mail.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

/** US-26 · MailService: SMTP genérico; sin configuración no envía. */
describe('US-26 · MailService', () => {
  const sendMail = jest.fn();
  const email = {
    destinatarios: ['a@club.test', 'b@club.test'],
    asunto: 'Asunto',
    texto: 'Texto',
    html: '<p>Texto</p>',
  };
  const servicioCon = (env: Record<string, string>) =>
    new MailService({ get: (k: string) => env[k] } as unknown as ConfigService);

  beforeEach(() => {
    jest.clearAllMocks();
    (createTransport as jest.Mock).mockReturnValue({ sendMail });
  });

  it('sin SMTP_HOST no envía y devuelve false', async () => {
    const mail = servicioCon({});
    expect(mail.configurado).toBe(false);
    await expect(mail.enviar(email)).resolves.toBe(false);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('envía con los destinatarios en copia oculta', async () => {
    const mail = servicioCon({
      SMTP_HOST: 'smtp-relay.brevo.com',
      SMTP_PORT: '587',
      SMTP_USER: 'usuario',
      SMTP_PASS: 'clave',
      MAIL_FROM: 'SocialClub <avisos@club.test>',
    });

    await expect(mail.enviar(email)).resolves.toBe(true);

    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: { user: 'usuario', pass: 'clave' },
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'SocialClub <avisos@club.test>',
      to: 'SocialClub <avisos@club.test>',
      bcc: ['a@club.test', 'b@club.test'],
      subject: 'Asunto',
      text: 'Texto',
      html: '<p>Texto</p>',
    });
  });

  it('usa conexión segura en el puerto 465', async () => {
    await servicioCon({ SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_USER: 'u' }).enviar(
      email,
    );
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true }),
    );
  });
});
