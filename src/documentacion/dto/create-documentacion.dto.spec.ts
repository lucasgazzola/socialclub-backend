import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDocumentacionDto } from './create-documentacion.dto';

/**
 * US-24 · Validación del DTO: un documento obligatorio NO se puede guardar sin
 * fecha de vencimiento (criterio de aceptación).
 */
describe('US-24 · CreateDocumentacionDto', () => {
  it('acepta un documento con tipo del catálogo, fecha e integrante', async () => {
    const dto = plainToInstance(CreateDocumentacionDto, {
      tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA',
      fechaVencimiento: '2026-12-31',
      personaId: 1,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza si falta la fecha de vencimiento', async () => {
    const dto = plainToInstance(CreateDocumentacionDto, {
      tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA',
      personaId: 1,
    });
    const errores = await validate(dto);
    expect(errores.some((e) => e.property === 'fechaVencimiento')).toBe(true);
  });

  it('rechaza si falta el tipo de documento', async () => {
    const dto = plainToInstance(CreateDocumentacionDto, {
      fechaVencimiento: '2026-12-31',
      personaId: 1,
    });
    const errores = await validate(dto);
    expect(errores.some((e) => e.property === 'tipoDocumento')).toBe(true);
  });

  it('rechaza un tipo de texto libre que no está en el catálogo', async () => {
    const dto = plainToInstance(CreateDocumentacionDto, {
      tipoDocumento: 'Apto físico',
      fechaVencimiento: '2026-12-31',
      personaId: 1,
    });
    const errores = await validate(dto);
    expect(errores.some((e) => e.property === 'tipoDocumento')).toBe(true);
  });
});
