import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { VerificacionEmailPlantilla } from './verificacion-email.plantilla';

const SALT_ROUNDS = 10;
/** Horas que dura el enlace si no se configura `VERIFICACION_EMAIL_HORAS_VALIDEZ`. */
export const HORAS_VALIDEZ = 24;
/** Envíos de enlace permitidos por cuenta en 24 horas (alta + reenvíos). */
export const MAX_ENVIOS_POR_DIA = 5;
/** Ruta de la pantalla del frontend que recibe el token. */
export const RUTA_FRONT = '/verificar-email';

const TIPO = 'VERIFICACION_EMAIL' as const;
const UN_DIA_MS = 24 * 60 * 60 * 1000;

/** Una cuenta recién creada o con enlace nuevo, lista para avisarle. */
export interface EnlaceEmitido {
  usuarioId: number;
  /** Token en claro: solo viaja en el email, en la base queda su hash. */
  token: string;
}

export interface DatosCuentaPendiente {
  personaId: number;
  email: string;
  nombre: string;
  apellido: string;
  /** Ids de rol a asignar (p. ej. SOCIO). Sin roles para un participante. */
  rolesIds?: number[];
  /** Quien hace el alta, para la auditoría. */
  responsableId?: number;
}

/** Hash con el que se guarda y se busca un token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * DT-54 (decisión 0005) — Verificación de email con enlace de un solo uso.
 *
 * Las altas (usuario administrativo, socio, participante y registro público)
 * crean la cuenta pendiente y llaman a `emitir` dentro de su transacción.
 * Cuando la transacción termina, `enviar` manda el enlace por
 * `NotificacionesService`. La persona lo abre, elige su contraseña si todavía
 * no tiene, y su email queda verificado. Hasta entonces no puede iniciar sesión.
 */
@Injectable()
export class VerificacionEmailService {
  private readonly logger = new Logger(VerificacionEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly notificaciones: NotificacionesService,
    private readonly plantilla: VerificacionEmailPlantilla,
    private readonly config: ConfigService,
  ) {}

  get horasValidez(): number {
    return Number(this.config.get('VERIFICACION_EMAIL_HORAS_VALIDEZ') ?? HORAS_VALIDEZ);
  }

  /**
   * Genera un token nuevo para la cuenta y anula los anteriores que no se
   * usaron: siempre sirve solo el último enlace enviado.
   */
  async emitir(
    usuarioId: number,
    tx: Prisma.TransactionClient = this.prisma,
    ahora = new Date(),
  ): Promise<EnlaceEmitido> {
    const token = randomBytes(32).toString('base64url');
    await tx.tokenUsuario.updateMany({
      where: { usuarioId, tipo: TIPO, usadoEn: null, anuladoEn: null },
      data: { anuladoEn: ahora },
    });
    await tx.tokenUsuario.create({
      data: {
        usuarioId,
        tipo: TIPO,
        tokenHash: hashToken(token),
        expiraEn: new Date(ahora.getTime() + this.horasValidez * 60 * 60 * 1000),
      },
    });
    return { usuarioId, token };
  }

  /**
   * Crea, dentro de la transacción de un alta, la cuenta pendiente de una
   * persona que tiene email: sin contraseña y sin verificar.
   */
  async crearCuentaPendiente(
    tx: Prisma.TransactionClient,
    datos: DatosCuentaPendiente,
  ): Promise<EnlaceEmitido> {
    const email = datos.email.trim().toLowerCase();
    const conEseEmail = await tx.usuario.findUnique({ where: { email }, select: { id: true } });
    if (conEseEmail) {
      throw new ConflictException('Ya existe una cuenta de usuario con ese email');
    }
    const usuario = await tx.usuario.create({
      data: {
        email,
        nombre: datos.nombre,
        apellido: datos.apellido,
        personaId: datos.personaId,
        roles: { create: (datos.rolesIds ?? []).map((rolId) => ({ rolId })) },
      },
      select: { id: true },
    });
    await this.auditoria.registrar(
      {
        accion: 'CREAR',
        entidad: 'Usuario',
        idEntidad: usuario.id,
        responsableId: datos.responsableId,
        detalle: 'Cuenta pendiente de verificación de email (DT-54)',
      },
      tx,
    );
    return this.emitir(usuario.id, tx);
  }

