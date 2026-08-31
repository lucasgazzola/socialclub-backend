import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EstadoSocioFiltro, FindSociosQueryDto } from './dto/find-socios-query.dto';
import { CreateSocioDto } from './dto/create-socio.dto';
import { RegistrarSocioDto } from './dto/registrar-socio.dto';
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
   * US-09: Registrarme como socio.
   * - Reutiliza el Usuario de la sesion autenticada.
   * - Un Usuario no puede tener mas de una Persona asociada.
   * - El DNI/email se validan contra Persona (no contra Usuario).
   * - Se asigna el rol SOCIO sin remover otros roles del usuario.
   * - Queda constancia en RegistroAuditoria (CREAR / Persona).
   */
  async registrarme(dto: RegistrarSocioDto, usuarioId: number) {
    const dni = dto.dni.trim();

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        email: true,
        nombre: true,
        apellido: true,
        activo: true,
        persona: { select: { id: true } },
      },
    });

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException(
        'El usuario no está habilitado para autogestionarse como socio',
      );
    }

    // Un usuario ya socio no puede duplicar el alta.
    if (usuario.persona) {
      throw new ConflictException('Ya sos socio: tu ficha de socio ya está asociada a esta cuenta');
    }

    // DNI duplicado contra Persona (dni es @unique).
    const conDni = await this.prisma.persona.findUnique({ where: { dni } });
    if (conDni?.activo) {
      throw new ConflictException('Ya existe un socio activo con ese DNI');
    }
    if (conDni) {
      throw new ConflictException('Ese DNI ya está registrado en una ficha dada de baja');
    }

    // Email duplicado contra Persona (insensible a mayusculas).
    const email = usuario.email.toLowerCase();
    const conEmail = await this.prisma.persona.findFirst({
      where: { email, activo: true },
      select: { id: true },
    });
    if (conEmail) {
      throw new ConflictException('Ya existe un socio activo con ese email');
    }

    const categoria = await this.prisma.categoriaSocio.findUnique({
      where: { id: dto.categoriaId },
    });
    if (!categoria) {
      throw new BadRequestException('La categoría de socio seleccionada no existe');
    }

    const rolSocio = await this.prisma.rol.findUnique({ where: { nombre: 'SOCIO' } });
    if (!rolSocio) {
      throw new BadRequestException('El rol SOCIO no está configurado en el sistema');
    }

    return this.prisma.$transaction(async (tx) => {
      const persona = await tx.persona.create({
        data: {
          nombre: usuario.nombre,
          apellido: usuario.apellido,
          dni,
          email,
          categoriaId: categoria.id,
          usuarioId: usuario.id,
        },
        include: { categoria: true },
      });

      // Asigna el rol SOCIO preservando los roles existentes (varios roles simultaneos).
      const yaTieneRol = await tx.usuarioRol.findUnique({
        where: { usuarioId_rolId: { usuarioId: usuario.id, rolId: rolSocio.id } },
      });
      if (!yaTieneRol) {
        await tx.usuarioRol.create({ data: { usuarioId: usuario.id, rolId: rolSocio.id } });
      }

      await this.auditoria.registrar(
        {
          accion: 'CREAR',
          entidad: 'Persona',
          idEntidad: persona.id,
          responsableId: usuario.id,
          detalle: `Alta autogestionada como socio (US-09) · categoría: ${categoria.nombre}`,
        },
        tx,
      );

      return persona;
    });
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
