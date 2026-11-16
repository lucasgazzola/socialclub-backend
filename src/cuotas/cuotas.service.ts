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

/** Período "YYYY-MM" actual. */
export function periodoActual(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const INCLUDE_TARIFA = {
  disciplina: { select: { id: true, nombre: true } },
  categoriaDisciplina: { select: { id: true, nombre: true } },
} as const;

@Injectable()
export class CuotasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * US-20 · TASK-33 — Configurar la tarifa mensual de la cuota deportiva de una
   * disciplina (tarifa base) o de una de sus categorías (reemplaza a la base).
   *  - El monto debe ser mayor a cero (validado además en el DTO).
   *  - Descuento para socios opcional, en porcentaje (0 a 100).
   *  - Los cambios aplican a partir del período siguiente; la PRIMERA tarifa de
   *    la disciplina/categoría puede regir desde el período actual.
   *  - Si ya existe una tarifa para ese alcance y período, se actualiza.
   */
  async configurar(dto: ConfigurarCuotaDto, responsableId: number) {
    const categoriaDisciplinaId = dto.categoriaDisciplinaId ?? null;
    const disciplina = await this.prisma.disciplina.findUnique({
      where: { id: dto.disciplinaId },
      include: { categorias: true },
    });
    if (!disciplina) {
      throw new NotFoundException('Disciplina no encontrada');
    }
    const categoria = categoriaDisciplinaId
      ? disciplina.categorias.find((c) => c.id === categoriaDisciplinaId)
      : null;
    if (categoriaDisciplinaId && !categoria) {
      throw new NotFoundException('La categoría no pertenece a esta disciplina');
    }

    const alcance = { disciplinaId: dto.disciplinaId, categoriaDisciplinaId };
    const yaTieneTarifa =
      (await this.prisma.configuracionCuotaDeportiva.count({ where: alcance })) > 0;
    const periodoAplicacion =
      dto.periodoAplicacion ?? (yaTieneTarifa ? proximoPeriodo() : periodoActual());
    this.validarPeriodo(periodoAplicacion, yaTieneTarifa);

    const datos = {
      monto: dto.monto,
      descuentoSocioPorcentaje: dto.descuentoSocioPorcentaje ?? 0,
    };
    const destino = `${disciplina.nombre}${categoria ? ` · ${categoria.nombre}` : ' (tarifa base)'}`;
    const existente = await this.prisma.configuracionCuotaDeportiva.findFirst({
      where: { ...alcance, periodoAplicacion },
    });

    const guardada = existente
      ? await this.prisma.configuracionCuotaDeportiva.update({
          where: { id: existente.id },
          data: { ...datos, activo: true },
          include: INCLUDE_TARIFA,
        })
      : await this.prisma.configuracionCuotaDeportiva.create({
          data: { ...alcance, periodoAplicacion, ...datos },
          include: INCLUDE_TARIFA,
        });

    await this.auditoria.registrar({
      accion: existente ? 'EDITAR' : 'CREAR',
      entidad: 'ConfiguracionCuotaDeportiva',
      idEntidad: guardada.id,
      responsableId,
      detalle: `Tarifa ${destino} desde ${periodoAplicacion}: $${dto.monto}, descuento socios ${datos.descuentoSocioPorcentaje} %`,
    });

    return serializarCuota(guardada);
  }

  /**
   * Listar configuraciones de cuota deportiva con filtros combinables
   * (disciplina, categoría, período de aplicación) y paginación.
   */
  async findAll(query: FindCuotasQueryDto) {
    const { disciplinaId, categoriaDisciplinaId, periodoAplicacion, pagina, porPagina } = query;

    const where: Prisma.ConfiguracionCuotaDeportivaWhereInput = {
      ...(disciplinaId && { disciplinaId }),
      ...(categoriaDisciplinaId && { categoriaDisciplinaId }),
      ...(periodoAplicacion && { periodoAplicacion }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.configuracionCuotaDeportiva.findMany({
        where,
        include: INCLUDE_TARIFA,
        orderBy: [
          { disciplina: { nombre: 'asc' } },
          { categoriaDisciplinaId: { sort: 'asc', nulls: 'first' } },
          { periodoAplicacion: 'desc' },
        ],
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
      include: INCLUDE_TARIFA,
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
      include: INCLUDE_TARIFA,
    });

    await this.auditoria.registrar({
      accion: 'EDITAR',
      entidad: 'ConfiguracionCuotaDeportiva',
      idEntidad: id,
      responsableId,
    });

    return serializarCuota(configuracion);
  }

  /**
   * Los cambios aplican desde el período siguiente; la primera tarifa de un
   * alcance puede regir desde el actual. Nunca un período pasado.
   */
  private validarPeriodo(periodoAplicacion: string, yaTieneTarifa: boolean) {
    const minimo = yaTieneTarifa ? proximoPeriodo() : periodoActual();
    if (periodoAplicacion < minimo) {
      throw new BadRequestException(
        yaTieneTarifa
          ? `El período ${periodoAplicacion} no es válido: los cambios de cuota aplican a partir del período siguiente (${minimo})`
          : `El período ${periodoAplicacion} no es válido: la primera tarifa puede regir desde el período actual (${minimo})`,
      );
    }
  }
}
