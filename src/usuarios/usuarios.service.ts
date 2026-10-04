import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioPasswordDto } from './dto/update-usuario.dto';
import { GetUsuariosQueryDto } from './dto/get-usuarios-query.dto';

const SALT_ROUNDS = 10;

/** DT-42: único rol que puede tener disciplinas a cargo. */
const ROL_DELEGADO = 'DELEGADO';

/** Campos que se exponen del usuario (nunca el passwordHash). */
const SELECT_PUBLICO = {
  id: true,
  email: true,
  nombre: true,
  apellido: true,
  activo: true,
  ultimoLogin: true,
  creadoEn: true,
  actualizadoEn: true,
  personaId: true,
  persona: { select: { dni: true } },
  roles: { select: { rol: { select: { id: true, nombre: true } } } },
  disciplinasDelegadas: {
    select: { disciplina: { select: { id: true, nombre: true } } },
    orderBy: { disciplina: { nombre: 'asc' } },
  },
} satisfies Prisma.UsuarioSelect;

type UsuarioPublico = Prisma.UsuarioGetPayload<{ select: typeof SELECT_PUBLICO }>;

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private aUsuarioDto(usuario: UsuarioPublico | null) {
    if (!usuario) return null;
    const { persona, disciplinasDelegadas, ...resto } = usuario;
    return {
      ...resto,
      dni: persona?.dni ?? null,
      disciplinas: (disciplinasDelegadas ?? []).map((d) => d.disciplina),
    };
  }

  /**
   * US-01: Registrar usuario administrativo.
   *
   * Puede pasar que el DNI ya corresponda a una Persona existente en el
   * sistema (por ejemplo, alguien cargado antes como socio o participante de
   * una inscripción, que todavía no tiene cuenta de acceso). En ese caso no
   * hay que rechazar el alta: hay que reutilizar esa Persona y solo crear el
   * Usuario nuevo sobre ella. Únicamente se rechaza si esa Persona YA tiene
   * un Usuario asociado (ahí sí sería un usuario duplicado).
   */
  async create(dto: CreateUsuarioDto, responsableId: number) {
    const email = dto.email.trim().toLowerCase();
    const dni = dto.dni.trim();

    const personaExistente = await this.prisma.persona.findUnique({ where: { dni } });

    if (personaExistente) {
      const usuarioExistente = await this.prisma.usuario.findUnique({
        where: { personaId: personaExistente.id },
      });
      if (usuarioExistente) {
        throw new ConflictException(
          'Ya existe un usuario administrativo asociado a esa persona (mismo DNI).',
        );
      }
    }

    // Si vamos a reutilizar una Persona existente, la excluimos de la
    // validación de unicidad: no tiene sentido que choque contra sí misma.
    await this.validarUnicidad({ email, dni }, undefined, personaExistente?.id);

    const rolesIds = await this.resolverRoles(dto.roles);
    const disciplinasIds = await this.resolverDisciplinas(dto.roles, dto.disciplinasIds);
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    let usuario;
    try {
      usuario = await this.prisma.$transaction(async (tx) => {
        let persona;

        if (personaExistente) {
          // Reutilizamos la Persona y actualizamos sus datos de contacto con
          // lo que acaba de cargar el administrador, para no dejar el
          // registro desactualizado respecto del alta anterior.
          persona = await tx.persona.update({
            where: { id: personaExistente.id },
            data: {
              nombre: dto.nombre,
              apellido: dto.apellido,
              email,
            },
          });
        } else {
          persona = await tx.persona.create({
            data: {
              nombre: dto.nombre,
              apellido: dto.apellido,
              dni,
              email,
            },
          });
        }

        return tx.usuario.create({
          data: {
            email,
            passwordHash,
            nombre: dto.nombre,
            apellido: dto.apellido,
            personaId: persona.id,
            roles: { create: rolesIds.map((rolId) => ({ rolId })) },
            disciplinasDelegadas: {
              create: disciplinasIds.map((disciplinaId) => ({ disciplinaId })),
            },
          },
          select: SELECT_PUBLICO,
        });
      });
    } catch (error) {
      // Defensa ante una condición de carrera: dos altas simultáneas con el
      // mismo DNI/email podrían pasar ambas la validación previa.
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe otro usuario o persona con ese DNI o correo');
      }
      throw error;
    }

    await this.auditoria.registrar({
      accion: 'CREAR',
      entidad: 'Usuario',
      idEntidad: usuario.id,
      responsableId,
    });

    return this.aUsuarioDto(usuario);
  }

  async findAll(query: GetUsuariosQueryDto = new GetUsuariosQueryDto()) {
    const { busqueda, rolId, estado, pagina = 1, porPagina = 10 } = query;
    const whereBase: Prisma.UsuarioWhereInput = {};

    if (busqueda) {
      const terminos = busqueda.trim().split(/\s+/);
      whereBase.AND = terminos.map((t) => ({
        OR: [
          { nombre: { contains: t, mode: 'insensitive' } },
          { apellido: { contains: t, mode: 'insensitive' } },
        ],
      }));
    }

    if (rolId) {
      whereBase.roles = {
        some: {
          rolId,
        },
      };
    }

    const whereActivos: Prisma.UsuarioWhereInput = { ...whereBase, activo: true };
    const whereInactivos: Prisma.UsuarioWhereInput = { ...whereBase, activo: false };

    let where: Prisma.UsuarioWhereInput = whereBase;
    if (estado === 'activos') {
      where = whereActivos;
    } else if (estado === 'inactivos') {
      where = whereInactivos;
    }

    const [items, total, totalTodos, totalActivos, totalInactivos] = await this.prisma.$transaction(
      [
        this.prisma.usuario.findMany({
          where,
          select: SELECT_PUBLICO,
          orderBy: { apellido: 'asc' },
          skip: (pagina - 1) * porPagina,
          take: porPagina,
        }),
        this.prisma.usuario.count({ where }),
        this.prisma.usuario.count({ where: whereBase }),
        this.prisma.usuario.count({ where: whereActivos }),
        this.prisma.usuario.count({ where: whereInactivos }),
      ],
    );

    return {
      items: items.map((u) => this.aUsuarioDto(u as UsuarioPublico)),
      total,
      pagina,
      porPagina,
      counts: {
        todos: totalTodos,
        activos: totalActivos,
        inactivos: totalInactivos,
      },
    };
  }

  async findOne(id: number) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id },
      select: SELECT_PUBLICO,
    });
    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return this.aUsuarioDto(usuario);
  }

  /** US-02: Editar usuario administrativo */
  async update(id: number, dto: UpdateUsuarioPasswordDto, responsableId: number) {
    const usuarioExistente = await this.prisma.usuario.findUnique({
      where: { id },
      include: {
        persona: true,
        roles: { select: { rol: { select: { nombre: true } } } },
        _count: { select: { disciplinasDelegadas: true } },
      },
    });
    if (!usuarioExistente) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const email = dto.email?.trim().toLowerCase();
    const dni = dto.dni?.trim();

    // Nota: acá SÍ se mantiene la validación estricta de DNI/email (sin
    // excepción para personas sin usuario). Editar el DNI de un usuario
    // existente para que coincida con el de otra Persona huérfana implicaría
    // "adoptar" esa identidad en silencio, algo que merece un flujo explícito
    // de vinculación y no un efecto secundario de esta edición.
    if (email || dni) {
      await this.validarUnicidad({ email, dni }, id, usuarioExistente.personaId);
    }

    const data: Prisma.UsuarioUpdateInput = {};
    if (dto.nombre) data.nombre = dto.nombre;
    if (dto.apellido) data.apellido = dto.apellido;
    if (email) data.email = email;
    if (dto.password) {
      if (!dto.currentPassword) {
        throw new BadRequestException(
          'Debes indicar la contraseña actual para cambiar la contraseña.',
        );
      }

      const passwordActualValida = await bcrypt.compare(
        dto.currentPassword,
        usuarioExistente.passwordHash,
      );
      if (!passwordActualValida) {
        throw new UnauthorizedException('La contraseña actual es incorrecta');
      }

      data.passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    } else if (dto.currentPassword) {
      throw new BadRequestException(
        'La contraseña nueva es obligatoria si ingresas la contraseña actual.',
      );
    }

    // DT-42: las disciplinas se validan contra los roles con los que queda el
    // usuario. Si deja de ser delegado, pierde las disciplinas a cargo.
    const rolesFinales = dto.roles ?? usuarioExistente.roles.map((r) => r.rol.nombre);
    if (dto.disciplinasIds !== undefined) {
      const disciplinasIds = await this.resolverDisciplinas(rolesFinales, dto.disciplinasIds);
      data.disciplinasDelegadas = {
        deleteMany: {},
        create: disciplinasIds.map((disciplinaId) => ({ disciplinaId })),
      };
    } else if (
      !rolesFinales.includes(ROL_DELEGADO) &&
      usuarioExistente._count.disciplinasDelegadas > 0
    ) {
      data.disciplinasDelegadas = { deleteMany: {} };
    }

    if (dto.roles) {
      const rolesIds = await this.resolverRoles(dto.roles);
      await this.prisma.usuarioRol.deleteMany({ where: { usuarioId: id } });
      data.roles = { create: rolesIds.map((rolId) => ({ rolId })) };
    }

    const usuario = await this.prisma.$transaction(async (tx) => {
      if (dni || dto.nombre || dto.apellido || email) {
        await tx.persona.update({
          where: { id: usuarioExistente.personaId },
          data: {
            ...(dni ? { dni } : {}),
            ...(dto.nombre ? { nombre: dto.nombre } : {}),
            ...(dto.apellido ? { apellido: dto.apellido } : {}),
            ...(email ? { email } : {}),
          },
        });
      }

      return tx.usuario.update({
        where: { id },
        data,
        select: SELECT_PUBLICO,
      });
    });

    await this.auditoria.registrar({
      accion: 'EDITAR',
      entidad: 'Usuario',
      idEntidad: id,
      responsableId,
    });

    return this.aUsuarioDto(usuario);
  }

  /** US-03: Dar de baja (baja lógica; nunca se elimina físicamente). */
  async deactivate(id: number, responsableId: number) {
    const usuario = await this.findOne(id);

    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (!usuario.activo) {
      throw new BadRequestException('El usuario ya está inactivo');
    }

    const actualizado = await this.prisma.usuario.update({
      where: { id },
      data: { activo: false },
      select: SELECT_PUBLICO,
    });

    await this.auditoria.registrar({
      accion: 'BAJA',
      entidad: 'Usuario',
      idEntidad: id,
      responsableId,
    });

    return this.aUsuarioDto(actualizado);
  }

  /** US-03 (complemento): Reactivar un usuario previamente dado de baja. */
  async activate(id: number, responsableId: number) {
    const usuario = await this.findOne(id);

    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (usuario.activo) {
      throw new BadRequestException('El usuario ya está activo');
    }

    const actualizado = await this.prisma.usuario.update({
      where: { id },
      data: { activo: true },
      select: SELECT_PUBLICO,
    });

    await this.auditoria.registrar({
      accion: 'REACTIVAR',
      entidad: 'Usuario',
      idEntidad: id,
      responsableId,
    });

    return this.aUsuarioDto(actualizado);
  }

  /** Traduce nombres de rol a sus ids, validando que todos existan. */
  private async resolverRoles(nombres: string[]): Promise<number[]> {
    const roles = await this.prisma.rol.findMany({ where: { nombre: { in: nombres } } });
    if (roles.length !== nombres.length) {
      throw new NotFoundException('Uno o más roles indicados no existen');
    }
    return roles.map((rol) => rol.id);
  }

  /**
   * DT-42: valida las disciplinas a cargo. Solo un delegado puede tenerlas, y
   * tienen que existir y estar activas.
   */
  private async resolverDisciplinas(roles: string[], ids: number[] = []): Promise<number[]> {
    if (!ids.length) return [];
    if (!roles.includes(ROL_DELEGADO)) {
      throw new BadRequestException(
        'Solo los usuarios con rol DELEGADO pueden tener disciplinas a cargo.',
      );
    }
    const disciplinas = await this.prisma.disciplina.findMany({
      where: { id: { in: ids }, activo: true },
      select: { id: true },
    });
    if (disciplinas.length !== new Set(ids).size) {
      throw new NotFoundException('Una o más disciplinas indicadas no existen o están inactivas');
    }
    return disciplinas.map((d) => d.id);
  }

  private async validarUnicidad(
    datos: { email?: string; dni?: string },
    excluirUsuarioId?: number,
    excluirPersonaId?: number,
  ) {
    if (datos.email) {
      const existenteUsuario = await this.prisma.usuario.findFirst({
        where: {
          email: datos.email,
          ...(excluirUsuarioId ? { id: { not: excluirUsuarioId } } : {}),
        },
        select: { id: true },
      });

      if (existenteUsuario) {
        throw new ConflictException('Ya existe otro usuario con ese email');
      }

      const existentePersona = await this.prisma.persona.findFirst({
        where: {
          email: datos.email,
          ...(excluirPersonaId ? { id: { not: excluirPersonaId } } : {}),
        },
        select: { id: true },
      });

      if (existentePersona) {
        throw new ConflictException('Ya existe una persona con ese email');
      }
    }

    if (datos.dni) {
      const existentePersona = await this.prisma.persona.findFirst({
        where: {
          dni: datos.dni,
          ...(excluirPersonaId ? { id: { not: excluirPersonaId } } : {}),
        },
        select: { id: true },
      });

      if (existentePersona) {
        throw new ConflictException('Ya existe otra persona con ese DNI');
      }
    }
  }
}
