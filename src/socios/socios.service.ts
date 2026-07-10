import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EstadoSocioFiltro, FindSociosQueryDto } from './dto/find-socios-query.dto';
import { CreateSocioDto } from './dto/create-socio.dto';
import { UpdateSocioDto } from './dto/update-socio.dto';

@Injectable()
export class SociosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** US-12: Registrar socio */
  async create(dto: CreateSocioDto, responsableId: number) {
    const existente = await this.prisma.persona.findUnique({ where: { dni: dto.dni } });
    if (existente) {
      throw new ConflictException('Ya existe una persona registrada con ese DNI');
    }

    const socio = await this.prisma.persona.create({
      data: {
        nombre: dto.nombre,
        apellido: dto.apellido,
        dni: dto.dni,
        email: dto.email,
        telefono: dto.telefono,
        categoriaId: dto.categoriaId,
        fechaNacimiento: dto.fechaNacimiento ? new Date(dto.fechaNacimiento) : undefined,
      },
      include: { categoria: true },
    });

    await this.auditoria.registrar({
      accion: 'CREAR',
      entidad: 'Persona',
      idEntidad: socio.id,
      responsableId,
    });

    return socio;
  }

  /**
   * US-15: Buscar y filtrar socios.
   * - Búsqueda parcial e insensible a mayúsculas por nombre, apellido o DNI.
   * - Filtro opcional por categoría.
   * - Filtro opcional por estado (alta/baja).
   * - Todos los filtros son combinables entre sí.
   * - Paginación resuelta enteramente en el backend (skip/take + count).
   */
  async findAll(query: FindSociosQueryDto) {
    const { busqueda, categoriaId, estado, pagina, porPagina } = query;

    const filtros: Prisma.PersonaWhereInput[] = [];

    if (busqueda) {
      const termino = busqueda.trim();
      filtros.push({
        OR: [
          { nombre: { contains: termino, mode: 'insensitive' } },
          { apellido: { contains: termino, mode: 'insensitive' } },
          { dni: { contains: termino, mode: 'insensitive' } },
        ],
      });
    }

    if (categoriaId) {
      filtros.push({ categoriaId });
    }

    if (estado) {
      filtros.push({ activo: estado === EstadoSocioFiltro.ALTA });
    }

    const where: Prisma.PersonaWhereInput = filtros.length ? { AND: filtros } : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.persona.findMany({
        where,
        include: { categoria: true },
        orderBy: { apellido: 'asc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
      this.prisma.persona.count({ where }),
    ]);

    return { items, total, pagina, porPagina };
  }

  async findOne(id: number) {
    const socio = await this.prisma.persona.findUnique({
      where: { id },
      include: { categoria: true },
    });
    if (!socio) {
      throw new NotFoundException('Socio no encontrado');
    }
    return socio;
  }

  /** US-13: Editar socio */
  async update(id: number, dto: UpdateSocioDto, responsableId: number) {
    await this.findOne(id);

    const socio = await this.prisma.persona.update({
      where: { id },
      data: {
        ...dto,
        fechaNacimiento: dto.fechaNacimiento ? new Date(dto.fechaNacimiento) : undefined,
      },
      include: { categoria: true },
    });

    await this.auditoria.registrar({
      accion: 'EDITAR',
      entidad: 'Persona',
      idEntidad: id,
      responsableId,
    });

    return socio;
  }

  /** US-14: Dar de baja socio (baja lógica) */
  async deactivate(id: number, responsableId: number) {
    await this.findOne(id);

    const socio = await this.prisma.persona.update({
      where: { id },
      data: { activo: false },
      include: { categoria: true },
    });

    await this.auditoria.registrar({
      accion: 'BAJA',
      entidad: 'Persona',
      idEntidad: id,
      responsableId,
    });

    return socio;
  }
}
