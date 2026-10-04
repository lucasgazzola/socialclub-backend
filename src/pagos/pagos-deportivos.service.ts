import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { RegistrarPagoDeportivoDto } from './dto/registrar-pago-deportivo.dto';
import {
  aPeriodo,
  eraSocioEn,
  montoACobrar,
  periodosEntre,
  tarifaVigente,
  type TarifaDeportiva,
} from '../cuotas/tarifas';

export type EstadoDeudaDeportiva = 'AL_DIA' | 'MOROSO';

export interface CuotaDeportivaPendiente {
  disciplinaId: number;
  disciplinaNombre: string;
  categoriaNombre: string | null;
  periodo: string;
  /** null = no hay tarifa configurada para ese período (no se puede cobrar). */
  monto: number | null;
  /** Tarifa sin descuento (para mostrar el descuento aplicado). */
  montoTarifa: number | null;
  /** Descuento de socio aplicado en ese período (0 si no era socio). */
  descuentoSocioPorcentaje: number;
  esSocio: boolean;
  sinTarifa: boolean;
  /** false si la deuda es de una disciplina ya dada de baja. */
  inscripcionActiva: boolean;
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

  /**
   * La persona con TODAS sus inscripciones (también las dadas de baja: su
   * deuda anterior a la baja se conserva) y sus membresías (para saber en qué
   * meses era socia y aplicar el descuento).
   */
  private async getParticipante(personaId: number) {
    const persona = await this.prisma.persona.findUnique({
      where: { id: personaId },
      include: {
        inscripciones: {
          include: {
            disciplina: true,
            categoriaDisciplina: true,
            periodos: { orderBy: { desde: 'asc' } },
          },
          orderBy: { disciplina: { nombre: 'asc' } },
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

    const membresiaActiva = persona.membresias.find((m) => m.activo) ?? null;
    return { persona, membresiaActiva };
  }

  /** Tarifas de las disciplinas indicadas, agrupadas por disciplina. */
  private async getTarifas(disciplinaIds: number[]) {
    const filas = disciplinaIds.length
      ? await this.prisma.configuracionCuotaDeportiva.findMany({
          where: { disciplinaId: { in: disciplinaIds } },
        })
      : [];
    const porDisciplina = new Map<number, TarifaDeportiva[]>();
    for (const f of filas) {
      const lista = porDisciplina.get(f.disciplinaId) ?? [];
      lista.push({
        id: f.id,
        categoriaDisciplinaId: f.categoriaDisciplinaId,
        periodoAplicacion: f.periodoAplicacion,
        monto: Number(f.monto),
        descuentoSocioPorcentaje: f.descuentoSocioPorcentaje,
        activo: f.activo,
      });
      porDisciplina.set(f.disciplinaId, lista);
    }
    return porDisciplina;
  }

  /**
   * Períodos que se le cobran a una inscripción: los meses de cada tramo en
   * que estuvo inscripta (DT-41), desde el alta hasta la baja o hasta hoy
   * (ambos meses completos). Si se reinscribió, los tramos anteriores siguen
   * contando. Sin historial (datos viejos) se usa el alta y la baja actuales.
   */
  private periodosDe(inscripcion: {
    fechaInscripcion: Date;
    fechaBaja: Date | null;
    activo: boolean;
    periodos?: { desde: Date; hasta: Date | null }[];
  }) {
    const tramos = inscripcion.periodos?.length
      ? inscripcion.periodos
      : [
          {
            desde: inscripcion.fechaInscripcion,
            hasta: !inscripcion.activo ? inscripcion.fechaBaja : null,
          },
        ];
    const meses = new Set(tramos.flatMap((t) => periodosEntre(t.desde, t.hasta ?? new Date())));
    return [...meses].sort();
  }

  /**
   * US-21 — Cuotas deportivas pendientes y estado de deuda de un participante.
   * Por cada inscripción (activa o dada de baja), los meses sin pago con el
   * monto de la tarifa vigente (disciplina o categoría) y el descuento de
   * socio si lo era ese mes. Un mes sin tarifa figura como "sin tarifa".
   */
  async getPendientesPorPersona(personaId: number) {
    const { persona, membresiaActiva } = await this.getParticipante(personaId);
    const tarifas = await this.getTarifas([
      ...new Set(persona.inscripciones.map((i) => i.disciplinaId)),
    ]);
    const pagos = await this.prisma.pagoCuotaDeportiva.findMany({ where: { personaId } });

    const pendientes: CuotaDeportivaPendiente[] = [];
    for (const inscripcion of persona.inscripciones) {
      const pagados = new Set(
        pagos.filter((p) => p.disciplinaId === inscripcion.disciplinaId).map((p) => p.periodo),
      );
      for (const periodo of this.periodosDe(inscripcion)) {
        if (pagados.has(periodo)) continue;
        const tarifa = tarifaVigente(
          tarifas.get(inscripcion.disciplinaId) ?? [],
          inscripcion.categoriaDisciplinaId ?? null,
          periodo,
        );
        const esSocio = eraSocioEn(persona.membresias, periodo);
        pendientes.push({
          disciplinaId: inscripcion.disciplinaId,
          disciplinaNombre: inscripcion.disciplina.nombre,
          categoriaNombre: inscripcion.categoriaDisciplina?.nombre ?? null,
          periodo,
          monto: tarifa ? montoACobrar(tarifa, esSocio) : null,
          montoTarifa: tarifa?.monto ?? null,
          descuentoSocioPorcentaje: tarifa && esSocio ? tarifa.descuentoSocioPorcentaje : 0,
          esSocio,
          sinTarifa: !tarifa,
          inscripcionActiva: inscripcion.activo,
        });
      }
    }

    const cobrables = pendientes.filter((p) => p.monto !== null);
    const totalAdeudado = Math.round(cobrables.reduce((s, p) => s + (p.monto ?? 0), 0) * 100) / 100;
    // Moroso = hay meses con tarifa sin pagar. Los meses sin tarifa no se pueden cobrar.
    const estadoDeuda: EstadoDeudaDeportiva = cobrables.length === 0 ? 'AL_DIA' : 'MOROSO';

    return {
      personaId: persona.id,
      participanteNombre: `${persona.nombre} ${persona.apellido}`.trim(),
      dni: persona.dni,
      esSocio: !!membresiaActiva,
      categoria: membresiaActiva?.categoria?.nombre ?? null,
      categoriaId: membresiaActiva?.categoriaId ?? null,
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

    const { persona } = await this.getParticipante(personaId);

    // Se puede cobrar la deuda de una inscripción activa o ya dada de baja.
    const inscripcion = persona.inscripciones.find((i) => i.disciplinaId === dto.disciplinaId);
    if (!inscripcion) {
      throw new BadRequestException('El participante no está inscripto en la disciplina indicada');
    }

    // No se permiten períodos futuros.
    const actual = periodoActualDeportivo();
    const futuros = dto.periodos.filter((p) => p > actual);
    if (futuros.length > 0) {
      throw new BadRequestException(
        `No se permite registrar pagos de períodos futuros (${futuros.join(', ')})`,
      );
    }

    // Solo los meses en que estuvo inscripto (cada tramo, de la inscripción a la baja).
    const meses = this.periodosDe(inscripcion);
    const cobrables = new Set(meses);
    const periodoInscripcion = meses[0] ?? aPeriodo(inscripcion.fechaInscripcion);
    const previos = dto.periodos.filter((p) => p < periodoInscripcion);
    if (previos.length > 0) {
      throw new BadRequestException(
        `No se permite registrar pagos anteriores a la inscripción (${periodoInscripcion}): ${previos.join(', ')}`,
      );
    }
    const ultimoMes = meses[meses.length - 1];
    const posterioresBaja = dto.periodos.filter((p) => !cobrables.has(p) && p > ultimoMes);
    if (posterioresBaja.length > 0) {
      throw new BadRequestException(
        `No se permite registrar pagos posteriores a la baja de la disciplina: ${posterioresBaja.join(', ')}`,
      );
    }
    // DT-41: meses entre una baja y la reinscripción siguiente.
    const sinInscripcion = dto.periodos.filter((p) => !cobrables.has(p));
    if (sinInscripcion.length > 0) {
      throw new BadRequestException(
        `No se permite registrar pagos de meses en que no estuvo inscripto en la disciplina: ${sinInscripcion.join(', ')}`,
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

    // TASK-33: el monto sale de la tarifa (disciplina o categoría) con el
    // descuento de socio si lo era ese mes.
    const tarifas = (await this.getTarifas([dto.disciplinaId])).get(dto.disciplinaId) ?? [];
    const items: { periodo: string; monto: number }[] = [];
    let montoTotal = 0;
    for (const periodo of dto.periodos) {
      const tarifa = tarifaVigente(tarifas, inscripcion.categoriaDisciplinaId ?? null, periodo);
      if (!tarifa) {
        throw new BadRequestException(
          `No hay una tarifa configurada para ${inscripcion.disciplina.nombre} en el período ${periodo}`,
        );
      }
      const monto = montoACobrar(tarifa, eraSocioEn(persona.membresias, periodo));
      items.push({ periodo, monto });
      montoTotal += monto;
    }
    montoTotal = Math.round(montoTotal * 100) / 100;

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
