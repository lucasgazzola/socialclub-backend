import { INestApplication, ExecutionContext, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { Server } from 'http';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

/**
 * e2e de US-38 (registro público) contra AuthController + AuthService reales,
 * con PrismaService/JwtService/AuditoriaService/ConfigService mockeados.
 *   TC-077 -> registro válido: no setea cookie (no auto-login) y responde con
 *             el usuario sin roles
 *   TC-078 -> con la cuenta recién registrada, login exitoso setea la cookie
 *             de sesión (US-39)
 *   TC-080 -> email duplicado -> 409
 *   TC-084 -> payload con "roles" -> 400 (rechazado por el ValidationPipe)
 *
 * e2e de US-41 (cambio de contraseña propio), mismo módulo con JwtAuthGuard
 * sobreescrito para simular una sesión activa:
 *   TC-118 -> PATCH /auth/cambiar-contrasena válido -> 200 + hash nuevo + auditoría
 *   TC-119 -> contraseña actual incorrecta -> 401 y nothing persisted
 *   TC-120 -> nueva contraseña sin mayúscula/número/especial -> 400
 *   TC-121 -> confirmación distinta de la nueva -> 400
 */
describe('AuthController (e2e) — US-38', () => {
  let app: INestApplication;

  interface PrismaMock {
    usuario: { findUnique: jest.Mock; update: jest.Mock; create: jest.Mock };
    persona: { findUnique: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  }

  const prismaMock: PrismaMock = {
    usuario: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    // register() (US-38) también consulta/crea Persona. Sin esta clave el mock
    // quedaba incompleto y TC-077/TC-078 reventaban con un TypeError.
    persona: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    // register() (US-38) crea Usuario+Persona dentro de una transacción.
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: PrismaMock) => unknown)(prismaMock) : arg,
    ),
  };
  const auditoriaMock = { registrar: jest.fn() };
  const configMock = { get: jest.fn(() => 'test') }; // NODE_ENV=test -> cookie sameSite=lax, secure=false

  /** Sesión simulada de un usuario auto-registrado sin roles (SOCIO). */
  const usuarioEnSesion = { id: 88, email: 'socio@test.com', roles: [] as string[] };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        // Con secret explícito: el JwtService "desnudo" no firma y login devuelve 500.
        { provide: JwtService, useValue: new JwtService({ secret: 'test-secret' }) },
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
        { provide: ConfigService, useValue: configMock },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = usuarioEnSesion;
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Persona inexistente: register() crea una nueva (branch normal del alta).
    prismaMock.persona.findUnique.mockResolvedValue(null);
    prismaMock.persona.create.mockResolvedValue({ id: 101 });
    prismaMock.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prismaMock) : arg,
    );
  });

  const datosValidos = {
    nombre: 'Ana',
    apellido: 'Pérez',
    email: 'ana@test.com',
    password: 'Nuevo123!',
  };

  describe('TC-077: registrarse con datos válidos', () => {
    it('POST /auth/register crea la cuenta, no setea cookie de sesión y no devuelve roles', async () => {
      const httpServer = app.getHttpServer() as Server;
      prismaMock.usuario.findUnique.mockResolvedValue(null);
      prismaMock.usuario.create.mockResolvedValue({
        id: 40,
        email: datosValidos.email,
        nombre: datosValidos.nombre,
        apellido: datosValidos.apellido,
      });

      const response = await request(httpServer)
        .post('/auth/register')
        .send(datosValidos)
        .expect(201);

      expect(response.body).toEqual({
        usuario: {
          id: 40,
          email: datosValidos.email,
          nombre: datosValidos.nombre,
          apellido: datosValidos.apellido,
          roles: [],
        },
      });
      // No auto-login: el registro no debe dejar cookie de sesión.
      expect(response.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('TC-078: iniciar sesión con la cuenta recién registrada', () => {
    it('tras registrarse, el login con las mismas credenciales setea la cookie access_token', async () => {
      const httpServer = app.getHttpServer() as Server;
      prismaMock.usuario.findUnique.mockResolvedValueOnce(null); // chequeo de duplicado en register
      let hashGuardado = '';
      prismaMock.usuario.create.mockImplementation(
        async ({ data }: { data: Record<string, string> }) => {
          hashGuardado = data.passwordHash;
          return { id: 41, email: data.email, nombre: data.nombre, apellido: data.apellido };
        },
      );

      await request(httpServer).post('/auth/register').send(datosValidos).expect(201);

      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 41,
        email: datosValidos.email,
        passwordHash: hashGuardado,
        nombre: datosValidos.nombre,
        apellido: datosValidos.apellido,
        activo: true,
        roles: [],
      });
      prismaMock.usuario.update.mockResolvedValue({});

      const loginResponse = await request(httpServer)
        .post('/auth/login')
        .send({ email: datosValidos.email, password: datosValidos.password })
        .expect(200);

      expect(loginResponse.body.usuario).toEqual(
        expect.objectContaining({ id: 41, email: datosValidos.email, roles: [] }),
      );
      const cookies = loginResponse.headers['set-cookie'] as unknown as string[] | undefined;
      expect(cookies).toBeDefined();
      expect(cookies?.some((c: string) => c.startsWith('access_token='))).toBe(true);
    });
  });

  describe('TC-080: email ya existente', () => {
    it('POST /auth/register devuelve 409 y no crea la cuenta', async () => {
      const httpServer = app.getHttpServer() as Server;
      prismaMock.usuario.findUnique.mockResolvedValue({ id: 1 });

      await request(httpServer).post('/auth/register').send(datosValidos).expect(409);

      expect(prismaMock.usuario.create).not.toHaveBeenCalled();
    });
  });

  describe('TC-084: impedir auto-asignación de rol', () => {
    it('POST /auth/register con "roles" en el body es rechazado con 400 y no crea el usuario', async () => {
      const httpServer = app.getHttpServer() as Server;
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      await request(httpServer)
        .post('/auth/register')
        .send({ ...datosValidos, roles: ['ADMIN'] })
        .expect(400);

      expect(prismaMock.usuario.create).not.toHaveBeenCalled();
    });
  });

  // ── US-41: PATCH /auth/cambiar-contrasena ───────────────────────────────────
  describe('US-41: cambiar la contraseña del usuario autenticado', () => {
    const PASSWORD_ACTUAL = 'Socio123!';
    const PASSWORD_NUEVA = 'Nueva123!';
    const hashActual = bcrypt.hashSync(PASSWORD_ACTUAL, 10);

    const payload = (overrides: Record<string, unknown> = {}) => ({
      passwordActual: PASSWORD_ACTUAL,
      nuevaContrasena: PASSWORD_NUEVA,
      confirmarNuevaContrasena: PASSWORD_NUEVA,
      ...overrides,
    });

    beforeEach(() => {
      prismaMock.usuario.findUnique.mockResolvedValue({ id: 88, passwordHash: hashActual });
      prismaMock.usuario.update.mockResolvedValue({});
    });

    it('TC-118: con datos válidos responde 200, guarda el hash de la nueva, audita el cambio e invalida la sesión borrando la cookie', async () => {
      const httpServer = app.getHttpServer() as Server;

      const response = await request(httpServer)
        .patch('/auth/cambiar-contrasena')
        .send(payload())
        .expect(200);

      expect(response.body).toEqual({ message: 'Contraseña actualizada correctamente' });
      const { where, data } = prismaMock.usuario.update.mock.calls[0][0] as {
        where: { id: number };
        data: { passwordHash: string };
      };
      expect(where).toEqual({ id: 88 }); // solo cambia SU propia contraseña
      expect(bcrypt.compareSync(PASSWORD_NUEVA, data.passwordHash)).toBe(true);
      expect(bcrypt.compareSync(PASSWORD_ACTUAL, data.passwordHash)).toBe(false);
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'EDITAR', entidad: 'Usuario', responsableId: 88 }),
      );

      // Invalida la sesión actual eliminando la cookie de acceso
      const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
      expect(cookies).toBeDefined();
      expect(
        cookies?.some(
          (c: string) =>
            c.startsWith('access_token=;') ||
            c.includes('access_token=;') ||
            c.includes('Expires=Thu, 01 Jan 1970') ||
            c.includes('Max-Age=0'),
        ),
      ).toBe(true);
    });

    it('TC-119: si la contraseña actual es incorrecta responde 401 y no modifica nada', async () => {
      const httpServer = app.getHttpServer() as Server;

      const response = await request(httpServer)
        .patch('/auth/cambiar-contrasena')
        .send(payload({ passwordActual: 'Otra1234!' }))
        .expect(401);

      expect(response.body.message).toBe('La contraseña actual es incorrecta');
      expect(prismaMock.usuario.update).not.toHaveBeenCalled();
      expect(auditoriaMock.registrar).not.toHaveBeenCalled();
    });

    it('TC-120: rechaza con 400 una nueva contraseña que no cumple la política de complejidad', async () => {
      const httpServer = app.getHttpServer() as Server;
      const debiles = [
        'corton1!', // menos de 8 caracteres
        'sinmayusculas1!', // sin mayúscula
        'SINMINUSCULAS1!', // sin minúscula
        'SinNumerosAA!', // sin número
        'SinEspecial1A', // sin carácter especial
      ];

      for (const nueva of debiles) {
        const response = await request(httpServer)
          .patch('/auth/cambiar-contrasena')
          .send(payload({ nuevaContrasena: nueva, confirmarNuevaContrasena: nueva }))
          .expect(400);

        const mensaje = ([] as string[]).concat(response.body.message as string | string[]);
        expect(mensaje.join(' ')).toContain('mayúscula');
      }
      expect(prismaMock.usuario.update).not.toHaveBeenCalled();
    });

    it('TC-121: rechaza con 400 si la confirmación no coincide con la nueva contraseña', async () => {
      const httpServer = app.getHttpServer() as Server;

      const response = await request(httpServer)
        .patch('/auth/cambiar-contrasena')
        .send(payload({ confirmarNuevaContrasena: 'Distinta123!' }))
        .expect(400);

      const mensaje = ([] as string[]).concat(response.body.message as string | string[]);
      expect(mensaje.join(' ')).toContain('La confirmación no coincide con la nueva contraseña.');
      expect(prismaMock.usuario.update).not.toHaveBeenCalled();
    });

    it('TC-124: rechaza con 400 una nueva contraseña igual a la actual', async () => {
      const httpServer = app.getHttpServer() as Server;

      const response = await request(httpServer)
        .patch('/auth/cambiar-contrasena')
        .send(
          payload({ nuevaContrasena: PASSWORD_ACTUAL, confirmarNuevaContrasena: PASSWORD_ACTUAL }),
        )
        .expect(400);

      expect(response.body.message).toBe('La nueva contraseña no puede ser igual a la actual');
      expect(prismaMock.usuario.update).not.toHaveBeenCalled();
    });
  });
});
