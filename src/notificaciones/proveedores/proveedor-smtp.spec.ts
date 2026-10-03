import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { ProveedorSmtp } from './proveedor-smtp';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

/** DT-36 · ProveedorSmtp (adapter de nodemailer). */
describe('DT-36 · ProveedorSmtp', () => {
  const sendMail = jest.fn();
  const contenido = { asunto: 'Asunto', texto: 'Texto', html: '<p>Texto</p>' };
  const proveedorCon = (env: Record<string, string>) => new ProveedorSmtp(new ConfigService(env));

  beforeEach(() => {
    jest.clearAllMocks();
    (createTransport as jest.Mock).mockReturnValue({ sendMail });
  });

  it('sin SMTP_HOST queda sin configurar', () => {
    expect(proveedorCon({}).configurado).toBe(false);
  });

  it('envía con el remitente configurado', async () => {
    const smtp = proveedorCon({
      SMTP_HOST: 'smtp-relay.brevo.com',
      SMTP_PORT: '587',
      SMTP_USER: 'usuario',
      SMTP_PASS: 'clave',
      MAIL_FROM: 'avisos@club.test',
    });

    await smtp.enviar('delegado@club.test', contenido);

    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: { user: 'usuario', pass: 'clave' },
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'avisos@club.test',
      to: 'delegado@club.test',
      subject: 'Asunto',
      text: 'Texto',
      html: '<p>Texto</p>',
    });
  });

  it('usa conexión segura en el puerto 465 y reutiliza la conexión', async () => {
    const smtp = proveedorCon({ SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_USER: 'u' });

    await smtp.enviar('a@club.test', contenido);
    await smtp.enviar('b@club.test', contenido);

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true }),
    );
  });
});
