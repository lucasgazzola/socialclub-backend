import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CuotaSocialService } from '../cuota-social/cuota-social.service';
import { ClubService } from './club.service';

describe('TASK-60 · ClubService · información pública para la landing', () => {
  let service: ClubService;
  const prismaMock = {
    categoriaSocio: { findMany: jest.fn() },
    disciplina: { findMany: jest.fn() },
    persona: { count: jest.fn() },
    evento: { count: jest.fn() },
  };
  const cuotaSocialMock = { getVigentes: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ClubService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CuotaSocialService, useValue: cuotaSocialMock },
      ],
    }).compile();
    service = moduleRef.get(ClubService);
  });

  it('arma los planes con la cuota vigente, las disciplinas activas y los números del club', async () => {
    prismaMock.categoriaSocio.findMany.mockResolvedValue([
      { id: 1, nombre: 'Activo', descripcion: 'Socio pleno' },
      { id: 2, nombre: 'Cadete', descripcion: null },
    ]);
    cuotaSocialMock.getVigentes.mockResolvedValue([{ categoriaId: 1, monto: 15000 }]);
    prismaMock.disciplina.findMany.mockResolvedValue([
      {
        id: 4,
        nombre: 'Natación',
        descripcion: 'Pileta climatizada',
        genero: null,
        edadMinima: 6,
        edadMaxima: null,
        categorias: [{ nombre: 'Infantil' }, { nombre: 'Mayores' }],
      },
    ]);
    prismaMock.persona.count.mockResolvedValueOnce(320).mockResolvedValueOnce(140);
    prismaMock.evento.count.mockResolvedValue(3);

    await expect(service.informacionPublica()).resolves.toEqual({
      planes: [
        { categoriaId: 1, nombre: 'Activo', descripcion: 'Socio pleno', cuotaMensual: 15000 },
        { categoriaId: 2, nombre: 'Cadete', descripcion: null, cuotaMensual: null },
      ],
      disciplinas: [
        {
          id: 4,
          nombre: 'Natación',
          descripcion: 'Pileta climatizada',
          genero: null,
          edadMinima: 6,
          edadMaxima: null,
          categorias: ['Infantil', 'Mayores'],
        },
      ],
      numeros: { socios: 320, participantes: 140, disciplinas: 1, eventosProximos: 3 },
    });
  });

  it('solo cuenta disciplinas activas, socios con membresía activa y eventos publicados por venir', async () => {
    prismaMock.categoriaSocio.findMany.mockResolvedValue([]);
    cuotaSocialMock.getVigentes.mockResolvedValue([]);
    prismaMock.disciplina.findMany.mockResolvedValue([]);
    prismaMock.persona.count.mockResolvedValue(0);
    prismaMock.evento.count.mockResolvedValue(0);

    await service.informacionPublica(new Date('2026-11-15T12:00:00Z'));

    expect(prismaMock.disciplina.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { activo: true } }),
    );
    expect(prismaMock.persona.count).toHaveBeenCalledWith({
      where: { membresias: { some: { activo: true } } },
    });
    expect(prismaMock.evento.count).toHaveBeenCalledWith({
      where: { estado: 'PUBLICADO', NOT: expect.objectContaining({ OR: expect.any(Array) }) },
    });
  });

  it('no expone datos personales: solo devuelve planes, disciplinas y totales', async () => {
    prismaMock.categoriaSocio.findMany.mockResolvedValue([]);
    cuotaSocialMock.getVigentes.mockResolvedValue([]);
    prismaMock.disciplina.findMany.mockResolvedValue([]);
    prismaMock.persona.count.mockResolvedValue(0);
    prismaMock.evento.count.mockResolvedValue(0);

    const respuesta = await service.informacionPublica();

    expect(Object.keys(respuesta).sort()).toEqual(['disciplinas', 'numeros', 'planes']);
    expect(prismaMock.persona.count).toHaveBeenCalledTimes(2);
  });
});
