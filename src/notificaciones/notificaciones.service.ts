import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CanalNotificacion, Notificacion, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CANALES, type Canal } from './canales/canal';
import type { ResumenEnvio, SolicitudNotificacion, TipoNotificacion } from './notificaciones.types';

/** Reintentos máximos de una notificación fallida. */
export const MAX_INTENTOS = 5;
/** Pasado este tiempo, una notificación pendiente o fallida ya no se reintenta. */
export const HORAS_REINTENTO = 72;

/**
 * Facade del servicio de notificaciones (DT-36). Es lo único que conocen los
 * demás módulos: piden avisar un tipo de notificación a ciertos usuarios y el
 * servicio resuelve canales, contenido, registro y envío.
 *
 * Outbox: cada notificación se guarda (PENDIENTE) con el contenido ya armado
 * y recién después se envía. Si el canal no está configurado queda pendiente;
 * si el envío falla queda FALLIDA. `despacharPendientes` reintenta ambas.
 */
@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);
  private readonly canales: Map<CanalNotificacion, Canal>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfigService,
    @Inject(CANALES) canales: Canal[],
  ) {
    this.canales = new Map(canales.map((c) => [c.tipo, c]));
  }

  /** Crea una notificación por destinatario y canal soportado, y la envía. */
  async notificar<D>({
    plantilla,
    datos,
    destinatarios,
    referencias = [],
  }: SolicitudNotificacion<D>): Promise<ResumenEnvio> {
    const resumen: ResumenEnvio = { creadas: 0, enviadas: 0, fallidas: 0, pendientes: 0 };
    if (!destinatarios.length) return resumen;

    const usuarios = await this.prisma.usuario.findMany({
      where: { id: { in: destinatarios }, activo: true },
      select: { id: true, email: true },
    });
    const contexto = { appUrl: this.config.get<string>('APP_URL') };

    const filas: Prisma.NotificacionCreateManyInput[] = [];
    for (const canal of this.canales.values()) {
      const contenido = plantilla.contenidoPara(canal.tipo, datos, contexto);
      if (contenido == null) continue;
      for (const usuario of usuarios) {
        const destino = canal.destinoDe({ usuarioId: usuario.id, email: usuario.email });
        if (!destino) continue;
        filas.push({
          tipo: plantilla.tipo,
          canal: canal.tipo,
          usuarioId: usuario.id,
          destino,
          contenido: contenido as Prisma.InputJsonValue,
          referencias,
        });
      }
    }
    if (!filas.length) return resumen;

    const creadas = await this.prisma.$transaction(async (tx) => {
      const nuevas = await tx.notificacion.createManyAndReturn({ data: filas });
      await this.auditoria.registrar(
        {
          accion: 'CREAR',
          entidad: 'Notificacion',
          detalle: `${plantilla.tipo}: ${nuevas.length} notificación(es) a ${usuarios.length} usuario(s)`,
        },
        tx,
      );
      return nuevas;
    });
    resumen.creadas = creadas.length;
    return { ...resumen, ...(await this.despachar(creadas)) };
  }

  /**
   * De las claves recibidas, las que todavía no figuran en ninguna
   * notificación de ese tipo (idempotencia por ítem).
   */
  async filtrarNuevas(tipo: TipoNotificacion, claves: string[]): Promise<string[]> {
    if (!claves.length) return [];
    const previas = await this.prisma.notificacion.findMany({
      where: { tipo, referencias: { hasSome: claves } },
      select: { referencias: true },
    });
    const avisadas = new Set(previas.flatMap((p) => p.referencias));
    return claves.filter((c) => !avisadas.has(c));
  }

  /** Usuarios activos con un rol, para usarlos como destinatarios. */
  async usuariosConRol(rol: string): Promise<number[]> {
    const usuarios = await this.prisma.usuario.findMany({
      where: { activo: true, roles: { some: { rol: { nombre: rol } } } },
      select: { id: true },
    });
    return usuarios.map((u) => u.id);
  }

  /** Reintenta lo pendiente o fallido de las últimas `HORAS_REINTENTO` horas. */
  async despacharPendientes(ahora = new Date()) {
    const desde = new Date(ahora.getTime() - HORAS_REINTENTO * 60 * 60 * 1000);
    const pendientes = await this.prisma.notificacion.findMany({
      where: {
        estado: { in: ['PENDIENTE', 'FALLIDA'] },
        intentos: { lt: MAX_INTENTOS },
        creadaEn: { gte: desde },
      },
      orderBy: { creadaEn: 'asc' },
    });
    return { revisadas: pendientes.length, ...(await this.despachar(pendientes)) };
  }

  private async despachar(notificaciones: Notificacion[]) {
    const r = { enviadas: 0, fallidas: 0, pendientes: 0 };
    for (const n of notificaciones) {
      const canal = this.canales.get(n.canal);
      if (!canal?.disponible()) {
        r.pendientes++;
        continue;
      }
      try {
        await canal.enviar(n.destino, n.contenido);
        await this.prisma.notificacion.update({
          where: { id: n.id },
          data: {
            estado: 'ENVIADA',
            intentos: { increment: 1 },
            enviadaEn: new Date(),
            ultimoError: null,
          },
        });
        r.enviadas++;
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);
        await this.prisma.notificacion.update({
          where: { id: n.id },
          data: {
            estado: 'FALLIDA',
            intentos: { increment: 1 },
            ultimoError: mensaje.slice(0, 500),
          },
        });
        this.logger.warn(`No se pudo enviar la notificación ${n.id} por ${n.canal}: ${mensaje}`);
        r.fallidas++;
      }
    }
    if (r.pendientes) {
      this.logger.warn(
        `${r.pendientes} notificación(es) quedaron pendientes: canal sin configurar.`,
      );
    }
    return r;
  }
}
