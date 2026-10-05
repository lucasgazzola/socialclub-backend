import {
  estadoDeInscripcion,
  estadoGeneral,
  type DocumentoPresentado,
  type RequisitoExigido,
} from './estado-documental';

/**
 * US-25 (base de US-05/08/24/26/27/28) · Estado documental de una inscripción:
 * cruza lo exigido por disciplina + categoría con lo presentado.
 */
describe('US-25 · estado documental de una inscripción', () => {
  const hoy = new Date(2026, 9, 1); // 01/10/2026
  const inscripcion = { fechaInscripcion: new Date(2026, 8, 20), requisitosDesde: null };
  const apto: RequisitoExigido = {
    tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA',
    plazoDiasTolerancia: 30,
    creadoEn: new Date(2026, 0, 1),
    categoriaDisciplinaId: null,
  };
  const autorizacion: RequisitoExigido = {
    tipoDocumento: 'AUTORIZACION_PADRES_TUTORES',
    plazoDiasTolerancia: 0,
    creadoEn: new Date(2026, 0, 1),
    categoriaDisciplinaId: 7,
  };
  const doc = (
    tipoDocumento: DocumentoPresentado['tipoDocumento'],
    vence: Date,
    id = 1,
    creadoEn = new Date(2026, 8, 25),
  ): DocumentoPresentado => ({ id, tipoDocumento, fechaVencimiento: vence, creadoEn });

  it('sin requisitos la inscripción está habilitada', () => {
    expect(estadoDeInscripcion(inscripcion, [], [], [], hoy)).toEqual(
      expect.objectContaining({ estado: 'HABILITADO', motivos: [], documentos: [] }),
    );
  });

  it('habilita si todos los documentos exigidos están vigentes', () => {
    const r = estadoDeInscripcion(
      inscripcion,
      [apto],
      [doc('CERTIFICADO_MEDICO_APTITUD_FISICA', new Date(2027, 5, 1))],
      [],
      hoy,
    );
    expect(r.estado).toBe('HABILITADO');
    expect(r.documentos[0]).toEqual(
      expect.objectContaining({ estado: 'VIGENTE', origen: 'DISCIPLINA', documentoId: 1 }),
    );
  });

  it('US-25 · TC-181: marca "Por vencer" un documento que vence dentro de los próximos 30 días, sin bloquear', () => {
    const r = estadoDeInscripcion(
      inscripcion,
      [apto],
      [doc('CERTIFICADO_MEDICO_APTITUD_FISICA', new Date(2026, 9, 20))],
      [],
      hoy,
    );
    expect(r.documentos[0].estado).toBe('POR_VENCER');
    expect(r.estado).toBe('HABILITADO');
  });

  it('un documento que vence hoy sigue siendo válido', () => {
    const r = estadoDeInscripcion(
      inscripcion,
      [apto],
      [doc('CERTIFICADO_MEDICO_APTITUD_FISICA', hoy)],
      [],
      hoy,
    );
    expect(r.documentos[0].estado).toBe('POR_VENCER');
    expect(r.estado).toBe('HABILITADO');
  });

  it('US-25 · TC-182: queda pendiente si falta un documento y el plazo no venció, con la fecha límite', () => {
    const r = estadoDeInscripcion(inscripcion, [apto], [], [], hoy);
    expect(r.estado).toBe('PENDIENTE');
    expect(r.documentos[0].estado).toBe('FALTANTE');
    expect(r.documentos[0].fechaLimite).toEqual(new Date(2026, 9, 20)); // 20/09 + 30 días
    expect(r.motivos).toEqual([
      'Certificado médico de aptitud física: falta presentarlo hasta el 20/10/2026',
    ]);
  });

  it('US-25 · TC-183: bloquea si el plazo de presentación venció sin el documento', () => {
    const r = estadoDeInscripcion(inscripcion, [autorizacion], [], [], hoy);
    expect(r.estado).toBe('BLOQUEADO');
    expect(r.documentos[0].origen).toBe('CATEGORIA');
    expect(r.motivos).toEqual([
      'Autorización de padres/tutores: no se presentó (el plazo venció el 20/09/2026)',
    ]);
  });

  it('con plazo 0 queda pendiente el mismo día de la inscripción', () => {
    const r = estadoDeInscripcion(
      { fechaInscripcion: hoy, requisitosDesde: null },
      [autorizacion],
      [],
      [],
      hoy,
    );
    expect(r.estado).toBe('PENDIENTE');
  });

  it('US-25 · TC-183: bloquea con un documento vencido e indica cuál', () => {
    const r = estadoDeInscripcion(
      inscripcion,
      [apto],
      [doc('CERTIFICADO_MEDICO_APTITUD_FISICA', new Date(2026, 8, 30))],
      [],
      hoy,
    );
    expect(r.estado).toBe('BLOQUEADO');
    expect(r.motivos).toEqual(['Certificado médico de aptitud física: vencido el 30/09/2026']);
  });

  it('una renovación (documento más nuevo del mismo tipo) reemplaza al vencido', () => {
    const r = estadoDeInscripcion(
      inscripcion,
      [apto],
      [
        doc('CERTIFICADO_MEDICO_APTITUD_FISICA', new Date(2026, 8, 30), 1, new Date(2026, 0, 10)),
        doc('CERTIFICADO_MEDICO_APTITUD_FISICA', new Date(2027, 8, 30), 2, new Date(2026, 8, 30)),
      ],
      [],
      hoy,
    );
    expect(r.estado).toBe('HABILITADO');
    expect(r.documentos[0].documentoId).toBe(2);
  });

  it('un requisito agregado después de la inscripción cuenta el plazo desde que rige', () => {
    const nuevo = { ...apto, creadoEn: new Date(2026, 8, 28) };
    const r = estadoDeInscripcion(inscripcion, [nuevo], [], [], hoy);
    expect(r.documentos[0].fechaLimite).toEqual(new Date(2026, 9, 28));
  });

  it('el cambio de categoría reinicia el plazo (requisitosDesde)', () => {
    const r = estadoDeInscripcion(
      { fechaInscripcion: new Date(2025, 0, 1), requisitosDesde: new Date(2026, 8, 30) },
      [autorizacion],
      [],
      [],
      hoy,
    );
    expect(r.estado).toBe('BLOQUEADO');
    expect(r.documentos[0].fechaLimite).toEqual(new Date(2026, 8, 30));
  });

  it('una habilitación excepcional vigente levanta el bloqueo', () => {
    const r = estadoDeInscripcion(
      inscripcion,
      [autorizacion],
      [],
      [{ hasta: new Date(2026, 9, 15) }],
      hoy,
    );
    expect(r.estado).toBe('HABILITADO');
    expect(r.habilitadoExcepcionalmenteHasta).toEqual(new Date(2026, 9, 15));
  });

  it('una habilitación excepcional vencida no levanta el bloqueo', () => {
    const r = estadoDeInscripcion(
      inscripcion,
      [autorizacion],
      [],
      [{ hasta: new Date(2026, 8, 25) }],
      hoy,
    );
    expect(r.estado).toBe('BLOQUEADO');
  });

  it('ignora documentos sin tipo del catálogo (cargados antes del catálogo)', () => {
    const r = estadoDeInscripcion(inscripcion, [apto], [doc(null, new Date(2027, 0, 1))], [], hoy);
    expect(r.documentos[0].estado).toBe('FALTANTE');
  });

  it('el estado del participante es el peor de sus inscripciones', () => {
    expect(estadoGeneral(['HABILITADO', 'PENDIENTE'])).toBe('PENDIENTE');
    expect(estadoGeneral(['PENDIENTE', 'BLOQUEADO', 'HABILITADO'])).toBe('BLOQUEADO');
    expect(estadoGeneral(['HABILITADO'])).toBe('HABILITADO');
    expect(estadoGeneral([])).toBeNull();
  });
});
