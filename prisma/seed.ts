import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

/**
 * Seed idempotente: puede ejecutarse múltiples veces sin duplicar datos
 * (usa `upsert`). Crea los roles base, una categoría de socio inicial y el
 * usuario administrador con el que el equipo arranca el sistema.
 */
const prisma = new PrismaClient();

const SALT_ROUNDS = 10;

async function main() {
  const rolAdmin = await prisma.rol.upsert({
    where: { nombre: 'ADMIN' },
    update: {},
    create: { nombre: 'ADMIN', descripcion: 'Acceso completo al sistema' },
  });

  await prisma.rol.upsert({
    where: { nombre: 'COLABORADOR' },
    update: {},
    create: {
      nombre: 'COLABORADOR',
      descripcion: 'Acceso operativo limitado (consulta de socios, asistencia)',
    },
  });

  await prisma.categoriaSocio.upsert({
    where: { nombre: 'Activo' },
    update: {},
    create: { nombre: 'Activo', descripcion: 'Socio activo con cuota al día' },
  });

  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@socialclub.local';
  const passwordPlano = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
  const passwordHash = await bcrypt.hash(passwordPlano, SALT_ROUNDS);

  const admin = await prisma.usuario.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      nombre: 'Administrador',
      apellido: 'Inicial',
      roles: { create: [{ rolId: rolAdmin.id }] },
    },
  });

  console.log('Seed completado.');
  console.log(`  Usuario admin: ${admin.email} / contraseña: ${passwordPlano}`);
  console.log('  IMPORTANTE: cambiá esta contraseña fuera del entorno local.');
}

main()
  .catch((error) => {
    console.error('Error ejecutando el seed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
