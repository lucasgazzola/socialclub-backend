import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { DocumentacionService } from './documentacion.service';
import { EstadoDocumentalService } from './estado-documental.service';

/**
 * US-24 · Cargar documentación obligatoria de un participante.
 * Cubre las reglas de negocio: integrante existente, fecha no anterior a hoy,
 * tipo del catálogo exigido al participante (TASK-31) y auditoría del alta. (La obligatoriedad de la fecha se valida en el DTO.)
 */
describe('US-24 · DocumentacionService', () => {
  let service: DocumentacionService;

  const prismaMock = {
    persona: { findUnique: jest.fn() },
    documentacion: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
    usuario: { findUnique: jest.fn() },
  };
  const auditoriaMock = { registrar: jest.fn() };
  const estadoDocumentalMock = { tiposExigidos: jest.fn() };

  // La fecha se arma en hora LOCAL, no con toISOString(): el service compara
  // contra el día local, así que entre las 21:00 y las 00:00 en UTC-3 el "ayer"
  // en UTC es el "hoy" local y el caso de fecha vencida dejaba de fallar.
  const diasDesdeHoy = (dias: number) => {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`; // YYYY-MM-DD
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentacionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
        { provide: EstadoDocumentalService, useValue: estadoDocumentalMock },
      ],
    }).compile();
    service = moduleRef.get(DocumentacionService);
    estadoDocumentalMock.tiposExigidos.mockResolvedValue([
      'CERTIFICADO_MEDICO_APTITUD_FISICA',
      'DNI',
      'SEGURO_COBERTURA_MEDICA',
    ]);
  });

  it('TC-244: carga el documento con fecha futura y audita CREAR', async () => {
    prismaMock.persona.findUnique.mockResolvedValue({ id: 1, nombre: 'Juan' });
    prismaMock.documentacion.create.mockResolvedValue({
      id: 10,
      tipo: 'Apto físico',
      personaId: 1,
    });

    const res = await service.create(
      {
        tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA',
        fechaVencimiento: diasDesdeHoy(30),
        personaId: 1,
      },
      7,
    );

    expect(res.id).toBe(10);
    expect(prismaMock.documentacion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA',
          // Sin descripción libre, se guarda el nombre del tipo del catálogo.
          tipo: 'Certificado médico de aptitud física',
          personaId: 1,
        }),
      }),
    );
    expect(auditoriaMock.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'CREAR', entidad: 'Documentacion', idEntidad: 10 }),
    );
  });

  it('TC-244: acepta un documento que vence hoy (no es anterior a la fecha actual)', async () => {
    prismaMock.persona.findUnique.mockResolvedValue({ id: 1 });
    prismaMock.documentacion.create.mockResolvedValue({ id: 11 });

    await expect(
      service.create({ tipoDocumento: 'DNI', fechaVencimiento: diasDesdeHoy(0), personaId: 1 }, 7),
    ).resolves.toBeDefined();
  });

  it('TC-246: rechaza una fecha de vencimiento anterior a hoy', async () => {
    prismaMock.persona.findUnique.mockResolvedValue({ id: 1 });

    await expect(
      service.create(
        {
          tipoDocumento: 'SEGURO_COBERTURA_MEDICA',
          fechaVencimiento: diasDesdeHoy(-1),
          personaId: 1,
        },
        7,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prismaMock.documentacion.create).not.toHaveBeenCalled();
  });

  it('TC-247: rechaza cargar documentación para un participante inexistente', async () => {
    prismaMock.persona.findUnique.mockResolvedValue(null);

    await expect(
      service.create(
        { tipoDocumento: 'DNI', fechaVencimiento: diasDesdeHoy(10), personaId: 99 },
        7,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.documentacion.create).not.toHaveBeenCalled();
  });

  it('TC-247: rechaza un tipo que no exige ninguna disciplina o categoría del participante', async () => {
    prismaMock.persona.findUnique.mockResolvedValue({ id: 1 });

    await expect(
      service.create(
        {
          tipoDocumento: 'FICHA_TECNICA_NATACION',
          fechaVencimiento: diasDesdeHoy(30),
          personaId: 1,
        },
        7,
      ),
    ).rejects.toThrow(
      'Ninguna disciplina o categoría del participante exige «Ficha técnica: Natación».',
    );
    expect(prismaMock.documentacion.create).not.toHaveBeenCalled();
  });

  it('guarda la descripción libre si se envía', async () => {
    prismaMock.persona.findUnique.mockResolvedValue({ id: 1 });
    prismaMock.documentacion.create.mockResolvedValue({ id: 12 });

    await service.create(
      {
        tipoDocumento: 'DNI',
        tipo: '  DNI tarjeta  ',
        fechaVencimiento: diasDesdeHoy(5),
        personaId: 1,
      },
      7,
    );

    expect(prismaMock.documentacion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipo: 'DNI tarjeta' }) }),
    );
  });

  describe('DT-43 · El DNI no requiere fecha de vencimiento', () => {
    it('permite cargar un DNI sin fecha de vencimiento (guarda fechaVencimiento = null)', async () => {
      prismaMock.persona.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.documentacion.create.mockResolvedValue({ id: 15, tipo: 'DNI', personaId: 1 });

      const res = await service.create(
        {
          tipoDocumento: 'DNI',
          personaId: 1,
        },
        7,
      );

      expect(res.id).toBe(15);
      expect(prismaMock.documentacion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tipoDocumento: 'DNI',
            fechaVencimiento: null,
            personaId: 1,
          }),
        }),
      );
    });

    it('rechaza cargar un documento que no sea DNI sin fecha de vencimiento', async () => {
      prismaMock.persona.findUnique.mockResolvedValue({ id: 1 });

      await expect(
        service.create(
          {
            tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA',
            personaId: 1,
          },
          7,
        ),
      ).rejects.toThrow('La fecha de vencimiento es obligatoria.');
      expect(prismaMock.documentacion.create).not.toHaveBeenCalled();
    });
  });
  describe('DT-28 · Consulta de documentación y permisos', () => {
    it('permite a un usuario con rol de staff consultar cualquier persona', async () => {
      const user = { id: 10, email: 'admin@club.com', roles: ['ADMIN'] };
      await expect(service.validarAccesoPersona(99, user)).resolves.toBeUndefined();
      expect(prismaMock.usuario.findUnique).not.toHaveBeenCalled();
    });

    it('permite a un colaborador consultar cualquier persona', async () => {
      const user = { id: 11, email: 'colab@club.com', roles: ['COLABORADOR'] };
      await expect(service.validarAccesoPersona(99, user)).resolves.toBeUndefined();
    });

    it('permite a un socio consultar su propia persona', async () => {
      const user = { id: 12, email: 'socio@club.com', roles: ['SOCIO'] };
      prismaMock.usuario.findUnique.mockResolvedValue({ personaId: 5 });
      await expect(service.validarAccesoPersona(5, user)).resolves.toBeUndefined();
    });

    it('rechaza a un socio que intenta consultar la documentación de otra persona', async () => {
      const user = { id: 12, email: 'socio@club.com', roles: ['SOCIO'] };
      prismaMock.usuario.findUnique.mockResolvedValue({ personaId: 5 });
      await expect(service.validarAccesoPersona(99, user)).rejects.toThrow(ForbiddenException);
    });

    it('obtiene personaId del usuario autenticado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({ personaId: 5 });
      const personaId = await service.obtenerPersonaIdDeUsuario(12);
      expect(personaId).toBe(5);
    });

    it('falla si el usuario no tiene ficha de persona', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({ personaId: null });
      await expect(service.obtenerPersonaIdDeUsuario(12)).rejects.toThrow(NotFoundException);
    });
  });
});
