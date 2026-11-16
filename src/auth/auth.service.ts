import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { RegisterDto } from './dto/register.dto';
import { CambiarContrasenaDto } from './dto/cambiar-contrasena.dto';
import { VerificacionEmailService } from '../verificacion-email/verificacion-email.service';

const SALT_ROUNDS = 10;
/** Hash bcrypt válido que no corresponde a ninguna contraseña real (login sin cuenta). */
const HASH_FICTICIO = '$2b$10$k7sPjg0/pGDPSgK0n6GVDuqr8WOQj.Nh0HyI5WoHNStsvdLN0vVvy';
export const MENSAJE_SIN_VERIFICAR =
  'Tenés que verificar tu email antes de iniciar sesión. Revisá tu correo; si el enlace venció, pedile al club que te envíe uno nuevo.';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditoria: AuditoriaService,
    private readonly verificacion: VerificacionEmailService,
  ) {}

  /**
   * US-38: Registro público de usuario. Crea la cuenta sin roles (un ADMIN los
   * asigna luego) y sin iniciar sesión: el usuario ingresa después vía /login.
   * DT-54: la cuenta queda pendiente hasta que verifique su email con el
   * enlace que le enviamos.
   */
  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    const existenteUsuario = await this.prisma.usuario.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existenteUsuario) {
      throw new ConflictException('Ya existe un usuario registrado con ese email');
    }

    const existentePersona = await this.prisma.persona.findUnique({
      where: { email },
      include: { usuario: { select: { id: true } } },
    });
    if (existentePersona?.usuario) {
      throw new ConflictException('Ya existe un usuario registrado con ese email');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const { usuario, enlace } = await this.prisma.$transaction(async (tx) => {
      let personaId = existentePersona?.id;
      if (!personaId) {
        const nuevaPersona = await tx.persona.create({
          data: {
            nombre: dto.nombre,
            apellido: dto.apellido,
            email,
            fechaNacimiento: new Date(`${dto.fechaNacimiento}T00:00:00.000Z`),
            genero: dto.genero,
          },
        });
        personaId = nuevaPersona.id;
      }

      const creado = await tx.usuario.create({
        data: {
          email,
          passwordHash,
          nombre: dto.nombre,
          apellido: dto.apellido,
          personaId,
        },
        select: { id: true, email: true, nombre: true, apellido: true },
      });
      return { usuario: creado, enlace: await this.verificacion.emitir(creado.id, tx) };
    });

    await this.auditoria.registrar({
      accion: 'CREAR',
      entidad: 'Usuario',
      idEntidad: usuario.id,
      responsableId: usuario.id,
      detalle: 'Auto-registro público (US-38)',
    });

    await this.verificacion.enviar(enlace);

    return {
      usuario: { ...usuario, roles: [] as string[] },
      mensaje: 'Te enviamos un email para verificar tu cuenta. Revisá tu bandeja de entrada.',
    };
  }

  /** US-39: Iniciar sesión. Valida credenciales y emite un JWT. */
  async login(email: string, password: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email },
      include: { roles: { include: { rol: true } } },
    });

    // Comparamos siempre contra un hash (aunque el usuario no exista o todavía
    // no tenga contraseña) para no filtrar por tiempo si un email está registrado.
    const passwordValida = await bcrypt.compare(password, usuario?.passwordHash ?? HASH_FICTICIO);

    // DT-54: la cuenta creada por el club todavía no tiene contraseña.
    if (usuario && !usuario.passwordHash) {
      throw new UnauthorizedException(MENSAJE_SIN_VERIFICAR);
    }

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

    // DT-54: sin verificar el email no se puede iniciar sesión.
    if (!usuario.emailVerificadoEn) {
      throw new UnauthorizedException(MENSAJE_SIN_VERIFICAR);
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
        persona: {
          include: {
            membresias: {
              include: { categoria: true },
              orderBy: { fechaAlta: 'desc' },
            },
          },
        },
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

  /**
   * US-41: Cambio de contraseña del usuario autenticado.
   *
   * Criterios de la historia:
   *  - Verifica la contraseña actual contra el hash guardado ANTES de guardar
   *    la nueva; si no coincide, nada se modifica (se responde 401).
   *  - La complejidad de la nueva contraseña la valida el DTO (ValidationPipe),
   *    mismo criterio del alta (US-01) y del registro público (US-38).
   *  - La coincidencia con `confirmarNuevaContrasena` también la valida el DTO.
   *  - Tras guardar la nueva, el controller borra la cookie httpOnly
   *    (`clearCookie`, igual que US-40) para exigir reautenticación: aunque el
   *    JWT previo aún fuese válido, el navegador ya no lo envía. Queda
   *    registrado en auditoría como `EDITAR`.
   */
  async cambiarContrasena(usuarioId: number, dto: CambiarContrasenaDto) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, passwordHash: true },
    });

    if (!usuario) {
      throw new UnauthorizedException('Sesión inválida');
    }

    // DT-54: una cuenta sin contraseña no puede tener sesión; por las dudas.
    if (!usuario.passwordHash) {
      throw new UnauthorizedException('La contraseña actual es incorrecta');
    }

    const passwordActualValida = await bcrypt.compare(dto.passwordActual, usuario.passwordHash);
    if (!passwordActualValida) {
      throw new UnauthorizedException('La contraseña actual es incorrecta');
    }

    // Evita un "cambio" que en realidad deja la misma contraseña guardada.
    const igualALaActual = await bcrypt.compare(dto.nuevaContrasena, usuario.passwordHash);
    if (igualALaActual) {
      throw new BadRequestException('La nueva contraseña no puede ser igual a la actual');
    }

    const passwordHash = await bcrypt.hash(dto.nuevaContrasena, SALT_ROUNDS);

    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { passwordHash },
    });

    await this.auditoria.registrar({
      accion: 'EDITAR',
      entidad: 'Usuario',
      idEntidad: usuarioId,
      responsableId: usuarioId,
      detalle: 'Cambio de contraseña propio (US-41)',
    });

    return { message: 'Contraseña actualizada correctamente' };
  }

  /** Normaliza la Persona vinculada al usuario para la API. */
  private serializarPersona(
    persona: Prisma.PersonaGetPayload<{
      include: { membresias: { include: { categoria: true } } };
    }> | null,
  ) {
    if (!persona) return null;
    return {
      id: persona.id,
      nombre: persona.nombre,
      apellido: persona.apellido,
      dni: persona.dni,
      email: persona.email,
      telefono: persona.telefono,
      fechaNacimiento: persona.fechaNacimiento,
      genero: persona.genero,
      membresias: persona.membresias.map((m) => ({
        id: m.id,
        categoriaId: m.categoriaId,
        categoria: m.categoria,
        fechaAlta: m.fechaAlta,
        fechaBaja: m.fechaBaja,
        activo: m.activo,
      })),
    };
  }
}
