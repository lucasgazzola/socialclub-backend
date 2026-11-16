import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import type { EjecucionTarea, OrigenEjecucion, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { TAREA_AUTOMATICA, type TareaAutomatica } from './tarea-automatica';

/** Tiempo máximo de una ejecución: después se libera el lock. */
export const DURACION_MAXIMA_MS = 10 * 60 * 1000;

export interface OpcionesEjecucion {
  origen: OrigenEjecucion;
  usuarioId?: number | null;
  hoy?: Date;
}

const USUARIO = { select: { id: true, nombre: true, apellido: true } } as const;

/**
 * Servicio centralizado de tareas automáticas (DT-22). Es el Invoker del
 * patrón Command: descubre las tareas marcadas con `@Tarea()` (Registry) y
 * concentra lo transversal de cada ejecución:
 *
 * - **Exclusión mutua:** un lock de PostgreSQL por tarea
 *   (`pg_try_advisory_xact_lock`) impide que la misma corra dos veces a la vez
 *   (dos réplicas, un disparo manual durante el programado, un reintento).
 * - **Registro:** cada ejecución queda en `ejecuciones_tareas` con su origen,
 *   estado, resultado o error.
 * - **Errores:** una tarea que falla queda FALLIDA; no tira abajo la API.
 */
@Injectable()
export class TareasService implements OnModuleInit {
  private readonly logger = new Logger(TareasService.name);
  private readonly tareas = new Map<string, TareaAutomatica>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly discovery: DiscoveryService,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit() {
    for (const wrapper of this.discovery.getProviders()) {
      const { metatype, instance } = wrapper;
      if (!metatype || !instance || !this.reflector.get(TAREA_AUTOMATICA, metatype)) continue;
      const tarea = instance as TareaAutomatica;
      if (this.tareas.has(tarea.nombre)) {
        throw new Error(`Hay dos tareas automáticas con el nombre «${tarea.nombre}»`);
      }
      this.tareas.set(tarea.nombre, tarea);
    }
    this.logger.log(`Tareas automáticas registradas: ${[...this.tareas.keys()].join(', ') || '—'}`);
  }

  /** Tareas registradas con su última ejecución. */
  async listar() {
    const tareas = [...this.tareas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
    const ultimas = await Promise.all(
      tareas.map((t) =>
        this.prisma.ejecucionTarea.findFirst({
          where: { tarea: t.nombre },
          orderBy: { inicio: 'desc' },
          include: { usuario: USUARIO },
        }),
      ),
    );
    return tareas.map((t, i) => ({
      nombre: t.nombre,
      descripcion: t.descripcion,
      horario: t.horario,
      ultimaEjecucion: ultimas[i] ?? null,
    }));
  }

  /** Últimas ejecuciones de una tarea, de la más reciente a la más vieja. */
  async ejecuciones(nombre: string, limite = 20) {
    this.obtener(nombre);
    return this.prisma.ejecucionTarea.findMany({
      where: { tarea: nombre },
      orderBy: { inicio: 'desc' },
      take: limite,
      include: { usuario: USUARIO },
    });
  }

  /** Ejecuta una tarea con lock y deja registrada la ejecución. */
  async ejecutar(
    nombre: string,
    { origen, usuarioId = null, hoy = new Date() }: OpcionesEjecucion,
  ): Promise<EjecucionTarea> {
    const tarea = this.obtener(nombre);

    const ejecucion = await this.prisma.$transaction(
      async (tx) => {
        // El lock dura lo que la transacción: se libera solo, aun si el proceso cae.
        const [{ libre }] = await tx.$queryRaw<{ libre: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtext(${`tarea:${nombre}`})) AS libre`;
        if (!libre) {
          return this.prisma.ejecucionTarea.create({
            data: {
              tarea: nombre,
              origen,
              usuarioId,
              estado: 'OMITIDA',
              fin: new Date(),
              error: 'La tarea ya se estaba ejecutando',
            },
          });
        }

        // Si una ejecución anterior quedó EN_CURSO, el proceso se cortó a mitad.
        await this.prisma.ejecucionTarea.updateMany({
          where: { tarea: nombre, estado: 'EN_CURSO' },
          data: {
            estado: 'FALLIDA',
            fin: new Date(),
            error: 'Interrumpida: el proceso terminó antes de registrar el resultado',
          },
        });
        const enCurso = await this.prisma.ejecucionTarea.create({
          data: { tarea: nombre, origen, usuarioId },
        });

        try {
          const resultado = await tarea.ejecutar({ hoy });
          return this.prisma.ejecucionTarea.update({
            where: { id: enCurso.id },
            data: {
              estado: 'EXITOSA',
              fin: new Date(),
              resultado: resultado as Prisma.InputJsonValue,
            },
          });
        } catch (error) {
          const mensaje = error instanceof Error ? error.message : String(error);
          this.logger.error(`La tarea «${nombre}» falló: ${mensaje}`, (error as Error)?.stack);
          return this.prisma.ejecucionTarea.update({
            where: { id: enCurso.id },
            data: { estado: 'FALLIDA', fin: new Date(), error: mensaje.slice(0, 1000) },
          });
        }
      },
      { maxWait: 10_000, timeout: DURACION_MAXIMA_MS },
    );

    if (origen === 'MANUAL') {
      await this.auditoria.registrar({
        accion: 'CREAR',
        entidad: 'EjecucionTarea',
        idEntidad: ejecucion.id,
        responsableId: usuarioId ?? undefined,
        detalle: `Ejecución manual de «${nombre}»: ${ejecucion.estado}`,
      });
    }
    return ejecucion;
  }

  private obtener(nombre: string): TareaAutomatica {
    const tarea = this.tareas.get(nombre);
    if (!tarea) throw new NotFoundException(`No existe la tarea automática «${nombre}»`);
    return tarea;
  }
}
