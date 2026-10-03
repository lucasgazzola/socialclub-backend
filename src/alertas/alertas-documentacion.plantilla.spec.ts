import type { AlertaDocumentacion } from './alertas-documentacion';
import { AlertasDocumentacionPlantilla } from './alertas-documentacion.plantilla';

/**
 * US-26 · DT-36 · Plantilla del email de alertas: completa el esqueleto común
 * (PlantillaEmail) con una fila por alerta.
 */
describe('US-26 · AlertasDocumentacionPlantilla', () => {
  const plantilla = new AlertasDocumentacionPlantilla();
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
    fecha: new Date('2026-10-10T00:00:00.000Z'),
    diasRestantes: 7,
    mensaje: '',
  };

  it('arma asunto, texto y HTML con los datos de cada alerta y el esqueleto común', () => {
    const email = plantilla.email({ alertas: [alerta] }, { appUrl: 'https://club.test' });

    expect(email.asunto).toBe('SocialClub · 1 alerta de documentación');
    expect(email.texto).toContain(
      '- Gómez, <Lola> (Fútbol · Sub-15): Autorización de padres/tutores. Falta presentar: 10/10/2026.',
    );
    expect(email.texto).toContain('Revisalo en https://club.test');
    expect(email.html).toContain('<meta charset="utf-8">');
    expect(email.html).toContain('Alertas de documentación');
    expect(email.html).toContain('Gómez, &lt;Lola&gt;');
    expect(email.html).not.toContain('<Lola>');
    expect(email.html).toContain('href="https://club.test"');
    expect(email.html).toContain('Aviso automático');
  });

  it('pluraliza el asunto y omite el enlace sin URL', () => {
    const email = plantilla.email({ alertas: [alerta, alerta] }, {});
    expect(email.asunto).toBe('SocialClub · 2 alertas de documentación');
    expect(email.html).not.toContain('Abrir SocialClub');
  });

  it('solo arma contenido para el canal de email', () => {
    expect(plantilla.contenidoPara('EMAIL', { alertas: [alerta] }, {})).toMatchObject({
      asunto: 'SocialClub · 1 alerta de documentación',
    });
    expect(plantilla.contenidoPara('PUSH' as never, { alertas: [alerta] }, {})).toBeNull();
  });
});
