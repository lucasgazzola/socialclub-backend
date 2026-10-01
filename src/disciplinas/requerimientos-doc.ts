import { BadRequestException } from '@nestjs/common';
import type { Prisma, TipoDocumentacionDisciplina } from '@prisma/client';
import type { RequerimientoDocumentacionDto } from './dto/create-disciplina.dto';

/** Nombre legible de cada tipo del catálogo, para mensajes y auditoría. */
export const ETIQUETA_TIPO_DOCUMENTO: Record<TipoDocumentacionDisciplina, string> = {
  DNI: 'DNI',
  FICHA_INSCRIPCION: 'Ficha de inscripción',
  CERTIFICADO_MEDICO_APTITUD_FISICA: 'Certificado médico de aptitud física',
  SEGURO_COBERTURA_MEDICA: 'Seguro o cobertura médica',
  AUTORIZACION_PADRES_TUTORES: 'Autorización de padres/tutores',
  CARNET_FEDERATIVO_LICENCIA_DEPORTIVA: 'Carnet federativo o licencia deportiva',
  REGLAMENTO_INTERNO_FIRMADO: 'Reglamento interno firmado',
  FICHA_TECNICA_NATACION: 'Ficha técnica: Natación',
  FICHA_TECNICA_GIMNASIO_FITNESS: 'Ficha técnica: Gimnasio/Fitness',
  FICHA_TECNICA_ARTES_MARCIALES: 'Ficha técnica: Artes marciales',
  FICHA_TECNICA_DEPORTES_CONTACTO: 'Ficha técnica: Deportes de contacto',
  COMPROBANTE_PAGO_CUOTA_SOCIAL_DEPORTIVA: 'Comprobante de pago de cuota social/deportiva',
};

/** Alcance de un conjunto de requisitos: la disciplina entera (categoría null) o una categoría. */
export interface AlcanceRequerimientos {
  disciplinaId: number;
  categoriaDisciplinaId: number | null;
}

/** Rechaza listas de requisitos que repiten un mismo tipo de documento. */
export function validarTiposSinRepetir(requerimientos: RequerimientoDocumentacionDto[] = []) {
  const tipos = requerimientos.map((r) => r.tipoDocumento);
  if (new Set(tipos).size !== tipos.length) {
    throw new BadRequestException('No se puede repetir un tipo de documento obligatorio.');
  }
}

/**
 * Sincroniza los requisitos de un alcance por tipo de documento: borra los
 * quitados, actualiza el plazo de los que siguen y crea los nuevos.
 * No se hace delete-all + re-insert porque `creadoEn` indica desde cuándo rige
 * cada requisito, y es la base del plazo para los participantes ya inscriptos
 * (US-45/49).
 */
export async function sincronizarRequerimientos(
  tx: Prisma.TransactionClient,
  alcance: AlcanceRequerimientos,
  requerimientos: RequerimientoDocumentacionDto[],
) {
  validarTiposSinRepetir(requerimientos);
  const actuales = await tx.disciplinaRequerimientoDoc.findMany({ where: alcance });
  const plazoPorTipo = new Map(
    requerimientos.map((r) => [r.tipoDocumento, r.plazoDiasTolerancia ?? 0]),
  );

  const idsABorrar = actuales.filter((a) => !plazoPorTipo.has(a.tipoDocumento)).map((a) => a.id);
  if (idsABorrar.length) {
    await tx.disciplinaRequerimientoDoc.deleteMany({ where: { id: { in: idsABorrar } } });
  }

  for (const actual of actuales) {
    const plazo = plazoPorTipo.get(actual.tipoDocumento);
    if (plazo !== undefined && plazo !== actual.plazoDiasTolerancia) {
      await tx.disciplinaRequerimientoDoc.update({
        where: { id: actual.id },
        data: { plazoDiasTolerancia: plazo },
      });
    }
  }

  const tiposActuales = new Set(actuales.map((a) => a.tipoDocumento));
  const nuevos = requerimientos.filter((r) => !tiposActuales.has(r.tipoDocumento));
  if (nuevos.length) {
    await tx.disciplinaRequerimientoDoc.createMany({
      data: nuevos.map((r) => ({
        ...alcance,
        tipoDocumento: r.tipoDocumento,
        plazoDiasTolerancia: r.plazoDiasTolerancia ?? 0,
      })),
    });
  }
}
