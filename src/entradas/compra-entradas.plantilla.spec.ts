import { CompraEntradasPlantilla, type DatosCompraEntradas } from './compra-entradas.plantilla';

describe('DT-36 / DT-31 · CompraEntradasPlantilla', () => {
  const plantilla = new CompraEntradasPlantilla();
  const datos: DatosCompraEntradas = {
    eventoNombre: 'Torneo <Primavera>',
    fechaEvento: '15/11/2026',
    lugarAcreditacion: 'Gimnasio Principal',
    cantidad: 2,
    precioUnitario: '$5.000,00',
    montoTotal: '$10.000,00',
  };

  it('arma asunto, texto y HTML con los datos de la compra escapando caracteres', () => {
    const email = plantilla.email(datos, { appUrl: 'https://club.test' });

    expect(email.asunto).toBe('SocialClub · Confirmación de compra: Torneo <Primavera>');
    expect(email.texto).toContain('Torneo <Primavera>');
    expect(email.texto).toContain('Cantidad: 2');
    expect(email.texto).toContain('Total abonado: $10.000,00');
    expect(email.texto).toContain('Revisalo en https://club.test');

    expect(email.html).toContain('Torneo &lt;Primavera&gt;');
    expect(email.html).toContain('Gimnasio Principal');
    expect(email.html).toContain('$10.000,00');
    expect(email.html).toContain('href="https://club.test"');
  });

  it('solo arma contenido para el canal de email', () => {
    expect(plantilla.contenidoPara('EMAIL', datos, {})).toMatchObject({
      asunto: 'SocialClub · Confirmación de compra: Torneo <Primavera>',
    });
    // @ts-expect-error canal inválido
    expect(plantilla.contenidoPara('PUSH', datos, {})).toBeNull();
  });
});
