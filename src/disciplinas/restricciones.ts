import { BadRequestException } from '@nestjs/common';
import type { GeneroDisciplina } from '@prisma/client';

/**
 * Restricciones de inscripción de una disciplina o categoría.
 * La edad se mide por AÑO DE NACIMIENTO: es la edad que el participante cumple
 * en el año calendario (año - año de nacimiento). Así "Sub-15 = hasta 15"
 * sigue valiendo cada temporada sin editar la categoría.
 * `null` = sin restricción (en una categoría: hereda la de la disciplina).
 */
export interface Restricciones {
  genero: GeneroDisciplina | null;
  edadMinima: number | null;
  edadMaxima: number | null;
}

export const ETIQUETA_GENERO: Record<GeneroDisciplina, string> = {
  FEMENINO: 'Femenino',
  MASCULINO: 'Masculino',
  NO_BINARIO_NO_ESPECIFICADO: 'No binario / No especificado',
};

/** Edad que se cumple en el año indicado (por defecto, el actual). */
export function edadEnElAnio(fechaNacimiento: Date, anio = new Date().getFullYear()) {
  return anio - fechaNacimiento.getUTCFullYear();
}

/** La restricción que rige: la de la categoría si la define, si no la de la disciplina. */
export function restriccionesEfectivas(
  disciplina: Restricciones,
  categoria?: Restricciones | null,
): Restricciones {
  return {
    genero: categoria?.genero ?? disciplina.genero,
    edadMinima: categoria?.edadMinima ?? disciplina.edadMinima,
    edadMaxima: categoria?.edadMaxima ?? disciplina.edadMaxima,
  };
}

/**
 * US-48/49: la categoría solo puede AFINAR la restricción de su disciplina,
 * nunca ampliarla ni contradecirla.
 */
export function validarRestriccionesDeCategoria(
  categoria: Restricciones,
  disciplina: Restricciones,
) {
  const { edadMinima, edadMaxima, genero } = categoria;
  if (edadMinima !== null && edadMaxima !== null && edadMinima > edadMaxima) {
    throw new BadRequestException('La edad máxima no puede ser menor que la edad mínima.');
  }
  if (disciplina.genero && genero && genero !== disciplina.genero) {
    throw new BadRequestException(
      `La disciplina es solo para el género ${ETIQUETA_GENERO[disciplina.genero]}: la categoría no puede definir otro.`,
    );
  }
  const minimoEfectivo = edadMinima ?? disciplina.edadMinima;
  const maximoEfectivo = edadMaxima ?? disciplina.edadMaxima;
  if (
    (edadMinima !== null && disciplina.edadMinima !== null && edadMinima < disciplina.edadMinima) ||
    (edadMaxima !== null && disciplina.edadMaxima !== null && edadMaxima > disciplina.edadMaxima) ||
    (minimoEfectivo !== null && maximoEfectivo !== null && minimoEfectivo > maximoEfectivo)
  ) {
    throw new BadRequestException(
      `El rango de edad de la categoría debe quedar dentro del de la disciplina (${describirRangoEdad(disciplina)}).`,
    );
  }
}

/**
 * Para la inscripción (US-5/6): motivos por los que un participante NO cumple
 * la restricción. Vacío = cumple. Si falta el dato del participante (fecha de
 * nacimiento o género) y la restricción lo exige, también es un motivo.
 */
export function motivosDeIncumplimiento(
  participante: { genero: GeneroDisciplina | null; fechaNacimiento: Date | null },
  restricciones: Restricciones,
  anio = new Date().getFullYear(),
): string[] {
  const motivos: string[] = [];
  if (restricciones.genero) {
    if (!participante.genero) {
      motivos.push('Falta registrar el género del participante.');
    } else if (participante.genero !== restricciones.genero) {
      motivos.push(`Solo admite el género ${ETIQUETA_GENERO[restricciones.genero]}.`);
    }
  }
  if (restricciones.edadMinima !== null || restricciones.edadMaxima !== null) {
    if (!participante.fechaNacimiento) {
      motivos.push('Falta registrar la fecha de nacimiento del participante.');
    } else {
      const edad = edadEnElAnio(participante.fechaNacimiento, anio);
      const fueraDeRango =
        (restricciones.edadMinima !== null && edad < restricciones.edadMinima) ||
        (restricciones.edadMaxima !== null && edad > restricciones.edadMaxima);
      if (fueraDeRango) {
        motivos.push(
          `Edad fuera del rango (${describirRangoEdad(restricciones)}): cumple ${edad} en ${anio}.`,
        );
      }
    }
  }
  return motivos;
}

export function describirRangoEdad({ edadMinima, edadMaxima }: Restricciones) {
  if (edadMinima !== null && edadMaxima !== null) return `${edadMinima} a ${edadMaxima} años`;
  if (edadMinima !== null) return `desde ${edadMinima} años`;
  if (edadMaxima !== null) return `hasta ${edadMaxima} años`;
  return 'sin límite de edad';
}
