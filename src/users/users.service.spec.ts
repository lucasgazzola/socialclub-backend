import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;

  const prismaMock = {
    user: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    role: {
      findMany: jest.fn(),
    },
  };
  const auditMock = {
    record: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  it('registra un usuario administrativo válido y audita la creación', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.role.findMany.mockResolvedValue([{ id: 2, name: 'ADMIN' }]);
    prismaMock.user.create.mockImplementation(async ({ data }) => ({
      id: 15,
      dni: data.dni,
      email: data.email,
      name: data.name,
      lastName: data.lastName,
      active: true,
      lastLogin: null,
      createdAt: '2026-07-21T12:00:00.000Z',
      roles: [{ role: { id: 2, name: 'ADMIN' } }],
    }));

    const resultado = await service.create(
      {
        dni: '40123456',
        email: 'nuevo.admin@socialclub.local',
        password: 'Admin123!',
        name: 'Nuevo',
        lastName: 'Administrador',
        roles: ['ADMIN'],
      },
      99,
    );

    expect(resultado).toEqual(
      expect.objectContaining({
        id: 15,
        dni: '40123456',
        email: 'nuevo.admin@socialclub.local',
        name: 'Nuevo',
        lastName: 'Administrador',
      }),
    );
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'nuevo.admin@socialclub.local' } }),
    );
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { dni: '40123456' } }),
    );
    expect(prismaMock.role.findMany).toHaveBeenCalledWith({
      where: { name: { in: ['ADMIN'] } },
    });
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dni: '40123456',
          email: 'nuevo.admin@socialclub.local',
          name: 'Nuevo',
          lastName: 'Administrador',
          roles: { create: [{ roleId: 2 }] },
        }),
      }),
    );
    expect(auditMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        entity: 'User',
        entityId: 15,
        responsibleId: 99,
      }),
    );
  });

  it('rechaza un usuario con email duplicado', async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce({ id: 8 });

    await expect(
      service.create(
        {
          dni: '40123456',
          email: 'admin@socialclub.local',
          password: 'Admin123!',
          name: 'Nuevo',
          lastName: 'Administrador',
          roles: ['ADMIN'],
        },
        99,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rechaza un usuario con DNI duplicado', async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce(null);
    prismaMock.user.findFirst.mockResolvedValueOnce({ id: 9 });

    await expect(
      service.create(
        {
          dni: '40123456',
          email: 'nuevo.admin@socialclub.local',
          password: 'Admin123!',
          name: 'Nuevo',
          lastName: 'Administrador',
          roles: ['ADMIN'],
        },
        99,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lanza not found si el rol solicitado no existe', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.role.findMany.mockResolvedValue([]);

    await expect(
      service.create(
        {
          dni: '40123456',
          email: 'nuevo.admin@socialclub.local',
          password: 'Admin123!',
          name: 'Nuevo',
          lastName: 'Administrador',
          roles: ['ADMIN'],
        },
        99,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
