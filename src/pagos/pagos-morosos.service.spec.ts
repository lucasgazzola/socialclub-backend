import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { PagosService } from './pagos.service';
import {
  CriterioOrdenMorosos,
  FindMorososQueryDto,
  SentidoOrden,
} from './dto/find-morosos-query.dto';

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

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PagosService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditoriaService, useValue: mockAuditoria },
      ],
    }).compile();

    service = moduleRef.get<PagosService>(PagosService);
  });

  it('CA 5 & 6: Excluye socios al día y devuelve lista vacía si todos pagaron', async () => {
    const hoy = new Date();
    const periodoActualStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;

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
            fechaAlta: hoy,
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

    const resultado = await service.getMorososCuotaSocial({});

    expect(resultado.total).toBe(0);
    expect(resultado.deudaTotalClub).toBe(0);
    expect(resultado.items).toHaveLength(0);
  });

  it('CA 1, 4 & 5: Lista morosos con deuda acumulada calculada según tarifa histórica por período', async () => {
    const hoy = new Date();
    const haceDosMeses = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1);
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
        pagos: [], // Debe 3 períodos
      },
    ]);

    // Simula tarifa histórica de 4000
    mockPrisma.configuracionCuotaSocial.findFirst.mockResolvedValue({
      monto: 4000,
      periodoAplicacion: '2026-01',
    });

    const resultado = await service.getMorososCuotaSocial({});

    expect(resultado.total).toBe(1);
    expect(resultado.items[0].nombreCompleto).toBe('María Gómez');
    expect(resultado.items[0].dni).toBe('22334455');
    expect(resultado.items[0].categoria).toBe('Juvenil');
    expect(resultado.items[0].cantidadPeriodos).toBe(3);
    expect(resultado.items[0].montoTotalDeuda).toBe(12000); // 3 * 4000
    expect(resultado.items[0].periodosAdeudados).toContain(p0);
    expect(resultado.deudaTotalClub).toBe(12000);
  });

  it('CA 2: Permite ordenar por monto de deuda (descendente y ascendente)', async () => {
    const hoy = new Date();
    const haceUnMes = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const haceTresMeses = new Date(hoy.getFullYear(), hoy.getMonth() - 3, 1);

    mockPrisma.persona.findMany.mockResolvedValue([
      {
        id: 1,
        nombre: 'Socio Menor Deuda',
        apellido: 'Uno',
        dni: '111',
        membresias: [{ activo: true, fechaAlta: haceUnMes, categoriaId: 1, categoria: { nombre: 'General' } }],
        pagos: [], // 2 períodos
      },
      {
        id: 2,
        nombre: 'Socio Mayor Deuda',
        apellido: 'Dos',
        dni: '222',
        membresias: [{ activo: true, fechaAlta: haceTresMeses, categoriaId: 1, categoria: { nombre: 'General' } }],
        pagos: [], // 4 períodos
      },
    ]);

    mockPrisma.configuracionCuotaSocial.findFirst.mockResolvedValue({ monto: 5000 });

    // Orden DESC por monto
    const resDesc = await service.getMorososCuotaSocial({
      ordenarPor: CriterioOrdenMorosos.MONTO,
      orden: SentidoOrden.DESC,
    });
    expect(resDesc.items[0].dni).toBe('222');
    expect(resDesc.items[1].dni).toBe('111');

    // Orden ASC por monto
    const resAsc = await service.getMorososCuotaSocial({
      ordenarPor: CriterioOrdenMorosos.MONTO,
      orden: SentidoOrden.ASC,
    });
    expect(resAsc.items[0].dni).toBe('111');
    expect(resAsc.items[1].dni).toBe('222');
  });

  it('CA 2: Permite ordenar por cantidad de períodos adeudados', async () => {
    const hoy = new Date();
    const haceUnMes = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const haceDosMeses = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1);

    mockPrisma.persona.findMany.mockResolvedValue([
      {
        id: 1,
        nombre: 'A',
        apellido: 'A',
        dni: '1',
        membresias: [{ activo: true, fechaAlta: haceUnMes, categoriaId: 1, categoria: { nombre: 'General' } }],
        pagos: [], // 2 períodos
      },
      {
        id: 2,
        nombre: 'B',
        apellido: 'B',
        dni: '2',
        membresias: [{ activo: true, fechaAlta: haceDosMeses, categoriaId: 1, categoria: { nombre: 'General' } }],
        pagos: [], // 3 períodos
      },
    ]);

    mockPrisma.configuracionCuotaSocial.findFirst.mockResolvedValue({ monto: 5000 });

    const res = await service.getMorososCuotaSocial({
      ordenarPor: CriterioOrdenMorosos.PERIODOS,
      orden: SentidoOrden.DESC,
    });

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
});
