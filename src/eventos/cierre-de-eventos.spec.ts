import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EventosService } from './eventos.service';

/**
 * DT-33 · EventosService: cierre de los eventos terminados (lo dispara la
 * tarea `cierre-de-eventos`).
 */
describe('DT-33 · EventosService · cierre de eventos', () => {
  let service: EventosService;
  const prismaMock = {
    evento: { updateMany: jest.fn() },
    entrada: { updateMany: jest.fn() },
    $transaction: jest.fn((operaciones: Promise<unknown>[]) => Promise.all(operaciones)),
  };
  const auditoriaMock = { registrar: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        EventosService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
      ],
    }).compile();
    service = moduleRef.get(EventosService);
  });

  describe('cerrarTerminados', () => {
    it('expira las entradas sin usar y finaliza los eventos publicados que ya terminaron', async () => {
      const ahora = new Date('2026-10-19T12:00:00.000Z');
      prismaMock.entrada.updateMany.mockResolvedValue({ count: 7 });
      prismaMock.evento.updateMany.mockResolvedValue({ count: 2 });

      await expect(service.cerrarTerminados(ahora)).resolves.toEqual({
        eventosFinalizados: 2,
        entradasExpiradas: 7,
      });

      const terminado = {
        OR: [
          { fechaFin: { lt: ahora } },
          { fechaFin: null, fechaEvento: { lt: new Date('2026-10-19T00:00:00.000Z') } },
        ],
      };
      expect(prismaMock.entrada.updateMany).toHaveBeenCalledWith({
        where: { estado: 'VALIDA', evento: terminado },
        data: { estado: 'EXPIRADA' },
      });
      expect(prismaMock.evento.updateMany).toHaveBeenCalledWith({
        where: { estado: 'PUBLICADO', ...terminado },
        data: { estado: 'FINALIZADO' },
      });
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
