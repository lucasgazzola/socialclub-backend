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
import { UpdatePerfilSocioDto } from './dto/update-perfil-socio.dto';

@Injectable()
export class SociosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Formatea una Persona con sus membresías al objeto Socio esperado */
  private aSocioDto(persona: any) {
    const membresiaActiva = persona.membresias?.find((m: any) => m.activo);
    const ultimaMembresia = persona.membresias?.[0];
    const mem = membresiaActiva ?? ultimaMembresia;

    return {
      id: persona.id,
      nombre: persona.nombre,
      apellido: persona.apellido,
      dni: persona.dni,
      email: persona.email,
      telefono: persona.telefono,
      fechaNacimiento: persona.fechaNacimiento,
      activo: Boolean(membresiaActiva),
      categoriaId: mem?.categoriaId ?? null,
      categoria: mem?.categoria ?? null,
      fechaAlta: mem?.fechaAlta ?? persona.creadoEn,
      fechaBaja: mem?.fechaBaja ?? null,
      usuarioId: persona.usuario?.id ?? null,
      creadoEn: persona.creadoEn,
      actualizadoEn: persona.actualizadoEn,
      membresias: persona.membresias ?? [],
    };
  }

  /** US-12: Registrar socio (carga administrativa) */
  async create(dto: CreateSocioDto, responsableId: number) {
    let categoria = null;
    if (dto.categoriaId) {
      categoria = await this.prisma.categoriaSocio.findUnique({
        where: { id: dto.categoriaId },
      });
      if (!categoria) {
        throw new BadRequestException('La categoría de socio seleccionada no existe');
      }
    } else {
      categoria = await this.prisma.categoriaSocio.findFirst();
      if (!categoria) {
        throw new BadRequestException('No hay categorías de socio configuradas');
      }
    }
    const categoriaId = categoria.id;

    const personaExistente = await this.prisma.persona.findUnique({
      where: { dni: dto.dni },
      include: {
        membresias: { include: { categoria: true }, orderBy: { fechaAlta: 'desc' } },
        usuario: { select: { id: true } },
      },
    });

    if (personaExistente) {
      const tieneActiva = personaExistente.membresias.some((m) => m.activo);
      if (tieneActiva) {
        throw new ConflictException('Ya existe un socio activo con ese DNI');
      }

      return this.prisma.$transaction(async (tx) => {
        await tx.persona.update({
          where: { id: personaExistente.id },
          data: {
            nombre: dto.nombre,
            apellido: dto.apellido,
            email: dto.email ?? personaExistente.email,
            telefono: dto.telefono ?? personaExistente.telefono,
            fechaNacimiento: dto.fechaNacimiento
              ? new Date(dto.fechaNacimiento)
              : personaExistente.fechaNacimiento,
          },
        });

        const membresia = await tx.membresia.create({
          data: {
            personaId: personaExistente.id,
            categoriaId,
            activo: true,
            fechaAlta: new Date(),
          },
          include: { categoria: true },
        });

        await this.auditoria.registrar(
          {
            accion: 'CREAR',
            entidad: 'Membresia',
            idEntidad: membresia.id,
            responsableId,
            detalle: `Alta de membresía de socio para persona DNI ${dto.dni} - categoría: ${categoria.nombre}`,
          },
          tx,
        );

        const actualizada = await tx.persona.findUnique({
          where: { id: personaExistente.id },
          include: {
            membresias: { include: { categoria: true }, orderBy: { fechaAlta: 'desc' } },
            usuario: { select: { id: true } },
          },
        });

        return this.aSocioDto(actualizada)!;
      });
    }

    if (dto.email) {
      const conEmail = await this.prisma.persona.findFirst({
        where: { email: dto.email.trim().toLowerCase() },
      });
      if (conEmail) {
        throw new ConflictException('Ya existe una persona registrada con ese email');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const persona = await tx.persona.create({
        data: {
          nombre: dto.nombre,
          apellido: dto.apellido,
          dni: dto.dni,
          email: dto.email ? dto.email.trim().toLowerCase() : null,
          telefono: dto.telefono,
          fechaNacimiento: dto.fechaNacimiento ? new Date(dto.fechaNacimiento) : undefined,
          membresias: {
            create: {
              categoriaId,
              activo: true,
              fechaAlta: new Date(),
            },
          },
        },
        include: {
          membresias: { include: { categoria: true }, orderBy: { fechaAlta: 'desc' } },
          usuario: { select: { id: true } },
        },
      });

      await this.auditoria.registrar(
        {
          accion: 'CREAR',
          entidad: 'Persona',
          idEntidad: persona.id,
          responsableId,
          detalle: `Alta administrativa de socio - DNI: ${dto.dni}, categoría: ${categoria.nombre}`,
        },
        tx,
      );

      return this.aSocioDto(persona)!;
    });
  }

  /**
   * US-09: Registrarme como socio.
   * - Reutiliza la Persona ya vinculada al Usuario autenticado.
   * - Si persona.dni ya está cargado → no se vuelve a pedir, solo se crea la Membresía.
   * - Si persona.dni es null → se pide, se valida unicidad, se guarda en Persona y se crea la Membresía.
   * - Como máximo una Membresia con activo = true por Persona.
   * - Asigna el rol SOCIO si aún no lo tiene.
   * - Queda constancia en RegistroAuditoria.
   */
  async registrarme(dto: RegistrarSocioDto, usuarioId: number) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: {
        persona: {
          include: {
            membresias: { include: { categoria: true }, orderBy: { fechaAlta: 'desc' } },
          },
        },
      },
    });

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException(
        'El usuario no está habilitado para autogestionarse como socio',
      );
    }

    if (!usuario.persona) {
      throw new BadRequestException('El usuario no tiene una ficha de persona vinculada');
    }

    const persona = usuario.persona;

    const tieneMembresiaActiva = persona.membresias.some((m) => m.activo);
    if (tieneMembresiaActiva) {
      throw new ConflictException('Ya sos socio: tu ficha de socio ya tiene una membresía activa');
    }

    let dni = persona.dni;
    if (!dni) {
      if (!dto.dni || !dto.dni.trim()) {
        throw new BadRequestException('El DNI es obligatorio para registrarte como socio');
      }
      dni = dto.dni.trim();

      const conDni = await this.prisma.persona.findUnique({ where: { dni } });
      if (conDni && conDni.id !== persona.id) {
        throw new ConflictException('Ya existe otra persona registrada con ese DNI');
      }
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
      if (!persona.dni) {
        await tx.persona.update({
          where: { id: persona.id },
          data: { dni },
        });
      }

      const membresia = await tx.membresia.create({
        data: {
          personaId: persona.id,
          categoriaId: categoria.id,
          activo: true,
          fechaAlta: new Date(),
        },
        include: { categoria: true },
      });

      const yaTieneRol = await tx.usuarioRol.findUnique({
        where: { usuarioId_rolId: { usuarioId: usuario.id, rolId: rolSocio.id } },
      });
      if (!yaTieneRol) {
        await tx.usuarioRol.create({ data: { usuarioId: usuario.id, rolId: rolSocio.id } });
      }

      await this.auditoria.registrar(
        {
          accion: 'CREAR',
          entidad: 'Membresia',
          idEntidad: membresia.id,
          responsableId: usuario.id,
          detalle: `Alta autogestionada como socio - categoría: ${categoria.nombre}`,
        },
        tx,
      );

      const personaActualizada = await tx.persona.findUnique({
        where: { id: persona.id },
        include: {
          membresias: { include: { categoria: true }, orderBy: { fechaAlta: 'desc' } },
          usuario: { select: { id: true } },
        },
      });

      return this.aSocioDto(personaActualizada);
    });
  }

  /**
   * US-15: Buscar y filtrar socios.
   * - Búsqueda por nombre, apellido o DNI.
   * - Filtro por categoría de socio (membresía activa).
   * - Filtro por estado (ALTA: membresía activa, BAJA: sin membresía activa).
   * - Paginación resuelta en backend.
   */
  async findAll(query: FindSociosQueryDto) {
    const { busqueda, categoriaId, estado, pagina, porPagina } = query;

    const filtros: Prisma.PersonaWhereInput[] = [
      { membresias: { some: {} } }, // Solo personas que tienen o tuvieron membresías
    ];

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
      filtros.push({
        membresias: { some: { categoriaId, activo: true } },
      });
    }

    if (estado) {
      if (estado === EstadoSocioFiltro.ALTA) {
        filtros.push({ membresias: { some: { activo: true } } });
      } else {
        filtros.push({ membresias: { none: { activo: true } } });
      }
    }

    const where: Prisma.PersonaWhereInput = { AND: filtros };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.persona.findMany({
        where,
        include: {
          membresias: { include: { categoria: true }, orderBy: { fechaAlta: 'desc' } },
          usuario: { select: { id: true } },
        },
        orderBy: { apellido: 'asc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
      this.prisma.persona.count({ where }),
    ]);

    return {
      items: items.map((p) => this.aSocioDto(p)),
      total,
      pagina,
      porPagina,
    };
  }

  async findOne(id: number) {
    const persona = await this.prisma.persona.findUnique({
      where: { id },
      include: {
        membresias: { include: { categoria: true }, orderBy: { fechaAlta: 'desc' } },
        usuario: { select: { id: true } },
      },
    });

    if (!persona || persona.membresias.length === 0) {
      throw new NotFoundException('Socio no encontrado');
    }

    return this.aSocioDto(persona)!;
  }

  /** US-13: Editar socio */
  async update(id: number, dto: UpdateSocioDto, responsableId: number) {
    const socioExistente = await this.findOne(id);

    if (dto.dni && dto.dni !== socioExistente.dni) {
      const conDni = await this.prisma.persona.findFirst({
        where: { dni: dto.dni, id: { not: id } },
      });
      if (conDni) {
        throw new ConflictException('Ya existe otra persona registrada con ese DNI');
      }
    }

    if (dto.email && dto.email !== socioExistente.email) {
      const conEmail = await this.prisma.persona.findFirst({
        where: { email: dto.email.trim().toLowerCase(), id: { not: id } },
      });
      if (conEmail) {
        throw new ConflictException('Ya existe otra persona registrada con ese email');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.persona.update({
        where: { id },
        data: {
          ...(dto.nombre ? { nombre: dto.nombre } : {}),
          ...(dto.apellido ? { apellido: dto.apellido } : {}),
          ...(dto.dni ? { dni: dto.dni } : {}),
          ...(dto.email ? { email: dto.email.trim().toLowerCase() } : {}),
          ...(dto.telefono !== undefined ? { telefono: dto.telefono } : {}),
          ...(dto.fechaNacimiento ? { fechaNacimiento: new Date(dto.fechaNacimiento) } : {}),
        },
      });

      if (dto.categoriaId) {
        const activa = await tx.membresia.findFirst({
          where: { personaId: id, activo: true },
        });
        if (activa) {
          await tx.membresia.update({
            where: { id: activa.id },
            data: { categoriaId: dto.categoriaId },
          });
        }
      }

      await this.auditoria.registrar(
        {
          accion: 'EDITAR',
          entidad: 'Persona',
          idEntidad: id,
          responsableId,
        },
        tx,
      );
    });

    return this.findOne(id);
  }

  /** US-14: Dar de baja socio (baja lógica de su membresía activa) */
  async deactivate(id: number, responsableId: number) {
    await this.findOne(id);

    const membresiaActiva = await this.prisma.membresia.findFirst({
      where: { personaId: id, activo: true },
    });

    if (!membresiaActiva) {
      throw new BadRequestException('El socio ya se encuentra dado de baja');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.membresia.update({
        where: { id: membresiaActiva.id },
        data: { activo: false, fechaBaja: new Date() },
      });

      await this.auditoria.registrar(
        {
          accion: 'BAJA',
          entidad: 'Membresia',
          idEntidad: membresiaActiva.id,
          responsableId,
        },
        tx,
      );
    });

    return this.findOne(id);
  }

  /**
   * US-11: Editar datos personales del socio.
   * - Solo permite modificar Nombre, Apellido, Email y Teléfono.
   * - El DNI y la categoría son inalterables por el socio.
   * - Valida unicidad de email contra otros usuarios y personas activos.
   * - Actualiza Usuario y Persona.
   * - Registra la operación en RegistroAuditoria.
   */
  async updatePerfil(usuarioId: number, dto: UpdatePerfilSocioDto) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: {
        persona: {
          include: {
            membresias: { include: { categoria: true }, orderBy: { fechaAlta: 'desc' } },
          },
        },
      },
    });

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Usuario no habilitado');
    }

    const persona = usuario.persona;
    if (!persona) {
      throw new NotFoundException('No se encontró una ficha de persona asociada a este usuario');
    }

    const email = dto.email.trim().toLowerCase();

    // Validar unicidad del email contra otros usuarios
    const conEmailUsuario = await this.prisma.usuario.findFirst({
      where: {
        email,
        id: { not: usuarioId },
      },
      select: { id: true },
    });
    if (conEmailUsuario) {
      throw new ConflictException(
        'El correo electrónico ya se encuentra registrado por otro usuario',
      );
    }

    // Validar unicidad del email contra otras personas
    const conEmailPersona = await this.prisma.persona.findFirst({
      where: {
        email,
        id: { not: persona.id },
      },
      select: { id: true },
    });
    if (conEmailPersona) {
      throw new ConflictException(
        'El correo electrónico ya se encuentra registrado por otra persona',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Actualizar Usuario
      await tx.usuario.update({
        where: { id: usuarioId },
        data: {
          nombre: dto.nombre.trim(),
          apellido: dto.apellido.trim(),
          email,
        },
      });

      // 2. Actualizar Persona
      const personaActualizada = await tx.persona.update({
        where: { id: persona.id },
        data: {
          nombre: dto.nombre.trim(),
          apellido: dto.apellido.trim(),
          email,
          telefono: dto.telefono ? dto.telefono.trim() : null,
        },
        include: {
          membresias: { include: { categoria: true }, orderBy: { fechaAlta: 'desc' } },
        },
      });

      // 3. Registrar auditoría (inalterable)
      await this.auditoria.registrar(
        {
          accion: 'EDITAR',
          entidad: 'Persona',
          idEntidad: persona.id,
          responsableId: usuarioId,
          detalle: `Actualización de datos personales del socio: ${dto.nombre.trim()} ${dto.apellido.trim()} (${email})`,
        },
        tx,
      );

      return this.aSocioDto(personaActualizada);
    });
  }
}
