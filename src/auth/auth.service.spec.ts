import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';

/**
 * Tests unitarios del AuthService con dependencias mockeadas (mismo patrón que
 * MembersService). Cubren US-38 (registro público) y US-39/US-40 (login/logout).
 *
 * Mapeo con la matriz de casos:
 *   TC-071 -> describe('login luego de register (US-38 + US-39)')
 *   TC-072 -> 'el usuario auto-registrado no recibe roles'
 *   TC-073 -> 'rechaza el registro si el email ya está en uso'
 *   TC-077 -> describe('TC-077: no auto-asignación de rol')
 *
 * TC-070, TC-074, TC-075, TC-076 son de UI/validación de formulario y no
 * corresponden a este archivo (ver RegisterForm.test.tsx del lado del front,
 * pendiente hasta contar con components/RegisterForm.tsx).
 */
describe('AuthService', () => {
  let service: AuthService;

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  };
  const jwtMock = { sign: jest.fn() };
  const auditMock = { record: jest.fn() };

  const PASSWORD_PLANO = 'Admin123!';
  let passwordHash: string;

  /** Usuario válido de referencia devuelto por Prisma (con roles incluidos). */
  const validUser = () => ({
    id: 7,
    email: 'admin@socialclub.local',
    passwordHash,
    name: 'Administrador',
    lastName: 'Inicial',
    active: true,
    roles: [{ role: { name: 'ADMIN' } }],
  });

  beforeAll(() => {
    passwordHash = bcrypt.hashSync(PASSWORD_PLANO, 10);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    jwtMock.sign.mockReturnValue('signed-jwt');
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  // ── US-39: Iniciar sesión ──────────────────────────────────────────────────
  describe('login (US-39)', () => {
    it('autentica con credenciales válidas y emite un JWT', async () => {
      prismaMock.user.findUnique.mockResolvedValue(validUser());
      prismaMock.user.update.mockResolvedValue({});

      const resultado = await service.login('admin@socialclub.local', PASSWORD_PLANO);

      expect(resultado.accessToken).toBe('signed-jwt');
      expect(resultado.user).toEqual({
        id: 7,
        email: 'admin@socialclub.local',
        name: 'Administrador',
        lastName: 'Inicial',
        roles: ['ADMIN'],
      });
      // El JWT se firma con el id, el email y los roles del usuario.
      expect(jwtMock.sign).toHaveBeenCalledWith({
        sub: 7,
        email: 'admin@socialclub.local',
        roles: ['ADMIN'],
      });
      // Registra la marca de último login y audita el acceso exitoso.
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 7 } }),
      );
      expect(auditMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOGIN', entity: 'User', responsibleId: 7 }),
      );
    });

    it('rechaza un email inexistente sin filtrar si estaba registrado', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login('noexiste@socialclub.local', PASSWORD_PLANO),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      // No se emite token y se deja constancia del intento fallido.
      expect(jwtMock.sign).not.toHaveBeenCalled();
      expect(auditMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOGIN_FAILED', entity: 'User' }),
      );
    });

    it('rechaza una contraseña incorrecta y audita el intento fallido', async () => {
      prismaMock.user.findUnique.mockResolvedValue(validUser());

      await expect(
        service.login('admin@socialclub.local', 'ContraseñaMala1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(jwtMock.sign).not.toHaveBeenCalled();
      expect(auditMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOGIN_FAILED' }),
      );
    });

    it('rechaza a un usuario dado de baja aunque la contraseña sea válida', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ ...validUser(), active: false });

      await expect(service.login('admin@socialclub.local', PASSWORD_PLANO)).rejects.toThrow(
        /baja/i,
      );
      // No se emite token para una cuenta inactiva.
      expect(jwtMock.sign).not.toHaveBeenCalled();
    });
  });

  // ── US-40: Cerrar sesión ───────────────────────────────────────────────────
  describe('logout (US-40)', () => {
    it('deja constancia del cierre de sesión en la auditoría', async () => {
      await service.logout(7);

      expect(auditMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LOGOUT',
          entity: 'User',
          entityId: 7,
          responsibleId: 7,
        }),
      );
    });
  });

  // ── US-38: Registro público ────────────────────────────────────────────────
  describe('register (US-38)', () => {
    const dto = {
      email: 'Nuevo@SocialClub.local',
      password: 'Nuevo123!',
      name: 'Ana',
      lastName: 'Pérez',
    };

    it('crea la cuenta sin roles, normaliza el email y audita CREATE', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        id: 12,
        email: 'nuevo@socialclub.local',
        name: 'Ana',
        lastName: 'Pérez',
      });

      const { user } = await service.register(dto);

      // El alta pública nace sin roles (los asigna un ADMIN después).
      expect(user).toEqual({
        id: 12,
        email: 'nuevo@socialclub.local',
        name: 'Ana',
        lastName: 'Pérez',
        roles: [],
      });
      // Email normalizado a minúsculas y contraseña guardada como hash (no plana).
      const dataCreada = prismaMock.user.create.mock.calls[0][0].data;
      expect(dataCreada.email).toBe('nuevo@socialclub.local');
      expect(dataCreada.passwordHash).not.toBe(dto.password);
      expect(bcrypt.compareSync(dto.password, dataCreada.passwordHash as string)).toBe(true);
      expect(dataCreada.roles).toBeUndefined();
      expect(auditMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', entity: 'User', entityId: 12 }),
      );
    });

    it('TC-073: rechaza el registro si el email ya está en uso (409)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 1 });

      await expect(service.register(dto)).rejects.toBeInstanceOf(ConflictException);
      // No crea el usuario duplicado.
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });

    it('TC-072: el usuario auto-registrado no recibe ningún rol', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        id: 13,
        email: 'nuevo@socialclub.local',
        name: 'Ana',
        lastName: 'Pérez',
      });

      const { user } = await service.register(dto);

      expect(user.roles).toEqual([]);
      // El create hacia Prisma tampoco intenta vincular ningún UsuarioRol.
      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ roles: expect.anything() }),
        }),
      );
    });
  });

  // ── TC-071: login luego de register (integración US-38 + US-39) ───────────
  describe('TC-071: iniciar sesión con la cuenta recién registrada', () => {
    it('el usuario puede loguearse inmediatamente después de registrarse, con sus propias credenciales', async () => {
      const dto = {
        email: 'ana@test.com',
        password: 'Nuevo123!',
        name: 'Ana',
        lastName: 'Pérez',
      };

      // 1) Registro: no existe el email todavía.
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      let hashGuardado = '';
      prismaMock.user.create.mockImplementation(async ({ data }) => {
        hashGuardado = data.passwordHash;
        return { id: 21, email: data.email, name: data.name, lastName: data.lastName };
      });

      const { user: usuarioRegistrado } = await service.register(dto);
      expect(usuarioRegistrado.roles).toEqual([]);

      // 2) Login: ahora sí "existe" en la base, con el hash recién generado y
      // sin roles (coherente con TC-072).
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 21,
        email: 'ana@test.com',
        passwordHash: hashGuardado,
        name: 'Ana',
        lastName: 'Pérez',
        active: true,
        roles: [],
      });
      prismaMock.user.update.mockResolvedValue({});

      const resultadoLogin = await service.login(dto.email, dto.password);

      expect(resultadoLogin.accessToken).toBe('signed-jwt');
      expect(resultadoLogin.user).toEqual(
        expect.objectContaining({ id: 21, email: 'ana@test.com', roles: [] }),
      );
    });
  });

  // TC-077: impedir auto-asignación de rol
  describe('TC-077: impedir auto-asignación de rol (escalada de privilegios)', () => {
    it('ignora por completo cualquier campo "roles" recibido en el DTO de registro', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        id: 30,
        email: 'atacante@test.com',
        name: 'Mal',
        lastName: 'Actor',
      });

      const dtoConRolesInyectado = {
        email: 'atacante@test.com',
        password: 'Nuevo123!',
        name: 'Mal',
        lastName: 'Actor',
        roles: ['ADMIN'],
      };

      const { user } = await service.register(dtoConRolesInyectado);

      // El servicio arma `data` explícitamente (email, passwordHash, nombre,
      // apellido): aunque llegue `roles` en el payload, nunca se propaga a
      // Prisma ni a la respuesta.
      expect(user.roles).toEqual([]);
      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: {
          email: 'atacante@test.com',
          passwordHash: expect.any(String),
          name: 'Mal',
          lastName: 'Actor',
        },
        select: { id: true, email: true, name: true, lastName: true },
      });
    });
  });
});
