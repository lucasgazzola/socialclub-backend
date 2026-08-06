import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ConfigurarCuotaDto } from './dto/configurar-cuota.dto';
import { ActualizarCuotaDto } from './dto/actualizar-cuota.dto';
import { FindCuotasQueryDto } from './dto/find-cuotas-query.dto';

/**
 * Formatea el monto (Decimal de Prisma) como número para la respuesta JSON.
 */
function serializarCuota<T extends { monto: unknown }>(configuracion: T) {
  return { ...configuracion, monto: Number(configuracion.monto) };
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
export class CuotasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
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
  async configurar(dto: ConfigurarCuotaDto, responsableId: number) {
    const periodoAplicacion = dto.periodoAplicacion ?? proximoPeriodo();
    this.validarPeriodoFuturo(periodoAplicacion);

    const [disciplina, categoria] = await Promise.all([
      this.prisma.disciplina.findUnique({ where: { id: dto.disciplinaId } }),
      this.prisma.categoriaSocio.findUnique({ where: { id: dto.categoriaId } }),
    ]);
    if (!disciplina) {
      throw new NotFoundException('Disciplina no encontrada');
    }
    if (!categoria) {
      throw new NotFoundException('Categoría de socio no encontrada');
    }

    const existente = await this.prisma.configuracionCuotaDeportiva.findUnique({
      where: {
        disciplinaId_categoriaId_periodoAplicacion: {
          disciplinaId: dto.disciplinaId,
          categoriaId: dto.categoriaId,
          periodoAplicacion,
        },
      },
    });

    // Regla 7: si la combinación+período ya existe, se actualiza (upsert).
    if (existente) {
      const actualizada = await this.prisma.configuracionCuotaDeportiva.update({
        where: { id: existente.id },
        data: { monto: dto.monto },
        include: { disciplina: true, categoria: true },
      });

      await this.auditoria.registrar({
        accion: 'EDITAR',
        entidad: 'ConfiguracionCuotaDeportiva',
        idEntidad: actualizada.id,
        responsableId,
        detalle: `Periodo ${periodoAplicacion} - Disciplina ${actualizada.disciplinaId} - Categoria ${actualizada.categoriaId}`,
      });

      return serializarCuota(actualizada);
    }

    const creada = await this.prisma.configuracionCuotaDeportiva.create({
      data: {
        disciplinaId: dto.disciplinaId,
        categoriaId: dto.categoriaId,
        periodoAplicacion,
        monto: dto.monto,
      },
      include: { disciplina: true, categoria: true },
    });

    await this.auditoria.registrar({
      accion: 'CREAR',
      entidad: 'ConfiguracionCuotaDeportiva',
      idEntidad: creada.id,
      responsableId,
      detalle: `Periodo ${periodoAplicacion} - Disciplina ${creada.disciplinaId} - Categoria ${creada.categoriaId}`,
    });

    return serializarCuota(creada);
  }

  /**
   * Listar configuraciones de cuota deportiva con filtros combinables
   * (disciplina, categoría, período de aplicación) y paginación.
   */
  async findAll(query: FindCuotasQueryDto) {
    const { disciplinaId, categoriaId, periodoAplicacion, pagina, porPagina } = query;

    const where: Prisma.ConfiguracionCuotaDeportivaWhereInput = {
      ...(disciplinaId && { disciplinaId }),
      ...(categoriaId && { categoriaId }),
      ...(periodoAplicacion && { periodoAplicacion }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.configuracionCuotaDeportiva.findMany({
        where,
        include: { disciplina: true, categoria: true },
        orderBy: [{ periodoAplicacion: 'desc' }, { disciplina: { nombre: 'asc' } }],
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
      this.prisma.configuracionCuotaDeportiva.count({ where }),
    ]);

    return {
      items: items.map(serializarCuota),
      total,
      pagina,
      porPagina,
    };
  }

  async findOne(id: number) {
    const configuracion = await this.prisma.configuracionCuotaDeportiva.findUnique({
      where: { id },
      include: { disciplina: true, categoria: true },
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
  async actualizar(id: number, dto: ActualizarCuotaDto, responsableId: number) {
    await this.findOne(id);

    const configuracion = await this.prisma.configuracionCuotaDeportiva.update({
      where: { id },
      data: dto,
      include: { disciplina: true, categoria: true },
    });

    await this.auditoria.registrar({
      accion: 'EDITAR',
      entidad: 'ConfiguracionCuotaDeportiva',
      idEntidad: id,
      responsableId,
    });

    return serializarCuota(configuracion);
  }

  /** El período configurado no puede ser el actual ni uno pasado. */
  private validarPeriodoFuturo(periodoAplicacion: string) {
    const minimo = proximoPeriodo();
    if (periodoAplicacion < minimo) {
      throw new BadRequestException(
        `El período ${periodoAplicacion} no es válido: los cambios de cuota aplican a partir del período siguiente (${minimo})`,
      );
    }
  }
}
