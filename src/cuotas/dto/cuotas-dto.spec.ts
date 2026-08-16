import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConfigurarCuotaDto } from './configurar-cuota.dto';
import { ActualizarCuotaDto } from './actualizar-cuota.dto';

describe('ConfigurarCuotaDto', () => {
  it('acepta un monto válido con período de aplicación opcional', async () => {
    const dto = plainToInstance(ConfigurarCuotaDto, {
      disciplinaId: 1,
      categoriaId: 1,
      monto: 15000,
      periodoAplicacion: '2026-09',
    });

    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
  });

  it('rechaza monto igual a 0', async () => {
    const dto = plainToInstance(ConfigurarCuotaDto, {
      disciplinaId: 1,
      categoriaId: 1,
      monto: 0,
    });

    const errores = await validate(dto);
    expect(errores.length).toBeGreaterThan(0);
    expect(errores.some((e) => e.property === 'monto')).toBe(true);
  });

  it('rechaza monto negativo', async () => {
    const dto = plainToInstance(ConfigurarCuotaDto, {
      disciplinaId: 1,
      categoriaId: 1,
      monto: -100,
    });

    const errores = await validate(dto);
    expect(errores.some((e) => e.property === 'monto')).toBe(true);
  });

  it('rechaza monto nulo', async () => {
    const dto = plainToInstance(ConfigurarCuotaDto, {
      disciplinaId: 1,
      categoriaId: 1,
      monto: null,
    });

    const errores = await validate(dto);
    expect(errores.some((e) => e.property === 'monto')).toBe(true);
  });

  it('rechaza un período de aplicación mal formateado', async () => {
    const dto = plainToInstance(ConfigurarCuotaDto, {
      disciplinaId: 1,
      categoriaId: 1,
      monto: 15000,
      periodoAplicacion: '2026-13',
    });

    const errores = await validate(dto);
    expect(errores.some((e) => e.property === 'periodoAplicacion')).toBe(true);
  });

  it('rechaza ids no enteros', async () => {
    const dto = plainToInstance(ConfigurarCuotaDto, {
      disciplinaId: 'a',
      categoriaId: 1,
      monto: 15000,
    });

    const errores = await validate(dto);
    expect(errores.some((e) => e.property === 'disciplinaId')).toBe(true);
  });
});

describe('ActualizarCuotaDto', () => {
  it('rechaza monto igual a 0', async () => {
    const dto = plainToInstance(ActualizarCuotaDto, { monto: 0 });

    const errores = await validate(dto);
    expect(errores.some((e) => e.property === 'monto')).toBe(true);
  });

  it('acepta actualizar solo el monto (mayor a cero)', async () => {
    const dto = plainToInstance(ActualizarCuotaDto, { monto: 20000 });

    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
  });
});
