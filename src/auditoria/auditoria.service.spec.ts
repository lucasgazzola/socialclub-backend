import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from './auditoria.service';

/**
 * US-32 · Registrar logs de operaciones (RF12 / RNF03 / RNF11).
 *
 * El módulo estaba implementado y mergeado sin un solo test, con 0 % de
 * cobertura de ramas, siendo el registro inalterable del sistema.
 */
const mockPrisma: any = {
  registroAuditoria: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  // `listarTodos` usa la forma de array de $transaction, no la de callback.
  $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(mockPrisma))),
};

describe('US-32 · AuditoriaService', () => {
  let service: AuditoriaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.registroAuditoria.findMany.mockResolvedValue([]);
    mockPrisma.registroAuditoria.count.mockResolvedValue(0);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [AuditoriaService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = moduleRef.get<AuditoriaService>(AuditoriaService);
  });

  describe('registrar', () => {
    it('inserta el registro con acción, entidad, responsable y detalle', async () => {
      mockPrisma.registroAuditoria.create.mockResolvedValue({ id: 1 });

      await service.registrar({
        accion: 'BAJA',
        entidad: 'Inscripcion',
        idEntidad: 5,
        responsableId: 99,
        detalle: 'Baja de prueba',
      });

      expect(mockPrisma.registroAuditoria.create).toHaveBeenCalledWith({
        data: {
          accion: 'BAJA',
          entidad: 'Inscripcion',
          idEntidad: 5,
          responsableId: 99,
          detalle: 'Baja de prueba',
        },
      });
    });

    it('escribe dentro de la transacción recibida para no dejar rastro si la operación falla', async () => {
      // Atomicidad (RNF07): si se pasa un cliente transaccional, la auditoría
      // tiene que ir por ahí. Si fuera por el cliente normal, el registro
      // sobreviviría al rollback de la operación auditada.
      const tx: any = { registroAuditoria: { create: jest.fn().mockResolvedValue({ id: 2 }) } };

      await service.registrar({ accion: 'CREAR', entidad: 'Inscripcion' }, tx);

      expect(tx.registroAuditoria.create).toHaveBeenCalled();
      expect(mockPrisma.registroAuditoria.create).not.toHaveBeenCalled();
    });

    it('no expone modificación ni borrado de registros (log inalterable)', () => {
      const metodos = Object.getOwnPropertyNames(AuditoriaService.prototype).filter(
        (m) => m !== 'constructor',
      );

      // Si alguien agrega un método de escritura distinto de `registrar`, este
      // caso falla y obliga a justificarlo: la tabla solo admite INSERT.
      expect(metodos.sort()).toEqual(['listarPorEntidad', 'listarTodos', 'registrar']);
    });
  });

  describe('listarTodos', () => {
    /** Devuelve el `where` con el que se consultó el log. */
    function whereUsado() {
      return mockPrisma.registroAuditoria.findMany.mock.calls[0][0].where;
    }

    it('sin filtros consulta sin condiciones y pagina de 20 en 20', async () => {
      const resultado = await service.listarTodos({});

      expect(whereUsado()).toEqual({});
      expect(mockPrisma.registroAuditoria.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20, orderBy: { fechaHora: 'desc' } }),
      );
      expect(resultado).toEqual({ items: [], total: 0, pagina: 1, porPagina: 20 });
    });

    it('filtra por acción', async () => {
      await service.listarTodos({ accion: 'BAJA' });

      expect(whereUsado()).toEqual({ accion: 'BAJA' });
    });

    it('filtra por entidad y responsable a la vez', async () => {
      await service.listarTodos({ entidad: 'Inscripcion', responsableId: 99 });

      expect(whereUsado()).toEqual({ entidad: 'Inscripcion', responsableId: 99 });
    });

    it('filtra por rango de fechas', async () => {
      await service.listarTodos({ fechaDesde: '2026-01-01', fechaHasta: '2026-12-31' });

      expect(whereUsado()).toEqual({
        fechaHora: { gte: new Date('2026-01-01'), lte: new Date('2026-12-31') },
      });
    });

    it('acepta un extremo suelto del rango de fechas', async () => {
      await service.listarTodos({ fechaDesde: '2026-06-01' });

      expect(whereUsado()).toEqual({ fechaHora: { gte: new Date('2026-06-01') } });
    });

    it('calcula el salto de la página pedida y devuelve el total', async () => {
      mockPrisma.registroAuditoria.count.mockResolvedValue(57);

      const resultado = await service.listarTodos({ pagina: 3, porPagina: 20 });

      expect(mockPrisma.registroAuditoria.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 40, take: 20 }),
      );
      expect(resultado.total).toBe(57);
      expect(resultado.pagina).toBe(3);
    });

    it('incluye los datos del responsable de cada operación', async () => {
      await service.listarTodos({});

      expect(mockPrisma.registroAuditoria.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            responsable: { select: { id: true, email: true, nombre: true, apellido: true } },
          },
        }),
      );
    });
  });

  describe('listarPorEntidad', () => {
    it('devuelve el historial de una entidad puntual, del más reciente al más antiguo', async () => {
      await service.listarPorEntidad('Inscripcion', 5);

      expect(mockPrisma.registroAuditoria.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entidad: 'Inscripcion', idEntidad: 5 },
          orderBy: { fechaHora: 'desc' },
        }),
      );
    });
  });
});
