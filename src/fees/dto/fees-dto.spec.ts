import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConfigureFeeDto } from './configure-fee.dto';
import { UpdateFeeDto } from './update-fee.dto';

describe('ConfigureFeeDto', () => {
  it('acepta un monto válido con período de aplicación opcional', async () => {
    const dto = plainToInstance(ConfigureFeeDto, {
      disciplineId: 1,
      categoryId: 1,
      amount: 15000,
      appliedPeriod: '2026-09',
    });

    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
  });

  it('rechaza monto igual a 0', async () => {
    const dto = plainToInstance(ConfigureFeeDto, {
      disciplineId: 1,
      categoryId: 1,
      amount: 0,
    });

    const errores = await validate(dto);
    expect(errores.length).toBeGreaterThan(0);
    expect(errores.some((e) => e.property === 'amount')).toBe(true);
  });

  it('rechaza monto negativo', async () => {
    const dto = plainToInstance(ConfigureFeeDto, {
      disciplineId: 1,
      categoryId: 1,
      amount: -100,
    });

    const errores = await validate(dto);
    expect(errores.some((e) => e.property === 'amount')).toBe(true);
  });

  it('rechaza monto nulo', async () => {
    const dto = plainToInstance(ConfigureFeeDto, {
      disciplineId: 1,
      categoryId: 1,
      amount: null,
    });

    const errores = await validate(dto);
    expect(errores.some((e) => e.property === 'amount')).toBe(true);
  });

  it('rechaza un período de aplicación mal formateado', async () => {
    const dto = plainToInstance(ConfigureFeeDto, {
      disciplineId: 1,
      categoryId: 1,
      amount: 15000,
      appliedPeriod: '2026-13',
    });

    const errores = await validate(dto);
    expect(errores.some((e) => e.property === 'appliedPeriod')).toBe(true);
  });

  it('rechaza ids no enteros', async () => {
    const dto = plainToInstance(ConfigureFeeDto, {
      disciplineId: 'a',
      categoryId: 1,
      amount: 15000,
    });

    const errores = await validate(dto);
    expect(errores.some((e) => e.property === 'disciplineId')).toBe(true);
  });
});

describe('UpdateFeeDto', () => {
  it('rechaza monto igual a 0', async () => {
    const dto = plainToInstance(UpdateFeeDto, { amount: 0 });

    const errores = await validate(dto);
    expect(errores.some((e) => e.property === 'amount')).toBe(true);
  });

  it('acepta actualizar solo el monto (mayor a cero)', async () => {
    const dto = plainToInstance(UpdateFeeDto, { amount: 20000 });

    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
  });
});
