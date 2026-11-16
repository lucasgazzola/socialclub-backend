import type { TipoDocumentacionDisciplina } from '@prisma/client';
import {
  dia,
  diaDeHoy,
  formatear,
  MS_DIA,
  type EstadoDeDocumento,
} from '../documentacion/estado-documental';

/**
 * US-26 — Alertas de documentación.
 *
 * Se derivan del estado documental (US-25) en el momento, igual que el
 * bloqueo: no hay jobs que marquen nada. Solo cambia la ventana: el estado
 * "Por vencer" mira 30 días, la alerta mira los próximos 10.
 */

/** Días hacia adelante que mira una alerta (criterio de aceptación de US-26). */
export const DIAS_ALERTA = 10;

export type TipoAlerta =
  /** Documento presentado que vence dentro de los próximos días. */
  | 'POR_VENCER'
  /** Documento presentado ya vencido (la inscripción está bloqueada). */
  | 'VENCIDO'
  /** Documento faltante cuyo plazo de presentación termina dentro de los próximos días. */
  | 'PRESENTACION_POR_VENCER'
  /** Documento faltante con el plazo de presentación ya terminado. */
  | 'PRESENTACION_VENCIDA';

export interface InscripcionConEstado {
  inscripcionId: number;
  personaId: number;
  participante: string;
  disciplinaId: number;
  disciplina: string;
  categoria: string | null;
  documentos: EstadoDeDocumento[];
}

export interface AlertaDocumentacion {
  /** Identifica el aviso para no repetirlo por email. */
  clave: string;
  tipo: TipoAlerta;
  inscripcionId: number;
  personaId: number;
  participante: string;
  disciplinaId: number;
  disciplina: string;
  categoria: string | null;
  tipoDocumento: TipoDocumentacionDisciplina;
  documento: string;
  /** Fecha de vencimiento o fecha límite de presentación. */
  fecha: Date;
  /** Negativo si ya pasó. */
  diasRestantes: number;
  mensaje: string;
}

function isoDia(fecha: Date): string {
  return new Date(dia(fecha)).toISOString().slice(0, 10);
}

function plural(dias: number): string {
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  return `en ${dias} días`;
}

function mensajeDe(tipo: TipoAlerta, fecha: Date, dias: number): string {
  const f = formatear(fecha);
  switch (tipo) {
    case 'POR_VENCER':
      return `Vence ${plural(dias)} (${f})`;
    case 'VENCIDO':
      return `Venció el ${f}`;
    case 'PRESENTACION_POR_VENCER':
      return `Falta presentarlo: el plazo termina ${plural(dias)} (${f})`;
    case 'PRESENTACION_VENCIDA':
      return `No se presentó: el plazo terminó el ${f}`;
  }
}

/** Alerta de un documento exigido, o null si no hay nada que avisar. */
function alertaDe(doc: EstadoDeDocumento, hoyDia: number, dias: number) {
  const fecha = doc.fechaVencimiento ?? doc.fechaLimite;
  if (!fecha) return null;
  const restantes = Math.round((dia(fecha) - hoyDia) / MS_DIA);
  if (restantes > dias) return null;
  const presentado = doc.documentoId !== null;
  const tipo: TipoAlerta = presentado
    ? restantes < 0
      ? 'VENCIDO'
      : 'POR_VENCER'
    : restantes < 0
      ? 'PRESENTACION_VENCIDA'
      : 'PRESENTACION_POR_VENCER';
  return { tipo, fecha, restantes };
}

const ORDEN: Record<TipoAlerta, number> = {
  VENCIDO: 0,
  PRESENTACION_VENCIDA: 0,
  POR_VENCER: 1,
  PRESENTACION_POR_VENCER: 1,
};

/**
 * Alertas de varias inscripciones, ordenadas por urgencia: primero lo que ya
 * bloquea, después lo que vence antes.
 */
export function alertasDeDocumentacion(
  inscripciones: InscripcionConEstado[],
  hoy: Date = new Date(),
  dias: number = DIAS_ALERTA,
): AlertaDocumentacion[] {
  const hoyDia = diaDeHoy(hoy);
  const alertas = inscripciones.flatMap((insc) =>
    insc.documentos.flatMap((doc) => {
      const a = alertaDe(doc, hoyDia, dias);
      if (!a) return [];
      return [
        {
          clave: `${insc.inscripcionId}:${doc.tipoDocumento}:${a.tipo}:${isoDia(a.fecha)}`,
          tipo: a.tipo,
          inscripcionId: insc.inscripcionId,
          personaId: insc.personaId,
          participante: insc.participante,
          disciplinaId: insc.disciplinaId,
          disciplina: insc.disciplina,
          categoria: insc.categoria,
          tipoDocumento: doc.tipoDocumento,
          documento: doc.etiqueta,
          fecha: a.fecha,
          diasRestantes: a.restantes,
          mensaje: mensajeDe(a.tipo, a.fecha, a.restantes),
        },
      ];
    }),
  );
  return alertas.sort(
    (x, y) =>
      ORDEN[x.tipo] - ORDEN[y.tipo] ||
      x.diasRestantes - y.diasRestantes ||
      x.participante.localeCompare(y.participante, 'es'),
  );
}
