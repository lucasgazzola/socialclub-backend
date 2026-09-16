import { PersonasService } from './personas.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

const mockPrisma: any = {
  persona: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const mockAuditoria = {
  registrar: jest.fn(),
};

describe('PersonasService — edición de datos del participante (US-06 / US-07)', () => {
  let service: PersonasService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PersonasService(
      mockPrisma as unknown as PrismaService,
      mockAuditoria as unknown as AuditoriaService,
    );
  });

  const persona = {
    id: 10,
    nombre: 'Juan',
    apellido: 'Pérez',
    dni: '30123456',
    fechaNacimiento: new Date('2000-01-01'),
    email: 'juan@perez.com',
    telefono: '1234567890',
    activo: true,
  };

  it('actualiza los datos básicos y registra la auditoría', async () => {
    mockPrisma.persona.findUnique.mockResolvedValue(persona);
    mockPrisma.persona.update.mockResolvedValue({ ...persona, telefono: '999' });

    const resultado = await service.update(10, { telefono: '999' }, 99);

    expect(resultado.telefono).toBe('999');
    expect(mockPrisma.persona.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: expect.objectContaining({ telefono: '999' }),
    });
    expect(mockAuditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'EDITAR',
        entidad: 'Persona',
        idEntidad: 10,
        responsableId: 99,
      }),
    );
  });

  it('rechaza el cambio de DNI cuando otro participante ya lo tiene', async () => {
    mockPrisma.persona.findUnique
      .mockResolvedValueOnce(persona)
      .mockResolvedValueOnce({ ...persona, id: 20 });

    await expect(service.update(10, { dni: '31987654' }, 99)).rejects.toThrow(
      'Ya existe un participante con ese DNI',
    );
    expect(mockPrisma.persona.update).not.toHaveBeenCalled();
    expect(mockAuditoria.registrar).not.toHaveBeenCalled();
  });

  it('permite guardar el mismo DNI sin conflicto', async () => {
    mockPrisma.persona.findUnique.mockResolvedValue(persona);
    mockPrisma.persona.update.mockResolvedValue(persona);

    await expect(service.update(10, { dni: '30123456' }, 99)).resolves.toEqual(persona);
  });

  it('informa que el participante a editar no existe', async () => {
    mockPrisma.persona.findUnique.mockResolvedValue(null);

    await expect(service.update(999, { nombre: 'X' }, 99)).rejects.toThrow(
      'Participante no encontrado',
    );
  });
});
