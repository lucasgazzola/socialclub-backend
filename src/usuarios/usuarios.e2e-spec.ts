import { INestApplication, ExecutionContext, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'http';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

describe('UsuariosController (e2e) — US-04 (Refactor)', () => {
  let app: INestApplication;

  const prismaMock = {
    usuario: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const auditoriaMock = { registrar: jest.fn() };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [UsuariosController],
      providers: [
        UsuariosService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = { id: 1, email: 'admin@test.com', roles: ['ADMIN'] };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true })); // Para que parsee query params (como pagina y porPagina)
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /usuarios', () => {
    it('filtra por busqueda con múltiples palabras (AND interno)', async () => {
      const mockResult = [{ id: 1, nombre: 'Franco', apellido: 'Perez' }];
      // $transaction retorna [items, total, totalTodos, totalActivos, totalInactivos]
      prismaMock.$transaction.mockResolvedValue([mockResult, 1, 10, 8, 2]);

      const httpServer = app.getHttpServer() as Server;
      const response = await request(httpServer)
        .get('/usuarios')
        .query({ busqueda: 'Franco Perez', pagina: 1, porPagina: 10 })
        .expect(200);

      expect(response.body).toEqual({
        items: expect.arrayContaining([expect.objectContaining({ nombre: 'Franco' })]),
        total: 1,
        pagina: 1,
        porPagina: 10,
        counts: { todos: 10, activos: 8, inactivos: 2 },
      });

      // Validar que se hizo el split y se generó el AND con las palabras "Franco" y "Perez"
      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {
                OR: [
                  { nombre: { contains: 'Franco', mode: 'insensitive' } },
                  { apellido: { contains: 'Franco', mode: 'insensitive' } },
                ],
              },
              {
                OR: [
                  { nombre: { contains: 'Perez', mode: 'insensitive' } },
                  { apellido: { contains: 'Perez', mode: 'insensitive' } },
                ],
              },
            ],
          },
        }),
      );
    });

    it('filtra por rolId', async () => {
      const mockResult = [{ id: 2, nombre: 'Ana', apellido: 'Gomez' }];
      prismaMock.$transaction.mockResolvedValue([mockResult, 1, 10, 8, 2]);

      const httpServer = app.getHttpServer() as Server;
      const response = await request(httpServer)
        .get('/usuarios')
        .query({ rolId: 3 }) // 3 puede ser COLABORADOR
        .expect(200);

      expect(response.body.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ nombre: 'Ana' })]),
      );
      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            roles: {
              some: { rolId: 3 },
            },
          },
        }),
      );
    });

    it('filtra por busqueda y rolId combinados', async () => {
      const mockResult = [{ id: 3, nombre: 'Carlos', apellido: 'Lopez' }];
      prismaMock.$transaction.mockResolvedValue([mockResult, 1, 10, 8, 2]);

      const httpServer = app.getHttpServer() as Server;
      const response = await request(httpServer)
        .get('/usuarios')
        .query({ busqueda: 'Carlos', rolId: 2 })
        .expect(200);

      expect(response.body.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ nombre: 'Carlos' })]),
      );
      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {
                OR: [
                  { nombre: { contains: 'Carlos', mode: 'insensitive' } },
                  { apellido: { contains: 'Carlos', mode: 'insensitive' } },
                ],
              },
            ],
            roles: {
              some: { rolId: 2 },
            },
          },
        }),
      );
    });

    it('devuelve { items: [] } y un objeto paginado vacío cuando no hay coincidencias', async () => {
      prismaMock.$transaction.mockResolvedValue([[], 0, 10, 8, 2]);

      const httpServer = app.getHttpServer() as Server;
      const response = await request(httpServer)
        .get('/usuarios')
        .query({ busqueda: 'NombreQueNoExiste' })
        .expect(200);

      expect(response.body).toEqual({
        items: [],
        total: 0,
        pagina: 1, // por default es 1
        porPagina: 10, // por default es 10
        counts: { todos: 10, activos: 8, inactivos: 2 },
      });
      expect(prismaMock.$transaction).toHaveBeenCalled();
    });
  });
});
