import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EstadoReserva, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { PagosService } from '../pagos/pagos.service';
import { PasarelaService } from '../pasarela/pasarela.service';
import { conflictosDe, ESTADOS_QUE_OCUPAN, ESTADOS_VIGENTES, HUSO_CLUB_MINUTOS } from './agenda';
import { ReservasPlantilla, type NovedadReserva } from './reservas.plantilla';
import type { FindSolicitudesQueryDto } from './dto/find-solicitudes-query.dto';
import type { DatosCobroReserva } from './reserva.acreditador';

/** Plazos por defecto (decisión 0004); se cambian con variables de entorno. */
export const HORAS_LIMITE_SENA = 48;
export const HORAS_PENALIZACION = 48;

/** Cómo pagar la seña, para «Mis Reservas» (US-62). */
export const INSTRUCCIONES_SENA =
  'Podés pagarla online con Mercado Pago o en la secretaría del club (efectivo, transferencia o tarjeta). La reserva se confirma cuando se acredita la seña.';

const MS_HORA = 3_600_000;

const INCLUIR = {
  espacio: { select: { id: true, nombre: true, modalidad: true } },
  usuario: {
    select: {
      id: true,
      email: true,
      persona: {
        select: {
          id: true,
          nombre: true,
          apellido: true,
          dni: true,
          telefono: true,
          membresias: { where: { activo: true }, select: { id: true } },
        },
      },
    },
  },
} satisfies Prisma.ReservaInclude;

type ReservaConDatos = Prisma.ReservaGetPayload<{ include: typeof INCLUIR }>;

/** Fecha y hora en el reloj del club, p. ej. «sáb 07/11/2026 18:00». */
export function enHoraClub(instante: Date, conDia = true): string {
  const local = new Date(instante.getTime() + HUSO_CLUB_MINUTOS * 60_000);
  const dd = String(local.getUTCDate()).padStart(2, '0');
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mi = String(local.getUTCMinutes()).padStart(2, '0');
  const dia = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][local.getUTCDay()];
  return `${conDia ? `${dia} ` : ''}${dd}/${mm}/${local.getUTCFullYear()} ${hh}:${mi}`;
}

/** Turno legible: «sáb 07/11/2026 18:00 a 20:00» o «sáb 07/11/2026 (día completo)». */
export function turnoLegible(r: {
  inicio: Date;
  fin: Date;
  espacio: { modalidad: string };
}): string {
  const desde = enHoraClub(r.inicio);
  if (r.espacio.modalidad === 'DIA_COMPLETO') return `${desde.slice(0, -6)} (día completo)`;
  const hasta = enHoraClub(r.fin).slice(-5);
  return `${desde} a ${hasta === '00:00' ? '24:00' : hasta}`;
}

