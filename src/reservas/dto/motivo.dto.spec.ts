import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MotivoReservaDto } from './motivo.dto';

/** US-60 / US-61 — El motivo del rechazo o de la cancelación es obligatorio. */
describe('US-60/61 · MotivoReservaDto', () => {
  const errores = (body: object) =>
    validateSync(plainToInstance(MotivoReservaDto, body)).flatMap((e) =>
      Object.values(e.constraints ?? {}),
    );

  it('TC-277 · rechaza un motivo ausente o en blanco con mensajes en español', () => {
    expect(errores({})).toEqual([
      'El motivo debe tener entre 5 y 500 caracteres',
      'El motivo es obligatorio',
    ]);
    expect(errores({ motivo: '    ' })).toEqual(['El motivo debe tener entre 5 y 500 caracteres']);
  });

  it('acepta un motivo válido y le quita los espacios de los extremos', () => {
    const dto = plainToInstance(MotivoReservaDto, { motivo: '  Torneo oficial  ' });
    expect(validateSync(dto)).toEqual([]);
    expect(dto.motivo).toBe('Torneo oficial');
  });
});
