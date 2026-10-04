import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoEvento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CrearEventoDto } from './dto/crear-evento.dto';
import { ActualizarEventoDto } from './dto/actualizar-evento.dto';
import { FiltrarEventosDto } from './dto/filtrar-eventos.dto';
import { mapEventoResponse } from './eventos.mapper';
import { filtroEventoTerminado } from './fin-del-evento';

@Injectable()
export class EventosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async findAll(filtros?: FiltrarEventosDto, esAdmin = false) {
    const { search, soloDisponibles, ordenar, incluirBorradores } = filtros ?? {};
    const pagina = Math.max(1, filtros?.pagina ?? 1);
    const porPagina = Math.min(50, Math.max(1, filtros?.porPagina ?? 5));

    const verBorradores = esAdmin && incluirBorradores === 'true';

    const where: any = {
      ...(!verBorradores ? { estado: { not: EstadoEvento.BORRADOR } } : {}),
      ...(search
        ? {
            OR: [
              { nombre: { contains: search, mode: 'insensitive' } },
              { descripcion: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(soloDisponibles === 'true'
        ? {
            OR: [
              { entradasDisponibles: null },
              { entradasDisponibles: { gt: 0 } },
            ],
          }
        : {}),
    };

    let orderBy: any = [{ fechaEvento: 'asc' }, { id: 'asc' }];
    if (ordenar === 'nombre') {
      orderBy = [{ nombre: 'asc' }, { id: 'asc' }];
    } else if (ordenar === 'reciente') {
      orderBy = [{ creadoEn: 'desc' }, { id: 'desc' }];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.evento.findMany({
        where,
        orderBy,
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        include: {
          _count: { select: { entradas: true } },
        },
      }),
      this.prisma.evento.count({ where }),
    ]);

    const totalPaginas = Math.ceil(total / porPagina) || 1;

    return {
      items: items.map((item) => mapEventoResponse(item)),
      total,
      pagina,
      porPagina,
      totalPaginas,
    };
  }

  async findOne(id: number, esAdmin = false) {
    const evento = await this.prisma.evento.findUnique({
      where: { id },
      include: {
        _count: { select: { entradas: true } },
      },
    });

    if (!evento || (!esAdmin && evento.estado === EstadoEvento.BORRADOR)) {
      throw new NotFoundException('Evento no encontrado');
    }

    return mapEventoResponse(evento);
  }

  async create(dto: CrearEventoDto, responsableId: number) {
    const requiereEntrada = dto.requiereEntrada ?? true;

    this.validarFechas({
      fechaEvento: dto.fechaEvento,
      fechaFin: dto.fechaFin,
      inicioVenta: dto.inicioVenta,
      finVenta: dto.finVenta,
      requiereEntrada,
      creando: true,
    });

    let capacidadMaxima = dto.capacidadMaxima ?? null;
    let entradasDisponibles = dto.entradasDisponibles ?? null;
    let precio = dto.precio ?? 0;
    let descuentoSocio = dto.descuentoSocio ?? 0;
    let inicioVenta = dto.inicioVenta ? new Date(dto.inicioVenta) : null;
    let finVenta = dto.finVenta ? new Date(dto.finVenta) : null;

    if (!requiereEntrada) {
      capacidadMaxima = null;
      entradasDisponibles = null;
      precio = 0;
      descuentoSocio = 0;
      inicioVenta = null;
      finVenta = null;
    } else {
      if (descuentoSocio > 0 && precio <= 0) {
        throw new BadRequestException('El descuento para socios solo aplica en eventos con precio mayor a 0');
      }
      if (capacidadMaxima !== null && capacidadMaxima < 1) {
        throw new BadRequestException('La capacidad máxima debe ser al menos 1');
      }
      if (entradasDisponibles !== null && entradasDisponibles < 0) {
        throw new BadRequestException('Las entradas disponibles no pueden ser negativas');
      }
      if (
        capacidadMaxima !== null &&
        entradasDisponibles !== null &&
        entradasDisponibles > capacidadMaxima
      ) {
        throw new BadRequestException('Las entradas disponibles no pueden superar la capacidad máxima');
      }
    }

    const estado = dto.estado ?? EstadoEvento.PUBLICADO;

    const evento = await this.prisma.evento.create({
      data: {
        nombre: dto.nombre,
        descripcion: dto.descripcion,
        requiereEntrada,
        capacidadMaxima,
        entradasDisponibles,
        precio,
        descuentoSocio,
        estado,
        fechaEvento: new Date(dto.fechaEvento),
        fechaFin: dto.fechaFin ? new Date(dto.fechaFin) : null,
        imagen: null, // El backend NO guarda imágenes
        lugarAcreditacion: dto.lugarAcreditacion,
        inicioVenta,
        finVenta,
      },
      include: {
        _count: { select: { entradas: true } },
      },
    });

    await this.auditoria.registrar({
      accion: 'CREAR',
      entidad: 'Evento',
      idEntidad: evento.id,
      responsableId,
    });

    return mapEventoResponse(evento);
  }

  async update(id: number, dto: ActualizarEventoDto, responsableId: number) {
    const eventoExistente = await this.prisma.evento.findUnique({
      where: { id },
      include: { _count: { select: { entradas: true } } },
    });

    if (!eventoExistente) {
      throw new NotFoundException('Evento no encontrado');
    }

    const entradasVendidas = eventoExistente._count.entradas;

    // Transición de estados
    if (
      (eventoExistente.estado === EstadoEvento.CANCELADO ||
        eventoExistente.estado === EstadoEvento.FINALIZADO) &&
      dto.estado &&
      (dto.estado === EstadoEvento.PUBLICADO || dto.estado === EstadoEvento.BORRADOR)
    ) {
      throw new BadRequestException(
        `No se puede cambiar el estado de ${eventoExistente.estado} a ${dto.estado}`,
      );
    }

    const targetRequiereEntrada = dto.requiereEntrada ?? eventoExistente.requiereEntrada;

    if (entradasVendidas > 0) {
      if (eventoExistente.requiereEntrada && !targetRequiereEntrada) {
        throw new ConflictException(
          'No se puede cambiar requiereEntrada a false porque existen compras o entradas registradas',
        );
      }
      if (
        dto.capacidadMaxima !== undefined &&
        dto.capacidadMaxima !== null &&
        dto.capacidadMaxima < entradasVendidas
      ) {
        throw new BadRequestException(
          `La capacidad máxima (${dto.capacidadMaxima}) no puede ser menor que las entradas ya vendidas (${entradasVendidas})`,
        );
      }
    }

    const fechaEventoTarget = dto.fechaEvento
      ? new Date(dto.fechaEvento)
      : eventoExistente.fechaEvento;
    const fechaFinTarget =
      dto.fechaFin !== undefined
        ? dto.fechaFin
          ? new Date(dto.fechaFin)
          : null
        : eventoExistente.fechaFin;
    const inicioVentaTarget =
      dto.inicioVenta !== undefined
        ? dto.inicioVenta
          ? new Date(dto.inicioVenta)
          : null
        : eventoExistente.inicioVenta;
    const finVentaTarget =
      dto.finVenta !== undefined
        ? dto.finVenta
          ? new Date(dto.finVenta)
          : null
        : eventoExistente.finVenta;

    this.validarFechas({
      fechaEvento: fechaEventoTarget,
      fechaFin: fechaFinTarget,
      inicioVenta: inicioVentaTarget,
      finVenta: finVentaTarget,
      requiereEntrada: targetRequiereEntrada,
      creando: false,
    });

    let capacidadMaxima =
      dto.capacidadMaxima !== undefined ? dto.capacidadMaxima : eventoExistente.capacidadMaxima;
    let entradasDisponibles =
      dto.entradasDisponibles !== undefined
        ? dto.entradasDisponibles
        : eventoExistente.entradasDisponibles;
    let precio = dto.precio !== undefined ? dto.precio : Number(eventoExistente.precio);
    let descuentoSocio =
      dto.descuentoSocio !== undefined ? dto.descuentoSocio : eventoExistente.descuentoSocio;

    if (!targetRequiereEntrada) {
      capacidadMaxima = null;
      entradasDisponibles = null;
      precio = 0;
      descuentoSocio = 0;
    } else {
      if (descuentoSocio > 0 && precio <= 0) {
        throw new BadRequestException('El descuento para socios solo aplica en eventos con precio mayor a 0');
      }
      if (
        capacidadMaxima !== null &&
        entradasDisponibles !== null &&
        entradasDisponibles > capacidadMaxima
      ) {
        throw new BadRequestException('Las entradas disponibles no pueden superar la capacidad máxima');
      }
    }

    const eventoActualizado = await this.prisma.evento.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
        ...(dto.descripcion !== undefined ? { descripcion: dto.descripcion } : {}),
        requiereEntrada: targetRequiereEntrada,
        capacidadMaxima,
        entradasDisponibles,
        precio,
        descuentoSocio,
        ...(dto.estado !== undefined ? { estado: dto.estado } : {}),
        fechaEvento: fechaEventoTarget,
        fechaFin: fechaFinTarget,
        ...(dto.lugarAcreditacion !== undefined
          ? { lugarAcreditacion: dto.lugarAcreditacion }
          : {}),
        inicioVenta: targetRequiereEntrada ? inicioVentaTarget : null,
        finVenta: targetRequiereEntrada ? finVentaTarget : null,
      },
      include: {
        _count: { select: { entradas: true } },
      },
    });

