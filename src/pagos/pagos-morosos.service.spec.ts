import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { PagosService } from './pagos.service';
import { PasarelaService } from '../pasarela/pasarela.service';
import { CriterioOrdenMorosos, SentidoOrden } from './dto/find-morosos-query.dto';

describe('PagosService · US-19 · getMorososCuotaSocial', () => {
  let service: PagosService;

  const mockPrisma: any = {
    persona: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    configuracionCuotaSocial: {
      findFirst: jest.fn(),
    },
    pago: {
      findMany: jest.fn(),
    },
  };

  const mockAuditoria = {
    registrar: jest.fn(),
  };

  const mockPasarela = {
    iniciarCobro: jest.fn(),
    cancelarPendientes: jest.fn(),
  };

  /** 15/10/2026: la cuota de octubre ya venció (día 10). */
  const HOY = new Date(2026, 9, 15);

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PagosService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditoriaService, useValue: mockAuditoria },
        { provide: PasarelaService, useValue: mockPasarela },
      ],
    }).compile();

    service = moduleRef.get<PagosService>(PagosService);
  });

  it('CA 5 & 6: Excluye socios al día y devuelve lista vacía si todos pagaron', async () => {
    const periodoActualStr = '2026-10';

    mockPrisma.persona.findMany.mockResolvedValue([
      {
        id: 1,
        nombre: 'Juan',
        apellido: 'Pérez',
        dni: '12345678',
        email: 'juan@test.com',
        telefono: '11223344',
        membresias: [
          {
            id: 10,
            activo: true,
            fechaAlta: HOY,
            categoriaId: 1,
            categoria: { nombre: 'General' },
          },
        ],
        pagos: [
          {
            periodo: periodoActualStr,
            monto: 5000,
          },
        ],
      },
    ]);

    const resultado = await service.getMorososCuotaSocial({}, HOY);

    expect(resultado.total).toBe(0);
    expect(resultado.deudaTotalClub).toBe(0);
    expect(resultado.items).toHaveLength(0);
    expect(resultado.diaVencimiento).toBe(10);
  });

  it('CA 1, 4 & 5: Lista morosos con deuda acumulada calculada según tarifa histórica por período', async () => {
    const haceDosMeses = new Date(HOY.getFullYear(), HOY.getMonth() - 2, 1);
    const p0 = `${haceDosMeses.getFullYear()}-${String(haceDosMeses.getMonth() + 1).padStart(2, '0')}`;

    mockPrisma.persona.findMany.mockResolvedValue([
      {
        id: 2,
        nombre: 'María',
        apellido: 'Gómez',
        dni: '22334455',
        email: 'maria@test.com',
        telefono: '99887766',
        membresias: [
          {
            id: 20,
            activo: true,
            fechaAlta: haceDosMeses,
            categoriaId: 2,
            categoria: { nombre: 'Juvenil' },
          },
        ],
        pagos: [], // Al día 15 debe 3 períodos (mes -2, mes -1 y mes actual ya vencido)
      },
    ]);

    // Simula tarifa histórica de 4000
    mockPrisma.configuracionCuotaSocial.findFirst.mockResolvedValue({
      monto: 4000,
      periodoAplicacion: '2026-01',
    });

    const resultado = await service.getMorososCuotaSocial({}, HOY);

    expect(resultado.total).toBe(1);
    expect(resultado.items[0].nombreCompleto).toBe('María Gómez');
    expect(resultado.items[0].dni).toBe('22334455');
    expect(resultado.items[0].categoria).toBe('Juvenil');
    expect(resultado.items[0].cantidadPeriodos).toBe(3);
    expect(resultado.items[0].montoTotalDeuda).toBe(12000); // 3 * 4000
    expect(resultado.items[0].periodosAdeudados).toContain(p0);
    expect(resultado.deudaTotalClub).toBe(12000);
    expect(resultado.diaVencimiento).toBe(10);
  });

  it('DT-48: no cuenta las cuotas del mes en curso que todavía no vencieron (hasta el día 10)', async () => {
    const haceDosMeses = new Date(2026, 7, 1); // Agosto 2026
    mockPrisma.persona.findMany.mockResolvedValue([
      {
        id: 2,
        nombre: 'María',
        apellido: 'Gómez',
        dni: '22334455',
        email: 'maria@test.com',
        telefono: '99887766',
        membresias: [
          {
            id: 20,
            activo: true,
            fechaAlta: haceDosMeses,
            categoriaId: 2,
            categoria: { nombre: 'Juvenil' },
          },
        ],
        pagos: [],
      },
    ]);
    mockPrisma.configuracionCuotaSocial.findFirst.mockResolvedValue({ monto: 4000 });

    // Consultado el 10/10/2026 (día 10): octubre NO venció aún, solo debe agosto y septiembre
    const resultado = await service.getMorososCuotaSocial({}, new Date(2026, 9, 10));

    expect(resultado.items[0].periodosAdeudados).toEqual(['2026-08', '2026-09']);
    expect(resultado.items[0].cantidadPeriodos).toBe(2);
    expect(resultado.items[0].montoTotalDeuda).toBe(8000);
  });

  it('DT-48: no lista como moroso a quien solo debe la cuota del mes en curso antes del día 10', async () => {
    mockPrisma.persona.findMany.mockResolvedValue([
      {
        id: 3,
        nombre: 'Nuevo',
        apellido: 'Socio',
        dni: '33445566',
        membresias: [
          {
            id: 30,
            activo: true,
            fechaAlta: new Date(2026, 9, 1),
            categoriaId: 1,
            categoria: { nombre: 'General' },
          },
        ],
        pagos: [],
      },
    ]);
    mockPrisma.configuracionCuotaSocial.findFirst.mockResolvedValue({ monto: 5000 });

    // Consultado el 08/10/2026 (día 8): no figura en la lista de morosos
    const resultado = await service.getMorososCuotaSocial({}, new Date(2026, 9, 8));

    expect(resultado).toMatchObject({ total: 0, deudaTotalClub: 0, items: [] });
  });

  it('DT-48: lista como moroso a quien debe la cuota del mes en curso a partir del día 11', async () => {
    mockPrisma.persona.findMany.mockResolvedValue([
      {
        id: 3,
        nombre: 'Nuevo',
        apellido: 'Socio',
        dni: '33445566',
        membresias: [
          {
            id: 30,
            activo: true,
            fechaAlta: new Date(2026, 9, 1),
            categoriaId: 1,
            categoria: { nombre: 'General' },
          },
        ],
        pagos: [],
      },
    ]);
    mockPrisma.configuracionCuotaSocial.findFirst.mockResolvedValue({ monto: 5000 });

    // Consultado el 11/10/2026: octubre ya venció
    const resultado = await service.getMorososCuotaSocial({}, new Date(2026, 9, 11));

    expect(resultado.total).toBe(1);
    expect(resultado.items[0].periodosAdeudados).toEqual(['2026-10']);
    expect(resultado.items[0].cantidadPeriodos).toBe(1);
    expect(resultado.items[0].montoTotalDeuda).toBe(5000);
  });

  it('CA 2: Permite ordenar por monto de deuda (descendente y ascendente)', async () => {
    const haceUnMes = new Date(HOY.getFullYear(), HOY.getMonth() - 1, 1);
    const haceTresMeses = new Date(HOY.getFullYear(), HOY.getMonth() - 3, 1);

    mockPrisma.persona.findMany.mockResolvedValue([
      {
        id: 1,
        nombre: 'Socio Menor Deuda',
        apellido: 'Uno',
        dni: '111',
        membresias: [
          { activo: true, fechaAlta: haceUnMes, categoriaId: 1, categoria: { nombre: 'General' } },
        ],
        pagos: [], // 2 períodos
      },
      {
        id: 2,
        nombre: 'Socio Mayor Deuda',
        apellido: 'Dos',
        dni: '222',
        membresias: [
          {
            activo: true,
            fechaAlta: haceTresMeses,
            categoriaId: 1,
            categoria: { nombre: 'General' },
          },
        ],
        pagos: [], // 4 períodos
      },
    ]);

    mockPrisma.configuracionCuotaSocial.findFirst.mockResolvedValue({ monto: 5000 });

    // Orden DESC por monto
    const resDesc = await service.getMorososCuotaSocial(
      {
        ordenarPor: CriterioOrdenMorosos.MONTO,
        orden: SentidoOrden.DESC,
      },
      HOY,
    );
    expect(resDesc.items[0].dni).toBe('222');
    expect(resDesc.items[1].dni).toBe('111');

    // Orden ASC por monto
    const resAsc = await service.getMorososCuotaSocial(
      {
        ordenarPor: CriterioOrdenMorosos.MONTO,
        orden: SentidoOrden.ASC,
      },
      HOY,
    );
    expect(resAsc.items[0].dni).toBe('111');
    expect(resAsc.items[1].dni).toBe('222');
  });

  it('CA 2: Permite ordenar por cantidad de períodos adeudados', async () => {
    const haceUnMes = new Date(HOY.getFullYear(), HOY.getMonth() - 1, 1);
    const haceDosMeses = new Date(HOY.getFullYear(), HOY.getMonth() - 2, 1);

    mockPrisma.persona.findMany.mockResolvedValue([
      {
        id: 1,
        nombre: 'A',
        apellido: 'A',
        dni: '1',
        membresias: [
          { activo: true, fechaAlta: haceUnMes, categoriaId: 1, categoria: { nombre: 'General' } },
        ],
        pagos: [], // 2 períodos
      },
      {
        id: 2,
        nombre: 'B',
        apellido: 'B',
        dni: '2',
        membresias: [
          {
            activo: true,
            fechaAlta: haceDosMeses,
            categoriaId: 1,
            categoria: { nombre: 'General' },
          },
        ],
        pagos: [], // 3 períodos
      },
    ]);

    mockPrisma.configuracionCuotaSocial.findFirst.mockResolvedValue({ monto: 5000 });

    const res = await service.getMorososCuotaSocial(
      {
        ordenarPor: CriterioOrdenMorosos.PERIODOS,
        orden: SentidoOrden.DESC,
      },
      HOY,
    );

    expect(res.items[0].dni).toBe('2');
    expect(res.items[0].cantidadPeriodos).toBe(3);
    expect(res.items[1].dni).toBe('1');
    expect(res.items[1].cantidadPeriodos).toBe(2);
  });

  it('CA 3: Aplica filtros por búsqueda y categoría en la consulta a la base de datos', async () => {
    mockPrisma.persona.findMany.mockResolvedValue([]);

    await service.getMorososCuotaSocial({
      busqueda: 'González',
      categoriaId: 3,
    });

    expect(mockPrisma.persona.findMany).toHaveBeenCalledWith({
      where: {
        membresias: {
          some: { categoriaId: 3 },
        },
        AND: [
          {
            OR: [
              { nombre: { contains: 'González', mode: 'insensitive' } },
              { apellido: { contains: 'González', mode: 'insensitive' } },
              { dni: { contains: 'González', mode: 'insensitive' } },
            ],
          },
        ],
      },
      include: expect.any(Object),
    });
  });

  it('soporta paginación opcional preservando total y deudaTotalClub intactos', async () => {
    const haceUnMes = new Date(HOY.getFullYear(), HOY.getMonth() - 1, 1);
    mockPrisma.persona.findMany.mockResolvedValue([
      {
        id: 1,
        nombre: 'Socio1',
        apellido: 'Test',
        dni: '111',
        membresias: [
          { activo: true, fechaAlta: haceUnMes, categoriaId: 1, categoria: { nombre: 'General' } },
        ],
        pagos: [], // 2 períodos
      },
      {
        id: 2,
        nombre: 'Socio2',
        apellido: 'Test',
        dni: '222',
        membresias: [
          { activo: true, fechaAlta: haceUnMes, categoriaId: 1, categoria: { nombre: 'General' } },
        ],
        pagos: [], // 2 períodos
      },
    ]);
    mockPrisma.configuracionCuotaSocial.findFirst.mockResolvedValue({ monto: 5000 });

    const resPag1 = await service.getMorososCuotaSocial({ pagina: 1, porPagina: 1 }, HOY);
    expect(resPag1.total).toBe(2);
    expect(resPag1.deudaTotalClub).toBe(20000);
    expect(resPag1.items).toHaveLength(1);
    expect(resPag1.pagina).toBe(1);
    expect(resPag1.porPagina).toBe(1);

    const resPag2 = await service.getMorososCuotaSocial({ pagina: 2, porPagina: 1 }, HOY);
    expect(resPag2.total).toBe(2);
    expect(resPag2.items).toHaveLength(1);
    expect(resPag2.pagina).toBe(2);
    expect(resPag2.porPagina).toBe(1);
  });
});
