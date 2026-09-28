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

  const rolColaborador = await prisma.rol.upsert({
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
  // US16: 3 categorías canónicas para cuota social (Cuota Juvenil / General / Senior)
  const categoriasMap = new Map<string, { id: number; nombre: string }>();
  const categorias = [
    { nombre: 'Cuota Juvenil', descripcion: 'Cuota Juvenil' },
    { nombre: 'Cuota General', descripcion: 'Cuota General' },
    { nombre: 'Cuota Senior', descripcion: 'Cuota Senior' },
  ];
  for (const categoria of categorias) {
    const cat = await prisma.categoriaSocio.upsert({
      where: { nombre: categoria.nombre },
      update: {},
      create: categoria,
    });
    categoriasMap.set(cat.nombre, cat);
  }

  // 💰 Base ConfiguracionCuotaSocial (Historial desde 2020 para prevenir Fallback al valor actual)
  for (const cat of categoriasMap.values()) {
    await prisma.configuracionCuotaSocial.upsert({
      where: {
        categoriaId_periodoAplicacion: {
          categoriaId: cat.id,
          periodoAplicacion: '2020-01',
        },
      },
      update: {},
      create: {
        categoriaId: cat.id,
        periodoAplicacion: '2020-01',
        monto: cat.nombre === 'Cuota Juvenil' ? 3000 : cat.nombre === 'Cuota General' ? 5000 : 4000,
        activo: true,
      },
    });
  }


  
  // 📈 Incremento Historico 2025
  for (const cat of categoriasMap.values()) {
    await prisma.configuracionCuotaSocial.upsert({
      where: {
        categoriaId_periodoAplicacion: {
          categoriaId: cat.id,
          periodoAplicacion: '2025-01',
        },
      },
      update: {},
      create: {
        categoriaId: cat.id,
        periodoAplicacion: '2025-01',
        monto: cat.nombre === 'Cuota Juvenil' ? 6000 : cat.nombre === 'Cuota General' ? 10000 : 8000,
        activo: true,
      },
    });
  }

  // ── Migración legacy (solo para BDs previas a US16): 3 categorías antiguas → 3 nuevas
  // Senior/Mayores/Infantil eran las únicas 3 en prod. Tras US16 quedan Cuota Juvenil/General/Senior.
  const legacyMap: Record<string, string> = {
    Senior: 'Cuota General',
    Mayores: 'Cuota Senior',
    Infantil: 'Cuota Juvenil',
  };
  for (const [legacy, nuevo] of Object.entries(legacyMap)) {
    const legacyCat = await prisma.categoriaSocio.findUnique({ where: { nombre: legacy } });
    if (!legacyCat) continue;
    const nuevoCat = categoriasMap.get(nuevo);
    if (!nuevoCat || legacyCat.id === nuevoCat.id) continue;
    await prisma.membresia.updateMany({ where: { categoriaId: legacyCat.id }, data: { categoriaId: nuevoCat.id } });
    await prisma.configuracionCuotaDeportiva.updateMany({
      where: { categoriaId: legacyCat.id },
      data: { categoriaId: nuevoCat.id },
    });
    try {
      await (prisma as any).configuracionCuotaSocial?.updateMany?.({
        where: { categoriaId: legacyCat.id },
        data: { categoriaId: nuevoCat.id },
      });
    } catch {}
    await prisma.categoriaSocio.delete({ where: { id: legacyCat.id } });
    console.log(`  Migrada categoría legacy '${legacy}' -> '${nuevo}'`);
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
            categoriaId: categoriasMap.get('Cuota Senior')!.id,
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
            categoriaId: categoriasMap.get('Cuota General')!.id,
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
            categoriaId: categoriasMap.get('Cuota Senior')!.id,
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
              categoriaId: categoriasMap.get('Cuota Juvenil')!.id,
              activo: false,
              fechaAlta: new Date('2023-01-01'),
              fechaBaja: new Date('2024-01-01'),
            },
            {
              categoriaId: categoriasMap.get('Cuota Senior')!.id,
              activo: true,
              fechaAlta: new Date('2025-01-01'),
              fechaBaja: null,
            },
          ],
        },
      },
    });
  }

  // ── Combinación 7: Usuario con rol COLABORADOR
  const emailColaborador = 'colaborador@socialclub.local';
  let personaColaborador = await prisma.persona.findUnique({ where: { dni: '70000007' } });
  if (!personaColaborador) {
    personaColaborador = await prisma.persona.create({
      data: {
        nombre: 'Franco',
        apellido: 'Colaborador',
        dni: '70000007',
        email: emailColaborador,
      },
    });
  }
  const colaborador = await prisma.usuario.upsert({
    where: { email: emailColaborador },
    update: { personaId: personaColaborador.id },
    create: {
      email: emailColaborador,
      passwordHash,
      nombre: 'Franco',
      apellido: 'Colaborador',
      personaId: personaColaborador.id,
      roles: { create: [{ rolId: rolColaborador.id }] },
    },
  });

  console.log('  Combinaciones de Persona, Usuario y Membresía sembradas exitosamente.');

  // ── Historial de pagos y morosidad controlada ───────────────────────────────
  const generarMeses = (desde: string, hasta: string) => {
    const meses: string[] = [];
    const [yIni, mIni] = desde.split('-').map(Number);
    const [yFin, mFin] = hasta.split('-').map(Number);
    let curY = yIni;
    let curM = mIni;
    while (curY < yFin || (curY === yFin && curM <= mFin)) {
      meses.push(`${curY}-${String(curM).padStart(2, '0')}`);
      curM++;
      if (curM > 12) {
        curM = 1;
        curY++;
      }
    }
    return meses;
  };

  const planPagos = [
    { persona: personaValeria, desde: '2025-01', hasta: '2026-09' }, // Al día
    { persona: personaSocioSinCuenta, desde: '2025-01', hasta: '2026-08' }, // Debe 2026-09 (1 cuota)
    { persona: personaLucia, desde: '2025-03', hasta: '2026-07' }, // Debe 2026-08 y 2026-09 (2 cuotas)
    { persona: personaMartin, desde: '2024-06', hasta: '2026-06' }, // Debe 2026-07, 2026-08 y 2026-09 (3 cuotas)
  ];

  for (const plan of planPagos) {
    if (!plan.persona) continue;
    await prisma.pago.deleteMany({ where: { personaId: plan.persona.id } });

    const periodos = generarMeses(plan.desde, plan.hasta);
    for (const periodo of periodos) {
      await prisma.pago.create({
        data: {
          personaId: plan.persona.id,
          periodo,
          monto: 5000,
          metodoPago: 'EFECTIVO',
          fechaPago: new Date(`${periodo}-10T10:00:00Z`),
        },
      });
    }
  }
  console.log('  Pagos y morosidad sembrados (1 Al día, morosos con 1, 2 y 3 cuotas).');

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
    console.log(`  Usuario colaborador: ${colaborador.email} / contraseña: ${passwordPlano}`);
    console.log('  IMPORTANTE: cambiá esta contraseña fuera del entorno local.');
  } else {
    console.log(`  Usuario admin: ${admin.email} (contraseña oculta en producción)`);
    console.log(`  Usuario colaborador: ${colaborador.email} (contraseña oculta en producción)`);
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
