import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MemberStatusFilter, FindMembersQueryDto } from './dto/find-members-query.dto';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** US-12: Registrar socio */
  async create(dto: CreateMemberDto, responsibleId: number) {
    const existente = await this.prisma.person.findUnique({ where: { dni: dto.dni } });
    if (existente) {
      throw new ConflictException('Ya existe una persona registrada con ese DNI');
    }

    const socio = await this.prisma.person.create({
      data: {
        name: dto.name,
        lastName: dto.lastName,
        dni: dto.dni,
        email: dto.email,
        phone: dto.phone,
        categoryId: dto.categoryId,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
      },
      include: { category: true },
    });

    await this.audit.record({
      action: 'CREATE',
      entity: 'Person',
      entityId: socio.id,
      responsibleId,
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
  async findAll(query: FindMembersQueryDto) {
    const { search, categoryId, status, page, perPage } = query;

    const filters: Prisma.PersonWhereInput[] = [];

    if (search) {
      const term = search.trim();
      filters.push({
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
          { dni: { contains: term, mode: 'insensitive' } },
        ],
      });
    }

    if (categoryId) {
      filters.push({ categoryId });
    }

    if (status) {
      filters.push({ active: status === MemberStatusFilter.ACTIVE });
    }

    const where: Prisma.PersonWhereInput = filters.length ? { AND: filters } : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.person.findMany({
        where,
        include: { category: true },
        orderBy: { lastName: 'asc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.person.count({ where }),
    ]);

    return { items, total, page, perPage };
  }

  async findOne(id: number) {
    const socio = await this.prisma.person.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!socio) {
      throw new NotFoundException('Socio no encontrado');
    }
    return socio;
  }

  /** US-13: Editar socio */
  async update(id: number, dto: UpdateMemberDto, responsibleId: number) {
    await this.findOne(id);

    const socio = await this.prisma.person.update({
      where: { id },
      data: {
        ...dto,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
      },
      include: { category: true },
    });

    await this.audit.record({
      action: 'UPDATE',
      entity: 'Person',
      entityId: id,
      responsibleId,
    });

    return socio;
  }

  /** US-14: Dar de baja socio (baja lógica) */
  async deactivate(id: number, responsibleId: number) {
    await this.findOne(id);

    const socio = await this.prisma.person.update({
      where: { id },
      data: { active: false },
      include: { category: true },
    });

    await this.audit.record({
      action: 'DEACTIVATE',
      entity: 'Person',
      entityId: id,
      responsibleId,
    });

    return socio;
  }
}
