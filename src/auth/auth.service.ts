import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RegisterDto } from './dto/register.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
  ) {}

  /**
   * US-38: Registro público de usuario. Crea la cuenta sin roles (un ADMIN los
   * asigna luego) y sin iniciar sesión: el usuario ingresa después vía /login.
   */
  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    const existente = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existente) {
      throw new ConflictException('Ya existe un usuario registrado con ese email');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name: dto.name,
        lastName: dto.lastName,
      },
      select: { id: true, email: true, name: true, lastName: true },
    });

    await this.audit.record({
      action: 'CREATE',
      entity: 'User',
      entityId: user.id,
      responsibleId: user.id,
      detail: 'Auto-registro público (US-38)',
    });

    return { user: { ...user, roles: [] as string[] } };
  }

  /** US-39: Iniciar sesión. Valida credenciales y emite un JWT. */
  async login(email: string, password: string) {
    const usuario = await this.prisma.user.findUnique({
      where: { email },
      include: { roles: { include: { role: true } } },
    });

    // Comparamos siempre contra un hash (aunque el usuario no exista) para no
    // filtrar por tiempo si un email está registrado o no.
    const passwordValida = usuario ? await bcrypt.compare(password, usuario.passwordHash) : false;

    if (!usuario || !passwordValida) {
      await this.audit.record({
        action: 'LOGIN_FAILED',
        entity: 'User',
        detail: `Intento de login fallido para: ${email}`,
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!usuario.active) {
      throw new UnauthorizedException('El usuario se encuentra dado de baja');
    }

    const roles = usuario.roles.map((ur) => ur.role.name);
    const accessToken = this.jwtService.sign({
      sub: usuario.id,
      email: usuario.email,
      roles,
    });

    await this.prisma.user.update({
      where: { id: usuario.id },
      data: { lastLogin: new Date() },
    });

    await this.audit.record({
      action: 'LOGIN',
      entity: 'User',
      entityId: usuario.id,
      responsibleId: usuario.id,
    });

    return {
      accessToken,
      user: {
        id: usuario.id,
        email: usuario.email,
        name: usuario.name,
        lastName: usuario.lastName,
        roles,
      },
    };
  }

  /** US-40: Cerrar sesión. Deja constancia en la auditoría. */
  async logout(userId: number) {
    await this.audit.record({
      action: 'LOGOUT',
      entity: 'User',
      entityId: userId,
      responsibleId: userId,
    });
  }
}
