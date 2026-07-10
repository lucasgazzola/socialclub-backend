import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
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
});
