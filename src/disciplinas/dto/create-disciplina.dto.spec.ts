import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDisciplinaDto } from './create-disciplina.dto';

/**
 * US-44 · Agregar disciplina — validación de la documentación obligatoria:
 * si la disciplina exige documentación, debe seleccionarse al menos un
 * documento del catálogo.
 */
describe('US-44 · CreateDisciplinaDto', () => {
  const validar = (datos: object) => validate(plainToInstance(CreateDisciplinaDto, datos));

  it('acepta una disciplina que exige documentación con documentos del catálogo', async () => {
    const errores = await validar({
      nombre: 'Fútbol',
      solicitaDocumentacion: true,
      requerimientosDocumentacion: [
        { tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA', plazoDiasTolerancia: 30 },
      ],
    });
    expect(errores).toHaveLength(0);
  });

  it('acepta una disciplina que no exige documentación sin requisitos', async () => {
    expect(await validar({ nombre: 'Ajedrez', solicitaDocumentacion: false })).toHaveLength(0);
  });

  it('rechaza exigir documentación sin seleccionar ningún documento', async () => {
    const errores = await validar({
      nombre: 'Fútbol',
      solicitaDocumentacion: true,
      requerimientosDocumentacion: [],
    });
    expect(errores.some((e) => e.property === 'requerimientosDocumentacion')).toBe(true);
  });

  it('rechaza exigir documentación si no se envía la lista', async () => {
    const errores = await validar({ nombre: 'Fútbol', solicitaDocumentacion: true });
    expect(errores.some((e) => e.property === 'requerimientosDocumentacion')).toBe(true);
  });

  it('rechaza un tipo de documento que no pertenece al catálogo', async () => {
    const errores = await validar({
      nombre: 'Fútbol',
      solicitaDocumentacion: true,
      requerimientosDocumentacion: [{ tipoDocumento: 'CV', plazoDiasTolerancia: 0 }],
    });
    expect(errores.some((e) => e.property === 'requerimientosDocumentacion')).toBe(true);
  });

  it('rechaza un plazo de presentación negativo', async () => {
    const errores = await validar({
      nombre: 'Fútbol',
      solicitaDocumentacion: true,
      requerimientosDocumentacion: [{ tipoDocumento: 'DNI', plazoDiasTolerancia: -1 }],
    });
    expect(errores.some((e) => e.property === 'requerimientosDocumentacion')).toBe(true);
  });
});
