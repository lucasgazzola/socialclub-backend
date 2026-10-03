import { SetMetadata } from '@nestjs/common';

export interface ContextoTarea {
  /** "Hoy" de la ejecución (inyectable para tests). */
  hoy: Date;
}

/** Resumen que devuelve una tarea (contadores); se guarda en la ejecución. */
export type ResultadoTarea = Record<string, number | string | boolean | null>;

/**
 * Command (DT-22): una automatización como objeto. Se ejecuta igual si la
 * dispara el horario programado o un ADMIN a mano, y `TareasService` registra
 * cada ejecución. La tarea vive en su módulo de dominio y solo hace lo propio:
 * el lock, el registro y los errores son del servicio.
 */
export interface TareaAutomatica {
  /** Identificador estable, en kebab-case: es parte de la URL y del workflow. */
  readonly nombre: string;
  readonly descripcion: string;
  /** Cuándo la dispara el workflow, en palabras (el cron vive en el workflow). */
  readonly horario: string;
  ejecutar(contexto: ContextoTarea): Promise<ResultadoTarea>;
}

export const TAREA_AUTOMATICA = 'tarea-automatica';

/**
 * Marca un provider como tarea automática. `TareasService` las descubre al
 * arrancar (Registry), así que sumar una tarea no modifica el módulo `tareas`.
 */
export const Tarea = () => SetMetadata(TAREA_AUTOMATICA, true);
