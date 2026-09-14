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

  const rolSocio = await prisma.rol.upsert({
    where: { nombre: 'SOCIO' },
    update: {},
    create: {
      nombre: 'SOCIO',
      descripcion: 'Socio del club con membresía autogestionada (US-09)',
    },
  });

  // ── Categorías de socio (upsert: idempotente) ──────────────────────────────
  const categoriasMap = new Map<string, { id: number; nombre: string }>();
  const categorias = [
    { nombre: 'Senior', descripcion: 'Socios de la categoría senior' },
    { nombre: 'Mayores', descripcion: 'Socios de la categoría mayores' },
    { nombre: 'Infantil', descripcion: 'Socios de la categoría infantil' },
  ];
  for (const categoria of categorias) {
    const cat = await prisma.categoriaSocio.upsert({
      where: { nombre: categoria.nombre },
      update: {},
      create: categoria,
    });
    categoriasMap.set(cat.nombre, cat);
  }

  // ── Disciplinas deportivas (upsert: idempotente) ───────────────────────────
  const disciplinasMap = new Map<string, { id: number; nombre: string }>();
  const disciplinas = [
    { nombre: 'Fútbol Mayor' },
    { nombre: 'Fútbol Femenino' },
    { nombre: 'Jockey Femenino' },
    { nombre: 'Natación' },
    { nombre: 'Pelota Paleta' },
    { nombre: 'Gimnasio' },
  ];
  for (const disciplina of disciplinas) {
    const disc = await prisma.disciplina.upsert({
      where: { nombre: disciplina.nombre },
      update: {},
      create: disciplina,
    });
    disciplinasMap.set(disc.nombre, disc);
  }
  console.log(`  ${disciplinas.length} disciplina(s) aseguradas.`);

  const emailAdmin = process.env.SEED_ADMIN_EMAIL ?? 'admin@socialclub.local';
  const passwordPlano = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
  const passwordHash = await bcrypt.hash(passwordPlano, SALT_ROUNDS);

  // ── Combinación 1: Administrador con DNI, sin ser socio (Usuario con rol ADMIN, sin Membresia)
  let personaAdmin = await prisma.persona.findUnique({ where: { dni: '10000001' } });
  if (!personaAdmin) {
    personaAdmin = await prisma.persona.create({
      data: {
        nombre: 'Administrador',
        apellido: 'Inicial',
        dni: '10000001',
        email: emailAdmin,
      },
    });
  }

  const admin = await prisma.usuario.upsert({
    where: { email: emailAdmin },
    update: { personaId: personaAdmin.id },
    create: {
      email: emailAdmin,
      passwordHash,
      nombre: 'Administrador',
      apellido: 'Inicial',
      personaId: personaAdmin.id,
      roles: { create: [{ rolId: rolAdmin.id }] },
    },
  });

  // ── Combinación 2: Socio sin cuenta, cargado administrativamente (Persona con DNI y Membresia activa, sin Usuario)
  let personaSocioSinCuenta = await prisma.persona.findUnique({ where: { dni: '20000002' } });
  if (!personaSocioSinCuenta) {
    personaSocioSinCuenta = await prisma.persona.create({
      data: {
        nombre: 'Carlos',
        apellido: 'SinCuenta',
        dni: '20000002',
        email: 'carlos.sincuenta@club.local',
        telefono: '3514445566',
        membresias: {
          create: {
            categoriaId: categoriasMap.get('Mayores')!.id,
            activo: true,
            fechaAlta: new Date('2025-01-10'),
          },
        },
      },
    });
  }

  // ── Combinación 3: Usuario que se registra y luego se hace socio (mismo Persona, se le agrega Membresia)
  const emailLucia = 'lucia.registrada@club.local';
  let personaLucia = await prisma.persona.findUnique({ where: { dni: '30000003' } });
  if (!personaLucia) {
    personaLucia = await prisma.persona.create({
      data: {
        nombre: 'Lucía',
        apellido: 'Registrada',
        dni: '30000003',
        email: emailLucia,
        membresias: {
          create: {
            categoriaId: categoriasMap.get('Senior')!.id,
            activo: true,
            fechaAlta: new Date('2025-03-01'),
          },
        },
      },
    });
  }
  await prisma.usuario.upsert({
    where: { email: emailLucia },
    update: { personaId: personaLucia.id },
    create: {
      email: emailLucia,
      passwordHash,
      nombre: 'Lucía',
      apellido: 'Registrada',
      personaId: personaLucia.id,
      roles: { create: [{ rolId: rolSocio.id }] },
    },
  });

  // ── Combinación 4: Administrador que también es socio (mismo Persona, Usuario ADMIN + Membresia activa, DNI una sola vez)
  const emailMartin = 'martin.adminsocio@socialclub.local';
  let personaMartin = await prisma.persona.findUnique({ where: { dni: '40000004' } });
  if (!personaMartin) {
    personaMartin = await prisma.persona.create({
      data: {
        nombre: 'Martín',
        apellido: 'AdminSocio',
        dni: '40000004',
        email: emailMartin,
        membresias: {
          create: {
            categoriaId: categoriasMap.get('Mayores')!.id,
            activo: true,
            fechaAlta: new Date('2024-06-15'),
          },
        },
      },
    });
  }
  await prisma.usuario.upsert({
    where: { email: emailMartin },
    update: { personaId: personaMartin.id },
    create: {
      email: emailMartin,
      passwordHash,
      nombre: 'Martín',
      apellido: 'AdminSocio',
      personaId: personaMartin.id,
      roles: { create: [{ rolId: rolAdmin.id }, { rolId: rolSocio.id }] },
    },
  });

  // ── Combinación 5: Persona sin cuenta y sin ser socia, pero con una Inscripcion (ej. gimnasio)
  let personaGimnasio = await prisma.persona.findUnique({ where: { dni: '50000005' } });
  if (!personaGimnasio) {
    personaGimnasio = await prisma.persona.create({
      data: {
        nombre: 'Esteban',
        apellido: 'Gimnasio',
        dni: '50000005',
        email: 'esteban.gim@externo.local',
        inscripciones: {
          create: {
            disciplinaId: disciplinasMap.get('Gimnasio')!.id,
            activo: true,
            fechaInscripcion: new Date('2026-02-01'),
          },
        },
      },
    });
  }

  // ── Combinación 6: Persona con una Membresia histórica (activo=false) y otra activa
  let personaValeria = await prisma.persona.findUnique({ where: { dni: '60000006' } });
  if (!personaValeria) {
    personaValeria = await prisma.persona.create({
      data: {
        nombre: 'Valeria',
        apellido: 'Historica',
        dni: '60000006',
        email: 'valeria.historica@club.local',
        membresias: {
          create: [
            {
              categoriaId: categoriasMap.get('Infantil')!.id,
              activo: false,
              fechaAlta: new Date('2023-01-01'),
              fechaBaja: new Date('2024-01-01'),
            },
            {
              categoriaId: categoriasMap.get('Mayores')!.id,
              activo: true,
              fechaAlta: new Date('2025-01-01'),
              fechaBaja: null,
            },
          ],
        },
      },
    });
  }

  console.log('  Combinaciones de Persona, Usuario y Membresía sembradas exitosamente.');

  // ── Mock de eventos ────────────────────────────────────────────────────────
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
