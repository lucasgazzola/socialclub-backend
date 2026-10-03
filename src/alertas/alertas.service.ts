import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EstadoDocumentalService } from '../documentacion/estado-documental.service';
import { MailService } from '../notificaciones/mail.service';
import {
  alertasDeDocumentacion,
  fechaReferencia,
  type AlertaDocumentacion,
  type InscripcionConEstado,
} from './alertas-documentacion';
import { asuntoAlertas, emailAlertas } from './email-alertas';

/** Rol que recibe las alertas por email (US-26: "como delegado…"). */
export const ROL_DESTINATARIO = 'DELEGADO';

export interface ResultadoNotificacion {
  alertas: number;
  nuevas: number;
  destinatarios: number;
  enviado: boolean;
}

/**
 * US-26 — Alertas por vencimiento de documentación.
 *
 * `listar` alimenta el panel del Inicio; `notificar` lo dispara una tarea
 * programada (GitHub Actions) y avisa por email solo lo que todavía no se avisó.
 */
@Injectable()
export class AlertasService {
  private readonly logger = new Logger(AlertasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly estadoDocumental: EstadoDocumentalService,
    private readonly mail: MailService,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfigService,
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

  /** Envía por email a los delegados las alertas que todavía no se avisaron. */
  async notificar(hoy = new Date()): Promise<ResultadoNotificacion> {
    const alertas = await this.listar(hoy);
    const resultado: ResultadoNotificacion = {
      alertas: alertas.length,
      nuevas: 0,
      destinatarios: 0,
      enviado: false,
    };
    if (!alertas.length) return resultado;

    const avisadas = await this.prisma.alertaDocumentacionNotificada.findMany({
      where: { clave: { in: alertas.map((a) => a.clave) } },
      select: { clave: true },
    });
    const yaAvisadas = new Set(avisadas.map((a) => a.clave));
    const nuevas = alertas.filter((a) => !yaAvisadas.has(a.clave));
    resultado.nuevas = nuevas.length;
    if (!nuevas.length) return resultado;

    const destinatarios = await this.prisma.usuario.findMany({
      where: { activo: true, roles: { some: { rol: { nombre: ROL_DESTINATARIO } } } },
      select: { email: true },
    });
    resultado.destinatarios = destinatarios.length;
    if (!destinatarios.length) {
      this.logger.warn(
        'Hay alertas de documentación nuevas pero ningún delegado activo para avisar.',
      );
      return resultado;
    }

    const { texto, html } = emailAlertas(nuevas, this.config.get<string>('APP_URL'));
    resultado.enviado = await this.mail.enviar({
      destinatarios: destinatarios.map((d) => d.email),
      asunto: asuntoAlertas(nuevas),
      texto,
      html,
    });
    // Sin envío real no se marcan: se avisan cuando el SMTP quede configurado.
    if (!resultado.enviado) return resultado;

    await this.prisma.$transaction(async (tx) => {
      await tx.alertaDocumentacionNotificada.createMany({
        data: nuevas.map((a) => ({
          clave: a.clave,
          inscripcionId: a.inscripcionId,
          tipoDocumento: a.tipoDocumento,
          tipoAlerta: a.tipo,
          fechaReferencia: fechaReferencia(a),
        })),
        skipDuplicates: true,
      });
      await this.auditoria.registrar(
        {
          accion: 'CREAR',
          entidad: 'AlertaDocumentacion',
          detalle: `Se avisaron por email ${nuevas.length} alerta(s) de documentación a ${destinatarios.length} delegado(s)`,
        },
        tx,
      );
    });
    return resultado;
  }
}
