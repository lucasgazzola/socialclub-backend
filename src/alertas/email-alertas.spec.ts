import type { AlertaDocumentacion } from './alertas-documentacion';
import { asuntoAlertas, emailAlertas } from './email-alertas';

/** US-26 · Email de alertas: cada fila con participante, disciplina, documento y fecha. */
describe('US-26 · emailAlertas', () => {
  const alerta: AlertaDocumentacion = {
    clave: 'k',
    tipo: 'PRESENTACION_POR_VENCER',
    inscripcionId: 5,
    personaId: 10,
    participante: 'Gómez, <Lola>',
    disciplina: 'Fútbol',
    categoria: 'Sub-15',
    tipoDocumento: 'AUTORIZACION_PADRES_TUTORES',
    documento: 'Autorización de padres/tutores',
    fecha: new Date(2026, 9, 10),
    diasRestantes: 7,
    mensaje: '',
  };

  it('arma el texto plano con los datos de cada alerta', () => {
    const { texto } = emailAlertas([alerta], 'https://club.test');
    expect(texto).toContain(
      '- Gómez, <Lola> (Fútbol · Sub-15): Autorización de padres/tutores. Falta presentar: 10/10/2026.',
    );
    expect(texto).toContain('Revisalo en https://club.test');
  });

  it('escapa el HTML y omite el enlace si no hay URL', () => {
    const { html } = emailAlertas([alerta]);
    expect(html).toContain('Gómez, &lt;Lola&gt;');
    expect(html).not.toContain('<Lola>');
    expect(html).not.toContain('Abrir SocialClub');
  });

  it('el asunto dice cuántas alertas hay', () => {
    expect(asuntoAlertas([alerta])).toBe('SocialClub · 1 alerta de documentación');
    expect(asuntoAlertas([alerta, alerta])).toBe('SocialClub · 2 alertas de documentación');
  });
});
