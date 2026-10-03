import type { TipoDocumentacionDisciplina } from '@prisma/client';
import { ETIQUETA_TIPO_DOCUMENTO } from '../disciplinas/requerimientos-doc';

/**
 * Estado documental (US-25, base de US-05/08/24/26/27/28 · DT-27).
 *
 * Por cada inscripción activa se cruzan los documentos exigidos (los de la
 * disciplina más los adicionales de la categoría) con los presentados por la
 * persona. Es un cálculo puro: no guarda nada, así que el bloqueo "se activa
 * solo el día que vence" (US-27) sin jobs ni estados desactualizados.
 */

export type EstadoDocumento = 'VIGENTE' | 'POR_VENCER' | 'VENCIDO' | 'FALTANTE';
export type EstadoHabilitacion = 'HABILITADO' | 'PENDIENTE' | 'BLOQUEADO';

/** Días antes del vencimiento en que un documento pasa a "Por vencer" (US-25). */
export const DIAS_POR_VENCER = 30;

export interface RequisitoExigido {
  tipoDocumento: TipoDocumentacionDisciplina;
  plazoDiasTolerancia: number;
  /** Desde cuándo rige el requisito (si se agregó después de la inscripción). */
  creadoEn: Date;
  categoriaDisciplinaId: number | null;
}

export interface DocumentoPresentado {
  id: number;
  tipoDocumento: TipoDocumentacionDisciplina | null;
  fechaVencimiento: Date;
  creadoEn: Date;
}

export interface InscripcionEvaluada {
  fechaInscripcion: Date;
  requisitosDesde: Date | null;
}

export interface EstadoDeDocumento {
  tipoDocumento: TipoDocumentacionDisciplina;
  etiqueta: string;
  origen: 'DISCIPLINA' | 'CATEGORIA';
  plazoDiasTolerancia: number;
  estado: EstadoDocumento;
  documentoId: number | null;
  fechaVencimiento: Date | null;
  /** Solo para faltantes: hasta cuándo se puede presentar. */
  fechaLimite: Date | null;
}

export interface EstadoDeInscripcion {
  estado: EstadoHabilitacion;
  /** Motivos del bloqueo o de lo pendiente, en español, listos para mostrar. */
  motivos: string[];
  documentos: EstadoDeDocumento[];
  /** Si una habilitación excepcional vigente levanta el bloqueo (US-28). */
  habilitadoExcepcionalmenteHasta: Date | null;
}

export const MS_DIA = 24 * 60 * 60 * 1000;

/**
 * Día calendario (sin hora) de una fecha guardada, como número comparable.
 * Las fechas de vencimiento viajan como "aaaa-mm-dd" y se guardan a las 00:00
 * UTC: se leen en UTC para que en Argentina (UTC-3) no caigan el día anterior.
 */
export function dia(fecha: Date): number {
  return Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
}

/** Día calendario de "hoy" (un instante): el del huso horario del servidor. */
export function diaDeHoy(hoy: Date): number {
  return Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
}

function sumarDias(fecha: Date, dias: number): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + dias);
}

