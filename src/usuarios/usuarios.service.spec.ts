import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsuariosService } from './usuarios.service';

describe('UsuariosService', () => {
  let service: UsuariosService;

  const prismaMock = {
    usuario: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    usuarioRol: {
      deleteMany: jest.fn(),
    },
    rol: {
      findMany: jest.fn(),
    },
  };
  const auditoriaMock = {
    registrar: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        UsuariosService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
      ],
    }).compile();

    service = moduleRef.get(UsuariosService);
  });

  it('registra un usuario administrativo válido y audita la creación', async () => {
    prismaMock.usuario.findFirst.mockResolvedValue(null);
    prismaMock.rol.findMany.mockResolvedValue([{ id: 2, nombre: 'ADMIN' }]);
    prismaMock.usuario.create.mockImplementation(async ({ data }) => ({
      id: 15,
      dni: data.dni,
      email: data.email,
      nombre: data.nombre,
      apellido: data.apellido,
      activo: true,
      ultimoLogin: null,
      creadoEn: '2026-07-21T12:00:00.000Z',
      roles: [{ rol: { id: 2, nombre: 'ADMIN' } }],
    }));

    const resultado = await service.create(
      {
        dni: '40123456',
        email: 'nuevo.admin@socialclub.local',
        password: 'Admin123!',
        nombre: 'Nuevo',
        apellido: 'Administrador',
        roles: ['ADMIN'],
      },
      99,
    );

    expect(resultado).toEqual(
      expect.objectContaining({
        id: 15,
        dni: '40123456',
        email: 'nuevo.admin@socialclub.local',
        nombre: 'Nuevo',
        apellido: 'Administrador',
      }),
    );
    expect(prismaMock.usuario.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'nuevo.admin@socialclub.local' } }),
    );
    expect(prismaMock.usuario.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { dni: '40123456' } }),
    );
    expect(prismaMock.rol.findMany).toHaveBeenCalledWith({
      where: { nombre: { in: ['ADMIN'] } },
    });
    expect(prismaMock.usuario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dni: '40123456',
          email: 'nuevo.admin@socialclub.local',
          nombre: 'Nuevo',
          apellido: 'Administrador',
          roles: { create: [{ rolId: 2 }] },
        }),
      }),
    );
    expect(auditoriaMock.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'CREAR',
        entidad: 'Usuario',
        idEntidad: 15,
        responsableId: 99,
      }),
    );
  });

  it('rechaza un usuario con email duplicado', async () => {
    prismaMock.usuario.findFirst.mockResolvedValueOnce({ id: 8 });

    await expect(
      service.create(
        {
          dni: '40123456',
          email: 'admin@socialclub.local',
          password: 'Admin123!',
          nombre: 'Nuevo',
          apellido: 'Administrador',
          roles: ['ADMIN'],
        },
        99,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rechaza un usuario con DNI duplicado', async () => {
    prismaMock.usuario.findFirst.mockResolvedValueOnce(null);
    prismaMock.usuario.findFirst.mockResolvedValueOnce({ id: 9 });

    await expect(
      service.create(
        {
          dni: '40123456',
          email: 'nuevo.admin@socialclub.local',
          password: 'Admin123!',
          nombre: 'Nuevo',
          apellido: 'Administrador',
          roles: ['ADMIN'],
        },
        99,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lanza not found si el rol solicitado no existe', async () => {
    prismaMock.usuario.findFirst.mockResolvedValue(null);
    prismaMock.rol.findMany.mockResolvedValue([]);

    await expect(
      service.create(
        {
          dni: '40123456',
          email: 'nuevo.admin@socialclub.local',
          password: 'Admin123!',
          nombre: 'Nuevo',
          apellido: 'Administrador',
          roles: ['ADMIN'],
        },
        99,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('TC-009: Editar los datos de un usuario de gestión existente', () => {
    const usuarioExistente = {
      id: 1,
      dni: '12345678',
      email: 'admin@socialclub.local',
      passwordHash: 'hash-de-12345678',
      nombre: 'Admin',
      apellido: 'Existente',
      activo: true,
      ultimoLogin: null,
      creadoEn: '2026-01-15T10:00:00.000Z',
    };

    const usuarioActualizado = {
      id: 1,
      dni: '12345678',
      email: 'admin.actualizado@socialclub.local',
      nombre: 'Admin',
      apellido: 'Actualizado',
      activo: true,
      ultimoLogin: null,
      creadoEn: '2026-01-15T10:00:00.000Z',
      roles: [{ rol: { id: 2, nombre: 'ADMIN' } }],
    };

    beforeEach(() => {
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioExistente);
      prismaMock.usuario.findFirst.mockResolvedValue(null);
      prismaMock.usuario.update.mockResolvedValue(usuarioActualizado);
    });

    it('actualiza el nombre y el email del usuario y audita la edición', async () => {
      const resultado = await service.update(
        1,
        {
          nombre: 'Admin',
          apellido: 'Actualizado',
          email: 'admin.actualizado@socialclub.local',
        },
        99,
      );

      expect(resultado).toEqual(
        expect.objectContaining({
          id: 1,
          email: 'admin.actualizado@socialclub.local',
          apellido: 'Actualizado',
        }),
      );
      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            nombre: 'Admin',
            apellido: 'Actualizado',
            email: 'admin.actualizado@socialclub.local',
          }),
        }),
      );
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'EDITAR',
          entidad: 'Usuario',
          idEntidad: 1,
          responsableId: 99,
        }),
      );
    });

    it('rechaza la edición con ConflictException si el email ya pertenece a otro usuario', async () => {
      prismaMock.usuario.findFirst.mockResolvedValueOnce({
        id: 2,
        email: 'admin.actualizado@socialclub.local',
      });

      await expect(
        service.update(1, { email: 'admin.actualizado@socialclub.local' }, 99),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prismaMock.usuario.update).not.toHaveBeenCalled();
    });

    it('rechaza la edición con ConflictException si el DNI ya pertenece a otro usuario', async () => {
      prismaMock.usuario.findFirst.mockResolvedValueOnce({
        id: 2,
        dni: '99999999',
      });

      await expect(service.update(1, { dni: '99999999' }, 99)).rejects.toBeInstanceOf(
        ConflictException,
      );

      expect(prismaMock.usuario.update).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si el usuario a editar no existe', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      await expect(service.update(999, { nombre: 'X' }, 99)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('TC-010: Editar el rol de un usuario de gestión existente', () => {
    const usuarioExistente = {
      id: 1,
      dni: '12345678',
      email: 'secretario@socialclub.local',
      passwordHash: 'hash-de-12345678',
      nombre: 'Secretario',
      apellido: 'Usuario',
      activo: true,
      ultimoLogin: null,
      creadoEn: '2026-01-15T10:00:00.000Z',
    };

    const usuarioActualizado = {
      id: 1,
      dni: '12345678',
      email: 'secretario@socialclub.local',
      nombre: 'Secretario',
      apellido: 'Usuario',
      activo: true,
      ultimoLogin: null,
      creadoEn: '2026-01-15T10:00:00.000Z',
      roles: [{ rol: { id: 2, nombre: 'ADMIN' } }],
    };

    beforeEach(() => {
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioExistente);
      prismaMock.usuario.findFirst.mockResolvedValue(null);
      prismaMock.rol.findMany.mockResolvedValue([{ id: 2, nombre: 'ADMIN' }]);
      prismaMock.usuarioRol.deleteMany.mockResolvedValue({ count: 1 });
      prismaMock.usuario.update.mockResolvedValue(usuarioActualizado);
    });

    it('reemplaza los roles del usuario al editar el rol asignado', async () => {
      const resultado = await service.update(1, { roles: ['ADMIN'] }, 99);

      expect(prismaMock.usuarioRol.deleteMany).toHaveBeenCalledWith({
        where: { usuarioId: 1 },
      });
      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            roles: { create: [{ rolId: 2 }] },
          }),
        }),
      );
      expect(resultado.roles).toEqual([{ rol: { id: 2, nombre: 'ADMIN' } }]);
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'EDITAR', idEntidad: 1, responsableId: 99 }),
      );
    });
  });

  describe('TC-011: Deshabilitar un usuario de gestión existente', () => {
    const usuarioActivo = {
      id: 1,
      dni: '12345678',
      email: 'admin@socialclub.local',
      passwordHash: 'hash-de-12345678',
      nombre: 'Admin',
      apellido: 'Gestor',
      activo: true,
      ultimoLogin: null,
      creadoEn: '2026-01-15T10:00:00.000Z',
    };

    const usuarioDesactivado = {
      ...usuarioActivo,
      activo: false,
    };

    beforeEach(() => {
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioActivo);
      prismaMock.usuario.update.mockResolvedValue(usuarioDesactivado);
    });

    it('pone el usuario en inactivo y audita la baja', async () => {
      const resultado = await service.deactivate(1, 99);

      expect(resultado.activo).toBe(false);
      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: { activo: false },
        }),
      );
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'BAJA',
          entidad: 'Usuario',
          idEntidad: 1,
          responsableId: 99,
        }),
      );
    });

    it('lanza NotFoundException si el usuario a deshabilitar no existe', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      await expect(service.deactivate(999, 99)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lanza BadRequestException si el usuario ya está inactivo', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        ...usuarioActivo,
        activo: false,
      });

      await expect(service.deactivate(1, 99)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('TC-012: Cada acción (crear, editar, deshabilitar) registra su confirmación en auditoría', () => {
    it('registra la acción correspondiente para crear, editar y deshabilitar', async () => {
      prismaMock.usuario.findFirst.mockResolvedValue(null);
      prismaMock.rol.findMany.mockResolvedValue([{ id: 2, nombre: 'ADMIN' }]);
      prismaMock.usuario.create.mockImplementation(async ({ data }) => ({
        id: 15,
        dni: data.dni,
        email: data.email,
        nombre: data.nombre,
        apellido: data.apellido,
        activo: true,
        ultimoLogin: null,
        creadoEn: '2026-07-21T12:00:00.000Z',
        roles: [{ rol: { id: 2, nombre: 'ADMIN' } }],
      }));

      await service.create(
        {
          dni: '40123456',
          email: 'nuevo.admin@socialclub.local',
          password: 'Admin123!',
          nombre: 'Nuevo',
          apellido: 'Administrador',
          roles: ['ADMIN'],
        },
        99,
      );
      expect(auditoriaMock.registrar).toHaveBeenLastCalledWith(
        expect.objectContaining({ accion: 'CREAR', responsableId: 99 }),
      );

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 1,
        dni: '12345678',
        email: 'admin@socialclub.local',
        passwordHash: 'hash-de-12345678',
        nombre: 'Admin',
        apellido: 'Gestor',
        activo: true,
        ultimoLogin: null,
        creadoEn: '2026-01-15T10:00:00.000Z',
      });
      prismaMock.usuario.update.mockResolvedValue({
        id: 1,
        dni: '12345678',
        email: 'admin@socialclub.local',
        nombre: 'Admin',
        apellido: 'Gestor',
        activo: true,
        ultimoLogin: null,
        creadoEn: '2026-01-15T10:00:00.000Z',
        roles: [{ rol: { id: 2, nombre: 'ADMIN' } }],
      });

      await service.update(1, { nombre: 'Admin' }, 99);
      expect(auditoriaMock.registrar).toHaveBeenLastCalledWith(
        expect.objectContaining({ accion: 'EDITAR', responsableId: 99 }),
      );

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 1,
        dni: '12345678',
        email: 'admin@socialclub.local',
        passwordHash: 'hash-de-12345678',
        nombre: 'Admin',
        apellido: 'Gestor',
        activo: true,
        ultimoLogin: null,
        creadoEn: '2026-01-15T10:00:00.000Z',
      });
      prismaMock.usuario.update.mockResolvedValue({
        id: 1,
        dni: '12345678',
        email: 'admin@socialclub.local',
        nombre: 'Admin',
        apellido: 'Gestor',
        activo: false,
        ultimoLogin: null,
        creadoEn: '2026-01-15T10:00:00.000Z',
        roles: [{ rol: { id: 2, nombre: 'ADMIN' } }],
      });

      await service.deactivate(1, 99);
      expect(auditoriaMock.registrar).toHaveBeenLastCalledWith(
        expect.objectContaining({ accion: 'BAJA', responsableId: 99 }),
      );
    });
  });
});
