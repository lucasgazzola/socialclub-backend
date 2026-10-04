import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CrearEntradasDto } from './dto/crear-entradas.dto';
import { ValidarEntradaDto } from './dto/validar-entrada.dto';
import { ComprarEntradasDto } from './dto/comprar-entradas.dto';

/**
 * - Cada entrada tiene un token generado por el sistema.
 * '@unique' de Prisma garantiza que no se puedan insertar dos entradas con el mismo token.
 * - Se crean N entradas y se decrementa el stock del evento. Si algo falla, no queda nada a medias.
 * - Se genera UNA entrada (y su token) por cada unidad comprada. NO se usa un QR para varias entradas.
 */
@Injectable()
export class EntradasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async crearMultiples(dto: CrearEntradasDto, responsableId: number) {
    const { eventoId, cantidad } = dto;

    const evento = await this.prisma.evento.findUnique({ where: { id: eventoId } });
    if (!evento) {
      throw new NotFoundException('Evento no encontrado');
    }

    if (evento.entradasDisponibles === null) {
      throw new BadRequestException(
        'El evento no tiene un cupo de entradas definido para generar entradas.',
      );
    }

    if (evento.entradasDisponibles < cantidad) {
      throw new BadRequestException(
        `No hay suficientes entradas disponibles. Quedan ${evento.entradasDisponibles}.`,
      );
    }

    /**
     * Genera los tokens ANTES de la transaccion por si randomUUID falla. De esta forma
     * no hay nada que revertir y la API responde error limpio.
     */
    const tokens = Array.from({ length: cantidad }, () => randomUUID());
    if (new Set(tokens).size !== tokens.length) {
      throw new ConflictException('No se pudieron generar identificadores únicos');
    }

    const entradas = await this.prisma.$transaction(async (tx) => {
      // Decremento del stock. Si dos administradores venden a la vez, updateMany evita vender de más.
      const resultado = await tx.evento.updateMany({
        where: { id: eventoId, entradasDisponibles: { gte: cantidad } },
        data: { entradasDisponibles: { decrement: cantidad } },
      });

      if (resultado.count === 0) {
        throw new BadRequestException(
          `No hay suficientes entradas disponibles para el evento "${evento.nombre}".`,
        );
      }

      const creadas = await tx.entrada.createManyAndReturn({
        data: tokens.map((token) => ({ token, eventoId })),
      });

      return creadas;
    });

    await this.auditoria.registrar({
      accion: 'CREAR',
      entidad: 'Entrada',
      responsableId,
      detalle: `Se generaron ${entradas.length} entrada(s) para el evento "${evento.nombre}" (id=${eventoId})`,
    });

