import {
  cuotaVencida,
  DIA_VENCIMIENTO_CUOTA_DEPORTIVA,
  fechaVencimiento,
} from './vencimiento-cuota-deportiva';

/** US-23 · La cuota deportiva de un mes vence el día 10 de ese mes. */
describe('US-23 · Vencimiento de la cuota deportiva', () => {
  it('vence el día 10', () => {
    expect(DIA_VENCIMIENTO_CUOTA_DEPORTIVA).toBe(10);
    expect(fechaVencimiento('2026-10')).toBe('2026-10-10');
  });

  it('la cuota del mes en curso no venció hasta el día 10 inclusive', () => {
    expect(cuotaVencida('2026-10', new Date(2026, 9, 1))).toBe(false);
    expect(cuotaVencida('2026-10', new Date(2026, 9, 10, 23, 59))).toBe(false);
  });

  it('desde el día 11 la cuota del mes en curso está vencida', () => {
    expect(cuotaVencida('2026-10', new Date(2026, 9, 11))).toBe(true);
  });

  it('las cuotas de meses anteriores están vencidas y las futuras no', () => {
    const hoy = new Date(2026, 9, 5);
    expect(cuotaVencida('2026-09', hoy)).toBe(true);
    expect(cuotaVencida('2025-12', hoy)).toBe(true);
    expect(cuotaVencida('2026-11', hoy)).toBe(false);
  });
});
