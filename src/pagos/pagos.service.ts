import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { IniciarPagoCuotasDto } from './dto/iniciar-pago-cuotas.dto';
import { PasarelaService } from '../pasarela/pasarela.service';
import type { DatosCobroCuotaSocial } from './cuota-social.acreditador';
import { RegistrarPagoSocioDto } from './dto/registrar-pago-socio.dto';
import {
  cuotaVencida,
  DIA_VENCIMIENTO_CUOTA_SOCIAL,
  fechaVencimiento,
} from './vencimiento-cuota-deportiva';
import {
  CriterioOrdenMorosos,
  FindMorososQueryDto,
  SentidoOrden,
} from './dto/find-morosos-query.dto';

export type EstadoFinancieroSocio = 'AL_DIA' | 'MOROSO';

export interface CuotaPendienteDto {
  periodo: string;
  monto: number;
  categoriaNombre: string;
  fechaVencimiento?: string;
  vencida?: boolean;
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
    private readonly pasarela: PasarelaService,
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
  async getCuotasPendientesPorSocio(socioId: number, hoy: Date = new Date()) {
    const { persona, membresia } = await this.getSocioPorPersonaId(socioId);

    const fechaFin = membresia.fechaBaja ?? hoy;
    const periodosTotales = this.generarPeriodosHasta(membresia.fechaAlta, fechaFin);
    const pagosRealizados = new Set(persona.pagos.map((p) => p.periodo));

    const cuotasPendientes: CuotaPendienteDto[] = [];
    let totalAdeudado = 0;

    for (const periodo of periodosTotales) {
      if (!pagosRealizados.has(periodo)) {
        const monto = await this.getMontoCuotaSocial(membresia.categoriaId, periodo);
        const vencida = cuotaVencida(periodo, hoy, DIA_VENCIMIENTO_CUOTA_SOCIAL);
        cuotasPendientes.push({
          periodo,
          monto,
          categoriaNombre: membresia.categoria?.nombre ?? '',
          fechaVencimiento: fechaVencimiento(periodo, DIA_VENCIMIENTO_CUOTA_SOCIAL),
          vencida,
        });
        totalAdeudado += monto;
      }
    }

    const cuotasVencidas = cuotasPendientes.filter((c) => c.vencida);
    const estadoFinanciero: EstadoFinancieroSocio =
      cuotasVencidas.length === 0 ? 'AL_DIA' : 'MOROSO';

    return {
      personaId: persona.id,
      socioNombre: `${persona.nombre} ${persona.apellido}`.trim(),
      dni: persona.dni,
      categoria: membresia.categoria?.nombre ?? '',
      categoriaId: membresia.categoriaId,
      estadoFinanciero,
      diaVencimiento: DIA_VENCIMIENTO_CUOTA_SOCIAL,
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
   * US-17 CA 3, 4, 5, 10 y 11 · TASK-51: valida los períodos a pagar de un socio
   * y calcula el monto de cada uno. La usan el cobro de secretaría y el pago
   * online, así las dos vías aplican las mismas reglas.
   */
  async cotizarCuotasSociales(
    personaId: number,
    categoriaId: number,
    periodos: string[],
  ): Promise<{ items: { periodo: string; monto: number }[]; montoTotal: number }> {
    // CA 10: No permitir registrar pago sin seleccionar al menos un período
    if (!periodos || periodos.length === 0) {
      throw new BadRequestException('Debe seleccionar al menos un período para abonar');
    }

    // CA 4: El sistema no permite registrar pagos correspondientes a períodos futuros
    const actual = periodoActual();
    const periodosFuturos = periodos.filter((p) => p > actual);
    if (periodosFuturos.length > 0) {
      throw new BadRequestException(
        `El sistema no permite registrar pagos correspondientes a períodos futuros (${periodosFuturos.join(', ')})`,
      );
    }

    // CA 3: El sistema no permite registrar el pago de un período que ya figure como pagado
    const pagosExistentes = await this.prisma.pago.findMany({
      where: {
        personaId,
        periodo: { in: periodos },
      },
    });

    if (pagosExistentes.length > 0) {
      const periodosPagados = pagosExistentes.map((p) => p.periodo).join(', ');
      throw new ConflictException(
        `No es posible procesar el pago: el/los período(s) [${periodosPagados}] ya figuran como pagados.`,
      );
    }

    // CA 5 & 11: Obtener monto vigente y validar que sea > 0
    const items: { periodo: string; monto: number }[] = [];
    let montoTotal = 0;

    for (const periodo of periodos) {
      const monto = await this.getMontoCuotaSocial(categoriaId, periodo);
      if (monto <= 0) {
        throw new BadRequestException(
          `El sistema no permite registrar pagos por montos iguales o inferiores a cero (la cuota para el período ${periodo} es $${monto}).`,
        );
      }
      items.push({ periodo, monto });
      montoTotal += monto;
    }

    if (montoTotal <= 0) {
      throw new BadRequestException('El monto total a abonar debe ser superior a cero');
    }

    return { items, montoTotal };
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
    const { items: itemsPago, montoTotal } = await this.cotizarCuotasSociales(
      persona.id,
      membresia.categoriaId,
      dto.periodos,
    );

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
   * US-10 CA 2-6 · TASK-51: el socio autenticado inicia el pago online de uno
   * o más períodos. Devuelve la orden con la URL de la pasarela; los pagos se
   * registran recién cuando la pasarela confirma (`CuotaSocialAcreditador`).
   */
  async iniciarPagoOnline(usuarioId: number, dto: IniciarPagoCuotasDto) {
    const { persona, membresia } = await this.getPersonaYSocio(usuarioId);
    const periodos = [...new Set(dto.periodos)].sort();

    // Una orden anterior sin pagar se reemplaza (si en realidad se pagó, se
    // acredita y la cotización de abajo rechaza los períodos ya pagos).
    await this.pasarela.cancelarPendientes(usuarioId, 'CUOTA_SOCIAL');
    const { items } = await this.cotizarCuotasSociales(persona.id, membresia.categoriaId, periodos);

    const categoria = membresia.categoria?.nombre ?? '';
    return this.pasarela.iniciarCobro({
      concepto: 'CUOTA_SOCIAL',
      usuarioId,
      descripcion: `Cuota social ${periodos.join(', ')}`,
      items: items.map((i) => ({
        titulo: `Cuota social ${i.periodo}${categoria ? ` — ${categoria}` : ''}`,
        cantidad: 1,
        precioUnitario: i.monto,
      })),
      datos: { personaId: persona.id, periodos: items } satisfies DatosCobroCuotaSocial,
    });
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

  /**
   * US-19: Obtener listado de socios morosos de cuota social con deuda retroactiva, ordenamiento y filtros.
   * Criterios:
   * CA 1: Nombre completo, períodos adeudados y monto total de deuda.
   * CA 2: Ordenar por monto de deuda o cantidad de períodos atrasados.
   * CA 3: Buscar por nombre, apellido o DNI, y filtrar por categoría de socio.
   * CA 4: Cálculo de deuda con tarifa histórica vigente por período.
   * CA 5: Excluir automáticamente socios al día.
   * CA 6: Mensaje / listado vacío si no hay morosos.
   */
  async getMorososCuotaSocial(query: FindMorososQueryDto = {}, hoy: Date = new Date()) {
    const {
      busqueda,
      categoriaId,
      ordenarPor = CriterioOrdenMorosos.MONTO,
      orden = SentidoOrden.DESC,
    } = query;

    const wherePersona: any = {
      membresias: {
        some: categoriaId ? { categoriaId } : {},
      },
    };

    if (busqueda && busqueda.trim()) {
      const termino = busqueda.trim();
      wherePersona.AND = [
        {
          OR: [
            { nombre: { contains: termino, mode: 'insensitive' } },
            { apellido: { contains: termino, mode: 'insensitive' } },
            { dni: { contains: termino, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const personas = await this.prisma.persona.findMany({
      where: wherePersona,
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

    const tarifasCache = new Map<string, number>();
    const getTarifaConCache = async (catId: number, periodo: string): Promise<number> => {
      const key = `${catId}:${periodo}`;
      if (tarifasCache.has(key)) {
        return tarifasCache.get(key)!;
      }
      const monto = await this.getMontoCuotaSocial(catId, periodo);
      tarifasCache.set(key, monto);
      return monto;
    };

    const morosos = [];

    for (const persona of personas) {
      if (!persona.membresias || persona.membresias.length === 0) continue;

      const membresiaActiva = persona.membresias.find((m) => m.activo);
      const ultimaMembresia = persona.membresias[0];
      const membresia = membresiaActiva ?? ultimaMembresia;

      if (categoriaId && membresia.categoriaId !== categoriaId) {
        continue;
      }

      const fechaFin = membresia.fechaBaja ?? hoy;
      const periodosTotales = this.generarPeriodosHasta(membresia.fechaAlta, fechaFin);
      const pagosRealizados = new Set(persona.pagos.map((p) => p.periodo));

      const cuotasVencidas: CuotaPendienteDto[] = [];
      let totalAdeudado = 0;

      for (const periodo of periodosTotales) {
        if (
          !pagosRealizados.has(periodo) &&
          cuotaVencida(periodo, hoy, DIA_VENCIMIENTO_CUOTA_SOCIAL)
        ) {
          const monto = await getTarifaConCache(membresia.categoriaId, periodo);
          cuotasVencidas.push({
            periodo,
            monto,
            categoriaNombre: membresia.categoria?.nombre ?? '',
            fechaVencimiento: fechaVencimiento(periodo, DIA_VENCIMIENTO_CUOTA_SOCIAL),
            vencida: true,
          });
          totalAdeudado += monto;
        }
      }

      // CA 5: Excluir socios que estén al día (sin cuotas vencidas)
      if (cuotasVencidas.length > 0) {
        morosos.push({
          personaId: persona.id,
          nombreCompleto: `${persona.nombre} ${persona.apellido}`.trim(),
          nombre: persona.nombre,
          apellido: persona.apellido,
          dni: persona.dni,
          email: persona.email,
          telefono: persona.telefono,
          categoriaId: membresia.categoriaId,
          categoria: membresia.categoria?.nombre ?? '',
          socioActivo: Boolean(membresiaActiva),
          periodosAdeudados: cuotasVencidas.map((c) => c.periodo),
          cantidadPeriodos: cuotasVencidas.length,
          montoTotalDeuda: totalAdeudado,
          cuotasPendientes: cuotasVencidas,
        });
      }
    }

    morosos.sort((a, b) => {
      let valorA: number;
      let valorB: number;

      if (ordenarPor === CriterioOrdenMorosos.PERIODOS) {
        valorA = a.cantidadPeriodos;
        valorB = b.cantidadPeriodos;
      } else {
        valorA = a.montoTotalDeuda;
        valorB = b.montoTotalDeuda;
      }

      if (orden === SentidoOrden.ASC) {
        return valorA - valorB;
      }
      return valorB - valorA;
    });

    const total = morosos.length;
    const deudaTotalClub = morosos.reduce((sum, m) => sum + m.montoTotalDeuda, 0);

    const paginados =
      query.pagina && query.porPagina
        ? morosos.slice((query.pagina - 1) * query.porPagina, query.pagina * query.porPagina)
        : morosos;

    return {
      items: paginados,
      total,
      deudaTotalClub,
      diaVencimiento: DIA_VENCIMIENTO_CUOTA_SOCIAL,
      ...(query.pagina && query.porPagina
        ? { pagina: query.pagina, porPagina: query.porPagina }
        : {}),
    };
  }
}
