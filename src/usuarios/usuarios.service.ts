import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';

const SALT_ROUNDS = 10;

/** Campos que se exponen del usuario (nunca el passwordHash). */
const SELECT_PUBLICO = {
  id: true,
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
    const existente = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    if (existente) {
      throw new ConflictException('Ya existe un usuario con ese email');
    }

    const rolesIds = await this.resolverRoles(dto.roles);
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const usuario = await this.prisma.usuario.create({
      data: {
        email: dto.email,
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
  async update(id: number, dto: UpdateUsuarioDto, responsableId: number) {
    await this.findOne(id);

    const data: Prisma.UsuarioUpdateInput = {};
    if (dto.nombre) data.nombre = dto.nombre;
    if (dto.apellido) data.apellido = dto.apellido;
    if (dto.email) data.email = dto.email;
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

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
    await this.findOne(id);

    const usuario = await this.prisma.usuario.update({
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

    return usuario;
  }

  /** Traduce nombres de rol a sus ids, validando que todos existan. */
  private async resolverRoles(nombres: string[]): Promise<number[]> {
    const roles = await this.prisma.rol.findMany({ where: { nombre: { in: nombres } } });
    if (roles.length !== nombres.length) {
      throw new NotFoundException('Uno o más roles indicados no existen');
    }
    return roles.map((rol) => rol.id);
  }
}
