import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'http';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

/**
 * e2e de US-38 (registro público) contra AuthController + AuthService reales,
 * con PrismaService/JwtService/AuditoriaService/ConfigService mockeados.
 *   TC-070 -> registro válido: no setea cookie (no auto-login) y responde con
 *             el usuario sin roles
 *   TC-071 -> con la cuenta recién registrada, login exitoso setea la cookie
 *             de sesión (US-39)
 *   TC-073 -> email duplicado -> 409
 *   TC-077 -> payload con "roles" -> 400 (rechazado por el ValidationPipe)
 */
describe('AuthController (e2e) — US-38', () => {
  let app: INestApplication;

  const prismaMock = {
    usuario: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  };
  const auditoriaMock = { registrar: jest.fn() };
  const configMock = { get: jest.fn(() => 'test') }; // NODE_ENV=test -> cookie sameSite=lax, secure=false

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        JwtService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

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
  });

  const datosValidos = {
    nombre: 'Ana',
    apellido: 'Pérez',
    email: 'ana@test.com',
    password: 'Nuevo123!',
  };

  describe('TC-070: registrarse con datos válidos', () => {
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

  describe('TC-071: iniciar sesión con la cuenta recién registrada', () => {
    it('tras registrarse, el login con las mismas credenciales setea la cookie access_token', async () => {
      const httpServer = app.getHttpServer() as Server;
      prismaMock.usuario.findUnique.mockResolvedValueOnce(null); // chequeo de duplicado en register
      let hashGuardado = '';
      prismaMock.usuario.create.mockImplementation(async ({ data }) => {
        hashGuardado = data.passwordHash;
        return { id: 41, email: data.email, nombre: data.nombre, apellido: data.apellido };
      });

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

  describe('TC-073: email ya existente', () => {
    it('POST /auth/register devuelve 409 y no crea la cuenta', async () => {
      const httpServer = app.getHttpServer() as Server;
      prismaMock.usuario.findUnique.mockResolvedValue({ id: 1 });

      await request(httpServer).post('/auth/register').send(datosValidos).expect(409);

      expect(prismaMock.usuario.create).not.toHaveBeenCalled();
    });
  });

  describe('TC-077: impedir auto-asignación de rol', () => {
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
});
