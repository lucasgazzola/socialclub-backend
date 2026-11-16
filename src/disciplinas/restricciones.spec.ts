import { BadRequestException } from '@nestjs/common';
import {
  edadEnElAnio,
  motivosDeIncumplimiento,
  restriccionesEfectivas,
  validarRestriccionesDeCategoria,
  type Restricciones,
} from './restricciones';

/**
 * US-48/49 (y base de US-5/6) · Restricciones de género y edad por año de
 * nacimiento: la categoría afina la restricción de su disciplina.
 */
describe('restricciones de disciplina/categoría', () => {
  const sinRestriccion: Restricciones = { genero: null, edadMinima: null, edadMaxima: null };
  const futbolInfantil: Restricciones = { genero: null, edadMinima: 6, edadMaxima: 18 };

  describe('edadEnElAnio', () => {
    it('usa el año de nacimiento, no el día: quien nace en diciembre cumple igual que quien nace en enero', () => {
      expect(edadEnElAnio(new Date('2011-01-05'), 2026)).toBe(15);
      expect(edadEnElAnio(new Date('2011-12-28'), 2026)).toBe(15);
    });
  });

  describe('validarRestriccionesDeCategoria', () => {
    it('acepta una categoría dentro del rango de la disciplina', () => {
      expect(() =>
        validarRestriccionesDeCategoria(
          { genero: null, edadMinima: 13, edadMaxima: 15 },
          futbolInfantil,
        ),
      ).not.toThrow();
    });

    it('acepta una categoría de un único año (mínima = máxima)', () => {
      expect(() =>
        validarRestriccionesDeCategoria(
          { genero: null, edadMinima: 15, edadMaxima: 15 },
          futbolInfantil,
        ),
      ).not.toThrow();
    });

    it('acepta una categoría sin restricciones propias (hereda)', () => {
      expect(() => validarRestriccionesDeCategoria(sinRestriccion, futbolInfantil)).not.toThrow();
    });

    it('rechaza edad máxima menor que la mínima', () => {
      expect(() =>
        validarRestriccionesDeCategoria(
          { genero: null, edadMinima: 15, edadMaxima: 13 },
          sinRestriccion,
        ),
      ).toThrow('La edad máxima no puede ser menor que la edad mínima.');
    });

    it('rechaza una edad mínima por debajo de la de la disciplina', () => {
      expect(() =>
        validarRestriccionesDeCategoria(
          { genero: null, edadMinima: 4, edadMaxima: 8 },
          futbolInfantil,
        ),
      ).toThrow(BadRequestException);
    });

    it('rechaza una edad máxima por encima de la de la disciplina', () => {
      expect(() =>
        validarRestriccionesDeCategoria(
          { genero: null, edadMinima: null, edadMaxima: 21 },
          futbolInfantil,
        ),
      ).toThrow(
        'El rango de edad de la categoría debe quedar dentro del de la disciplina (6 a 18 años).',
      );
    });

    it('rechaza una mínima que, con la máxima heredada, deja un rango vacío', () => {
      expect(() =>
        validarRestriccionesDeCategoria(
          { genero: null, edadMinima: 20, edadMaxima: null },
          {
            genero: null,
            edadMinima: null,
            edadMaxima: 18,
          },
        ),
      ).toThrow(BadRequestException);
    });

    it('rechaza un género distinto al de la disciplina', () => {
      expect(() =>
        validarRestriccionesDeCategoria(
          { genero: 'MASCULINO', edadMinima: null, edadMaxima: null },
          { genero: 'FEMENINO', edadMinima: null, edadMaxima: null },
        ),
      ).toThrow(
        'La disciplina es solo para el género Femenino: la categoría no puede definir otro.',
      );
    });

    it('permite definir género en la categoría si la disciplina no lo restringe', () => {
      expect(() =>
        validarRestriccionesDeCategoria(
          { genero: 'FEMENINO', edadMinima: null, edadMaxima: null },
          sinRestriccion,
        ),
      ).not.toThrow();
    });
  });

  describe('restriccionesEfectivas', () => {
    it('toma lo de la categoría y completa lo que no define con la disciplina', () => {
      expect(
        restriccionesEfectivas(
          { genero: 'FEMENINO', edadMinima: 6, edadMaxima: 18 },
          { genero: null, edadMinima: 13, edadMaxima: null },
        ),
      ).toEqual({ genero: 'FEMENINO', edadMinima: 13, edadMaxima: 18 });
    });
  });

  describe('motivosDeIncumplimiento', () => {
    const sub15Femenino: Restricciones = { genero: 'FEMENINO', edadMinima: 13, edadMaxima: 15 };

    it('no informa motivos si el participante cumple', () => {
      expect(
        motivosDeIncumplimiento(
          { genero: 'FEMENINO', fechaNacimiento: new Date('2012-03-10') },
          sub15Femenino,
          2026,
        ),
      ).toEqual([]);
    });

    it('informa género y edad fuera de la restricción', () => {
      expect(
        motivosDeIncumplimiento(
          { genero: 'MASCULINO', fechaNacimiento: new Date('2009-03-10') },
          sub15Femenino,
          2026,
        ),
      ).toEqual([
        'Solo admite el género Femenino.',
        'Edad fuera del rango (13 a 15 años): cumple 17 en 2026.',
      ]);
    });

    it('informa los datos faltantes del participante cuando la restricción los exige', () => {
      expect(
        motivosDeIncumplimiento({ genero: null, fechaNacimiento: null }, sub15Femenino),
      ).toEqual([
        'Falta registrar el género del participante.',
        'Falta registrar la fecha de nacimiento del participante.',
      ]);
    });

    it('sin restricciones no exige datos', () => {
      expect(
        motivosDeIncumplimiento({ genero: null, fechaNacimiento: null }, sinRestriccion),
      ).toEqual([]);
    });
  });
});
