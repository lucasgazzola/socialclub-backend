import {
  aPeriodo,
  eraSocioEn,
  montoACobrar,
  periodosEntre,
  tarifaVigente,
  type TarifaDeportiva,
} from './tarifas';

/** US-20/21 · TASK-33 · Tarifas de la cuota deportiva. */
describe('tarifas de la cuota deportiva', () => {
  const t = (over: Partial<TarifaDeportiva>): TarifaDeportiva => ({
    id: 1,
    categoriaDisciplinaId: null,
    periodoAplicacion: '2026-01',
    monto: 15000,
    descuentoSocioPorcentaje: 20,
    activo: true,
    ...over,
  });
  const futbol = [
    t({ id: 1, periodoAplicacion: '2026-01', monto: 15000 }),
    t({ id: 2, periodoAplicacion: '2026-07', monto: 18000 }),
    t({
      id: 3,
      categoriaDisciplinaId: 7,
      periodoAplicacion: '2026-03',
      monto: 10000,
      descuentoSocioPorcentaje: 0,
    }),
  ];

  describe('tarifaVigente', () => {
    it('usa la tarifa de la disciplina que rige en el período', () => {
      expect(tarifaVigente(futbol, null, '2026-05')?.id).toBe(1);
      expect(tarifaVigente(futbol, null, '2026-08')?.id).toBe(2);
    });

    it('la tarifa de la categoría reemplaza a la de la disciplina desde que rige', () => {
      expect(tarifaVigente(futbol, 7, '2026-02')?.id).toBe(1); // la de categoría todavía no rige
      expect(tarifaVigente(futbol, 7, '2026-08')?.id).toBe(3);
    });

    it('una categoría sin tarifa propia usa la de la disciplina', () => {
      expect(tarifaVigente(futbol, 8, '2026-08')?.id).toBe(2);
    });

    it('devuelve null si no hay tarifa para el período (sin tarifa, no $0)', () => {
      expect(tarifaVigente(futbol, null, '2025-12')).toBeNull();
      expect(tarifaVigente([], null, '2026-05')).toBeNull();
    });

    it('ignora las tarifas desactivadas', () => {
      expect(tarifaVigente([t({ activo: false })], null, '2026-05')).toBeNull();
    });
  });

  describe('montoACobrar', () => {
    it('aplica el descuento de socio', () => {
      expect(montoACobrar(futbol[0], true)).toBe(12000);
      expect(montoACobrar(futbol[0], false)).toBe(15000);
    });

    it('redondea a centavos', () => {
      expect(montoACobrar(t({ monto: 9999.99, descuentoSocioPorcentaje: 15 }), true)).toBe(8499.99);
    });
  });

  describe('eraSocioEn', () => {
    it('es socio en los meses en que la membresía estuvo activa', () => {
      const m = [
        { fechaAlta: new Date(2026, 2, 20), fechaBaja: new Date(2026, 5, 5), activo: false },
      ];
      expect(eraSocioEn(m, '2026-02')).toBe(false);
      expect(eraSocioEn(m, '2026-03')).toBe(true); // alta el 20/03: cuenta el mes
      expect(eraSocioEn(m, '2026-06')).toBe(true); // baja el 05/06: cuenta el mes
      expect(eraSocioEn(m, '2026-07')).toBe(false);
    });

    it('una membresía activa sin baja cuenta desde el alta', () => {
      expect(
        eraSocioEn([{ fechaAlta: new Date(2026, 0, 1), fechaBaja: null, activo: true }], '2026-09'),
      ).toBe(true);
    });

    it('sin membresías no es socio', () => {
      expect(eraSocioEn([], '2026-09')).toBe(false);
    });
  });

  it('periodosEntre incluye el mes de inicio y el de fin', () => {
    expect(periodosEntre(new Date(2026, 9, 28), new Date(2027, 0, 3))).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
    ]);
  });

  describe('DT-44 · fechas a las 00:00 UTC del día 1 no se corren al mes anterior en UTC-3', () => {
    it('aPeriodo lee el año y mes en UTC para una fecha guardada a las 00:00 UTC del día 1', () => {
      expect(aPeriodo(new Date('2025-06-01T00:00:00.000Z'))).toBe('2025-06');
      expect(aPeriodo(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01');
    });

    it('periodosEntre con alta el 01/06/2025 00:00 UTC empieza en 2025-06 (no en 2025-05)', () => {
      expect(
        periodosEntre(new Date('2025-06-01T00:00:00.000Z'), new Date('2025-08-01T00:00:00.000Z')),
      ).toEqual(['2025-06', '2025-07', '2025-08']);
    });

    it('eraSocioEn con alta el 01/06/2025 00:00 UTC no cuenta como socio en 2025-05', () => {
      const m = [
        {
          fechaAlta: new Date('2025-06-01T00:00:00.000Z'),
          fechaBaja: new Date('2025-08-01T00:00:00.000Z'),
          activo: false,
        },
      ];
      expect(eraSocioEn(m, '2025-05')).toBe(false);
      expect(eraSocioEn(m, '2025-06')).toBe(true);
      expect(eraSocioEn(m, '2025-08')).toBe(true);
      expect(eraSocioEn(m, '2025-09')).toBe(false);
    });
  });
});
