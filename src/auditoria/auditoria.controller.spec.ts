import { Test, TestingModule } from '@nestjs/testing';
import { AuditoriaController } from './auditoria.controller';
import { AuditoriaService } from './auditoria.service';

describe('AuditoriaController', () => {
  let controller: AuditoriaController;

  const mockAuditoriaService = {
    listarTodos: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditoriaController],
      providers: [
        {
          provide: AuditoriaService,
          useValue: mockAuditoriaService,
        },
      ],
    }).compile();

    controller = module.get<AuditoriaController>(AuditoriaController);
  });

  it('llama a listarTodos del service', async () => {
    const query = { pagina: 1, porPagina: 10 };
    mockAuditoriaService.listarTodos.mockResolvedValue({ items: [], total: 0 });

    const result = await controller.findAll(query);

    expect(mockAuditoriaService.listarTodos).toHaveBeenCalledWith(query);
    expect(result).toEqual({ items: [], total: 0 });
  });
});