const pesos = (n: Prisma.Decimal | number) =>
  `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

/**
 * US-60 · US-61 · US-62 — Evaluación, cancelación y consulta de reservas de
 * espacios. La ocupación de la agenda la deciden las reglas de `agenda.ts`
 * (decisión 0004); los avisos salen por `NotificacionesService` y el pago
 * online de la seña por `PasarelaService`.
 */
@Injectable()
export class ReservasService {
  private readonly logger = new Logger(ReservasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly notificaciones: NotificacionesService,
    private readonly plantilla: ReservasPlantilla,
    private readonly pagos: PagosService,
    private readonly pasarela: PasarelaService,
    private readonly config: ConfigService,
  ) {}

  get horasLimiteSena(): number {
    return Number(this.config.get('RESERVAS_HORAS_LIMITE_SENA') ?? HORAS_LIMITE_SENA);
  }

  get horasPenalizacion(): number {
    return Number(this.config.get('RESERVAS_HORAS_PENALIZACION') ?? HORAS_PENALIZACION);
  }

  private async buscar(id: number): Promise<ReservaConDatos> {
    const reserva = await this.prisma.reserva.findUnique({ where: { id }, include: INCLUIR });
    if (!reserva) throw new NotFoundException('Reserva no encontrada');
    return reserva;
  }

  /**
   * Cambia el estado solo si la reserva sigue en el estado esperado: si dos
   * personas actúan a la vez, la segunda recibe un conflicto en vez de pisar.
   */
  private async transicionar(
    reserva: ReservaConDatos,
    desde: readonly EstadoReserva[],
    data: Prisma.ReservaUncheckedUpdateManyInput,
    auditoria: { accion: 'EDITAR' | 'BAJA'; responsableId?: number; detalle: string },
  ): Promise<ReservaConDatos> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.reserva.updateMany({
        where: { id: reserva.id, estado: { in: [...desde] } },
        data,
      });
      if (count === 0) {
        throw new ConflictException(
          'La reserva cambió de estado mientras tanto. Actualizá la página.',
        );
      }
      await this.auditoria.registrar(
        { ...auditoria, entidad: 'Reserva', idEntidad: reserva.id },
        tx,
      );
    });
    return this.buscar(reserva.id);
  }

  /** Avisa al solicitante. Un aviso que falla no deshace la operación. */
  private async avisar(reserva: ReservaConDatos, novedad: NovedadReserva, motivo?: string | null) {
    try {
      await this.notificaciones.notificar({
        plantilla: this.plantilla,
        destinatarios: [reserva.usuarioId],
        referencias: [`reserva-${reserva.id}-${novedad}`],
        datos: {
          novedad,
          codigo: reserva.codigo,
          espacio: reserva.espacio.nombre,
          turno: turnoLegible(reserva),
          motivo,
          ...(novedad === 'APROBADA' && reserva.limitePagoSena
            ? { sena: pesos(reserva.montoSena), limitePago: enHoraClub(reserva.limitePagoSena) }
            : {}),
        },
      });
    } catch (error) {
      this.logger.error(
        `No se pudo avisar la reserva ${reserva.codigo}: ${(error as Error).message}`,
      );
    }
  }

  // ── US-60 · Bandeja y evaluación ──────────────────────────────────────────

  /** Condición de socio y deuda de cuota social del solicitante. */
  private async condicionSolicitante(reserva: ReservaConDatos) {
    const persona = reserva.usuario.persona;
    const esSocio = (persona?.membresias.length ?? 0) > 0;
    if (!persona || !esSocio) return { esSocio, cuotasAdeudadas: 0, deuda: 0 };
    try {
      const { cuotasPendientes, totalAdeudado } = await this.pagos.getCuotasPendientesPorSocio(
        persona.id,
      );
      return { esSocio, cuotasAdeudadas: cuotasPendientes.length, deuda: totalAdeudado };
    } catch {
      return { esSocio, cuotasAdeudadas: 0, deuda: 0 };
    }
  }

  /** Lo que ocupa el turno de la reserva (otras reservas aprobadas o bloqueos). */
  private async conflictosDe(
    reserva: Pick<ReservaConDatos, 'id' | 'espacioId' | 'inicio' | 'fin'>,
  ) {
    const [reservas, bloqueos] = await Promise.all([
      this.prisma.reserva.findMany({
        where: {
          espacioId: reserva.espacioId,
          id: { not: reserva.id },
          estado: { in: [...ESTADOS_QUE_OCUPAN] },
          inicio: { lt: reserva.fin },
          fin: { gt: reserva.inicio },
        },
        select: { id: true, codigo: true, estado: true, inicio: true, fin: true },
      }),
      this.prisma.bloqueoAgenda.findMany({ where: { espacioId: reserva.espacioId, activo: true } }),
    ]);
    return conflictosDe(reserva, { reservas, bloqueos }, reserva.id);
  }

  private async aBandeja(reserva: ReservaConDatos) {
    const persona = reserva.usuario.persona;
    return {
      ...this.resumen(reserva),
      solicitante: {
        usuarioId: reserva.usuarioId,
        nombre: persona ? `${persona.nombre} ${persona.apellido}`.trim() : reserva.usuario.email,
        dni: persona?.dni ?? null,
        telefono: persona?.telefono ?? null,
        email: reserva.usuario.email,
        ...(await this.condicionSolicitante(reserva)),
      },
      conflictos:
        reserva.estado === 'PENDIENTE_APROBACION'
          ? (await this.conflictosDe(reserva)).map((c) => ({
              tipo: c.tipo,
              detalle: c.detalle,
              desde: enHoraClub(c.inicio),
              hasta: enHoraClub(c.fin),
            }))
          : [],
    };
  }

  /**
   * US-60 CA 1-2: bandeja ordenada por fecha del turno y, a igual fecha, por
   * fecha de solicitud, con los datos del solicitante y su condición.
   */
  async listarSolicitudes(query: FindSolicitudesQueryDto = {}) {
    const termino = query.busqueda?.trim();
    const reservas = await this.prisma.reserva.findMany({
      where: {
        estado: { in: query.estado?.length ? query.estado : ['PENDIENTE_APROBACION'] },
        ...(termino
          ? {
              OR: [
                { codigo: { contains: termino, mode: 'insensitive' } },
                { usuario: { persona: { nombre: { contains: termino, mode: 'insensitive' } } } },
                { usuario: { persona: { apellido: { contains: termino, mode: 'insensitive' } } } },
                { usuario: { persona: { dni: { contains: termino } } } },
              ],
            }
          : {}),
      },
      include: INCLUIR,
      orderBy: [{ inicio: 'asc' }, { creadoEn: 'asc' }],
    });
    return Promise.all(reservas.map((r) => this.aBandeja(r)));
  }

  /**
   * US-60 CA 3: aprueba, fija el plazo para pagar la seña y bloquea el turno.
   * Antes verifica que el turno siga libre (decisión 0004).
   */
  async aprobar(id: number, responsableId: number) {
    const reserva = await this.buscar(id);
    if (reserva.estado !== 'PENDIENTE_APROBACION') {
      throw new BadRequestException('Solo se pueden aprobar solicitudes pendientes de aprobación');
    }
    const conflicto = (await this.conflictosDe(reserva))[0];
    if (conflicto) {
      throw new ConflictException(
        `El turno ya no está disponible: se superpone con ${conflicto.detalle} (${enHoraClub(conflicto.inicio)} a ${enHoraClub(conflicto.fin).slice(-5)}).`,
      );
    }
    const limitePagoSena = new Date(Date.now() + this.horasLimiteSena * MS_HORA);
    const aprobada = await this.transicionar(
      reserva,
      ['PENDIENTE_APROBACION'],
      {
        estado: 'APROBADA_PENDIENTE_PAGO',
        limitePagoSena,
        evaluadaPorId: responsableId,
        evaluadaEn: new Date(),
      },
      {
        accion: 'EDITAR',
        responsableId,
        detalle: `Reserva ${reserva.codigo} aprobada (${reserva.espacio.nombre}, ${turnoLegible(reserva)}). Seña ${pesos(reserva.montoSena)} hasta ${enHoraClub(limitePagoSena)}.`,
      },
    );
    await this.avisar(aprobada, 'APROBADA');
    return {
      mensaje: `Solicitud ${reserva.codigo} aprobada. El turno quedó bloqueado y el solicitante tiene hasta el ${enHoraClub(limitePagoSena)} para pagar la seña.`,
      reserva: this.resumen(aprobada),
    };
  }

  /** US-60 CA 4: rechaza con motivo obligatorio y avisa al solicitante. */
  async rechazar(id: number, motivo: string, responsableId: number) {
    const reserva = await this.buscar(id);
    if (reserva.estado !== 'PENDIENTE_APROBACION') {
      throw new BadRequestException('Solo se pueden rechazar solicitudes pendientes de aprobación');
    }
    const rechazada = await this.transicionar(
      reserva,
      ['PENDIENTE_APROBACION'],
      {
        estado: 'RECHAZADA',
        motivoRechazo: motivo,
        evaluadaPorId: responsableId,
        evaluadaEn: new Date(),
      },
      {
        accion: 'EDITAR',
        responsableId,
        detalle: `Reserva ${reserva.codigo} rechazada. Motivo: ${motivo}`,
      },
    );
    await this.avisar(rechazada, 'RECHAZADA', motivo);
    return {
      mensaje: `Solicitud ${reserva.codigo} rechazada. Le avisamos al solicitante.`,
      reserva: this.resumen(rechazada),
    };
  }

  /** US-60 (cobro de la seña): secretaría registra el pago y la reserva queda confirmada. */
  async registrarSena(id: number, metodoPago: string, responsableId: number) {
    const reserva = await this.buscar(id);
    if (reserva.estado !== 'APROBADA_PENDIENTE_PAGO') {
      throw new BadRequestException(
        'Solo se puede registrar la seña de una reserva aprobada pendiente de pago',
      );
    }
    const confirmada = await this.transicionar(
      reserva,
      ['APROBADA_PENDIENTE_PAGO'],
      { estado: 'CONFIRMADA', senaPagadaEn: new Date(), metodoPagoSena: metodoPago },
      {
        accion: 'EDITAR',
        responsableId,
        detalle: `Seña de la reserva ${reserva.codigo} cobrada por secretaría (${pesos(reserva.montoSena)}, ${metodoPago}). Reserva confirmada.`,
      },
    );
    return {
      mensaje: `Seña registrada. La reserva ${reserva.codigo} quedó confirmada.`,
      reserva: this.resumen(confirmada),
    };
  }

  /** US-60 · decisión 0004: el solicitante paga la seña online con la pasarela. */
  async iniciarPagoSena(id: number, usuarioId: number) {
    const reserva = await this.buscar(id);
    if (reserva.usuarioId !== usuarioId)
      throw new ForbiddenException('La reserva pertenece a otro usuario');
    if (reserva.estado !== 'APROBADA_PENDIENTE_PAGO') {
      throw new BadRequestException(
        'Solo se puede pagar la seña de una reserva aprobada pendiente de pago',
      );
    }
    if (reserva.limitePagoSena && reserva.limitePagoSena < new Date()) {
      throw new BadRequestException(
        'Venció el plazo para pagar la seña. Comunicate con la secretaría del club.',
      );
    }
    return this.pasarela.iniciarCobro({
      concepto: 'RESERVA',
      usuarioId,
      descripcion: `Seña de la reserva ${reserva.codigo} (${reserva.espacio.nombre})`,
      items: [
        {
          titulo: `Seña reserva ${reserva.codigo} — ${reserva.espacio.nombre}`,
          cantidad: 1,
          precioUnitario: Number(reserva.montoSena),
        },
      ],
      datos: { reservaId: reserva.id } satisfies DatosCobroReserva,
    });
  }

  // ── US-61 · Cancelaciones ─────────────────────────────────────────────────

  /** Hasta cuándo el solicitante puede cancelar solo. */
  limiteCancelacion(inicio: Date): Date {
    return new Date(inicio.getTime() - this.horasPenalizacion * MS_HORA);
  }

  /** US-61 CA 3: el solicitante cancela desde su panel antes del plazo de penalización. */
  async cancelarPorUsuario(id: number, usuarioId: number) {
    const reserva = await this.buscar(id);
    if (reserva.usuarioId !== usuarioId)
      throw new ForbiddenException('La reserva pertenece a otro usuario');
    if (!ESTADOS_VIGENTES.includes(reserva.estado)) {
      throw new BadRequestException('La reserva ya no está vigente: fue rechazada o cancelada');
    }
    const limite = this.limiteCancelacion(reserva.inicio);
    if (new Date() > limite) {
      throw new BadRequestException(
        `Solo podés cancelar hasta ${this.horasPenalizacion} horas antes del turno (límite: ${enHoraClub(limite)}). Comunicate con la secretaría del club.`,
      );
    }
    const cancelada = await this.transicionar(
      reserva,
      ESTADOS_VIGENTES,
      { estado: 'CANCELADA_USUARIO', canceladaPorId: usuarioId, canceladaEn: new Date() },
      {
        accion: 'BAJA',
        responsableId: usuarioId,
        detalle: `Reserva ${reserva.codigo} cancelada por el solicitante. Turno liberado.`,
      },
    );
    return {
      mensaje: `Cancelaste la reserva ${reserva.codigo}. El turno quedó libre.`,
      reserva: this.resumen(cancelada),
    };
  }

  /** US-61 CA 2: la administración cancela por prioridad institucional, con motivo. */
  async cancelarPorInstitucion(id: number, motivo: string, responsableId: number) {
    const reserva = await this.buscar(id);
    if (reserva.estado === 'PENDIENTE_APROBACION') {
      throw new BadRequestException('Una solicitud pendiente se rechaza, no se cancela');
    }
    if (!ESTADOS_QUE_OCUPAN.includes(reserva.estado)) {
      throw new BadRequestException('La reserva ya no está vigente: fue rechazada o cancelada');
    }
    const cancelada = await this.transicionar(
      reserva,
      ESTADOS_QUE_OCUPAN,
      {
        estado: 'CANCELADA_INSTITUCION',
        motivoCancelacion: motivo,
        canceladaPorId: responsableId,
        canceladaEn: new Date(),
      },
      {
        accion: 'BAJA',
        responsableId,
        detalle: `Reserva ${reserva.codigo} cancelada por la institución. Motivo: ${motivo}. Turno liberado.${reserva.estado === 'CONFIRMADA' ? ' Tenía la seña pagada: corresponde devolverla.' : ''}`,
      },
    );
    await this.avisar(cancelada, 'CANCELADA_INSTITUCION', motivo);
    return {
      mensaje: `Reserva ${reserva.codigo} cancelada. Le avisamos al solicitante y el turno quedó libre.`,
      reserva: this.resumen(cancelada),
    };
  }

  /** US-61 CA 1: cancelación por falta de pago una vez vencido el plazo de la seña. */
  async cancelarPorFaltaPago(id: number, responsableId?: number) {
    const reserva = await this.buscar(id);
    if (reserva.estado !== 'APROBADA_PENDIENTE_PAGO') {
      throw new BadRequestException(
        'Solo se cancela por falta de pago una reserva aprobada pendiente de pago',
      );
    }
    if (reserva.limitePagoSena && reserva.limitePagoSena > new Date()) {
      throw new BadRequestException(
        `El plazo para pagar la seña todavía no venció (vence el ${enHoraClub(reserva.limitePagoSena)}).`,
      );
    }
    const cancelada = await this.transicionar(
      reserva,
      ['APROBADA_PENDIENTE_PAGO'],
      {
        estado: 'CANCELADA_FALTA_PAGO',
        canceladaPorId: responsableId ?? null,
        canceladaEn: new Date(),
      },
      {
        accion: 'BAJA',
        responsableId: responsableId ?? reserva.usuarioId,
        detalle: `Reserva ${reserva.codigo} cancelada por falta de pago de la seña${responsableId ? '' : ' (tarea automática)'}. Turno liberado.`,
      },
    );
    await this.avisar(cancelada, 'CANCELADA_FALTA_PAGO');
    return {
      mensaje: `Reserva ${reserva.codigo} cancelada por falta de pago. El turno quedó libre.`,
      reserva: this.resumen(cancelada),
    };
  }

  /** US-61 CA 1 (tarea automática): cancela las reservas con la seña vencida. */
  async vencerSenas(hoy = new Date()) {
    const vencidas = await this.prisma.reserva.findMany({
      where: { estado: 'APROBADA_PENDIENTE_PAGO', limitePagoSena: { lt: hoy } },
      select: { id: true },
    });
    let canceladas = 0;
    for (const { id } of vencidas) {
      try {
        await this.cancelarPorFaltaPago(id);
        canceladas++;
      } catch (error) {
        // Otro proceso la cambió (p. ej. se pagó la seña justo ahora).
        this.logger.warn(`Reserva #${id} no se canceló: ${(error as Error).message}`);
      }
    }
    return { revisadas: vencidas.length, canceladas };
  }

  // ── US-62 · Mis Reservas ──────────────────────────────────────────────────

  /** US-62: todas las reservas del usuario, de la más reciente a la más antigua. */
  async misReservas(usuarioId: number) {
    const reservas = await this.prisma.reserva.findMany({
      where: { usuarioId },
      include: INCLUIR,
      orderBy: { creadoEn: 'desc' },
    });
    const ahora = new Date();
    return reservas.map((r) => {
      const limiteCancelacion = this.limiteCancelacion(r.inicio);
      return {
        ...this.resumen(r),
        limiteCancelacion,
        limiteCancelacionTexto: enHoraClub(limiteCancelacion),
        puedeCancelar: ESTADOS_VIGENTES.includes(r.estado) && ahora <= limiteCancelacion,
        puedePagarSena:
          r.estado === 'APROBADA_PENDIENTE_PAGO' &&
          (!r.limitePagoSena || r.limitePagoSena >= ahora),
        instruccionesSena: r.estado === 'APROBADA_PENDIENTE_PAGO' ? INSTRUCCIONES_SENA : null,
      };
    });
  }

  private resumen(r: ReservaConDatos) {
    return {
      id: r.id,
      codigo: r.codigo,
      estado: r.estado,
      espacio: r.espacio,
      inicio: r.inicio,
      fin: r.fin,
      turno: turnoLegible(r),
      esSocio: r.esSocio,
      montoTotal: Number(r.montoTotal),
      montoSena: Number(r.montoSena),
      observaciones: r.observaciones,
      limitePagoSena: r.limitePagoSena,
      limitePagoSenaTexto: r.limitePagoSena ? enHoraClub(r.limitePagoSena) : null,
      senaPagadaEn: r.senaPagadaEn,
      metodoPagoSena: r.metodoPagoSena,
      motivoRechazo: r.motivoRechazo,
      motivoCancelacion: r.motivoCancelacion,
      creadoEn: r.creadoEn,
    };
  }
}
