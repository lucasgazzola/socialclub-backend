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
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserPasswordDto } from './dto/update-user.dto';

const SALT_ROUNDS = 10;

/** Campos que se exponen del usuario (nunca el passwordHash). */
const SELECT_PUBLICO = {
  id: true,
  dni: true,
  email: true,
  name: true,
  lastName: true,
  active: true,
  lastLogin: true,
  createdAt: true,
  roles: { select: { role: { select: { id: true, name: true } } } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** US-01: Registrar usuario administrativo */
  async create(dto: CreateUserDto, responsibleId: number) {
    const email = dto.email.trim().toLowerCase();
    const dni = dto.dni.trim();

    await this.ensureUnique({ email, dni });

    const rolesIds = await this.resolveRoles(dto.roles);
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const usuario = await this.prisma.user.create({
      data: {
        dni,
        email,
        passwordHash,
        name: dto.name,
        lastName: dto.lastName,
        roles: { create: rolesIds.map((roleId) => ({ roleId })) },
      },
      select: SELECT_PUBLICO,
    });

    await this.audit.record({
      action: 'CREATE',
      entity: 'User',
      entityId: usuario.id,
      responsibleId,
    });

    return usuario;
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: SELECT_PUBLICO,
      orderBy: { lastName: 'asc' },
    });
  }

  async findOne(id: number) {
    const usuario = await this.prisma.user.findUnique({
      where: { id },
      select: SELECT_PUBLICO,
    });
    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return usuario;
  }

  /** US-02: Editar usuario administrativo */
  async update(id: number, dto: UpdateUserPasswordDto, responsibleId: number) {
    const usuarioExistente = await this.prisma.user.findUnique({ where: { id } });
    if (!usuarioExistente) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const email = dto.email?.trim().toLowerCase();
    const dni = dto.dni?.trim();

    if (email || dni) {
      await this.ensureUnique({ email, dni }, id);
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.name) data.name = dto.name;
    if (dto.lastName) data.lastName = dto.lastName;
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
      const rolesIds = await this.resolveRoles(dto.roles);
      // Reemplaza el set de roles por completo.
      await this.prisma.userRole.deleteMany({ where: { userId: id } });
      data.roles = { create: rolesIds.map((roleId) => ({ roleId })) };
    }

    const usuario = await this.prisma.user.update({
      where: { id },
      data,
      select: SELECT_PUBLICO,
    });

    await this.audit.record({
      action: 'UPDATE',
      entity: 'User',
      entityId: id,
      responsibleId,
    });

    return usuario;
  }

  /** US-03: Dar de baja (baja lógica; nunca se elimina físicamente). */
  async deactivate(id: number, responsibleId: number) {
    const usuario = await this.findOne(id);

    if (!usuario.active) {
      throw new BadRequestException('El usuario ya está inactivo');
    }

    const actualizado = await this.prisma.user.update({
      where: { id },
      data: { active: false },
      select: SELECT_PUBLICO,
    });

    await this.audit.record({
      action: 'DEACTIVATE',
      entity: 'User',
      entityId: id,
      responsibleId,
    });

    return actualizado;
  }

  /** US-03 (complemento): Reactivar un usuario previamente dado de baja. */
  async activate(id: number, responsibleId: number) {
    const usuario = await this.findOne(id);

    if (usuario.active) {
      throw new BadRequestException('El usuario ya está activo');
    }

    const actualizado = await this.prisma.user.update({
      where: { id },
      data: { active: true },
      select: SELECT_PUBLICO,
    });

    await this.audit.record({
      action: 'REACTIVATE',
      entity: 'User',
      entityId: id,
      responsibleId,
    });

    return actualizado;
  }

  /** Traduce nombres de rol a sus ids, validando que todos existan. */
  private async resolveRoles(nombres: string[]): Promise<number[]> {
    const roles = await this.prisma.role.findMany({ where: { name: { in: nombres } } });
    if (roles.length !== nombres.length) {
      throw new NotFoundException('Uno o más roles indicados no existen');
    }
    return roles.map((rol) => rol.id);
  }

  private async ensureUnique(datos: { email?: string; dni?: string }, excluirId?: number) {
    if (datos.email) {
      const existente = await this.prisma.user.findFirst({
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
      const existente = await this.prisma.user.findFirst({
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
