import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsuariosService } from './usuarios.service';

describe('UsuariosService', () => {
  let service: UsuariosService;

  const prismaMock = {
    usuario: {
      findFirst: jest.fn(),
      create: jest.fn(),
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
});
