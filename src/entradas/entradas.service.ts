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
