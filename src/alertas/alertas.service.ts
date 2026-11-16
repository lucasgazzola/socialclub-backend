import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EstadoDocumentalService } from '../documentacion/estado-documental.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import type { ResumenEnvio } from '../notificaciones/notificaciones.types';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
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
  /** DT-42: alertas nuevas de disciplinas sin delegado (quedan para la próxima corrida). */
  sinDelegado: number;
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

  /**
   * DT-42: disciplinas cuyas alertas ve el usuario. `null` = todas (ADMIN);
   * un delegado ve solo las que tiene a cargo.
   */
  async disciplinasVisibles(usuario: AuthenticatedUser): Promise<number[] | null> {
    if (usuario.roles.includes('ADMIN')) return null;
    const asignadas = await this.prisma.delegadoDisciplina.findMany({
      where: { usuarioId: usuario.id },
      select: { disciplinaId: true },
    });
    return asignadas.map((a) => a.disciplinaId);
  }

  /**
   * Alertas vigentes de las inscripciones activas, por urgencia. Con
   * `disciplinasIds` (DT-42) se limitan a esas disciplinas.
   */
  async listar(
    hoy = new Date(),
    disciplinasIds: number[] | null = null,
  ): Promise<AlertaDocumentacion[]> {
    if (disciplinasIds && !disciplinasIds.length) return [];
    const enDisciplinas = disciplinasIds ? { disciplinaId: { in: disciplinasIds } } : {};
    const personas = await this.prisma.persona.findMany({
      where: { inscripciones: { some: { activo: true, ...enDisciplinas } } },
      select: { id: true, nombre: true, apellido: true },
    });
    if (!personas.length) return [];
    const estados = await this.estadoDocumental.porPersonas(
      personas.map((p) => p.id),
      hoy,
    );
    const inscripciones: InscripcionConEstado[] = personas.flatMap((p) =>
      (estados.get(p.id)?.inscripciones ?? [])
        .filter((i) => !disciplinasIds || disciplinasIds.includes(i.disciplina.id))
        .map((i) => ({
          inscripcionId: i.inscripcionId,
          personaId: p.id,
          participante: `${p.apellido}, ${p.nombre}`,
          disciplinaId: i.disciplina.id,
          disciplina: i.disciplina.nombre,
          categoria: i.categoriaDisciplina?.nombre ?? null,
          documentos: i.documentos,
        })),
    );
    return alertasDeDocumentacion(inscripciones, hoy);
  }

  /**
   * Avisa las alertas que todavía no figuran en ninguna notificación. Cada
   * delegado recibe solo las de sus disciplinas (DT-42); las de disciplinas
   * sin delegado no se marcan como avisadas y salen cuando se asigne uno.
   */
  async notificar(hoy = new Date()): Promise<ResultadoNotificacion> {
    const alertas = await this.listar(hoy);
    const resultado: ResultadoNotificacion = {
      alertas: alertas.length,
      nuevas: 0,
      destinatarios: 0,
      sinDelegado: 0,
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

    const delegados = await this.prisma.usuario.findMany({
      where: { activo: true, roles: { some: { rol: { nombre: ROL_DESTINATARIO } } } },
      select: { id: true, disciplinasDelegadas: { select: { disciplinaId: true } } },
    });
    const conDelegado = new Set<number>();
    for (const delegado of delegados) {
      const propias = new Set(delegado.disciplinasDelegadas.map((d) => d.disciplinaId));
      const suyas = nuevas.filter((a) => propias.has(a.disciplinaId));
      if (!suyas.length) continue;
      suyas.forEach((a) => conDelegado.add(a.disciplinaId));
      const envio = await this.notificaciones.notificar({
        plantilla: this.plantilla,
        datos: { alertas: suyas },
        destinatarios: [delegado.id],
        referencias: suyas.map((a) => a.clave),
      });
      resultado.destinatarios++;
      resultado.creadas += envio.creadas;
      resultado.enviadas += envio.enviadas;
      resultado.fallidas += envio.fallidas;
      resultado.pendientes += envio.pendientes;
    }

    resultado.sinDelegado = nuevas.filter((a) => !conDelegado.has(a.disciplinaId)).length;
    if (resultado.sinDelegado) {
      this.logger.warn(
        `Hay ${resultado.sinDelegado} alerta(s) de documentación de disciplinas sin delegado activo.`,
      );
    }
    return resultado;
  }
}
