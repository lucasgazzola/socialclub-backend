import { VerificacionEmailPlantilla } from './verificacion-email.plantilla';
import type { ContenidoEmail } from '../notificaciones/notificaciones.types';

/** DT-54 — Email con el enlace de verificación. */
describe('VerificacionEmailPlantilla (DT-54)', () => {
  const plantilla = new VerificacionEmailPlantilla();
  const contexto = { appUrl: 'https://socialclub.test' };
  const datos = {
    nombre: 'Ana <b>',
    enlace: 'https://socialclub.test/verificar-email?token=abc',
    horasValidez: 24,
    eligeContrasena: true,
  };

  const email = (d = datos) => plantilla.contenidoPara('EMAIL', d, contexto) as ContenidoEmail;

  it('a una cuenta creada por el club la invita a elegir su contraseña', () => {
    const { asunto, html, texto } = email();

    expect(asunto).toBe('SocialClub · Activá tu cuenta');
    expect(html).toContain('href="https://socialclub.test/verificar-email?token=abc"');
    expect(html).toContain('Elegir mi contraseña');
    expect(texto).toContain(
      'Elegir mi contraseña: https://socialclub.test/verificar-email?token=abc',
    );
    expect(texto).toContain('vence en 24 horas y sirve una sola vez');
  });

  it('a quien se registró solo le pide verificar el email', () => {
    const { asunto, html } = email({ ...datos, eligeContrasena: false });

    expect(asunto).toBe('SocialClub · Verificá tu email');
    expect(html).toContain('Verificar mi email');
  });

  it('escapa los datos de la persona en el HTML', () => {
    expect(email().html).toContain('Ana &lt;b&gt;');
  });
});
