import { Injectable } from '@nestjs/common';
import { AccionAuditoria, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface RegistrarParams {
  accion: AccionAuditoria;
  entidad: string;
  idEntidad?: number;
  responsableId?: number;
  detalle?: string;
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
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(params: RegistrarParams, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.registroAuditoria.create({
      data: {
        accion: params.accion,
        entidad: params.entidad,
        idEntidad: params.idEntidad,
        responsableId: params.responsableId,
        detalle: params.detalle,
      },
    });
  }

  async listarPorEntidad(entidad: string, idEntidad: number) {
    return this.prisma.registroAuditoria.findMany({
      where: { entidad, idEntidad },
      orderBy: { fechaHora: 'desc' },
      include: {
        responsable: { select: { id: true, email: true, nombre: true, apellido: true } },
      },
    });
  }
}
