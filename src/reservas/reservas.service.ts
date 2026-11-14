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
import {
  conflictosDe,
  diaCompleto,
  ESTADOS_QUE_OCUPAN,
  ESTADOS_VIGENTES,
  fechaClub,
  generarCodigoReserva,
  HUSO_CLUB_MINUTOS,
  instanteClub,
  obtenerIdsEspaciosRelacionados,
} from './agenda';
import { ReservasPlantilla, type NovedadReserva } from './reservas.plantilla';
import type { DisponibilidadQueryDto } from './dto/disponibilidad-query.dto';
import type { FindSolicitudesQueryDto } from './dto/find-solicitudes-query.dto';
import type { DatosCobroReserva } from './reserva.acreditador';
import type { CreateReservaDto, PresupuestoReservaDto } from './dto/solicitar-reserva.dto';

/** Plazos por defecto (decisión 0004); se cambian con variables de entorno. */
export const HORAS_LIMITE_SENA = 48;
export const HORAS_PENALIZACION = 48;
export const MINUTOS_ANTICIPACION_SENA = 30;

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
    const idsEspacios = await obtenerIdsEspaciosRelacionados(this.prisma, reserva.espacioId);

    const [reservas, bloqueos] = await Promise.all([
      this.prisma.reserva.findMany({
        where: {
          espacioId: { in: idsEspacios },
          id: { not: reserva.id },
          estado: { in: [...ESTADOS_QUE_OCUPAN] },
          inicio: { lt: reserva.fin },
          fin: { gt: reserva.inicio },
        },
        select: {
          id: true,
          codigo: true,
          estado: true,
          inicio: true,
          fin: true,
          espacioId: true,
          espacio: { select: { id: true, nombre: true } },
        },
      }),
      this.prisma.bloqueoAgenda.findMany({
        where: { espacioId: { in: idsEspacios }, activo: true },
        include: {
          espacio: { select: { id: true, nombre: true } },
        },
      }),
    ]);
    return conflictosDe(reserva, { reservas, bloqueos }, reserva.id, reserva.espacioId);
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
    const ahora = Date.now();
    const topeAntesDelTurno = reserva.inicio.getTime() - MINUTOS_ANTICIPACION_SENA * 60_000;
    if (topeAntesDelTurno <= ahora) {
      throw new BadRequestException(
        `No se puede aprobar: faltan menos de ${MINUTOS_ANTICIPACION_SENA} minutos para el inicio del turno y ya no hay margen para abonar la seña`,
      );
    }
    const limitePagoSena = new Date(
      Math.min(ahora + this.horasLimiteSena * MS_HORA, topeAntesDelTurno),
    );
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

  // ── US-59 · Solicitud de reserva ──────────────────────────────────────────

  /** US-59: lista los espacios activos disponibles para reservar (sin restricción de rol). */
  async listarEspaciosDisponibles() {
    const espacios = await this.prisma.espacio.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
      include: {
        espacioPadre: { select: { id: true, nombre: true } },
        subespacios: { where: { activo: true }, select: { id: true, nombre: true } },
        disciplinas: { include: { disciplina: { select: { id: true, nombre: true } } } },
      },
    });
    return espacios.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      tipo: e.tipo,
      capacidadMaxima: e.capacidadMaxima,
      modalidad: e.modalidad,
      ubicacion: e.ubicacion,
      descripcion: e.descripcion,
      espacioPadreId: e.espacioPadreId,
      espacioPadre: e.espacioPadre,
      subespacios: e.subespacios,
      precio: Number(e.precio),
      descuentoSocio: e.descuentoSocio,
      precioSocio: e.precioSocio !== null ? Number(e.precioSocio) : null,
      montoSena: Number(e.montoSena),
      disciplinas: e.disciplinas.map((d) => d.disciplina),
    }));
  }

  /** US-59 CA 1 & 4: intervalos ocupados por bloqueos o reservas en el espacio y sus relacionados. */
  async consultarDisponibilidad(query: DisponibilidadQueryDto) {
    const espacio = await this.prisma.espacio.findFirst({
      where: { id: query.espacioId, activo: true },
      select: { id: true, modalidad: true },
    });
    if (!espacio) {
      throw new NotFoundException('Espacio no encontrado o inactivo');
    }

    const desdeDate = this.parsearFechaIso(query.desde, 'desde');
    const hastaDate = this.parsearFechaIso(query.hasta, 'hasta');
    if (hastaDate < desdeDate) {
      throw new BadRequestException('La fecha hasta debe ser mayor o igual a la fecha desde');
    }
    const diasRango = (hastaDate.getTime() - desdeDate.getTime()) / 86_400_000 + 1;
    if (diasRango > 62) {
      throw new BadRequestException('El rango máximo de consulta es de 62 días');
    }

    const [a1, m1, d1] = [
      desdeDate.getUTCFullYear(),
      desdeDate.getUTCMonth() + 1,
      desdeDate.getUTCDate(),
    ];
    const rango = {
      inicio: instanteClub(a1, m1, d1, '00:00'),
      fin: diaCompleto(hastaDate).fin,
    };

    const conflictos = await this.conflictosEnIntervalo(espacio.id, rango);
    return {
      espacioId: espacio.id,
      modalidad: espacio.modalidad,
      desde: query.desde,
      hasta: query.hasta,
      ocupados: conflictos.map((c) => ({
        tipo: c.tipo,
        inicio: c.inicio,
        fin: c.fin,
        detalle: c.detalle,
      })),
    };
  }

  /** US-59 CA 4, 5 & 6: verifica disponibilidad en tiempo real y calcula presupuesto + seña. */
  async calcularPresupuesto(usuarioId: number, dto: PresupuestoReservaDto) {
    const espacio = await this.prisma.espacio.findFirst({
      where: { id: dto.espacioId, activo: true },
    });
    if (!espacio) {
      throw new NotFoundException('Espacio no encontrado o inactivo');
    }

    const { inicio, fin, horas } = this.resolverTurno(espacio.modalidad, dto);
    const [conflictos, tarifa] = await Promise.all([
      this.conflictosEnIntervalo(espacio.id, { inicio, fin }),
      this.condicionTarifaUsuario(usuarioId),
    ]);

    const precioRegularUnitario = Number(espacio.precio);
    const precioSocioUnitario =
      espacio.precioSocio !== null
        ? Number(espacio.precioSocio)
        : Math.round(precioRegularUnitario * (1 - espacio.descuentoSocio / 100) * 100) / 100;
    const precioUnitario = tarifa.aplicaTarifaSocio ? precioSocioUnitario : precioRegularUnitario;
    const cantidad = espacio.modalidad === 'DIA_COMPLETO' ? 1 : horas;
    const montoRegular = Math.round(precioRegularUnitario * cantidad * 100) / 100;
    const montoTotal = Math.round(precioUnitario * cantidad * 100) / 100;
    const descuentoAplicado = Math.round((montoRegular - montoTotal) * 100) / 100;
    const montoSena = Math.min(Number(espacio.montoSena), montoTotal);

    return {
      disponible: conflictos.length === 0,
      conflictos: conflictos.map((c) => ({
        tipo: c.tipo,
        inicio: c.inicio,
        fin: c.fin,
        detalle: c.detalle,
      })),
      inicio,
      fin,
      modalidad: espacio.modalidad,
      cantidad,
      esSocio: tarifa.esSocio,
      alDia: tarifa.alDia,
      aplicaTarifaSocio: tarifa.aplicaTarifaSocio,
      cuotasAdeudadas: tarifa.cuotasAdeudadas,
      precioRegularUnitario,
      precioSocioUnitario,
      descuentoSocioPct: espacio.descuentoSocio,
      montoRegular,
      descuentoAplicado,
      montoTotal,
      montoSena,
    };
  }

  /** US-59 CA 7: registra la solicitud en PENDIENTE_APROBACION y emite código RES-XXXXXX. */
  async solicitarReserva(usuarioId: number, dto: CreateReservaDto) {
    const presupuesto = await this.calcularPresupuesto(usuarioId, dto);
    if (!presupuesto.disponible) {
      throw new ConflictException(
        `El espacio no está disponible en ese horario: ${presupuesto.conflictos[0].detalle}`,
      );
    }

    const pendienteDuplicada = await this.prisma.reserva.findFirst({
      where: {
        usuarioId,
        espacioId: dto.espacioId,
        estado: 'PENDIENTE_APROBACION',
        inicio: { lt: presupuesto.fin },
        fin: { gt: presupuesto.inicio },
      },
      select: { codigo: true },
    });
    if (pendienteDuplicada) {
      throw new ConflictException(
        `Ya tenés una solicitud pendiente (${pendienteDuplicada.codigo}) para este espacio en ese horario`,
      );
    }

    const codigo = await this.generarCodigoUnico();
    const creada = await this.prisma.$transaction(async (tx) => {
      const reserva = await tx.reserva.create({
        data: {
          codigo,
          espacioId: dto.espacioId,
          usuarioId,
          inicio: presupuesto.inicio,
          fin: presupuesto.fin,
          estado: 'PENDIENTE_APROBACION',
          esSocio: presupuesto.aplicaTarifaSocio,
          montoTotal: presupuesto.montoTotal,
          montoSena: presupuesto.montoSena,
        },
        include: INCLUIR,
      });

      await this.auditoria.registrar(
        {
          accion: 'CREAR',
          entidad: 'Reserva',
          idEntidad: reserva.id,
          responsableId: usuarioId,
          detalle: `Solicitud de reserva ${reserva.codigo} creada para ${reserva.espacio.nombre} (${turnoLegible(reserva)}).`,
        },
        tx,
      );

      return reserva;
    });

    return {
      mensaje: `Solicitud ${creada.codigo} enviada. Queda pendiente de aprobación.`,
      reserva: this.resumen(creada),
    };
  }

  private async condicionTarifaUsuario(usuarioId: number) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        persona: {
          select: {
            id: true,
            membresias: { where: { activo: true }, select: { id: true } },
          },
        },
      },
    });
    const persona = usuario?.persona;
    const esSocio = (persona?.membresias.length ?? 0) > 0;
    if (!persona || !esSocio) {
      return { esSocio: false, alDia: false, aplicaTarifaSocio: false, cuotasAdeudadas: 0 };
    }
    try {
      const { cuotasPendientes } = await this.pagos.getCuotasPendientesPorSocio(persona.id);
      const cuotasAdeudadas = cuotasPendientes.length;
      const alDia = cuotasAdeudadas === 0;
      return { esSocio: true, alDia, aplicaTarifaSocio: alDia, cuotasAdeudadas };
    } catch {
      return { esSocio: true, alDia: false, aplicaTarifaSocio: false, cuotasAdeudadas: 0 };
    }
  }

  private async conflictosEnIntervalo(espacioId: number, rango: { inicio: Date; fin: Date }) {
    const idsEspacios = await obtenerIdsEspaciosRelacionados(this.prisma, espacioId);
    const [reservas, bloqueos] = await Promise.all([
      this.prisma.reserva.findMany({
        where: {
          espacioId: { in: idsEspacios },
          estado: { in: [...ESTADOS_QUE_OCUPAN] },
          inicio: { lt: rango.fin },
          fin: { gt: rango.inicio },
        },
        select: {
          id: true,
          codigo: true,
          estado: true,
          inicio: true,
          fin: true,
          espacioId: true,
          espacio: { select: { id: true, nombre: true } },
        },
      }),
      this.prisma.bloqueoAgenda.findMany({
        where: { espacioId: { in: idsEspacios }, activo: true },
        include: { espacio: { select: { id: true, nombre: true } } },
      }),
    ]);
    return conflictosDe(rango, { reservas, bloqueos }, undefined, espacioId);
  }

  private parsearFechaIso(valor: string, campo: string): Date {
    const [anio, mes, dia] = valor.split('-').map(Number);
    const fecha = new Date(Date.UTC(anio, mes - 1, dia));
    if (
      Number.isNaN(fecha.getTime()) ||
      fecha.getUTCFullYear() !== anio ||
      fecha.getUTCMonth() + 1 !== mes ||
      fecha.getUTCDate() !== dia
    ) {
      throw new BadRequestException(`La fecha ${campo} no es válida`);
    }
    return fecha;
  }

  private resolverTurno(modalidad: string, dto: PresupuestoReservaDto) {
    const fechaDate = this.parsearFechaIso(dto.fecha, 'fecha');
    const hoyClub = fechaClub(new Date());

    if (modalidad === 'DIA_COMPLETO') {
      if (fechaDate <= hoyClub) {
        throw new BadRequestException(
          'Para espacios de día completo, la reserva debe solicitarse al menos para mañana',
        );
      }
      const { inicio, fin } = diaCompleto(fechaDate);
      return { inicio, fin, horas: 24 };
    }

    if (!dto.horaInicio || !dto.horaFin) {
      throw new BadRequestException('Debés indicar hora de inicio y hora de fin');
    }

    const [anio, mes, dia] = [
      fechaDate.getUTCFullYear(),
      fechaDate.getUTCMonth() + 1,
      fechaDate.getUTCDate(),
    ];
    const inicio = instanteClub(anio, mes, dia, dto.horaInicio);
    const fin =
      dto.horaFin === '24:00'
        ? diaCompleto(fechaDate).fin
        : instanteClub(anio, mes, dia, dto.horaFin);

    if (fin <= inicio) {
      throw new BadRequestException('La hora de fin debe ser posterior a la hora de inicio');
    }
    if (inicio <= new Date()) {
      throw new BadRequestException('El turno seleccionado ya pasó');
    }
    if (inicio.getTime() <= Date.now() + MINUTOS_ANTICIPACION_SENA * 60_000) {
      throw new BadRequestException(
        `La reserva debe solicitarse con al menos ${MINUTOS_ANTICIPACION_SENA} minutos de anticipación para poder abonar la seña`,
      );
    }
    const horas = (fin.getTime() - inicio.getTime()) / 3_600_000;
    return { inicio, fin, horas };
  }

  private async generarCodigoUnico(): Promise<string> {
    for (let i = 0; i < 8; i++) {
      const codigo = generarCodigoReserva();
      const existe = await this.prisma.reserva.findUnique({
        where: { codigo },
        select: { id: true },
      });
      if (!existe) return codigo;
    }
    throw new ConflictException('No se pudo generar un código de reserva único, reintentá');
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
