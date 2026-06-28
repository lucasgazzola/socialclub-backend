import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    controller = moduleRef.get(AppController);
  });

  it('responde el healthcheck con estado "ok"', () => {
    const resultado = controller.health();
    expect(resultado.status).toBe('ok');
    expect(typeof resultado.timestamp).toBe('string');
  });
});
