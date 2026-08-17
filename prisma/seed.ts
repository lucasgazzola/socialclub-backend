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
  const rolAdmin = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN', description: 'Acceso completo al sistema' },
  });

  await prisma.role.upsert({
    where: { name: 'COLLABORATOR' },
    update: {},
    create: {
      name: 'COLLABORATOR',
      description: 'Acceso operativo limitado (consulta de socios, asistencia)',
    },
  });

  // ── Categorías de socio (upsert: idempotente) ──────────────────────────────
  const categorias = [
    { name: 'Senior', description: 'Socios de la categoría senior' },
    { name: 'Mayores', description: 'Socios de la categoría mayores' },
    { name: 'Infantil', description: 'Socios de la categoría infantil' },
  ];
  for (const categoria of categorias) {
    await prisma.memberCategory.upsert({
      where: { name: categoria.name },
      update: {},
      create: categoria,
    });
  }

  // ── Disciplinas deportivas (upsert: idempotente) ───────────────────────────
  const disciplinas = [
    { name: 'Fútbol Mayor' },
    { name: 'Fútbol Femenino' },
    { name: 'Jockey Femenino' },
    { name: 'Natación' },
    { name: 'Pelota Paleta' },
  ];
  for (const disciplina of disciplinas) {
    await prisma.discipline.upsert({
      where: { name: disciplina.name },
      update: {},
      create: disciplina,
    });
  }
  console.log(`  ${disciplinas.length} disciplina(s) aseguradas.`);

  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@socialclub.local';
  const passwordPlano = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
  const passwordHash = await bcrypt.hash(passwordPlano, SALT_ROUNDS);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      name: 'Administrador',
      lastName: 'Inicial',
      roles: { create: [{ roleId: rolAdmin.id }] },
    },
  });

  // ── Mock de eventos ────────────────────────────────────────────────────────
  // Se insertan únicamente si no existe ningún evento, así la futura pantalla
  // de "crear evento" no se ve afectada por datos de ejemplo repetidos.
  const cantidadEventos = await prisma.event.count();
  if (cantidadEventos === 0) {
    const eventos = [
      {
        name: 'Fiesta de Fin de Año',
        description: 'Celebración anual del club con música en vivo y cena.',
        availableTickets: 150,
      },
      {
        name: 'Torneo de Fútbol 2026',
        description: 'Torneo interclubes de fútbol 7. Incluye partidos los fines de semana.',
        availableTickets: 80,
      },
      {
        name: 'Gran Baile de Carnaval',
        description: 'Noche de disfraces y música de carnaval con bandas locales.',
        availableTickets: 200,
      },
      {
        name: 'Show de Stand-Up',
        description: 'Noche de humor con comediantes invitados.',
        availableTickets: 60,
      },
      {
        name: 'Clínica de Natación',
        description: 'Jornada de entrenamiento y técnicas de natación para todas las edades.',
        availableTickets: 40,
      },
    ];

    for (const evento of eventos) {
      await prisma.event.create({ data: evento });
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