/** dd/mm/aaaa de una fecha guardada (leída en UTC, igual que `dia`). */
export function formatear(fecha: Date): string {
  const dd = String(fecha.getUTCDate()).padStart(2, '0');
  const mm = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${fecha.getUTCFullYear()}`;
}

/** El documento que cuenta para un tipo: el último cargado (una renovación reemplaza al anterior). */
export function documentoVigentePorTipo(
  documentos: DocumentoPresentado[],
  tipo: TipoDocumentacionDisciplina,
): DocumentoPresentado | null {
  return (
    documentos
      .filter((d) => d.tipoDocumento === tipo)
      .sort((a, b) => b.creadoEn.getTime() - a.creadoEn.getTime())[0] ?? null
  );
}

export function estadoDeInscripcion(
  inscripcion: InscripcionEvaluada,
  requisitos: RequisitoExigido[],
  documentos: DocumentoPresentado[],
  habilitacionesExcepcionales: { hasta: Date }[] = [],
  hoy: Date = new Date(),
): EstadoDeInscripcion {
  const hoyDia = diaDeHoy(hoy);
  const inicio = inscripcion.requisitosDesde ?? inscripcion.fechaInscripcion;

  const estados: EstadoDeDocumento[] = requisitos.map((req) => {
    const base = {
      tipoDocumento: req.tipoDocumento,
      etiqueta: ETIQUETA_TIPO_DOCUMENTO[req.tipoDocumento],
      origen: req.categoriaDisciplinaId === null ? ('DISCIPLINA' as const) : ('CATEGORIA' as const),
      plazoDiasTolerancia: req.plazoDiasTolerancia,
    };
    const doc = documentoVigentePorTipo(documentos, req.tipoDocumento);
    if (!doc) {
      // El plazo corre desde la inscripción o desde que rige el requisito, lo que sea posterior.
      const desde = req.creadoEn > inicio ? req.creadoEn : inicio;
      return {
        ...base,
        estado: 'FALTANTE' as const,
        documentoId: null,
        fechaVencimiento: null,
        fechaLimite: sumarDias(desde, req.plazoDiasTolerancia),
      };
    }
    const diasRestantes = (dia(doc.fechaVencimiento) - hoyDia) / MS_DIA;
    const estado: EstadoDocumento =
      diasRestantes < 0 ? 'VENCIDO' : diasRestantes <= DIAS_POR_VENCER ? 'POR_VENCER' : 'VIGENTE';
    return {
      ...base,
      estado,
      documentoId: doc.id,
      fechaVencimiento: doc.fechaVencimiento,
      fechaLimite: null,
    };
  });

  const motivosBloqueo = estados.flatMap((d) => {
    if (d.estado === 'VENCIDO' && d.fechaVencimiento) {
      return [`${d.etiqueta}: vencido el ${formatear(d.fechaVencimiento)}`];
    }
    if (d.estado === 'FALTANTE' && d.fechaLimite && dia(d.fechaLimite) < hoyDia) {
      return [`${d.etiqueta}: no se presentó (el plazo venció el ${formatear(d.fechaLimite)})`];
    }
    return [];
  });
  const motivosPendientes = estados
    .filter((d) => d.estado === 'FALTANTE' && d.fechaLimite && dia(d.fechaLimite) >= hoyDia)
    .map((d) => `${d.etiqueta}: falta presentarlo hasta el ${formatear(d.fechaLimite as Date)}`);

  const excepcion = habilitacionesExcepcionales
    .filter((h) => dia(h.hasta) >= hoyDia)
    .sort((a, b) => b.hasta.getTime() - a.hasta.getTime())[0];

  if (motivosBloqueo.length) {
    if (excepcion) {
      return {
        estado: 'HABILITADO',
        motivos: motivosBloqueo,
        documentos: estados,
        habilitadoExcepcionalmenteHasta: excepcion.hasta,
      };
    }
    return {
      estado: 'BLOQUEADO',
      motivos: [...motivosBloqueo, ...motivosPendientes],
      documentos: estados,
      habilitadoExcepcionalmenteHasta: null,
    };
  }
  return {
    estado: motivosPendientes.length ? 'PENDIENTE' : 'HABILITADO',
    motivos: motivosPendientes,
    documentos: estados,
    habilitadoExcepcionalmenteHasta: null,
  };
}

const GRAVEDAD: Record<EstadoHabilitacion, number> = { HABILITADO: 0, PENDIENTE: 1, BLOQUEADO: 2 };

/** Estado del participante: el peor entre sus inscripciones activas (null si no tiene). */
export function estadoGeneral(estados: EstadoHabilitacion[]): EstadoHabilitacion | null {
  if (!estados.length) return null;
  return estados.reduce((peor, e) => (GRAVEDAD[e] > GRAVEDAD[peor] ? e : peor));
}
