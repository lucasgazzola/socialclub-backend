import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { RegistrarPagoDeportivoDto } from './dto/registrar-pago-deportivo.dto';

export type EstadoDeudaDeportiva = 'AL_DIA' | 'MOROSO';

export interface CuotaDeportivaPendiente {
  disciplinaId: number;
  disciplinaNombre: string;
  periodo: string;
  monto: number;
}

/** Período "YYYY-MM" actual. */
export function periodoActualDeportivo(now = new Date()): string {
  const anio = now.getFullYear();
  const mes = now.getMonth() + 1;
  return `${anio}-${String(mes).padStart(2, '0')}`;
}

@Injectable()
export class PagosDeportivosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Formatea un Date a "YYYY-MM". */
  private toPeriodo(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  /** Genera los períodos "YYYY-MM" desde una fecha inicial hasta una final (por defecto hoy). */
  private generarPeriodosHasta(fechaInicio: Date, fechaFin: Date = new Date()): string[] {
    const periodos: string[] = [];
    const actual = new Date(fechaInicio.getFullYear(), fechaInicio.getMonth(), 1);
    const fin = new Date(fechaFin.getFullYear(), fechaFin.getMonth(), 1);
    while (actual <= fin) {
      periodos.push(this.toPeriodo(actual));
      actual.setMonth(actual.getMonth() + 1);
    }
    return periodos;
  }

  /**
   * Obtiene la persona con sus inscripciones activas y su membresía (para
   * resolver la categoría de socio que determina el monto de la cuota deportiva).
   */
  private async getParticipante(personaId: number) {
    const persona = await this.prisma.persona.findUnique({
      where: { id: personaId },
      include: {
        inscripciones: {
          where: { activo: true },
          include: { disciplina: true },
        },
        membresias: {
          include: { categoria: true },
          orderBy: { fechaAlta: 'desc' },
        },
      },
    });

    if (!persona) {
      throw new NotFoundException('Participante no encontrado');
    }

    const membresiaActiva = persona.membresias.find((m) => m.activo);
    const membresia = membresiaActiva ?? persona.membresias[0] ?? null;

    return { persona, membresia };
  }

  /**
   * Determina el monto de la cuota deportiva vigente para una disciplina,
   * categoría de socio y período dados. Toma la configuración con
   * periodoAplicacion <= periodo (la más reciente); si no hay una anterior,
   * usa la más antigua configurada como fallback.
   */
  async getMontoCuotaDeportiva(
    disciplinaId: number,
    categoriaId: number,
    periodo: string,
  ): Promise<number> {
    const config = await this.prisma.configuracionCuotaDeportiva.findFirst({
      where: { disciplinaId, categoriaId, periodoAplicacion: { lte: periodo } },
      orderBy: { periodoAplicacion: 'desc' },
    });
    if (config) {
      return Number(config.monto);
    }

    const fallback = await this.prisma.configuracionCuotaDeportiva.findFirst({
      where: { disciplinaId, categoriaId },
      orderBy: { periodoAplicacion: 'asc' },
    });
    return fallback ? Number(fallback.monto) : 0;
  }

  /**
   * US-21 — Cuotas deportivas pendientes y estado de deuda de un participante.
   * La deuda de cada disciplina corre desde la fecha de inscripción hasta el
   * período actual; se considera pendiente todo período sin un pago registrado.
   */
  async getPendientesPorPersona(personaId: number) {
    const { persona, membresia } = await this.getParticipante(personaId);
    const categoriaId = membresia?.categoriaId ?? null;

    const pagos = await this.prisma.pagoCuotaDeportiva.findMany({
      where: { personaId },
    });

    const pendientes: CuotaDeportivaPendiente[] = [];
    let totalAdeudado = 0;

    for (const inscripcion of persona.inscripciones) {
      const periodos = this.generarPeriodosHasta(inscripcion.fechaInscripcion);
      const pagados = new Set(
        pagos.filter((p) => p.disciplinaId === inscripcion.disciplinaId).map((p) => p.periodo),
      );

      for (const periodo of periodos) {
        if (pagados.has(periodo)) continue;
        const monto =
          categoriaId != null
            ? await this.getMontoCuotaDeportiva(inscripcion.disciplinaId, categoriaId, periodo)
            : 0;
        pendientes.push({
          disciplinaId: inscripcion.disciplinaId,
          disciplinaNombre: inscripcion.disciplina.nombre,
          periodo,
          monto,
        });
        totalAdeudado += monto;
      }
    }

    const estadoDeuda: EstadoDeudaDeportiva = pendientes.length === 0 ? 'AL_DIA' : 'MOROSO';

    return {
      personaId: persona.id,
      participanteNombre: `${persona.nombre} ${persona.apellido}`.trim(),
      dni: persona.dni,
      categoria: membresia?.categoria?.nombre ?? null,
      categoriaId,
      estadoDeuda,
      cuotasPendientes: pendientes,
      totalAdeudado,
    };
  }

  /**
   * US-21 — Registrar el pago de una o varias cuotas deportivas de una disciplina.
   *  - CA: permite uno o varios períodos en la misma operación (transacción atómica).
   *  - CA: no permite registrar un período ya pagado (ni períodos futuros).
   *  - CA: registra monto, fecha/hora, período cubierto y usuario responsable.
   *  - CA: recalcula el estado ("al día" si no quedan períodos pendientes).
   */
  async registrarPago(personaId: number, dto: RegistrarPagoDeportivoDto, responsableId: number) {
    if (!dto.periodos || dto.periodos.length === 0) {
      throw new BadRequestException('Debe seleccionar al menos un período para abonar');
    }

    // Períodos duplicados dentro de la misma operación.
    const unicos = new Set(dto.periodos);
    if (unicos.size !== dto.periodos.length) {
      throw new BadRequestException('No se pueden repetir períodos en la misma operación');
    }

    const { persona, membresia } = await this.getParticipante(personaId);

    // El participante debe estar inscripto y activo en la disciplina.
    const inscripcion = persona.inscripciones.find((i) => i.disciplinaId === dto.disciplinaId);
    if (!inscripcion) {
      throw new BadRequestException(
        'El participante no tiene una inscripción activa en la disciplina indicada',
      );
    }

    // No se permiten períodos futuros.
    const actual = periodoActualDeportivo();
    const futuros = dto.periodos.filter((p) => p > actual);
    if (futuros.length > 0) {
      throw new BadRequestException(
        `No se permite registrar pagos de períodos futuros (${futuros.join(', ')})`,
      );
    }

    // No se permiten períodos anteriores a la inscripción.
    const periodoInscripcion = this.toPeriodo(inscripcion.fechaInscripcion);
    const previos = dto.periodos.filter((p) => p < periodoInscripcion);
    if (previos.length > 0) {
      throw new BadRequestException(
        `No se permite registrar pagos anteriores a la inscripción (${periodoInscripcion}): ${previos.join(', ')}`,
      );
    }

    // CA: no permitir registrar un período que ya figura como pagado.
    const existentes = await this.prisma.pagoCuotaDeportiva.findMany({
      where: { personaId, disciplinaId: dto.disciplinaId, periodo: { in: dto.periodos } },
    });
    if (existentes.length > 0) {
      const pagados = existentes.map((p) => p.periodo).join(', ');
      throw new ConflictException(
        `No es posible procesar el pago: el/los período(s) [${pagados}] ya figuran como pagados.`,
      );
    }

    // La categoría de socio determina el monto de la cuota deportiva.
    if (membresia?.categoriaId == null) {
      throw new BadRequestException(
        'No se puede determinar la cuota deportiva: el participante no tiene una categoría de socio asociada',
      );
    }

    const items: { periodo: string; monto: number }[] = [];
    let montoTotal = 0;
    for (const periodo of dto.periodos) {
      const monto = await this.getMontoCuotaDeportiva(dto.disciplinaId, membresia.categoriaId, periodo);
      if (monto <= 0) {
        throw new BadRequestException(
          `No hay una cuota deportiva configurada (monto mayor a cero) para la disciplina en el período ${periodo}`,
        );
      }
      items.push({ periodo, monto });
      montoTotal += monto;
    }

    const metodoPago = dto.metodoPago || 'EFECTIVO';
    const fechaHora = new Date();

    const pagosCreados = await this.prisma.$transaction(async (tx) => {
      const resultados = [];
      for (const item of items) {
        const pago = await tx.pagoCuotaDeportiva.create({
          data: {
            personaId,
            disciplinaId: dto.disciplinaId,
            periodo: item.periodo,
            monto: item.monto,
            metodoPago,
            fechaPago: fechaHora,
            responsableId,
          },
        });

        await this.auditoria.registrar(
          {
            accion: 'CREAR',
            entidad: 'PagoCuotaDeportiva',
            idEntidad: pago.id,
            responsableId,
            detalle: `Cobro de cuota deportiva (${inscripcion.disciplina.nombre}) para ${persona.nombre} ${persona.apellido} (#${persona.id}). Período: ${item.periodo}, Monto: $${item.monto}, Método: ${metodoPago}${dto.observaciones ? ` - Obs: ${dto.observaciones}` : ''}`,
          },
          tx,
        );

        resultados.push(pago);
      }
      return resultados;
    });

    const resumen = await this.getPendientesPorPersona(personaId);

    return {
      mensaje: '¡Pago de cuota deportiva registrado exitosamente!',
      montoTotal,
      fechaHora,
      periodosCubiertos: dto.periodos,
      disciplinaId: dto.disciplinaId,
      disciplinaNombre: inscripcion.disciplina.nombre,
      usuarioResponsableId: responsableId,
      participante: {
        id: persona.id,
        nombre: `${persona.nombre} ${persona.apellido}`.trim(),
        dni: persona.dni,
      },
      pagos: pagosCreados.map((p) => ({
        id: p.id,
        periodo: p.periodo,
        monto: Number(p.monto),
        fechaPago: p.fechaPago,
        metodoPago: p.metodoPago,
      })),
      estadoDeudaActual: resumen.estadoDeuda,
      cuotasPendientesRestantes: resumen.cuotasPendientes.length,
    };
  }

  /**
   * US-22 — Historial de cuotas deportivas de un participante (solo lectura).
   * Muestra los pagos realizados (período, fecha, monto y usuario que lo
   * registró) y los períodos adeudados vigentes, con totales. Permite filtrar
   * los pagos por rango de fechas de pago (desde/hasta, inclusive).
   */
  async getHistorialPorPersona(
    personaId: number,
    filtros: { desde?: string; hasta?: string } = {},
  ) {
    // Reutiliza el cálculo de pendientes (deuda siempre actualizada según los
    // registros del sistema) y trae los datos del participante.
    const resumen = await this.getPendientesPorPersona(personaId);

    const rangoFecha = this.construirRangoFecha(filtros.desde, filtros.hasta);
    const pagos = await this.prisma.pagoCuotaDeportiva.findMany({
      where: {
        personaId,
        ...(rangoFecha ? { fechaPago: rangoFecha } : {}),
      },
      include: { disciplina: true, responsable: true },
      orderBy: { fechaPago: 'desc' },
    });

    const pagosSerializados = pagos.map((p) => ({
      id: p.id,
      disciplinaId: p.disciplinaId,
      disciplinaNombre: p.disciplina.nombre,
      periodo: p.periodo,
      monto: Number(p.monto),
      fechaPago: p.fechaPago,
      metodoPago: p.metodoPago,
      registradoPor: p.responsable
        ? {
            id: p.responsable.id,
            nombre: `${p.responsable.nombre} ${p.responsable.apellido}`.trim(),
          }
        : null,
    }));

    const totalPagado = pagosSerializados.reduce((s, p) => s + p.monto, 0);

    return {
      personaId: resumen.personaId,
      participanteNombre: resumen.participanteNombre,
      dni: resumen.dni,
      categoria: resumen.categoria,
      categoriaId: resumen.categoriaId,
      estadoDeuda: resumen.estadoDeuda,
      filtro: { desde: filtros.desde ?? null, hasta: filtros.hasta ?? null },
      pagos: pagosSerializados,
      adeudados: resumen.cuotasPendientes,
      totalPagado,
      totalAdeudado: resumen.totalAdeudado,
    };
  }

  /**
   * Construye el filtro Prisma de rango sobre `fechaPago`. Las fechas (YYYY-MM-DD)
   * se interpretan en horario local: `desde` desde el inicio del día y `hasta`
   * hasta el final del día, ambos inclusive.
   */
  private construirRangoFecha(desde?: string, hasta?: string) {
    if (!desde && !hasta) return undefined;
    const rango: { gte?: Date; lte?: Date } = {};
    if (desde) {
      const [y, m, d] = desde.split('-').map(Number);
      rango.gte = new Date(y, m - 1, d, 0, 0, 0, 0);
    }
    if (hasta) {
      const [y, m, d] = hasta.split('-').map(Number);
      rango.lte = new Date(y, m - 1, d, 23, 59, 59, 999);
    }
    return rango;
  }
}
