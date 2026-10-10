import {
  estadoDeInscripcion,
  type DocumentoPresentado,
  type RequisitoExigido,
} from './estado-documental';

/**
 * US-27: Bloquear participante ante documentación vencida.
 * Trazabilidad de casos de prueba TC-186 a TC-190.
 */
describe('US-27 · Bloqueo de participante ante documentación vencida', () => {
  const hoy = new Date(2026, 9, 1); // 01/10/2026

  const inscripcionFutbol = {
    fechaInscripcion: new Date(2026, 8, 1), // 01/09/2026
    requisitosDesde: null,
  };

  const inscripcionAjedrez = {
    fechaInscripcion: new Date(2026, 8, 1),
    requisitosDesde: null,
  };

  const reqAptoFisico: RequisitoExigido = {
    tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA',
    plazoDiasTolerancia: 15,
    creadoEn: new Date(2026, 0, 1),
    categoriaDisciplinaId: null,
  };

  const reqAutorizacionMenor: RequisitoExigido = {
    tipoDocumento: 'AUTORIZACION_PADRES_TUTORES',
    plazoDiasTolerancia: 0,
    creadoEn: new Date(2026, 0, 1),
    categoriaDisciplinaId: 10,
  };

  const reqDni: RequisitoExigido = {
    tipoDocumento: 'DNI',
    plazoDiasTolerancia: 30,
    creadoEn: new Date(2026, 0, 1),
    categoriaDisciplinaId: null,
  };

  const crearDoc = (
    tipoDocumento: DocumentoPresentado['tipoDocumento'],
    vence: Date,
    id = 1,
    creadoEn = new Date(2026, 8, 1),
  ): DocumentoPresentado => ({
    id,
    tipoDocumento,
    fechaVencimiento: vence,
    creadoEn,
  });

  it('US-27 · TC-186: bloquea automáticamente cuando un documento está vencido o se cumple el plazo de presentación sin haberlo cargado', () => {
    // 1. Documento vencido (venció el 30/09/2026, hoy es 01/10/2026)
    const docVencido = crearDoc('CERTIFICADO_MEDICO_APTITUD_FISICA', new Date(2026, 8, 30));
    const resVencido = estadoDeInscripcion(inscripcionFutbol, [reqAptoFisico], [docVencido], [], hoy);
    expect(resVencido.estado).toBe('BLOQUEADO');
    expect(resVencido.documentos[0].estado).toBe('VENCIDO');

    // 2. Plazo de presentación cumplido sin haberlo cargado (plazo 15 días desde 01/09 = 16/09/2026)
    const resFaltanteVencido = estadoDeInscripcion(inscripcionFutbol, [reqAptoFisico], [], [], hoy);
    expect(resFaltanteVencido.estado).toBe('BLOQUEADO');
    expect(resFaltanteVencido.documentos[0].estado).toBe('FALTANTE');
  });

  it('US-27 · TC-187: el bloqueo afecta únicamente a las inscripciones (disciplina/categoría) que exigen este documento', () => {
    // El participante tiene cargado sólo DNI vigente para Ajedrez, y el Apto Médico está vencido para Fútbol.
    const docs = [
      crearDoc('DNI', new Date(2027, 5, 1), 1),
      crearDoc('CERTIFICADO_MEDICO_APTITUD_FISICA', new Date(2026, 8, 25), 2), // vencido
    ];

    // Inscripción a Fútbol (exige Apto Médico): queda BLOQUEADA
    const estadoFutbol = estadoDeInscripcion(inscripcionFutbol, [reqAptoFisico], docs, [], hoy);
    expect(estadoFutbol.estado).toBe('BLOQUEADO');

    // Inscripción a Ajedrez (solo exige DNI): queda HABILITADA
    const estadoAjedrez = estadoDeInscripcion(inscripcionAjedrez, [reqDni], docs, [], hoy);
    expect(estadoAjedrez.estado).toBe('HABILITADO');
  });

  it('US-27 · TC-188: el sistema indica el motivo del bloqueo especificando qué documento está vencido o faltante', () => {
    const docs = [crearDoc('CERTIFICADO_MEDICO_APTITUD_FISICA', new Date(2026, 8, 30))];
    const res = estadoDeInscripcion(
      inscripcionFutbol,
      [reqAptoFisico, reqAutorizacionMenor],
      docs,
      [],
      hoy,
    );

    expect(res.estado).toBe('BLOQUEADO');
    expect(res.motivos).toContain(
      'Certificado médico de aptitud física: vencido el 30/09/2026',
    );
    expect(res.motivos).toContain(
      'Autorización de padres/tutores: no se presentó (el plazo venció el 01/09/2026)',
    );
  });

  it('US-27 · TC-189: el sistema levanta el bloqueo automáticamente al cargar un documento vigente que cubra el requisito', () => {
    // Inicialmente bloqueado por documento vencido
    const docAntiguo = crearDoc('CERTIFICADO_MEDICO_APTITUD_FISICA', new Date(2026, 8, 30), 1, new Date(2025, 8, 30));
    const bloqueado = estadoDeInscripcion(inscripcionFutbol, [reqAptoFisico], [docAntiguo], [], hoy);
    expect(bloqueado.estado).toBe('BLOQUEADO');

    // Se carga una renovación vigente (fecha de vencimiento 2027)
    const renovacionVigente = crearDoc(
      'CERTIFICADO_MEDICO_APTITUD_FISICA',
      new Date(2027, 8, 30),
      2,
      new Date(2026, 9, 1),
    );
    const levantado = estadoDeInscripcion(
      inscripcionFutbol,
      [reqAptoFisico],
      [docAntiguo, renovacionVigente],
      [],
      hoy,
    );

    expect(levantado.estado).toBe('HABILITADO');
    expect(levantado.documentos[0].estado).toBe('VIGENTE');
    expect(levantado.documentos[0].documentoId).toBe(2);
  });

  it('US-27 · TC-190: el sistema levanta el bloqueo ante una excepción administrativa vigente registrada por un administrador', () => {
    const docVencido = crearDoc('CERTIFICADO_MEDICO_APTITUD_FISICA', new Date(2026, 8, 30));
    const habilitacionExcepcional = [{ hasta: new Date(2026, 9, 20) }]; // vigente hasta el 20/10/2026

    const res = estadoDeInscripcion(
      inscripcionFutbol,
      [reqAptoFisico],
      [docVencido],
      habilitacionExcepcional,
      hoy,
    );

    expect(res.estado).toBe('HABILITADO');
    expect(res.habilitadoExcepcionalmenteHasta).toEqual(new Date(2026, 9, 20));
    expect(res.motivos).toEqual([
      'Certificado médico de aptitud física: vencido el 30/09/2026',
    ]);
  });
});
