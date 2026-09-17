import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { RegistrarPagoDto } from './dto/registrar-pago.dto';

export type EstadoFinancieroSocio = 'AL_DIA' | 'MOROSO';

export interface CuotaPendienteDto {
  periodo: string;
  monto: number;
  categoriaNombre: string;
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

  /** Genera lista de períodos YYYY-MM desde una fecha inicial hasta el período actual */
  private generarPeriodosHastaHoy(fechaInicio: Date): string[] {
    const periodos: string[] = [];
    const inicio = new Date(fechaInicio.getFullYear(), fechaInicio.getMonth(), 1);
    const hoy = new Date();
    const fin = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const actual = new Date(inicio);
    while (actual <= fin) {
      periodos.push(this.toPeriodo(actual));
      actual.setMonth(actual.getMonth() + 1);
    }
    return periodos;
  }

  /**
   * Obtiene la persona y su membresía activa asociada a un usuarioId
   */
  private async getPersonaYSocio(usuarioId: number) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: {
        persona: {
          include: {
            membresias: {
              where: { activo: true },
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
    const membresiaActiva = persona.membresias[0];

    if (!membresiaActiva) {
      throw new BadRequestException('El usuario no posee una membresía activa de socio');
    }

    return { usuario, persona, membresiaActiva };
  }

  /**
   * Determina el monto de la cuota social para una categoría y período dados
   */
  private async getMontoCuotaSocial(categoriaId: number, periodo: string): Promise<number> {
    const config = await this.prisma.configuracionCuotaSocial.findFirst({
      where: {
        categoriaId,
        periodoAplicacion: { lte: periodo },
        activo: true,
      },
      orderBy: { periodoAplicacion: 'desc' },
    });

    if (config) {
      return Number(config.monto);
    }

    // Fallback: buscar la más reciente activa
    const configReciente = await this.prisma.configuracionCuotaSocial.findFirst({
      where: { categoriaId, activo: true },
      orderBy: { periodoAplicacion: 'desc' },
    });

    return configReciente ? Number(configReciente.monto) : 0;
  }

  /**
   * US-10 CA 1: Visualizar cuotas pendientes y estado financiero dinámico (RN05/RN06)
   */
  async getCuotasPendientes(usuarioId: number) {
    const { persona, membresiaActiva } = await this.getPersonaYSocio(usuarioId);

    const periodosTotales = this.generarPeriodosHastaHoy(membresiaActiva.fechaAlta);
    const pagosRealizados = new Set(persona.pagos.map((p) => p.periodo));

    const cuotasPendientes: CuotaPendienteDto[] = [];
    let totalAdeudado = 0;

    for (const periodo of periodosTotales) {
      if (!pagosRealizados.has(periodo)) {
        const monto = await this.getMontoCuotaSocial(membresiaActiva.categoriaId, periodo);
        cuotasPendientes.push({
          periodo,
          monto,
          categoriaNombre: membresiaActiva.categoria.nombre,
        });
        totalAdeudado += monto;
      }
    }

    const estadoFinanciero: EstadoFinancieroSocio =
      cuotasPendientes.length === 0 ? 'AL_DIA' : 'MOROSO';

    return {
      personaId: persona.id,
      socioNombre: `${persona.nombre} ${persona.apellido}`,
      categoria: membresiaActiva.categoria.nombre,
      estadoFinanciero,
      cuotasPendientes,
      totalAdeudado,
    };
  }

  /**
   * US-10 CA 2, 3, 4, 5, 6: Registrar pago de uno o más períodos pendientes
   */
  async registrarPago(usuarioId: number, dto: RegistrarPagoDto) {
    const { persona, membresiaActiva } = await this.getPersonaYSocio(usuarioId);

    // CA 5: Verificar que ninguno de los períodos requeridos ya haya sido pagado
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

    // Procesar pago en transacción atómica (Mock pasarela + auditoría RN14)
    const metodoPago = dto.metodoPago || 'MOCK_TARJETA';

    const pagosCreados = await this.prisma.$transaction(async (tx) => {
      const resultados = [];

      for (const periodo of dto.periodos) {
        const monto = await this.getMontoCuotaSocial(membresiaActiva.categoriaId, periodo);

        const pago = await tx.pago.create({
          data: {
            personaId: persona.id,
            periodo,
            monto,
            metodoPago,
            fechaPago: new Date(),
          },
        });

        await this.auditoria.registrar(
          {
            accion: 'CREAR',
            entidad: 'Pago',
            idEntidad: pago.id,
            responsableId: usuarioId,
            detalle: `Pago de cuota social registrado para el período ${periodo} (Monto: $${monto}, Método: ${metodoPago})`,
          },
          tx,
        );

        resultados.push(pago);
      }

      return resultados;
    });

    // Recalcular estado financiero dinámico actualizado
    const resumenActualizado = await this.getCuotasPendientes(usuarioId);

    return {
      mensaje: '¡Pago registrado exitosamente!',
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
   * Obtener historial de pagos del socio
   */
  async getHistorialPagos(usuarioId: number) {
    const { persona } = await this.getPersonaYSocio(usuarioId);

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
}
