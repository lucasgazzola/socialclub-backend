import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConfigureFeeDto } from './dto/configure-fee.dto';
import { UpdateFeeDto } from './dto/update-fee.dto';
import { FindFeesQueryDto } from './dto/find-fees-query.dto';

/**
 * Formatea el monto (Decimal de Prisma) como número para la respuesta JSON.
 */
function serializarCuota<T extends { amount: unknown }>(configuracion: T) {
  return { ...configuracion, amount: Number(configuracion.amount) };
}

/**
 * Devuelve el período "YYYY-MM" siguiente al actual. Es el período por defecto
 * cuando el administrador no indica uno (regla: los cambios aplican desde el
 * período siguiente).
 */
export function proximoPeriodo(now = new Date()): string {
  const anio = now.getFullYear();
  const mes = now.getMonth() + 1; // 1..12
  const total = anio * 12 + (mes - 1) + 1;
  const proxAnio = Math.floor(total / 12);
  const proxMes = (total % 12) + 1;
  return `${proxAnio}-${String(proxMes).padStart(2, '0')}`;
}

@Injectable()
export class FeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Configurar (o reconfigurar) el monto de la cuota deportiva para una
   * combinación disciplina-categoría. Reglas de la US:
   *  - Un monto por combinación disciplina-categoría-período de aplicación.
   *  - El monto debe ser mayor a cero (validado además en el DTO).
   *  - El cambio aplica a partir del período siguiente (no se permite configurar
   *    períodos pasados ni el actual).
   *  - Si ya existe una configuración para la combinación y período, se
   *    actualiza en lugar de crear un duplicado (regla 7).
   */
  async configurar(dto: ConfigureFeeDto, responsibleId: number) {
    const appliedPeriod = dto.appliedPeriod ?? proximoPeriodo();
    this.validarPeriodoFuturo(appliedPeriod);

    const [disciplina, categoria] = await Promise.all([
      this.prisma.discipline.findUnique({ where: { id: dto.disciplineId } }),
      this.prisma.memberCategory.findUnique({ where: { id: dto.categoryId } }),
    ]);
    if (!disciplina) {
      throw new NotFoundException('Disciplina no encontrada');
    }
    if (!categoria) {
      throw new NotFoundException('Categoría de socio no encontrada');
    }

    const existente = await this.prisma.sportsFeeConfig.findUnique({
      where: {
        disciplineId_categoryId_appliedPeriod: {
          disciplineId: dto.disciplineId,
          categoryId: dto.categoryId,
          appliedPeriod,
        },
      },
    });

    // Regla 7: si la combinación+período ya existe, se actualiza (upsert).
    if (existente) {
      const actualizada = await this.prisma.sportsFeeConfig.update({
        where: { id: existente.id },
        data: { amount: dto.amount },
        include: { discipline: true, category: true },
      });

      await this.audit.record({
        action: 'UPDATE',
        entity: 'SportsFeeConfig',
        entityId: actualizada.id,
        responsibleId,
        detail: `Periodo ${appliedPeriod} - Disciplina ${actualizada.disciplineId} - Categoria ${actualizada.categoryId}`,
      });

      return serializarCuota(actualizada);
    }

    const creada = await this.prisma.sportsFeeConfig.create({
      data: {
        disciplineId: dto.disciplineId,
        categoryId: dto.categoryId,
        appliedPeriod,
        amount: dto.amount,
      },
      include: { discipline: true, category: true },
    });

    await this.audit.record({
      action: 'CREATE',
      entity: 'SportsFeeConfig',
      entityId: creada.id,
      responsibleId,
      detail: `Periodo ${appliedPeriod} - Disciplina ${creada.disciplineId} - Categoria ${creada.categoryId}`,
    });

    return serializarCuota(creada);
  }

  /**
   * Listar configuraciones de cuota deportiva con filtros combinables
   * (disciplina, categoría, período de aplicación) y paginación.
   */
  async findAll(query: FindFeesQueryDto) {
    const { disciplineId, categoryId, appliedPeriod, page, perPage } = query;

    const where: Prisma.SportsFeeConfigWhereInput = {
      ...(disciplineId && { disciplineId }),
      ...(categoryId && { categoryId }),
      ...(appliedPeriod && { appliedPeriod }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.sportsFeeConfig.findMany({
        where,
        include: { discipline: true, category: true },
        orderBy: [{ appliedPeriod: 'desc' }, { discipline: { name: 'asc' } }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.sportsFeeConfig.count({ where }),
    ]);

    return {
      items: items.map(serializarCuota),
      total,
      page,
      perPage,
    };
  }

  async findOne(id: number) {
    const configuracion = await this.prisma.sportsFeeConfig.findUnique({
      where: { id },
      include: { discipline: true, category: true },
    });
    if (!configuracion) {
      throw new NotFoundException('Configuración de cuota no encontrada');
    }
    return serializarCuota(configuracion);
  }

  /**
   * Actualizar el monto (o estado) de una configuración existente. Sigue
   * validando que el monto sea mayor a cero (la validación del DTO y este
   * chequeo son complementarios).
   */
  async actualizar(id: number, dto: UpdateFeeDto, responsibleId: number) {
    await this.findOne(id);

    const configuracion = await this.prisma.sportsFeeConfig.update({
      where: { id },
      data: dto,
      include: { discipline: true, category: true },
    });

    await this.audit.record({
      action: 'UPDATE',
      entity: 'SportsFeeConfig',
      entityId: id,
      responsibleId,
    });

    return serializarCuota(configuracion);
  }

  /** El período configurado no puede ser el actual ni uno pasado. */
  private validarPeriodoFuturo(appliedPeriod: string) {
    const minimo = proximoPeriodo();
    if (appliedPeriod < minimo) {
      throw new BadRequestException(
        `El período ${appliedPeriod} no es válido: los cambios de cuota aplican a partir del período siguiente (${minimo})`,
      );
    }
  }
}
