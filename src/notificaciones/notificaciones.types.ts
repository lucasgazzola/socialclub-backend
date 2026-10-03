import type { CanalNotificacion } from '@prisma/client';

/**
 * Tipos de aviso del sistema (DT-36). Cada tipo tiene su plantilla, que vive en
 * el módulo de dominio que lo origina.
 */
export type TipoNotificacion = 'ALERTAS_DOCUMENTACION';

/** Contenido de un email ya armado: es lo que se guarda y se reenvía. */
export interface ContenidoEmail {
  asunto: string;
  html: string;
  texto: string;
}

/** Usuario al que se le avisa; cada canal toma de acá su dirección. */
export interface Destinatario {
  usuarioId: number;
  email: string;
}

/** Datos comunes a todas las plantillas. */
export interface ContextoPlantilla {
  /** URL del frontend, para los enlaces. */
  appUrl?: string;
}

/**
 * Plantilla de un tipo de aviso: arma el contenido para cada canal que
 * soporta. Devuelve null para los canales que no usa.
 */
export interface Plantilla<D> {
  readonly tipo: TipoNotificacion;
  contenidoPara(canal: CanalNotificacion, datos: D, contexto: ContextoPlantilla): unknown;
}

export interface SolicitudNotificacion<D> {
  plantilla: Plantilla<D>;
  datos: D;
  /** Ids de usuario; los inactivos se descartan. */
  destinatarios: number[];
  /** Claves de los ítems avisados, para no repetirlos (ver `filtrarNuevas`). */
  referencias?: string[];
}

export interface ResumenEnvio {
  /** Notificaciones creadas (una por destinatario y canal). */
  creadas: number;
  enviadas: number;
  fallidas: number;
  /** Quedaron pendientes porque el canal no está configurado. */
  pendientes: number;
}
