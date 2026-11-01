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
import { eventoTerminado } from '../eventos/fin-del-evento';
import { PasarelaService } from '../pasarela/pasarela.service';
import type { DatosCobroEntradas } from './entradas.acreditador';

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
    private readonly pasarela: PasarelaService,
  ) {}

  async crearMultiples(dto: CrearEntradasDto, responsableId: number) {
    const { eventoId, cantidad } = dto;

    const evento = await this.prisma.evento.findUnique({ where: { id: eventoId } });
    if (!evento) {
      throw new NotFoundException('Evento no encontrado');
    }

    // DT-33: no tiene sentido generar entradas que nacen vencidas o inutilizables.
    if (
      evento.estado === 'CANCELADO' ||
      evento.estado === 'FINALIZADO' ||
      eventoTerminado(evento)
    ) {
      throw new BadRequestException(
        `No se pueden generar entradas: el evento "${evento.nombre}" ya terminó o fue cancelado.`,
      );
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

  /**
   * US-52 · TASK-51: valida que el evento se pueda comprar y calcula el precio
   * (con el descuento de socio, si corresponde).
   */
  private async cotizarCompra(dto: ComprarEntradasDto, usuarioId: number) {
    const ahora = new Date();
    const evento = await this.prisma.evento.findUnique({ where: { id: dto.eventoId } });
    if (!evento) throw new NotFoundException('Evento no encontrado');

    if (!evento.requiereEntrada) {
      throw new BadRequestException(
        'El evento es de acceso libre y no requiere compra de entradas.',
      );
    }

    if (evento.estado !== 'PUBLICADO') {
      throw new BadRequestException('El evento no está publicado.');
    }

    // DT-33: aunque la venta no tenga fecha de cierre, no se vende para un evento terminado.
    if (eventoTerminado(evento, ahora)) {
      throw new BadRequestException('El evento ya terminó.');
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
    const precioUnitario =
      Math.round(Math.max(0, precioBase * (1 - descuentoAplicable / 100)) * 100) / 100;
    const montoTotal = Math.round(precioUnitario * dto.cantidad * 100) / 100;

    return { evento, precioUnitario, montoTotal };
  }

  /**
   * US-52 · TASK-51: inicia la compra online. Reserva el cupo junto con la
   * orden de pago (así no se vende de más mientras el usuario paga) y devuelve
   * la URL de la pasarela. Las entradas se generan recién cuando la pasarela
   * confirma el pago (`EntradasAcreditador`); si no se paga, el cupo se libera.
   */
  async iniciarCompra(dto: ComprarEntradasDto, usuarioId: number) {
    const { evento, precioUnitario, montoTotal } = await this.cotizarCompra(dto, usuarioId);

    return this.pasarela.iniciarCobro({
      concepto: 'ENTRADAS',
      usuarioId,
      descripcion: `${dto.cantidad} entrada(s) para "${evento.nombre}"`,
      items: [{ titulo: `Entrada — ${evento.nombre}`, cantidad: dto.cantidad, precioUnitario }],
      datos: {
        eventoId: evento.id,
        cantidad: dto.cantidad,
        precioUnitario,
        montoTotal,
      } satisfies DatosCobroEntradas,
      reservar: async (tx) => {
        if (evento.entradasDisponibles === null) return;
        const stock = await tx.evento.updateMany({
          where: { id: evento.id, estado: 'PUBLICADO', entradasDisponibles: { gte: dto.cantidad } },
          data: { entradasDisponibles: { decrement: dto.cantidad } },
        });
        if (stock.count === 0) {
          throw new BadRequestException(
            'Las entradas se agotaron. Actualizá la página e intentá nuevamente.',
          );
        }
      },
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

    // DT-33: si el evento ya terminó, la entrada venció aunque la tarea de
    // cierre todavía no la haya marcado. Se marca acá para que quede registrado.
    if (entrada.estado === 'VALIDA' && eventoTerminado(entrada.evento)) {
      await this.prisma.entrada.updateMany({
        where: { id: entrada.id, estado: 'VALIDA' },
        data: { estado: 'EXPIRADA' },
      });
      throw new BadRequestException(`Entrada expirada para el evento "${entrada.evento.nombre}".`);
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
