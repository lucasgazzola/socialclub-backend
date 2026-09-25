import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { RegistrarPagoDto } from './dto/registrar-pago.dto';
import { RegistrarPagoSocioDto } from './dto/registrar-pago-socio.dto';

export type EstadoFinancieroSocio = 'AL_DIA' | 'MOROSO';

export interface CuotaPendienteDto {
  periodo: string;
  monto: number;
  categoriaNombre: string;
}

export function periodoActual(now = new Date()): string {
  const anio = now.getFullYear();
  const mes = now.getMonth() + 1;
  return `${anio}-${String(mes).padStart(2, '0')}`;
}

@Injectable()
export class PagosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Formatea una fecha o Date object a formato YYYY-MM */
  private toPeriodo(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  /** Genera lista de períodos YYYY-MM desde una fecha inicial hasta una fecha final (por defecto hoy) */
  private generarPeriodosHasta(fechaInicio: Date, fechaFin: Date = new Date()): string[] {
    const periodos: string[] = [];
    const inicio = new Date(fechaInicio.getFullYear(), fechaInicio.getMonth(), 1);
    const fin = new Date(fechaFin.getFullYear(), fechaFin.getMonth(), 1);

    const actual = new Date(inicio);
    while (actual <= fin) {
      periodos.push(this.toPeriodo(actual));
      actual.setMonth(actual.getMonth() + 1);
    }
    return periodos;
  }

  /**
   * Obtiene un socio directamente por su id de Persona (usado por secretaría/administración).
   * Funciona tanto para socios con cuenta de usuario como para socios sin usuario (US-17).
   */
  async getSocioPorPersonaId(personaId: number) {
    const persona = await this.prisma.persona.findUnique({
      where: { id: personaId },
      include: {
        membresias: {
          include: { categoria: true },
          orderBy: { fechaAlta: 'desc' },
        },
        pagos: {
          orderBy: { fechaPago: 'desc' },
        },
      },
    });

    if (!persona || !persona.membresias || persona.membresias.length === 0) {
      throw new NotFoundException('Socio no encontrado');
    }

    const membresiaActiva = persona.membresias.find((m) => m.activo);
    const ultimaMembresia = persona.membresias[0];
    const membresia = membresiaActiva ?? ultimaMembresia;

    if (!membresia) {
      throw new BadRequestException('El socio no posee registros de membresía');
    }

    return { persona, membresia, membresiaActiva };
  }

  /**
   * Obtiene la persona y su membresía asociada a un usuarioId (usado por autoservicio del socio).
   */
  private async getPersonaYSocio(usuarioId: number) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: {
        persona: {
          include: {
            membresias: {
              include: { categoria: true },
              orderBy: { fechaAlta: 'desc' },
            },
            pagos: {
              orderBy: { fechaPago: 'desc' },
            },
          },
        },
      },
    });

    if (!usuario || !usuario.persona) {
      throw new NotFoundException('No se encontró una ficha de persona asociada al usuario');
    }

    const persona = usuario.persona;
    const membresiaActiva = persona.membresias?.find((m) => m.activo);
    const ultimaMembresia = persona.membresias?.[0];
    const membresia = membresiaActiva ?? ultimaMembresia;

    if (!membresia) {
      throw new BadRequestException('El usuario no posee registros de membresía de socio');
    }

    return { usuario, persona, membresia, membresiaActiva };
  }

  /**
   * Determina el monto de la cuota social vigente para una categoría y período dados (US-16 / US-17 CA 5).
   * Busca la configuración con periodoAplicacion <= periodo ordenado descendentemente.
   */
  async getMontoCuotaSocial(categoriaId: number, periodo: string): Promise<number> {
    const config = await this.prisma.configuracionCuotaSocial.findFirst({
      where: {
        categoriaId,
        periodoAplicacion: { lte: periodo },
      },
      orderBy: { periodoAplicacion: 'desc' },
    });

    if (config) {
      return Number(config.monto);
    }

    // Fallback: si no hay anterior a ese período, buscar la más antigua configurada o la activa
    const configFallback = await this.prisma.configuracionCuotaSocial.findFirst({
      where: { categoriaId },
      orderBy: { periodoAplicacion: 'asc' },
    });

    return configFallback ? Number(configFallback.monto) : 0;
  }

  /**
   * US-17 CA 1, 2, 5, 6, 8, 9: Obtener cuotas pendientes y estado financiero de un socio (Secretaría)
   */
  async getCuotasPendientesPorSocio(socioId: number) {
    const { persona, membresia } = await this.getSocioPorPersonaId(socioId);

    const fechaFin = membresia.fechaBaja ?? new Date();
    const periodosTotales = this.generarPeriodosHasta(membresia.fechaAlta, fechaFin);
    const pagosRealizados = new Set(persona.pagos.map((p) => p.periodo));

    const cuotasPendientes: CuotaPendienteDto[] = [];
    let totalAdeudado = 0;

    for (const periodo of periodosTotales) {
      if (!pagosRealizados.has(periodo)) {
        const monto = await this.getMontoCuotaSocial(membresia.categoriaId, periodo);
        cuotasPendientes.push({
          periodo,
          monto,
          categoriaNombre: membresia.categoria?.nombre ?? '',
        });
        totalAdeudado += monto;
      }
    }

    const estadoFinanciero: EstadoFinancieroSocio =
      cuotasPendientes.length === 0 ? 'AL_DIA' : 'MOROSO';

    return {
      personaId: persona.id,
      socioNombre: `${persona.nombre} ${persona.apellido}`.trim(),
      dni: persona.dni,
      categoria: membresia.categoria?.nombre ?? '',
      categoriaId: membresia.categoriaId,
      estadoFinanciero,
      cuotasPendientes,
      totalAdeudado,
    };
  }

  /**
   * US-10 CA 1: Visualizar cuotas pendientes del socio autenticado (Autoservicio)
   */
  async getCuotasPendientes(usuarioId: number) {
    const { persona } = await this.getPersonaYSocio(usuarioId);
    return this.getCuotasPendientesPorSocio(persona.id);
  }

  /**
   * US-17 CA 1-13: Registrar pago de cuota social de un socio por Secretaría
   */
  async registrarPagoPorSocio(socioId: number, dto: RegistrarPagoSocioDto, responsableId: number) {
    // CA 10: No permitir registrar pago sin seleccionar al menos un período
    if (!dto.periodos || dto.periodos.length === 0) {
      throw new BadRequestException('Debe seleccionar al menos un período para abonar');
    }

    const { persona, membresia } = await this.getSocioPorPersonaId(socioId);

    // CA 4: El sistema no permite registrar pagos correspondientes a períodos futuros
    const actual = periodoActual();
    const periodosFuturos = dto.periodos.filter((p) => p > actual);
    if (periodosFuturos.length > 0) {
      throw new BadRequestException(
        `El sistema no permite registrar pagos correspondientes a períodos futuros (${periodosFuturos.join(', ')})`,
      );
    }

    // CA 3: El sistema no permite registrar el pago de un período que ya figure como pagado
    const pagosExistentes = await this.prisma.pago.findMany({
      where: {
        personaId: persona.id,
        periodo: { in: dto.periodos },
      },
    });

    if (pagosExistentes.length > 0) {
      const periodosPagados = pagosExistentes.map((p) => p.periodo).join(', ');
      throw new ConflictException(
        `No es posible procesar el pago: el/los período(s) [${periodosPagados}] ya figuran como pagados.`,
      );
    }

    // CA 5 & 11: Obtener monto vigente y validar que sea > 0
    const itemsPago: { periodo: string; monto: number }[] = [];
    let montoTotal = 0;

    for (const periodo of dto.periodos) {
      const monto = await this.getMontoCuotaSocial(membresia.categoriaId, periodo);
      if (monto <= 0) {
        throw new BadRequestException(
          `El sistema no permite registrar pagos por montos iguales o inferiores a cero (la cuota para el período ${periodo} es $${monto}).`,
        );
      }
      itemsPago.push({ periodo, monto });
      montoTotal += monto;
    }

    if (montoTotal <= 0) {
      throw new BadRequestException('El monto total a abonar debe ser superior a cero');
    }

    const metodoPago = dto.metodoPago || 'EFECTIVO';
    const fechaHoraOperacion = new Date();

    // CA 7 & 13: Transacción atómica integral (todos los períodos o ninguno)
    const pagosCreados = await this.prisma.$transaction(async (tx) => {
      const resultados = [];

      for (const item of itemsPago) {
        const pago = await tx.pago.create({
          data: {
            personaId: persona.id,
            periodo: item.periodo,
            monto: item.monto,
            metodoPago,
            fechaPago: fechaHoraOperacion,
          },
        });

        await this.auditoria.registrar(
          {
            accion: 'CREAR',
            entidad: 'Pago',
            idEntidad: pago.id,
            responsableId,
            detalle: `Cobro de cuota social registrado para el socio ${persona.nombre} ${persona.apellido} (#${persona.id}). Período: ${item.periodo}, Monto: $${item.monto}, Método: ${metodoPago}${dto.observaciones ? ` - Obs: ${dto.observaciones}` : ''}`,
          },
          tx,
        );

        resultados.push(pago);
      }

      return resultados;
    });

    // CA 8 & 9: Recalcular estado financiero inmediatamente
    const resumenActualizado = await this.getCuotasPendientesPorSocio(persona.id);

    return {
      mensaje: '¡Pago registrado exitosamente!',
      montoTotal,
      fechaHora: fechaHoraOperacion,
      periodosCubiertos: dto.periodos,
      usuarioResponsableId: responsableId,
      socio: {
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
      estadoFinancieroActual: resumenActualizado.estadoFinanciero,
      cuotasPendientesRestantes: resumenActualizado.cuotasPendientes.length,
    };
  }

  /**
   * US-10 CA 2-6: Registrar pago de uno o más períodos pendientes por el socio autenticado
   */
  async registrarPago(usuarioId: number, dto: RegistrarPagoDto) {
    const { persona } = await this.getPersonaYSocio(usuarioId);
    return this.registrarPagoPorSocio(persona.id, dto, usuarioId);
  }

  /**
   * Obtener historial de pagos de un socio por personaId (Secretaría)
   */
  async getHistorialPagosPorSocio(socioId: number) {
    const { persona } = await this.getSocioPorPersonaId(socioId);

    const pagos = await this.prisma.pago.findMany({
      where: { personaId: persona.id },
      orderBy: { fechaPago: 'desc' },
    });

    return pagos.map((p) => ({
      id: p.id,
      periodo: p.periodo,
      monto: Number(p.monto),
      fechaPago: p.fechaPago,
      metodoPago: p.metodoPago,
    }));
  }

  /**
   * Obtener historial de pagos del socio autenticado
   */
  async getHistorialPagos(usuarioId: number) {
    const { persona } = await this.getPersonaYSocio(usuarioId);
    return this.getHistorialPagosPorSocio(persona.id);
  }
}
