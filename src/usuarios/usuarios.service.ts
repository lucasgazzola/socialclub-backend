import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioPasswordDto } from './dto/update-usuario.dto';

const SALT_ROUNDS = 10;

/** Campos que se exponen del usuario (nunca el passwordHash). */
const SELECT_PUBLICO = {
  id: true,
  dni: true,
  email: true,
  nombre: true,
  apellido: true,
  activo: true,
  ultimoLogin: true,
  creadoEn: true,
  roles: { select: { rol: { select: { id: true, nombre: true } } } },
} satisfies Prisma.UsuarioSelect;

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** US-01: Registrar usuario administrativo */
  async create(dto: CreateUsuarioDto, responsableId: number) {
    const email = dto.email.trim().toLowerCase();
    const dni = dto.dni.trim();

    await this.validarUnicidad({ email, dni });

    const rolesIds = await this.resolverRoles(dto.roles);
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const usuario = await this.prisma.usuario.create({
      data: {
        dni,
        email,
        passwordHash,
        nombre: dto.nombre,
        apellido: dto.apellido,
        roles: { create: rolesIds.map((rolId) => ({ rolId })) },
      },
      select: SELECT_PUBLICO,
    });

    await this.auditoria.registrar({
      accion: 'CREAR',
      entidad: 'Usuario',
      idEntidad: usuario.id,
      responsableId,
    });

    return usuario;
  }

  async findAll() {
    return this.prisma.usuario.findMany({
      select: SELECT_PUBLICO,
      orderBy: { apellido: 'asc' },
    });
  }

  async findOne(id: number) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id },
      select: SELECT_PUBLICO,
    });
    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return usuario;
  }

  /** US-02: Editar usuario administrativo */
  async update(id: number, dto: UpdateUsuarioPasswordDto, responsableId: number) {
    const usuarioExistente = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuarioExistente) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const email = dto.email?.trim().toLowerCase();
    const dni = dto.dni?.trim();

    if (email || dni) {
      await this.validarUnicidad({ email, dni }, id);
    }

    const data: Prisma.UsuarioUpdateInput = {};
    if (dto.nombre) data.nombre = dto.nombre;
    if (dto.apellido) data.apellido = dto.apellido;
    if (email) data.email = email;
    if (dni) data.dni = dni;
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

    if (dto.roles) {
      const rolesIds = await this.resolverRoles(dto.roles);
      // Reemplaza el set de roles por completo.
      await this.prisma.usuarioRol.deleteMany({ where: { usuarioId: id } });
      data.roles = { create: rolesIds.map((rolId) => ({ rolId })) };
    }

    const usuario = await this.prisma.usuario.update({
      where: { id },
      data,
      select: SELECT_PUBLICO,
    });

    await this.auditoria.registrar({
      accion: 'EDITAR',
      entidad: 'Usuario',
      idEntidad: id,
      responsableId,
    });

    return usuario;
  }

  /** US-03: Dar de baja (baja lógica; nunca se elimina físicamente). */
  async deactivate(id: number, responsableId: number) {
    const usuario = await this.findOne(id);

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

    return actualizado;
  }

  /** US-03 (complemento): Reactivar un usuario previamente dado de baja. */
  async activate(id: number, responsableId: number) {
    const usuario = await this.findOne(id);

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

    return actualizado;
  }

  /** Traduce nombres de rol a sus ids, validando que todos existan. */
  private async resolverRoles(nombres: string[]): Promise<number[]> {
    const roles = await this.prisma.rol.findMany({ where: { nombre: { in: nombres } } });
    if (roles.length !== nombres.length) {
      throw new NotFoundException('Uno o más roles indicados no existen');
    }
    return roles.map((rol) => rol.id);
  }

  private async validarUnicidad(datos: { email?: string; dni?: string }, excluirId?: number) {
    if (datos.email) {
      const existente = await this.prisma.usuario.findFirst({
        where: {
          email: datos.email,
          ...(excluirId ? { id: { not: excluirId } } : {}),
        },
        select: { id: true },
      });

      if (existente) {
        throw new ConflictException('Ya existe otro usuario con ese email');
      }
    }

    if (datos.dni) {
      const existente = await this.prisma.usuario.findFirst({
        where: {
          dni: datos.dni,
          ...(excluirId ? { id: { not: excluirId } } : {}),
        },
        select: { id: true },
      });

      if (existente) {
        throw new ConflictException('Ya existe otro usuario con ese DNI');
      }
    }
  }
}
