import { Test, TestingModule } from '@nestjs/testing';
import { CategoriasController } from './categorias.controller';
import { CategoriasService } from './categorias.service';

describe('US-09 / US-12 · CategoriasController', () => {
  let controller: CategoriasController;
  const serviceMock = {
    findAll: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [CategoriasController],
      providers: [{ provide: CategoriasService, useValue: serviceMock }],
    }).compile();

    controller = moduleRef.get(CategoriasController);
  });

  it('TC-240: delega findAll en CategoriasService y devuelve el listado', async () => {
    const categorias = [{ id: 1, nombre: 'Activo' }];
    serviceMock.findAll.mockResolvedValue(categorias);

    await expect(controller.findAll()).resolves.toEqual(categorias);
    expect(serviceMock.findAll).toHaveBeenCalledTimes(1);
  });
});
