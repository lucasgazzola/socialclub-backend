import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDocumentacionDto } from './create-documentacion.dto';

/**
 * US-24 · Validación del DTO: un documento obligatorio NO se puede guardar sin
 * fecha de vencimiento (criterio de aceptación).
 */
describe('US-24 · CreateDocumentacionDto', () => {
  it('acepta un documento con tipo, fecha e integrante', async () => {
    const dto = plainToInstance(CreateDocumentacionDto, {
      tipo: 'Apto físico',
      fechaVencimiento: '2026-12-31',
      personaId: 1,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza si falta la fecha de vencimiento', async () => {
    const dto = plainToInstance(CreateDocumentacionDto, {
      tipo: 'Apto físico',
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
    expect(errores.some((e) => e.property === 'tipo')).toBe(true);
  });
});
