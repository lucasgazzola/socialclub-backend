import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Servicio del modulo Eventos.
 *
 * Por ahora expone la lectura de eventos (listar y obtener por id). La creacion
 * de eventos no esta implementada.
 */
@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const items = await this.prisma.event.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { tickets: true } },
      },
    });

    // `_count.tickets` se expone como `entradasVendidas` para la pantalla.
    return items.map(({ _count, ...event }) => ({
      ...event,
      entradasVendidas: _count.tickets,
    }));
  }

  async findOne(id: number) {
    const evento = await this.prisma.event.findUnique({
      where: { id },
      include: {
        _count: { select: { tickets: true } },
      },
    });

    if (!evento) {
      throw new NotFoundException('Evento no encontrado');
    }

    const { _count, ...rest } = evento;
    return { ...rest, entradasVendidas: _count.tickets };
  }
}