    await this.auditoria.registrar({
      accion: 'EDITAR',
      entidad: 'Evento',
      idEntidad: id,
      responsableId,
    });

    return mapEventoResponse(eventoActualizado);
  }

  private validarFechas({
    fechaEvento,
    fechaFin,
    inicioVenta,
    finVenta,
    requiereEntrada,
    creando,
  }: {
    fechaEvento: Date | string;
    fechaFin?: Date | string | null;
    inicioVenta?: Date | string | null;
    finVenta?: Date | string | null;
    requiereEntrada: boolean;
    creando: boolean;
  }) {
    const ahora = new Date();
    // Margen de 5 minutos en el pasado para inicioVenta
    const margenCincoMin = new Date(ahora.getTime() - 5 * 60 * 1000);
    // Límite máximo: 3 años en el futuro
    const limiteMaximo = new Date(ahora.getTime() + 3 * 365.25 * 24 * 60 * 60 * 1000);

    const dEvento = new Date(fechaEvento);
    const dFin = fechaFin ? new Date(fechaFin) : null;
    const dInicioVenta = inicioVenta ? new Date(inicioVenta) : null;
    const dFinVenta = finVenta ? new Date(finVenta) : null;

    if (creando) {
      if (dEvento < margenCincoMin) {
        throw new BadRequestException('La fecha del evento no puede estar en el pasado');
      }
      if (dFin && dFin < margenCincoMin) {
        throw new BadRequestException('La fecha de fin no puede estar en el pasado');
      }
      if (dInicioVenta && dInicioVenta < margenCincoMin) {
        throw new BadRequestException('La fecha de inicio de venta no puede estar en el pasado');
      }
    }

    if (dEvento > limiteMaximo) {
      throw new BadRequestException('La fecha del evento supera el límite máximo de 3 años');
    }
    if (dFin && dFin > limiteMaximo) {
      throw new BadRequestException('La fecha de fin supera el límite máximo de 3 años');
    }
    if (dInicioVenta && dInicioVenta > limiteMaximo) {
      throw new BadRequestException('La fecha de inicio de venta supera el límite máximo de 3 años');
    }
    if (dFinVenta && dFinVenta > limiteMaximo) {
      throw new BadRequestException('La fecha de fin de venta supera el límite máximo de 3 años');
    }

    if (dFin && dFin <= dEvento) {
      throw new BadRequestException('La fecha de fin debe ser posterior a la fecha del evento');
    }

    if (requiereEntrada) {
      if (dInicioVenta && dFinVenta && dFinVenta < dInicioVenta) {
        throw new BadRequestException(
          'La fecha de fin de venta debe ser posterior o igual a la de inicio de venta',
        );
      }
      if (dFinVenta && dFinVenta > dEvento) {
        throw new BadRequestException(
          'La fecha de fin de venta no puede ser posterior a la fecha del evento',
        );
      }
    }
  }

  /**
   * DT-33 — Cierre de los eventos que ya terminaron: los publicados pasan a
   * FINALIZADO y sus entradas sin usar, a EXPIRADA. Lo dispara la tarea
   * automática `cierre-de-eventos`; correrlo dos veces no cambia nada.
   */
  async cerrarTerminados(ahora = new Date()) {
    const terminado = filtroEventoTerminado(ahora);
    const [entradas, eventos] = await this.prisma.$transaction([
      this.prisma.entrada.updateMany({
        where: { estado: 'VALIDA', evento: terminado },
        data: { estado: 'EXPIRADA' },
      }),
      this.prisma.evento.updateMany({
        where: { estado: EstadoEvento.PUBLICADO, ...terminado },
        data: { estado: EstadoEvento.FINALIZADO },
      }),
    ]);
    return { eventosFinalizados: eventos.count, entradasExpiradas: entradas.count };
  }
}
