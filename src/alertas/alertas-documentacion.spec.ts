import type { EstadoDeDocumento } from '../documentacion/estado-documental';
import {
  alertasDeDocumentacion,
  DIAS_ALERTA,
  type InscripcionConEstado,
} from './alertas-documentacion';

/**
 * US-26 · Cálculo de alertas: documentos que vencen o cuyo plazo de
 * presentación termina en los próximos 10 días, y los ya vencidos.
 */
describe('US-26 · alertasDeDocumentacion', () => {
  const hoy = new Date(2026, 9, 3);
  const enDias = (n: number) => new Date(2026, 9, 3 + n);

  const presentado = (tipo: string, vence: Date, id = 1): EstadoDeDocumento => ({
    tipoDocumento: tipo as EstadoDeDocumento['tipoDocumento'],
    etiqueta: tipo === 'DNI' ? 'DNI' : 'Certificado médico de aptitud física',
    origen: 'DISCIPLINA',
    plazoDiasTolerancia: 30,
    estado: 'POR_VENCER',
    documentoId: id,
    fechaVencimiento: vence,
    fechaLimite: null,
  });
  const faltante = (limite: Date): EstadoDeDocumento => ({
    tipoDocumento: 'AUTORIZACION_PADRES_TUTORES',
    etiqueta: 'Autorización de padres/tutores',
    origen: 'CATEGORIA',
    plazoDiasTolerancia: 15,
    estado: 'FALTANTE',
    documentoId: null,
    fechaVencimiento: null,
    fechaLimite: limite,
  });
  const inscripcion = (
    documentos: EstadoDeDocumento[],
    participante = 'Gómez, Lola',
    id = 5,
  ): InscripcionConEstado => ({
    inscripcionId: id,
    personaId: 10,
    participante,
    disciplinaId: 1,
    disciplina: 'Fútbol',
    categoria: 'Sub-15',
    documentos,
  });

  it('la ventana de aviso es de 10 días', () => {
    expect(DIAS_ALERTA).toBe(10);
  });

  it('avisa un documento que vence dentro de los próximos 10 días, con sus datos', () => {
    const [alerta] = alertasDeDocumentacion(
      [inscripcion([presentado('CERTIFICADO_MEDICO_APTITUD_FISICA', enDias(4))])],
      hoy,
    );
    expect(alerta).toMatchObject({
      tipo: 'POR_VENCER',
      participante: 'Gómez, Lola',
      disciplina: 'Fútbol',
      categoria: 'Sub-15',
      documento: 'Certificado médico de aptitud física',
      diasRestantes: 4,
      mensaje: 'Vence en 4 días (07/10/2026)',
    });
    expect(alerta.fecha).toEqual(enDias(4));
  });

  it('incluye el día 10 y deja afuera el 11', () => {
    const alertas = alertasDeDocumentacion(
      [
        inscripcion([
          presentado('CERTIFICADO_MEDICO_APTITUD_FISICA', enDias(10)),
          presentado('DNI', enDias(11), 2),
        ]),
      ],
      hoy,
    );
    expect(alertas.map((a) => a.diasRestantes)).toEqual([10]);
  });

  it('avisa un faltante cuyo plazo de presentación termina en los próximos 10 días', () => {
    const [alerta] = alertasDeDocumentacion([inscripcion([faltante(enDias(1))])], hoy);
    expect(alerta).toMatchObject({
      tipo: 'PRESENTACION_POR_VENCER',
      documento: 'Autorización de padres/tutores',
      mensaje: 'Falta presentarlo: el plazo termina mañana (04/10/2026)',
    });
  });

  it('marca lo vencido y los plazos terminados, y los pone primero', () => {
    const alertas = alertasDeDocumentacion(
      [
        inscripcion([presentado('CERTIFICADO_MEDICO_APTITUD_FISICA', enDias(2))], 'Abad, Ana', 1),
        inscripcion([presentado('DNI', enDias(-3), 2)], 'Ruiz, Tomás', 2),
        inscripcion([faltante(enDias(-1))], 'Díaz, Valentina', 3),
      ],
      hoy,
    );
    expect(alertas.map((a) => [a.tipo, a.participante])).toEqual([
      ['VENCIDO', 'Ruiz, Tomás'],
      ['PRESENTACION_VENCIDA', 'Díaz, Valentina'],
      ['POR_VENCER', 'Abad, Ana'],
    ]);
    expect(alertas[0].mensaje).toBe('Venció el 30/09/2026');
  });

  it('no avisa lo que está vigente más allá de la ventana', () => {
    expect(
      alertasDeDocumentacion(
        [
          inscripcion([
            presentado('CERTIFICADO_MEDICO_APTITUD_FISICA', enDias(45)),
            faltante(enDias(20)),
          ]),
        ],
        hoy,
      ),
    ).toEqual([]);
  });

  it('una fecha guardada a las 00:00 UTC se informa en su día, no en el anterior', () => {
    const [alerta] = alertasDeDocumentacion(
      [inscripcion([presentado('DNI', new Date('2026-10-07T00:00:00.000Z'))])],
      hoy,
    );
    expect(alerta.mensaje).toBe('Vence en 4 días (07/10/2026)');
    expect(alerta.clave).toBe('5:DNI:POR_VENCER:2026-10-07');
  });

  it('la clave identifica inscripción, documento, tipo de alerta y fecha', () => {
    const [alerta] = alertasDeDocumentacion(
      [inscripcion([presentado('CERTIFICADO_MEDICO_APTITUD_FISICA', enDias(0))])],
      hoy,
    );
    expect(alerta.clave).toBe('5:CERTIFICADO_MEDICO_APTITUD_FISICA:POR_VENCER:2026-10-03');
    expect(alerta.mensaje).toBe('Vence hoy (03/10/2026)');
  });
});
