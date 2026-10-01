import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ConfigurarCuotaSocialDto } from './dto/configurar-cuota-social.dto';
import { ActualizarCuotaSocialDto } from './dto/actualizar-cuota-social.dto';
import { FindCuotaSocialQueryDto } from './dto/find-cuota-social-query.dto';

function serializarCuotaSocial<T extends { monto: unknown }>(configuracion: T) {
  return { ...configuracion, monto: Number(configuracion.monto) };
}

export function proximoPeriodo(now = new Date()): string {
  const anio = now.getFullYear();
  const mes = now.getMonth() + 1;
  const total = anio * 12 + (mes - 1) + 1;
  const proxAnio = Math.floor(total / 12);
  const proxMes = (total % 12) + 1;
  return `${proxAnio}-${String(proxMes).padStart(2, '0')}`;
}

export function periodoActual(now = new Date()): string {
  const anio = now.getFullYear();
  const mes = now.getMonth() + 1;
  return `${anio}-${String(mes).padStart(2, '0')}`;
}

@Injectable()
export class CuotaSocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Configurar el monto de la cuota social para una categoría de socio.
   * US16: tres cuotas (Cuota Juvenil / General / Senior), monto >0,
   * aplica a partir del período siguiente.
   */
  async configurar(dto: ConfigurarCuotaSocialDto, responsableId: number) {
    const periodoAplicacion = dto.periodoAplicacion ?? proximoPeriodo();
    this.validarPeriodoFuturo(periodoAplicacion);

    const categoria = await this.prisma.categoriaSocio.findUnique({
      where: { id: dto.categoriaId },
    });
    if (!categoria) {
      throw new NotFoundException('Categoría de socio no encontrada');
    }

    const existente = await this.prisma.configuracionCuotaSocial.findUnique({
      where: {
        categoriaId_periodoAplicacion: {
          categoriaId: dto.categoriaId,
          periodoAplicacion,
        },
      },
    });

    if (existente) {
      // US16 + vigencia automática: no activar hasta que llegue su período.
      // Si el período ya es vigente (periodo <= hoy), se activa y desactiva las demás.
      const esVigenteAhora = periodoAplicacion <= periodoActual();
      if (esVigenteAhora) {
        await this.prisma.configuracionCuotaSocial.updateMany({
          where: { categoriaId: dto.categoriaId, activo: true, id: { not: existente.id } },
          data: { activo: false },
        });
      }
      const actualizada = await this.prisma.configuracionCuotaSocial.update({
        where: { id: existente.id },
        data: { monto: dto.monto, activo: esVigenteAhora ? true : existente.activo },
        include: { categoria: true },
      });

      await this.auditoria.registrar({
        accion: 'EDITAR',
        entidad: 'ConfiguracionCuotaSocial',
        idEntidad: actualizada.id,
        responsableId,
        detalle: `Cuota social ${actualizada.categoria.nombre} - Período ${periodoAplicacion} - Monto $${Number(dto.monto).toFixed(2)}`,
      });

      return serializarCuotaSocial(actualizada);
    }

    // Crear: no es vigente hasta que llegue su período, queda inactiva
    const esVigenteAhora = periodoAplicacion <= periodoActual();
    if (esVigenteAhora) {
      await this.prisma.configuracionCuotaSocial.updateMany({
        where: { categoriaId: dto.categoriaId, activo: true },
        data: { activo: false },
      });
    }

    const creada = await this.prisma.configuracionCuotaSocial.create({
      data: {
        categoriaId: dto.categoriaId,
        periodoAplicacion,
        monto: dto.monto,
        activo: esVigenteAhora,
      },
      include: { categoria: true },
    });

    await this.auditoria.registrar({
      accion: 'CREAR',
      entidad: 'ConfiguracionCuotaSocial',
      idEntidad: creada.id,
      responsableId,
      detalle: `Cuota social ${categoria.nombre} - Período ${periodoAplicacion} - Monto $${Number(dto.monto).toFixed(2)}`,
    });

    return serializarCuotaSocial(creada);
  }

  async findAll(query: FindCuotaSocialQueryDto) {
    const { categoriaId, periodoAplicacion, pagina, porPagina } = query;

    const where: Prisma.ConfiguracionCuotaSocialWhereInput = {
      ...(categoriaId && { categoriaId }),
      ...(periodoAplicacion && { periodoAplicacion }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.configuracionCuotaSocial.findMany({
        where,
        include: { categoria: true },
        orderBy: [{ periodoAplicacion: 'desc' }, { categoria: { nombre: 'asc' } }],
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
      this.prisma.configuracionCuotaSocial.count({ where }),
    ]);

    return {
      items: items.map(serializarCuotaSocial),
      total,
      pagina,
      porPagina,
    };
  }

  async findOne(id: number) {
    const configuracion = await this.prisma.configuracionCuotaSocial.findUnique({
      where: { id },
      include: { categoria: true },
    });
    if (!configuracion) {
      throw new NotFoundException('Configuración de cuota social no encontrada');
    }
    return serializarCuotaSocial(configuracion);
  }

  async actualizar(id: number, dto: ActualizarCuotaSocialDto, responsableId: number) {
    const existente = await this.findOne(id);

    if (dto.activo === true) {
      await this.prisma.configuracionCuotaSocial.updateMany({
        where: { categoriaId: existente.categoriaId, activo: true, id: { not: id } },
        data: { activo: false },
      });
    }

    const configuracion = await this.prisma.configuracionCuotaSocial.update({
      where: { id },
      data: dto,
      include: { categoria: true },
    });

    const detalleMonto =
      dto.monto !== undefined
        ? ` - Monto $${Number(existente.monto).toFixed(2)} → $${Number(dto.monto).toFixed(2)}`
        : '';
    const detalleActivo =
      dto.activo !== undefined ? ` - activo:${existente.activo}→${dto.activo}` : '';
    await this.auditoria.registrar({
      accion: 'EDITAR',
      entidad: 'ConfiguracionCuotaSocial',
      idEntidad: id,
      responsableId,
      detalle: `Cuota social ${existente.categoria.nombre} - Período ${existente.periodoAplicacion}${detalleMonto}${detalleActivo}`,
    });

    return serializarCuotaSocial(configuracion);
  }

  /** Devuelve la cuota vigente para una categoría (max periodo <= hoy). */
  async getVigente(categoriaId: number) {
    const vigente = await this.prisma.configuracionCuotaSocial.findFirst({
      where: { categoriaId, periodoAplicacion: { lte: periodoActual() } },
      orderBy: { periodoAplicacion: 'desc' },
      include: { categoria: true },
    });
    return vigente ? serializarCuotaSocial(vigente) : null;
  }

  /** Lista las vigentes de todas las categorías (una por categoría). */
  async getVigentes() {
    const categorias = await this.prisma.categoriaSocio.findMany();
    const vigentes = await Promise.all(categorias.map((c) => this.getVigente(c.id)));
    return vigentes.filter((v): v is NonNullable<typeof v> => v !== null);
  }

  /** Sincroniza el flag activo con la vigencia por fecha. Se ejecuta el día 1 de cada mes. */
  async sincronizarVigentes(now = new Date()) {
    const actual = periodoActual(now);
    const categorias = await this.prisma.categoriaSocio.findMany({ select: { id: true } });
    for (const { id: categoriaId } of categorias) {
      const vigente = await this.prisma.configuracionCuotaSocial.findFirst({
        where: { categoriaId, periodoAplicacion: { lte: actual } },
        orderBy: { periodoAplicacion: 'desc' },
      });
      if (!vigente) continue;
      await this.prisma.configuracionCuotaSocial.updateMany({
        where: { categoriaId, activo: true, id: { not: vigente.id } },
        data: { activo: false },
      });
      if (!vigente.activo) {
        await this.prisma.configuracionCuotaSocial.update({
          where: { id: vigente.id },
          data: { activo: true },
        });
      }
    }
  }

  private validarPeriodoFuturo(periodoAplicacion: string) {
    const minimo = proximoPeriodo();
    if (periodoAplicacion < minimo) {
      throw new BadRequestException(
        `El período ${periodoAplicacion} no es válido: los cambios de cuota aplican a partir del período siguiente (${minimo})`,
      );
    }
  }
}
