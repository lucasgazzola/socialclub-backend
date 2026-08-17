import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FindAuditLogsQueryDto } from './dto/find-audit-logs-query.dto'; // Asegúrate de que esta ruta sea la correcta

interface RecordParams {
  action: AuditAction;
  entity: string;
  entityId?: number;
  responsibleId?: number;
  detail?: string;
}

/**
 * Único punto de escritura de la tabla `registros_auditoria` (RF12 / RNF03 / RNF11).
 *
 * Regla de negocio crítica: la auditoría es INALTERABLE. Este servicio solo
 * expone operaciones de INSERT y de consulta — nunca update ni delete.
 *
 * Acepta opcionalmente un cliente transaccional (`tx`) para registrar la
 * auditoría dentro de la misma transacción que la operación auditada y así
 * garantizar atomicidad (RNF07).
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: RecordParams, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.auditLog.create({
      data: {
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        responsibleId: params.responsibleId,
        detail: params.detail,
      },
    });
  }

  async listByEntity(entity: string, entityId: number) {
    return this.prisma.auditLog.findMany({
      where: { entity, entityId },
      orderBy: { timestamp: 'desc' },
      include: {
        responsible: { select: { id: true, email: true, name: true, lastName: true } },
      },
    });
  }

  async listAll(query: FindAuditLogsQueryDto) {
    const {
      action,
      entity,
      responsibleId,
      dateFrom,
      dateTo,
      page = 1,
      perPage = 20,
    } = query;

    const where: Prisma.AuditLogWhereInput = {
      ...(action && { action }),
      ...(entity && { entity }),
      ...(responsibleId && { responsibleId }),
      ...((dateFrom || dateTo) && {
        timestamp: {
          ...(dateFrom && { gte: new Date(dateFrom) }),
          ...(dateTo && { lte: new Date(dateTo) }),
        },
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          responsible: {
            select: { id: true, email: true, name: true, lastName: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, perPage };
  }
}