    return {
      eventoId,
      eventoNombre: evento.nombre,
      cantidad: entradas.length,
      entradas,
    };
  }

  async listarPorEvento(eventoId: number) {
    const evento = await this.prisma.evento.findUnique({ where: { id: eventoId } });
    if (!evento) {
      throw new NotFoundException('Evento no encontrado');
    }

    const items = await this.prisma.entrada.findMany({
      where: { eventoId },
      orderBy: { creadoEn: 'desc' },
      include: { evento: true },
    });

    return items;
  }

  async comprar(dto: ComprarEntradasDto, usuarioId: number) {
    const ahora = new Date();
    const evento = await this.prisma.evento.findUnique({ where: { id: dto.eventoId } });
    if (!evento) throw new NotFoundException('Evento no encontrado');

    if (!evento.requiereEntrada) {
      throw new BadRequestException('El evento es de acceso libre y no requiere compra de entradas.');
    }

    if (evento.estado !== 'PUBLICADO') {
      throw new BadRequestException('El evento no está publicado.');
    }

    if (evento.entradasDisponibles !== null && evento.entradasDisponibles < dto.cantidad) {
      throw new BadRequestException('No hay suficientes entradas disponibles.');
    }

    if (evento.inicioVenta && ahora < evento.inicioVenta) {
      throw new BadRequestException('La venta de entradas aún no ha comenzado.');
    }

    if (evento.finVenta && ahora > evento.finVenta) {
      throw new BadRequestException('La venta de entradas para este evento ha finalizado.');
    }

    // Verificar si el usuario es SOCIO para aplicar el descuento
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: {
        roles: { include: { rol: true } },
        persona: { include: { membresias: { where: { fechaBaja: null } } } },
      },
    });

    const esSocio =
      (usuario?.roles.some((r) => r.rol.nombre === 'SOCIO') ?? false) ||
      (usuario?.persona?.membresias.length ?? 0) > 0;

    const descuentoAplicable = esSocio ? (evento.descuentoSocio ?? 0) : 0;
    const precioBase = Number(evento.precio);
    const precioUnitario = Math.max(0, precioBase * (1 - descuentoAplicable / 100));
    const montoTotal = precioUnitario * dto.cantidad;

    const tokens = Array.from({ length: dto.cantidad }, () => randomUUID());

    return this.prisma.$transaction(async (tx) => {
      if (evento.entradasDisponibles !== null) {
        const stock = await tx.evento.updateMany({
          where: {
            id: dto.eventoId,
            estado: 'PUBLICADO',
            entradasDisponibles: { gte: dto.cantidad },
          },
          data: { entradasDisponibles: { decrement: dto.cantidad } },
        });
        if (stock.count === 0) {
          throw new BadRequestException(
            'Las entradas se agotaron. Actualizá la página e intentá nuevamente.',
          );
        }
      }

      const compra = await tx.compraEntrada.create({
        data: {
          usuarioId,
          eventoId: dto.eventoId,
          cantidad: dto.cantidad,
          precioUnitario,
          montoTotal,
        },
      });
      const entradas = await tx.entrada.createManyAndReturn({
        data: tokens.map((token) => ({ token, eventoId: dto.eventoId, compraId: compra.id })),
      });

      await this.auditoria.registrar(
        {
          accion: 'CREAR',
          entidad: 'CompraEntrada',
          idEntidad: compra.id,
          responsableId: usuarioId,
          detalle: `Compra aprobada de ${dto.cantidad} entrada(s) para "${evento.nombre}" por $${montoTotal.toFixed(2)}`,
        },
        tx,
      );

      return { ...compra, entradas, eventoNombre: evento.nombre };
    });
  }

  async listarMisEntradas(usuarioId: number) {
    return this.prisma.entrada.findMany({
      where: { compra: { usuarioId } },
      orderBy: { creadoEn: 'desc' },
      include: { evento: true, compra: true },
    });
  }

  async validarAcceso(dto: ValidarEntradaDto, responsableId: number) {
    // Primero verificamos que la entrada existe
    const entrada = await this.prisma.entrada.findUnique({
      where: { token: dto.token },
      include: { evento: true },
    });

    if (!entrada) {
      throw new NotFoundException('Entrada no encontrada. El código QR no es válido.');
    }

    if (entrada.estado === 'EXPIRADA') {
      throw new BadRequestException(`Entrada expirada para el evento "${entrada.evento.nombre}".`);
    }

    if (entrada.estado === 'USADA') {
      throw new ConflictException(
        `Entrada ya utilizada para el evento "${entrada.evento.nombre}". Posible intento de reingreso no autorizado.`,
      );
    }

    // Actualización atómica: solo cambia si sigue en estado VALIDA
    const resultado = await this.prisma.entrada.updateMany({
      where: { token: dto.token, estado: 'VALIDA' },
      data: { estado: 'USADA' },
    });

    if (resultado.count === 0) {
      throw new ConflictException('La entrada ya fue utilizada o no es válida.');
    }

    await this.auditoria.registrar({
      accion: 'EDITAR',
      entidad: 'Entrada',
      idEntidad: entrada.id,
      responsableId,
      detalle: `Acceso validado para el evento "${entrada.evento.nombre}" (token: ${dto.token})`,
    });

    return {
      acceso: 'PERMITIDO',
      entrada: {
        id: entrada.id,
        eventoId: entrada.eventoId,
        eventoNombre: entrada.evento.nombre,
      },
    };
  }
}
