import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { RegisterDto } from './dto/register.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * US-38: Registro público de usuario. Crea la cuenta sin roles (un ADMIN los
   * asigna luego) y sin iniciar sesión: el usuario ingresa después vía /login.
   */
  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    const existente = await this.prisma.usuario.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existente) {
      throw new ConflictException('Ya existe un usuario registrado con ese email');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const usuario = await this.prisma.usuario.create({
      data: {
        email,
        passwordHash,
        nombre: dto.nombre,
        apellido: dto.apellido,
      },
      select: { id: true, email: true, nombre: true, apellido: true },
    });

    await this.auditoria.registrar({
      accion: 'CREAR',
      entidad: 'Usuario',
      idEntidad: usuario.id,
      responsableId: usuario.id,
      detalle: 'Auto-registro público (US-38)',
    });

    return { usuario: { ...usuario, roles: [] as string[] } };
  }

  /** US-39: Iniciar sesión. Valida credenciales y emite un JWT. */
  async login(email: string, password: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email },
      include: { roles: { include: { rol: true } } },
    });

    // Comparamos siempre contra un hash (aunque el usuario no exista) para no
    // filtrar por tiempo si un email está registrado o no.
    const passwordValida = usuario ? await bcrypt.compare(password, usuario.passwordHash) : false;

    if (!usuario || !passwordValida) {
      await this.auditoria.registrar({
        accion: 'LOGIN_FALLIDO',
        entidad: 'Usuario',
        detalle: `Intento de login fallido para: ${email}`,
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!usuario.activo) {
      throw new UnauthorizedException('El usuario se encuentra dado de baja');
    }

    const roles = usuario.roles.map((ur) => ur.rol.nombre);
    const accessToken = this.jwtService.sign({
      sub: usuario.id,
      email: usuario.email,
      roles,
    });

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { ultimoLogin: new Date() },
    });

    await this.auditoria.registrar({
      accion: 'LOGIN',
      entidad: 'Usuario',
      idEntidad: usuario.id,
      responsableId: usuario.id,
    });

    return {
      accessToken,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        roles,
      },
    };
  }

  /** US-40: Cerrar sesión. Deja constancia en la auditoría. */
  async logout(usuarioId: number) {
    await this.auditoria.registrar({
      accion: 'LOGOUT',
      entidad: 'Usuario',
      idEntidad: usuarioId,
      responsableId: usuarioId,
    });
  }

  /**
   * Obtiene el perfil actualizado del usuario autenticado (GET /auth/me).
   * Esta consulta accede directamente a la base de datos para recuperar los roles
   * y la información de la Persona vigentes.
   */
  async obtenerPerfil(usuarioId: number) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: {
        roles: { include: { rol: true } },
        persona: { include: { categoria: true } },
      },
    });

    if (!usuario) {
      throw new UnauthorizedException('Sesión inválida');
    }

    return {
      id: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      roles: usuario.roles.map((ur) => ur.rol.nombre),
      persona: this.serializarPersona(usuario.persona ?? null),
    };
  }

  /**
   * Re-firma el JWT del usuario con sus roles actuales - por si se hace socio-.
   */
  async refrescarSesion(usuarioId: number) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: { roles: { include: { rol: true } } },
    });

    if (!usuario) {
      throw new UnauthorizedException('Sesión inválida');
    }

    const roles = usuario.roles.map((ur) => ur.rol.nombre);
    const accessToken = this.jwtService.sign({
      sub: usuario.id,
      email: usuario.email,
      roles,
    });

    return {
      accessToken,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        roles,
      },
    };
  }

  /** Normaliza la Persona vinculada al usuario para la API (persona: null si no es socio). */
  private serializarPersona(
    persona: Prisma.PersonaGetPayload<{ include: { categoria: true } }> | null,
  ) {
    if (!persona) return null;
    return {
      id: persona.id,
      dni: persona.dni,
      email: persona.email,
      telefono: persona.telefono,
      fechaNacimiento: persona.fechaNacimiento,
      categoriaId: persona.categoriaId,
      categoria: persona.categoria,
      fechaAlta: persona.fechaAlta,
      activo: persona.activo,
    };
  }
}
