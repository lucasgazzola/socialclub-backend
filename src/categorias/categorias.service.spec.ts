import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriasService } from './categorias.service';

describe('US-09 / US-12 · CategoriasService', () => {
  let service: CategoriasService;
  const prismaMock = {
    categoriaSocio: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [CategoriasService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = moduleRef.get(CategoriasService);
  });

  it('TC-240: devuelve las categorías de socio ordenadas alfabéticamente por nombre', async () => {
    const categorias = [
      { id: 1, nombre: 'Activo' },
      { id: 2, nombre: 'Cadete' },
      { id: 3, nombre: 'Vitalicio' },
    ];
    prismaMock.categoriaSocio.findMany.mockResolvedValue(categorias);

    const resultado = await service.findAll();

    expect(prismaMock.categoriaSocio.findMany).toHaveBeenCalledWith({
      orderBy: { nombre: 'asc' },
    });
    expect(resultado).toEqual(categorias);
  });
});

