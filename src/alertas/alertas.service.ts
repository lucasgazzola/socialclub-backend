import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EstadoDocumentalService } from '../documentacion/estado-documental.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import type { ResumenEnvio } from '../notificaciones/notificaciones.types';
import {
  alertasDeDocumentacion,
  type AlertaDocumentacion,
  type InscripcionConEstado,
} from './alertas-documentacion';
import { AlertasDocumentacionPlantilla } from './alertas-documentacion.plantilla';

/** Rol que recibe las alertas por email (US-26: "como delegado…"). */
export const ROL_DESTINATARIO = 'DELEGADO';

export interface ResultadoNotificacion extends ResumenEnvio {
  alertas: number;
  nuevas: number;
  destinatarios: number;
}

/**
 * US-26 — Alertas por vencimiento de documentación.
 *
 * `listar` alimenta el panel del Inicio; `notificar` lo dispara una tarea
 * programada y avisa, por el servicio de notificaciones (DT-36), solo lo que
 * todavía no se avisó.
 */
@Injectable()
export class AlertasService {
  private readonly logger = new Logger(AlertasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly estadoDocumental: EstadoDocumentalService,
    private readonly notificaciones: NotificacionesService,
    private readonly plantilla: AlertasDocumentacionPlantilla,
  ) {}

  /** Alertas vigentes de todas las inscripciones activas, por urgencia. */
  async listar(hoy = new Date()): Promise<AlertaDocumentacion[]> {
    const personas = await this.prisma.persona.findMany({
      where: { inscripciones: { some: { activo: true } } },
      select: { id: true, nombre: true, apellido: true },
    });
    if (!personas.length) return [];
    const estados = await this.estadoDocumental.porPersonas(
      personas.map((p) => p.id),
      hoy,
    );
    const inscripciones: InscripcionConEstado[] = personas.flatMap((p) =>
      (estados.get(p.id)?.inscripciones ?? []).map((i) => ({
        inscripcionId: i.inscripcionId,
        personaId: p.id,
        participante: `${p.apellido}, ${p.nombre}`,
        disciplina: i.disciplina.nombre,
        categoria: i.categoriaDisciplina?.nombre ?? null,
        documentos: i.documentos,
      })),
    );
    return alertasDeDocumentacion(inscripciones, hoy);
  }

  /** Avisa a los delegados las alertas que todavía no figuran en ninguna notificación. */
  async notificar(hoy = new Date()): Promise<ResultadoNotificacion> {
    const alertas = await this.listar(hoy);
    const resultado: ResultadoNotificacion = {
      alertas: alertas.length,
      nuevas: 0,
      destinatarios: 0,
      creadas: 0,
      enviadas: 0,
      fallidas: 0,
      pendientes: 0,
    };
    const claves = await this.notificaciones.filtrarNuevas(
      this.plantilla.tipo,
      alertas.map((a) => a.clave),
    );
    const nuevas = alertas.filter((a) => claves.includes(a.clave));
    resultado.nuevas = nuevas.length;
    if (!nuevas.length) return resultado;

    const destinatarios = await this.notificaciones.usuariosConRol(ROL_DESTINATARIO);
    resultado.destinatarios = destinatarios.length;
    if (!destinatarios.length) {
      this.logger.warn(
        'Hay alertas de documentación nuevas pero ningún delegado activo para avisar.',
      );
      return resultado;
    }

    const envio = await this.notificaciones.notificar({
      plantilla: this.plantilla,
      datos: { alertas: nuevas },
      destinatarios,
      referencias: nuevas.map((a) => a.clave),
    });
    return { ...resultado, ...envio };
  }
}
