import { PrismaClient } from '@prisma/client';

/**
 * DT-25 · Integración contra Postgres: la tabla `registros_auditoria` solo
 * admite INSERT. Lo garantizan los triggers de la migración
 * `20261004210000_auditoria_inalterable`, no solo AuditoriaService.
 *
 * Necesita una base con las migraciones aplicadas en `DB_INTEGRACION_URL`.
 * El CI la crea con `prisma migrate deploy`; en local:
 *   DB_INTEGRACION_URL=postgresql://... npx jest auditoria.inalterable
 * Sin la variable, la suite se saltea.
 */
const url = process.env.DB_INTEGRACION_URL;
const describeConBase = url ? describe : describe.skip;

describeConBase('DT-25 · TC-024 / TC-074 · Auditoría inalterable en la base', () => {
  let prisma: PrismaClient;
  let id: number;
  const INALTERABLE = /La auditoría es inalterable: no se permite (UPDATE|DELETE|TRUNCATE)/;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: url });
    const registro = await prisma.registroAuditoria.create({
      data: { accion: 'CREAR', entidad: 'PruebaDT25', detalle: 'original' },
    });
    id = registro.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('permite insertar registros', async () => {
    await expect(prisma.registroAuditoria.findUnique({ where: { id } })).resolves.toMatchObject({
      entidad: 'PruebaDT25',
      detalle: 'original',
    });
  });

  it('rechaza modificar un registro', async () => {
    await expect(
      prisma.registroAuditoria.update({ where: { id }, data: { detalle: 'alterado' } }),
    ).rejects.toThrow(INALTERABLE);
    await expect(
      prisma.registroAuditoria.updateMany({
        where: { entidad: 'PruebaDT25' },
        data: { detalle: 'x' },
      }),
    ).rejects.toThrow(INALTERABLE);
  });

  it('rechaza borrar registros', async () => {
    await expect(prisma.registroAuditoria.delete({ where: { id } })).rejects.toThrow(INALTERABLE);
    await expect(
      prisma.registroAuditoria.deleteMany({ where: { entidad: 'PruebaDT25' } }),
    ).rejects.toThrow(INALTERABLE);
  });

  it('rechaza vaciar la tabla, aun con SQL directo', async () => {
    await expect(prisma.$executeRawUnsafe('TRUNCATE registros_auditoria')).rejects.toThrow(
      INALTERABLE,
    );
    await expect(prisma.$executeRawUnsafe('DELETE FROM registros_auditoria')).rejects.toThrow(
      INALTERABLE,
    );
  });

  it('el registro queda intacto después de los intentos', async () => {
    await expect(prisma.registroAuditoria.findUnique({ where: { id } })).resolves.toMatchObject({
      detalle: 'original',
    });
  });
});
