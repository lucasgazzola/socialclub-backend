import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateTicketsDto } from './dto/create-tickets.dto';

/**
 * - Each ticket has a system-generated token.
 * Prisma's `@unique` guarantees no two tickets can be inserted with the same token.
 * - N tickets are created and the event stock is decremented. If anything fails, nothing is left half-done.
 * - One ticket (and its token) is generated per purchased unit. A QR is NOT reused for several tickets.
 */
@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createMany(dto: CreateTicketsDto, responsibleId: number) {
    const { eventId, quantity } = dto;

    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Evento no encontrado');
    }

    if (event.availableTickets < quantity) {
      throw new BadRequestException(
        `No hay suficientes entradas disponibles. Quedan ${event.availableTickets}.`,
      );
    }

    /**
     * Generate the tokens BEFORE the transaction in case randomUUID fails. This way
     * there is nothing to roll back and the API responds with a clean error.
     */
    const tokens = Array.from({ length: quantity }, () => randomUUID());
    if (new Set(tokens).size !== tokens.length) {
      throw new ConflictException('No se pudieron generar identificadores únicos');
    }

    const tickets = await this.prisma.$transaction(async (tx) => {
      // Stock decrement. If two admins sell at the same time, updateMany prevents overselling.
      const result = await tx.event.updateMany({
        where: { id: eventId, availableTickets: { gte: quantity } },
        data: { availableTickets: { decrement: quantity } },
      });

      if (result.count === 0) {
        throw new BadRequestException(
          `No hay suficientes entradas disponibles para el evento "${event.name}".`,
        );
      }

      const created = await tx.ticket.createManyAndReturn({
        data: tokens.map((token) => ({ token, eventId })),
      });

      return created;
    });

    await this.audit.record({
      action: 'CREATE',
      entity: 'Ticket',
      responsibleId,
      detail: `Se generaron ${tickets.length} entrada(s) para el evento "${event.name}" (id=${eventId})`,
    });

    return {
      eventId,
      eventName: event.name,
      quantity: tickets.length,
      tickets,
    };
  }

  async listByEvent(eventId: number) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Evento no encontrado');
    }

    const items = await this.prisma.ticket.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
      include: { event: true },
    });

    return items;
  }
}
