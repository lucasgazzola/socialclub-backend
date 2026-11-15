import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { PrismaService } from '../prisma/prisma.service';
import { VerificacionEmailPlantilla } from './verificacion-email.plantilla';
import {
  HORAS_VALIDEZ,
  MAX_ENVIOS_POR_DIA,
  VerificacionEmailService,
  hashToken,
} from './verificacion-email.service';

/**
 * DT-54 (decisión 0005) — Enlace de verificación de email: se emite al dar de
 * alta una cuenta, vence a las 24 h, sirve una sola vez y, si la cuenta no
 * tiene contraseña, es donde la persona la elige.
 */
describe('VerificacionEmailService (DT-54)', () => {
  let service: VerificacionEmailService;
  let config: Record<string, unknown>;

  const prismaMock: any = {
    tokenUsuario: {
      updateMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    usuario: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const auditoriaMock = { registrar: jest.fn() };
  const notificacionesMock = { notificar: jest.fn() };

  const AHORA = new Date('2026-11-11T12:00:00.000Z');
  const EN_UNA_HORA = new Date('2026-11-11T13:00:00.000Z');

  /** Token vigente de una cuenta creada por el club (sin contraseña). */
  const tokenVigente = (extra: Record<string, unknown> = {}, usuario = {}) => ({
    id: 5,
    usuarioId: 30,
    tipo: 'VERIFICACION_EMAIL',
    tokenHash: hashToken('abc'),
    expiraEn: EN_UNA_HORA,
    usadoEn: null,
    anuladoEn: null,
    usuario: {
      id: 30,
      nombre: 'Ana',
      email: 'ana@club.local',
      activo: true,
      passwordHash: null,
      ...usuario,
    },
    ...extra,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    config = { APP_URL: 'https://socialclub.test/' };
    prismaMock.$transaction.mockImplementation((cb: any) => cb(prismaMock));
    prismaMock.tokenUsuario.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.tokenUsuario.count.mockResolvedValue(0);
    notificacionesMock.notificar.mockResolvedValue({ creadas: 1, enviadas: 1 });

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        VerificacionEmailService,
        VerificacionEmailPlantilla,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
        { provide: NotificacionesService, useValue: notificacionesMock },
        { provide: ConfigService, useValue: { get: (k: string) => config[k] } },
      ],
    }).compile();

    service = moduleRef.get(VerificacionEmailService);
  });

  describe('emitir', () => {
    it('guarda solo el hash del token, con vencimiento a las 24 h, y anula los anteriores', async () => {
      const { usuarioId, token } = await service.emitir(30, prismaMock, AHORA);

      expect(usuarioId).toBe(30);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(prismaMock.tokenUsuario.updateMany).toHaveBeenCalledWith({
        where: { usuarioId: 30, tipo: 'VERIFICACION_EMAIL', usadoEn: null, anuladoEn: null },
        data: { anuladoEn: AHORA },
      });
      const data = prismaMock.tokenUsuario.create.mock.calls[0][0].data;
      expect(data.tokenHash).toBe(hashToken(token));
      expect(data.tokenHash).not.toContain(token);
      expect(data.expiraEn).toEqual(new Date(AHORA.getTime() + HORAS_VALIDEZ * 60 * 60 * 1000));
    });

    it('respeta las horas configuradas en VERIFICACION_EMAIL_HORAS_VALIDEZ', async () => {
      config.VERIFICACION_EMAIL_HORAS_VALIDEZ = '48';

      await service.emitir(30, prismaMock, AHORA);

      const data = prismaMock.tokenUsuario.create.mock.calls[0][0].data;
      expect(data.expiraEn).toEqual(new Date('2026-11-13T12:00:00.000Z'));
    });
  });

  describe('crearCuentaPendiente', () => {
    it('crea la cuenta sin contraseña, con sus roles, la audita y emite el enlace', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);
      prismaMock.usuario.create.mockResolvedValue({ id: 31 });

      const enlace = await service.crearCuentaPendiente(prismaMock, {
        personaId: 9,
        email: ' Socio@Club.local ',
        nombre: 'Beto',
        apellido: 'Ruiz',
        rolesIds: [3],
        responsableId: 1,
      });

      expect(prismaMock.usuario.create).toHaveBeenCalledWith({
        data: {
          email: 'socio@club.local',
          nombre: 'Beto',
          apellido: 'Ruiz',
          personaId: 9,
          roles: { create: [{ rolId: 3 }] },
        },
        select: { id: true },
      });
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'CREAR',
          entidad: 'Usuario',
          idEntidad: 31,
          responsableId: 1,
        }),
        prismaMock,
      );
      expect(enlace.usuarioId).toBe(31);
      expect(prismaMock.tokenUsuario.create).toHaveBeenCalled();
    });

    it('rechaza si ya hay una cuenta con ese email', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({ id: 2 });

      await expect(
        service.crearCuentaPendiente(prismaMock, {
          personaId: 9,
          email: 'socio@club.local',
          nombre: 'Beto',
          apellido: 'Ruiz',
        }),
      ).rejects.toThrow('Ya existe una cuenta de usuario con ese email');
      expect(prismaMock.usuario.create).not.toHaveBeenCalled();
    });
  });

  describe('enviar', () => {
    it('manda el enlace al frontend con el token y audita el envío', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 30,
        nombre: 'Ana',
        passwordHash: null,
      });

      await service.enviar({ usuarioId: 30, token: 'abc' }, 1);

      expect(notificacionesMock.notificar).toHaveBeenCalledWith(
        expect.objectContaining({
          destinatarios: [30],
          datos: {
            nombre: 'Ana',
            enlace: 'https://socialclub.test/verificar-email?token=abc',
            horasValidez: 24,
            eligeContrasena: true,
          },
        }),
      );
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'ENVIAR_VERIFICACION', idEntidad: 30, responsableId: 1 }),
      );
    });

    it('sin enlace no hace nada', async () => {
      await service.enviar(null);
      expect(notificacionesMock.notificar).not.toHaveBeenCalled();
    });

    it('si el envío falla no rompe el alta (se reintenta o se reenvía)', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({ id: 30, nombre: 'Ana', passwordHash: 'h' });
      notificacionesMock.notificar.mockRejectedValue(new Error('SMTP caído'));

      await expect(service.enviar({ usuarioId: 30, token: 'abc' })).resolves.toBeUndefined();
    });
  });

  describe('consultar', () => {
    it('devuelve a quién pertenece el enlace y si tiene que elegir contraseña', async () => {
      prismaMock.tokenUsuario.findUnique.mockResolvedValue(tokenVigente());

      await expect(service.consultar('abc', AHORA)).resolves.toEqual({
        nombre: 'Ana',
        email: 'ana@club.local',
        requiereContrasena: true,
        expiraEn: EN_UNA_HORA,
      });
      expect(prismaMock.tokenUsuario.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: hashToken('abc') } }),
      );
    });

    it('rechaza un enlace inexistente', async () => {
      prismaMock.tokenUsuario.findUnique.mockResolvedValue(null);
      await expect(service.consultar('nada', AHORA)).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each([
      ['vencido (pasaron las 24 h)', { expiraEn: AHORA }, 'El enlace venció'],
      ['ya usado', { usadoEn: AHORA }, 'Este enlace ya fue usado'],
      ['reemplazado por un reenvío', { anuladoEn: AHORA }, 'fue reemplazado por uno más nuevo'],
    ])('rechaza un enlace %s', async (_caso, extra, mensaje) => {
      prismaMock.tokenUsuario.findUnique.mockResolvedValue(tokenVigente(extra));
      await expect(service.consultar('abc', AHORA)).rejects.toThrow(mensaje);
    });

    it('rechaza el enlace de una cuenta dada de baja', async () => {
      prismaMock.tokenUsuario.findUnique.mockResolvedValue(tokenVigente({}, { activo: false }));
      await expect(service.consultar('abc', AHORA)).rejects.toThrow('La cuenta está dada de baja');
    });
  });

  describe('verificar', () => {
    it('guarda la contraseña elegida, verifica el email, consume el enlace y audita', async () => {
      prismaMock.tokenUsuario.findUnique.mockResolvedValue(tokenVigente());

      const respuesta = await service.verificar('abc', 'Nueva123!', AHORA);

      expect(prismaMock.tokenUsuario.updateMany).toHaveBeenCalledWith({
        where: { id: 5, usadoEn: null, anuladoEn: null, expiraEn: { gt: AHORA } },
        data: { usadoEn: AHORA },
      });
      const { data } = prismaMock.usuario.update.mock.calls[0][0];
      expect(data.emailVerificadoEn).toEqual(AHORA);
      expect(bcrypt.compareSync('Nueva123!', data.passwordHash)).toBe(true);
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'VERIFICAR_EMAIL', idEntidad: 30, responsableId: 30 }),
        prismaMock,
      );
      expect(respuesta.mensaje).toMatch(/Ya podés iniciar sesión/);
    });

    it('exige elegir contraseña si la cuenta no tiene', async () => {
      prismaMock.tokenUsuario.findUnique.mockResolvedValue(tokenVigente());

      await expect(service.verificar('abc', undefined, AHORA)).rejects.toThrow(
        'Elegí una contraseña para tu cuenta',
      );
      expect(prismaMock.usuario.update).not.toHaveBeenCalled();
    });

    it('en una cuenta del registro público solo verifica el email (no cambia la contraseña)', async () => {
      prismaMock.tokenUsuario.findUnique.mockResolvedValue(
        tokenVigente({}, { passwordHash: 'hash-elegido-al-registrarse' }),
      );

      await service.verificar('abc', 'Otra123!', AHORA);

      const { data } = prismaMock.usuario.update.mock.calls[0][0];
      expect(data).toEqual({ emailVerificadoEn: AHORA });
    });

    it('si dos pedidos usan el mismo enlace a la vez, el segundo recibe 409', async () => {
      prismaMock.tokenUsuario.findUnique.mockResolvedValue(tokenVigente());
      prismaMock.tokenUsuario.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.verificar('abc', 'Nueva123!', AHORA)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prismaMock.usuario.update).not.toHaveBeenCalled();
    });

    it('rechaza un enlace vencido sin tocar la cuenta', async () => {
      prismaMock.tokenUsuario.findUnique.mockResolvedValue(tokenVigente({ expiraEn: AHORA }));

      await expect(service.verificar('abc', 'Nueva123!', AHORA)).rejects.toThrow('venció');
      expect(prismaMock.usuario.update).not.toHaveBeenCalled();
    });
  });

  describe('reenviar (administrador)', () => {
    beforeEach(() => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 30,
        nombre: 'Ana',
        activo: true,
        emailVerificadoEn: null,
        passwordHash: null,
      });
    });

    it('emite un enlace nuevo y lo envía', async () => {
      await expect(service.reenviar(30, 1, AHORA)).resolves.toEqual({
        mensaje: 'Enviamos un nuevo enlace de verificación',
      });
      expect(prismaMock.tokenUsuario.create).toHaveBeenCalled();
      expect(notificacionesMock.notificar).toHaveBeenCalled();
    });

    it('rechaza si el email ya está verificado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 30,
        activo: true,
        emailVerificadoEn: AHORA,
      });
      await expect(service.reenviar(30, 1, AHORA)).rejects.toThrow('ya está verificado');
    });

    it('rechaza si el usuario no existe o está dado de baja', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce(null);
      await expect(service.reenviar(30, 1, AHORA)).rejects.toBeInstanceOf(NotFoundException);

      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 30,
        activo: false,
        emailVerificadoEn: null,
      });
      await expect(service.reenviar(30, 1, AHORA)).rejects.toThrow('dado de baja');
    });

    it(`limita a ${MAX_ENVIOS_POR_DIA} enlaces cada 24 horas`, async () => {
      prismaMock.tokenUsuario.count.mockResolvedValue(MAX_ENVIOS_POR_DIA);

      await expect(service.reenviar(30, 1, AHORA)).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.tokenUsuario.count).toHaveBeenCalledWith({
        where: {
          usuarioId: 30,
          tipo: 'VERIFICACION_EMAIL',
          creadoEn: { gte: new Date('2026-11-10T12:00:00.000Z') },
        },
      });
      expect(prismaMock.tokenUsuario.create).not.toHaveBeenCalled();
    });
  });
});