  /**
   * Manda el enlace por email. Se llama después de la transacción del alta:
   * si el envío falla, el alta no se deshace (el outbox de notificaciones lo
   * reintenta y el administrador puede reenviarlo).
   */
  async enviar(enlace: EnlaceEmitido | null | undefined, responsableId?: number): Promise<void> {
    if (!enlace) return;
    try {
      const usuario = await this.prisma.usuario.findUnique({
        where: { id: enlace.usuarioId },
        select: { id: true, nombre: true, passwordHash: true },
      });
      if (!usuario) return;
      const appUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:5173';
      await this.notificaciones.notificar({
        plantilla: this.plantilla,
        datos: {
          nombre: usuario.nombre,
          enlace: `${appUrl.replace(/\/$/, '')}${RUTA_FRONT}?token=${enlace.token}`,
          horasValidez: this.horasValidez,
          eligeContrasena: !usuario.passwordHash,
        },
        destinatarios: [usuario.id],
        referencias: [`usuario:${usuario.id}`],
      });
      await this.auditoria.registrar({
        accion: 'ENVIAR_VERIFICACION',
        entidad: 'Usuario',
        idEntidad: usuario.id,
        responsableId: responsableId ?? usuario.id,
      });
    } catch (error) {
      this.logger.error(
        `No se pudo enviar el enlace de verificación al usuario ${enlace.usuarioId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Cuántos enlaces se emitieron a la cuenta en las últimas 24 horas. */
  private async enviosRecientes(usuarioId: number, ahora: Date): Promise<number> {
    return this.prisma.tokenUsuario.count({
      where: { usuarioId, tipo: TIPO, creadoEn: { gte: new Date(ahora.getTime() - UN_DIA_MS) } },
    });
  }

  /**
   * Reenvío pedido por un administrador desde la grilla de usuarios. Es la
   * única forma de pedir un enlace nuevo (decisión del equipo, 11/11/2026).
   */
  async reenviar(usuarioId: number, responsableId: number, ahora = new Date()) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, activo: true, emailVerificadoEn: true },
    });
    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }
    if (usuario.emailVerificadoEn) {
      throw new BadRequestException('El email de este usuario ya está verificado');
    }
    if (!usuario.activo) {
      throw new BadRequestException('El usuario está dado de baja');
    }
    if ((await this.enviosRecientes(usuarioId, ahora)) >= MAX_ENVIOS_POR_DIA) {
      throw new BadRequestException(
        `Ya se enviaron ${MAX_ENVIOS_POR_DIA} enlaces en las últimas 24 horas. Probá más tarde.`,
      );
    }
    await this.enviar(await this.emitir(usuarioId, this.prisma, ahora), responsableId);
    return { mensaje: 'Enviamos un nuevo enlace de verificación' };
  }

  /** Busca el token y explica por qué no sirve, si no sirve. */
  private async tokenVigente(token: string, ahora: Date) {
    const registro = await this.prisma.tokenUsuario.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        usuario: {
          select: { id: true, nombre: true, email: true, activo: true, passwordHash: true },
        },
      },
    });
    if (!registro || registro.tipo !== TIPO) {
      throw new NotFoundException('El enlace no es válido');
    }
    if (registro.usadoEn) {
      throw new BadRequestException(
        'Este enlace ya fue usado. Si ya verificaste tu email, iniciá sesión.',
      );
    }
    if (registro.anuladoEn) {
      throw new BadRequestException(
        'Este enlace fue reemplazado por uno más nuevo. Usá el último que te enviamos.',
      );
    }
    if (registro.expiraEn <= ahora) {
      throw new BadRequestException('El enlace venció. Pedile al club que te envíe uno nuevo.');
    }
    if (!registro.usuario.activo) {
      throw new BadRequestException('La cuenta está dada de baja');
    }
    return registro;
  }

  /** Datos que muestra la pantalla del enlace antes de confirmar. */
  async consultar(token: string, ahora = new Date()) {
    const { usuario, expiraEn } = await this.tokenVigente(token, ahora);
    return {
      nombre: usuario.nombre,
      email: usuario.email,
      requiereContrasena: !usuario.passwordHash,
      expiraEn,
    };
  }

  /**
   * Usa el enlace: verifica el email y, si la cuenta no tiene contraseña,
   * guarda la elegida. El enlace sirve una sola vez aunque llegue dos veces.
   */
  async verificar(token: string, password: string | undefined, ahora = new Date()) {
    const registro = await this.tokenVigente(token, ahora);
    const requiereContrasena = !registro.usuario.passwordHash;
    if (requiereContrasena && !password) {
      throw new BadRequestException('Elegí una contraseña para tu cuenta');
    }
    const passwordHash = requiereContrasena
      ? await bcrypt.hash(password as string, SALT_ROUNDS)
      : undefined;

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.tokenUsuario.updateMany({
        where: { id: registro.id, usadoEn: null, anuladoEn: null, expiraEn: { gt: ahora } },
        data: { usadoEn: ahora },
      });
      if (count === 0) {
        throw new ConflictException(
          'Este enlace ya fue usado. Si ya verificaste tu email, iniciá sesión.',
        );
      }
      await tx.usuario.update({
        where: { id: registro.usuarioId },
        data: { emailVerificadoEn: ahora, ...(passwordHash ? { passwordHash } : {}) },
      });
      await this.auditoria.registrar(
        {
          accion: 'VERIFICAR_EMAIL',
          entidad: 'Usuario',
          idEntidad: registro.usuarioId,
          responsableId: registro.usuarioId,
          detalle: requiereContrasena ? 'Verificó su email y eligió su contraseña' : undefined,
        },
        tx,
      );
    });

    return {
      mensaje: requiereContrasena
        ? 'Tu cuenta quedó activa. Ya podés iniciar sesión con tu contraseña.'
        : 'Tu email quedó verificado. Ya podés iniciar sesión.',
    };
  }
}
