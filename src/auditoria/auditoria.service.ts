import { Injectable } from '@nestjs/common';
import { AccionAuditoria, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FindAuditoriaQueryDto, PeriodoAuditoria } from './dto/find-auditoria-query.dto';

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

  async listarTodos(query: FindAuditoriaQueryDto) {
    const {
      accion,
      entidad,
      responsableId,
      fechaDesde,
      fechaHasta,
      periodo,
      rango,
      pagina = 1,
      porPagina = 20,
    } = query;

    const periodoFiltro = periodo ?? rango;
    let fechaDesdeCalculada = fechaDesde ? new Date(fechaDesde) : undefined;
    const fechaHastaCalculada = fechaHasta ? new Date(fechaHasta) : undefined;

    if (periodoFiltro && periodoFiltro !== PeriodoAuditoria.PERSONALIZADO) {
      const ahora = new Date();
      if (periodoFiltro === PeriodoAuditoria.ULTIMA_HORA) {
        fechaDesdeCalculada = new Date(ahora.getTime() - 60 * 60 * 1000);
      } else if (periodoFiltro === PeriodoAuditoria.ULTIMAS_24H) {
        fechaDesdeCalculada = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
      } else if (periodoFiltro === PeriodoAuditoria.ULTIMOS_7D) {
        fechaDesdeCalculada = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
      }
    }

    const where: Prisma.RegistroAuditoriaWhereInput = {
      ...(accion && { accion }),
      ...(entidad && { entidad }),
      ...(responsableId && { responsableId }),
      ...((fechaDesdeCalculada || fechaHastaCalculada) && {
        fechaHora: {
          ...(fechaDesdeCalculada && { gte: fechaDesdeCalculada }),
          ...(fechaHastaCalculada && { lte: fechaHastaCalculada }),
        },
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.registroAuditoria.findMany({
        where,
        orderBy: { fechaHora: 'desc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        include: {
          responsable: {
            select: { id: true, email: true, nombre: true, apellido: true },
          },
        },
      }),
      this.prisma.registroAuditoria.count({ where }),
    ]);

    return { items, total, pagina, porPagina };
  }
}
