import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

/**
 * Seed idempotente: puede ejecutarse múltiples veces sin duplicar datos
 * (usa `upsert`). Crea los roles base, una categoría de socio inicial, el
 * usuario administrador con el que el equipo arranca el sistema y un set de
 * eventos de ejemplo (mock).
 *
 * IMPORTANTE: los eventos solo se crean si la tabla está vacía, para no pisar
 * los eventos creados desde la user story de "crear evento".
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

  // ── Categorías de socio (upsert: idempotente) ──────────────────────────────
  const categorias = [
    { nombre: 'Senior', descripcion: 'Socios de la categoría senior' },
    { nombre: 'Mayores', descripcion: 'Socios de la categoría mayores' },
    { nombre: 'Infantil', descripcion: 'Socios de la categoría infantil' },
  ];
  for (const categoria of categorias) {
    await prisma.categoriaSocio.upsert({
      where: { nombre: categoria.nombre },
      update: {},
      create: categoria,
    });
  }

  // ── Disciplinas deportivas (upsert: idempotente) ───────────────────────────
  const disciplinas = [
    { nombre: 'Fútbol Mayor' },
    { nombre: 'Fútbol Femenino' },
    { nombre: 'Jockey Femenino' },
    { nombre: 'Natación' },
    { nombre: 'Pelota Paleta' },
  ];
  for (const disciplina of disciplinas) {
    await prisma.disciplina.upsert({
      where: { nombre: disciplina.nombre },
      update: {},
      create: disciplina,
    });
  }
  console.log(`  ${disciplinas.length} disciplina(s) aseguradas.`);

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

  // ── Mock de eventos ────────────────────────────────────────────────────────
  // Se insertan únicamente si no existe ningún evento, así la futura pantalla
  // de "crear evento" no se ve afectada por datos de ejemplo repetidos.
  const cantidadEventos = await prisma.evento.count();
  if (cantidadEventos === 0) {
    const eventos = [
      {
        nombre: 'Fiesta de Fin de Año',
        descripcion: 'Celebración anual del club con música en vivo y cena.',
        entradasDisponibles: 150,
      },
      {
        nombre: 'Torneo de Fútbol 2026',
        descripcion: 'Torneo interclubes de fútbol 7. Incluye partidos los fines de semana.',
        entradasDisponibles: 80,
      },
      {
        nombre: 'Gran Baile de Carnaval',
        descripcion: 'Noche de disfraces y música de carnaval con bandas locales.',
        entradasDisponibles: 200,
      },
      {
        nombre: 'Show de Stand-Up',
        descripcion: 'Noche de humor con comediantes invitados.',
        entradasDisponibles: 60,
      },
      {
        nombre: 'Clínica de Natación',
        descripcion: 'Jornada de entrenamiento y técnicas de natación para todas las edades.',
        entradasDisponibles: 40,
      },
    ];

    for (const evento of eventos) {
      await prisma.evento.create({ data: evento });
    }
    console.log(`  ${eventos.length} evento(s) de ejemplo creados.`);
  }

  console.log('Seed completado.');
  // La contraseña en texto plano solo se muestra fuera de producción, para no
  // exponerla en los logs del contenedor en entornos productivos.
  if (process.env.NODE_ENV !== 'production') {
    console.log(`  Usuario admin: ${admin.email} / contraseña: ${passwordPlano}`);
    console.log('  IMPORTANTE: cambiá esta contraseña fuera del entorno local.');
  } else {
    console.log(`  Usuario admin: ${admin.email} (contraseña oculta en producción)`);
  }
}

main()
  .catch((error) => {
    console.error('Error ejecutando el seed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
