import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AuthService } from './auth.service';

/**
 * Tests unitarios del AuthService con dependencias mockeadas (mismo patrón que
 * SociosService). Cubren US-39 (iniciar sesión) y US-40 (cerrar sesión).
 *
 * `bcrypt` se usa real contra un hash precomputado: así validamos de verdad la
 * comparación de contraseñas sin acoplarnos a mocks del módulo.
 */
describe('AuthService', () => {
  let service: AuthService;

  const prismaMock = {
    usuario: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  };
  const jwtMock = { sign: jest.fn() };
  const auditoriaMock = { registrar: jest.fn() };

  const PASSWORD_PLANO = 'Admin123!';
  let passwordHash: string;

  /** Usuario válido de referencia devuelto por Prisma (con roles incluidos). */
  const usuarioValido = () => ({
    id: 7,
    email: 'admin@socialclub.local',
    passwordHash,
    nombre: 'Administrador',
    apellido: 'Inicial',
    activo: true,
    roles: [{ rol: { nombre: 'ADMIN' } }],
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
        { provide: AuditoriaService, useValue: auditoriaMock },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  // ── US-39: Iniciar sesión ──────────────────────────────────────────────────
  describe('login (US-39)', () => {
    it('autentica con credenciales válidas y emite un JWT', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioValido());
      prismaMock.usuario.update.mockResolvedValue({});

      const resultado = await service.login('admin@socialclub.local', PASSWORD_PLANO);

      expect(resultado.accessToken).toBe('signed-jwt');
      expect(resultado.usuario).toEqual({
        id: 7,
        email: 'admin@socialclub.local',
        nombre: 'Administrador',
        apellido: 'Inicial',
        roles: ['ADMIN'],
      });
      // El JWT se firma con el id, el email y los roles del usuario.
      expect(jwtMock.sign).toHaveBeenCalledWith({
        sub: 7,
        email: 'admin@socialclub.local',
        roles: ['ADMIN'],
      });
      // Registra la marca de último login y audita el acceso exitoso.
      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 7 } }),
      );
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'LOGIN', entidad: 'Usuario', responsableId: 7 }),
      );
    });

    it('rechaza un email inexistente sin filtrar si estaba registrado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      await expect(service.login('noexiste@socialclub.local', PASSWORD_PLANO)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      // No se emite token y se deja constancia del intento fallido.
      expect(jwtMock.sign).not.toHaveBeenCalled();
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'LOGIN_FALLIDO', entidad: 'Usuario' }),
      );
    });

    it('rechaza una contraseña incorrecta y audita el intento fallido', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioValido());

      await expect(
        service.login('admin@socialclub.local', 'ContraseñaMala1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(jwtMock.sign).not.toHaveBeenCalled();
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'LOGIN_FALLIDO' }),
      );
    });

    it('rechaza a un usuario dado de baja aunque la contraseña sea válida', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({ ...usuarioValido(), activo: false });

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

      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'LOGOUT',
          entidad: 'Usuario',
          idEntidad: 7,
          responsableId: 7,
        }),
      );
    });
  });

  // ── US-38: Registro público ────────────────────────────────────────────────
  describe('register (US-38)', () => {
    const dto = {
      email: 'Nuevo@SocialClub.local',
      password: 'Nuevo123!',
      nombre: 'Ana',
      apellido: 'Pérez',
    };

    it('crea la cuenta sin roles, normaliza el email y audita CREAR', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);
      prismaMock.usuario.create.mockResolvedValue({
        id: 12,
        email: 'nuevo@socialclub.local',
        nombre: 'Ana',
        apellido: 'Pérez',
      });

      const { usuario } = await service.register(dto);

      // El alta pública nace sin roles (los asigna un ADMIN después).
      expect(usuario).toEqual({
        id: 12,
        email: 'nuevo@socialclub.local',
        nombre: 'Ana',
        apellido: 'Pérez',
        roles: [],
      });
      // Email normalizado a minúsculas y contraseña guardada como hash (no plana).
      const dataCreada = prismaMock.usuario.create.mock.calls[0][0].data;
      expect(dataCreada.email).toBe('nuevo@socialclub.local');
      expect(dataCreada.passwordHash).not.toBe(dto.password);
      expect(bcrypt.compareSync(dto.password, dataCreada.passwordHash)).toBe(true);
      expect(dataCreada.roles).toBeUndefined();
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'CREAR', entidad: 'Usuario', idEntidad: 12 }),
      );
    });

    it('rechaza el registro si el email ya está en uso', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({ id: 1 });

      await expect(service.register(dto)).rejects.toBeInstanceOf(ConflictException);
      // No crea el usuario duplicado.
      expect(prismaMock.usuario.create).not.toHaveBeenCalled();
    });
  });
});
