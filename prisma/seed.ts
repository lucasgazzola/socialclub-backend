import 'dotenv/config';
import {
  PrismaClient,
  GeneroDisciplina,
  TipoDocumentacionDisciplina,
  EstadoEvento,
  EstadoEntrada,
  EstadoCompraEntrada,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';

/**
 * Seed idempotente: puede ejecutarse múltiples veces sin duplicar datos
 * (usa `upsert` y búsquedas previas).
 *
 * Incluye:
 * - Roles del sistema: ADMIN, COLABORADOR, DELEGADO, SOCIO.
 * - Categorías de socio y configuraciones de cuota social histórica.
 * - Disciplinas con género, restricciones de edad y requerimientos documentales.
 * - Categorías de disciplina (sub-divisiones formativas/competitivas).
 * - Requerimientos documentales (generales y por categoría).
 * - Tarifas de cuota deportiva por disciplina y categoría con descuento a socios (US-20).
 * - Personas y usuarios cubriendo todas las combinaciones del dominio:
 *     1. Admin con DNI, sin membresía
 *     2. Socio sin cuenta (cargado administrativamente)
 *     3. Usuario registrado que luego se hace socio
 *     4. Admin que también es socio
 *     5. Participante no socio con inscripciones a actividades
 *     6. Socia con historial de membresía previa dada de baja
 *     7. Usuario operativo COLABORADOR
 *     8. Usuario operativo DELEGADO
 *     9. Socio menor de edad con documentación y autorización parental
 *    10. Jugadora de fútbol federada socia con cuota deportiva al día
 * - Inscripciones activas y bajas históricas con fechaBaja (US-07 / US-08).
 * - Documentación presentada (vigente y vencida para pruebas de alertas).
 * - Habilitación excepcional por certificado médico en trámite (US-28).
 * - Historial de pagos sociales y deportivos (al día y con morosidad).
 * - Eventos en diversos estados (PUBLICADO, BORRADOR) con compras y entradas QR.
 */
const prisma = new PrismaClient();

const SALT_ROUNDS = 10;

async function main() {
  console.log('Iniciando seed de SocialClub...');

  // ── 1. Roles del sistema ───────────────────────────────────────────────────
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

  const rolDelegado = await prisma.rol.upsert({
    where: { nombre: 'DELEGADO' },
    update: {},
    create: {
      nombre: 'DELEGADO',
      descripcion: 'Delegado de disciplina o actividad deportiva',
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

  console.log('  Roles asegurados: ADMIN, COLABORADOR, DELEGADO, SOCIO.');

  // ── 2. Categorías de socio y cuota social ──────────────────────────────────
  const categoriasMap = new Map<string, { id: number; nombre: string }>();
  const categorias = [
    { nombre: 'Cuota Juvenil', descripcion: 'Cuota Juvenil (hasta 17 años inclusive)' },
    { nombre: 'Cuota General', descripcion: 'Cuota General (adultos de 18 a 60 años)' },
    { nombre: 'Cuota Senior', descripcion: 'Cuota Senior (mayores de 60 años)' },
  ];
  for (const categoria of categorias) {
    const cat = await prisma.categoriaSocio.upsert({
      where: { nombre: categoria.nombre },
      update: { descripcion: categoria.descripcion },
      create: categoria,
    });
    categoriasMap.set(cat.nombre, cat);
  }

  // Base ConfiguracionCuotaSocial (Historial desde 2020)
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

  // Incremento Histórico 2025
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

  // Migración legacy (solo para BDs previas a US16)
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
    await prisma.membresia.updateMany({
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

  // ── 3. Disciplinas deportivas ──────────────────────────────────────────────
  const disciplinasData = [
    {
      nombre: 'Fútbol Mayor',
      descripcion: 'Fútbol masculino libre y veteranos.',
      genero: GeneroDisciplina.MASCULINO,
      edadMinima: 18,
      edadMaxima: null,
      solicitaDocumentacion: true,
      activo: true,
    },
    {
      nombre: 'Fútbol Femenino',
      descripcion: 'Fútbol femenino formativo y primera división.',
      genero: GeneroDisciplina.FEMENINO,
      edadMinima: 13,
      edadMaxima: null,
      solicitaDocumentacion: true,
      activo: true,
    },
    {
      nombre: 'Jockey Femenino',
      descripcion: 'Hockey sobre césped femenino federado y escuelita.',
      genero: GeneroDisciplina.FEMENINO,
      edadMinima: 10,
      edadMaxima: null,
      solicitaDocumentacion: true,
      activo: true,
    },
    {
      nombre: 'Natación',
      descripcion: 'Natación formativa y libre en pileta climatizada.',
      genero: null,
      edadMinima: 4,
      edadMaxima: null,
      solicitaDocumentacion: true,
      activo: true,
    },
    {
      nombre: 'Pelota Paleta',
      descripcion: 'Práctica y torneos de pelota paleta en trinquete.',
      genero: null,
      edadMinima: 16,
      edadMaxima: null,
      solicitaDocumentacion: false,
      activo: true,
    },
    {
      nombre: 'Gimnasio',
      descripcion: 'Sala de aparatos, musculación y cardio funcional.',
      genero: null,
      edadMinima: 14,
      edadMaxima: null,
      solicitaDocumentacion: true,
      activo: true,
    },
    {
      nombre: 'Básquet',
      descripcion: 'Básquet formativo y competitivo.',
      genero: null,
      edadMinima: 8,
      edadMaxima: null,
      solicitaDocumentacion: true,
      activo: true,
    },
  ];

  const disciplinasMap = new Map<string, any>();
  for (const discData of disciplinasData) {
    const disc = await prisma.disciplina.upsert({
      where: { nombre: discData.nombre },
      update: {
        descripcion: discData.descripcion,
        genero: discData.genero,
        edadMinima: discData.edadMinima,
        edadMaxima: discData.edadMaxima,
        solicitaDocumentacion: discData.solicitaDocumentacion,
        activo: discData.activo,
      },
      create: discData,
    });
    disciplinasMap.set(disc.nombre, disc);
  }
  console.log(`  ${disciplinasMap.size} disciplinas deportivas aseguradas.`);

  // ── 4. Categorías de disciplina (US-48 / US-49 / US-05) ────────────────────
  const categoriasDisciplinaData = [
    // Fútbol Mayor
    { disciplina: 'Fútbol Mayor', nombre: 'Primera División', edadMinima: 18, edadMaxima: null, genero: GeneroDisciplina.MASCULINO },
    { disciplina: 'Fútbol Mayor', nombre: 'Reserva', edadMinima: 18, edadMaxima: 23, genero: GeneroDisciplina.MASCULINO },
    { disciplina: 'Fútbol Mayor', nombre: 'Senior (+35)', edadMinima: 35, edadMaxima: null, genero: GeneroDisciplina.MASCULINO },
    // Fútbol Femenino
    { disciplina: 'Fútbol Femenino', nombre: 'Primera Femenina', edadMinima: 17, edadMaxima: null, genero: GeneroDisciplina.FEMENINO },
    { disciplina: 'Fútbol Femenino', nombre: 'Sub-16 Femenina', edadMinima: 13, edadMaxima: 16, genero: GeneroDisciplina.FEMENINO },
    // Jockey Femenino
    { disciplina: 'Jockey Femenino', nombre: 'Primera', edadMinima: 15, edadMaxima: null, genero: GeneroDisciplina.FEMENINO },
    { disciplina: 'Jockey Femenino', nombre: 'Sub-14', edadMinima: 10, edadMaxima: 14, genero: GeneroDisciplina.FEMENINO },
    // Natación
    { disciplina: 'Natación', nombre: 'Escuela Infantil', edadMinima: 4, edadMaxima: 12, genero: null },
    { disciplina: 'Natación', nombre: 'Adultos / Libre', edadMinima: 13, edadMaxima: null, genero: null },
    // Gimnasio
    { disciplina: 'Gimnasio', nombre: 'Pase Libre Musculación', edadMinima: 14, edadMaxima: null, genero: null },
    { disciplina: 'Gimnasio', nombre: 'Entrenamiento Funcional', edadMinima: 14, edadMaxima: null, genero: null },
    // Básquet
    { disciplina: 'Básquet', nombre: 'Mini Básquet', edadMinima: 8, edadMaxima: 12, genero: null },
    { disciplina: 'Básquet', nombre: 'Juveniles', edadMinima: 13, edadMaxima: 18, genero: null },
  ];

  const categoriasDisciplinaMap = new Map<string, any>();
  for (const catData of categoriasDisciplinaData) {
    const disc = disciplinasMap.get(catData.disciplina);
    if (!disc) continue;
    const cat = await prisma.categoriaDisciplina.upsert({
      where: {
        disciplinaId_nombre: {
          disciplinaId: disc.id,
          nombre: catData.nombre,
        },
      },
      update: {
        edadMinima: catData.edadMinima,
        edadMaxima: catData.edadMaxima,
        genero: catData.genero,
        activo: true,
      },
      create: {
        disciplinaId: disc.id,
        nombre: catData.nombre,
        edadMinima: catData.edadMinima,
        edadMaxima: catData.edadMaxima,
        genero: catData.genero,
        activo: true,
      },
    });
    categoriasDisciplinaMap.set(`${catData.disciplina}:${catData.nombre}`, cat);
  }
  console.log(`  ${categoriasDisciplinaMap.size} categorías de disciplina sembradas.`);

  // ── 5. Requerimientos documentales (US-24 / DT-27) ─────────────────────────
  const requerimientosData = [
    // Fútbol Mayor
    { disciplina: 'Fútbol Mayor', categoria: null, tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA, plazoDiasTolerancia: 15 },
    { disciplina: 'Fútbol Mayor', categoria: null, tipoDocumento: TipoDocumentacionDisciplina.SEGURO_COBERTURA_MEDICA, plazoDiasTolerancia: 30 },
    { disciplina: 'Fútbol Mayor', categoria: null, tipoDocumento: TipoDocumentacionDisciplina.DNI, plazoDiasTolerancia: 0 },
    // Fútbol Femenino
    { disciplina: 'Fútbol Femenino', categoria: null, tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA, plazoDiasTolerancia: 15 },
    { disciplina: 'Fútbol Femenino', categoria: null, tipoDocumento: TipoDocumentacionDisciplina.DNI, plazoDiasTolerancia: 0 },
    // Jockey Femenino
    { disciplina: 'Jockey Femenino', categoria: null, tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA, plazoDiasTolerancia: 15 },
    { disciplina: 'Jockey Femenino', categoria: null, tipoDocumento: TipoDocumentacionDisciplina.CARNET_FEDERATIVO_LICENCIA_DEPORTIVA, plazoDiasTolerancia: 30 },
    // Natación
    { disciplina: 'Natación', categoria: null, tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA, plazoDiasTolerancia: 10 },
    { disciplina: 'Natación', categoria: null, tipoDocumento: TipoDocumentacionDisciplina.FICHA_TECNICA_NATACION, plazoDiasTolerancia: 0 },
    // Requisito adicional para Natación - Escuela Infantil
    { disciplina: 'Natación', categoria: 'Escuela Infantil', tipoDocumento: TipoDocumentacionDisciplina.AUTORIZACION_PADRES_TUTORES, plazoDiasTolerancia: 0 },
    // Gimnasio
    { disciplina: 'Gimnasio', categoria: null, tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA, plazoDiasTolerancia: 15 },
    { disciplina: 'Gimnasio', categoria: null, tipoDocumento: TipoDocumentacionDisciplina.FICHA_TECNICA_GIMNASIO_FITNESS, plazoDiasTolerancia: 0 },
    // Básquet
    { disciplina: 'Básquet', categoria: null, tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA, plazoDiasTolerancia: 15 },
  ];

  for (const req of requerimientosData) {
    const disc = disciplinasMap.get(req.disciplina);
    if (!disc) continue;
    const cat = req.categoria ? categoriasDisciplinaMap.get(`${req.disciplina}:${req.categoria}`) : null;
    const categoriaDisciplinaId = cat ? cat.id : null;

    const existente = await prisma.disciplinaRequerimientoDoc.findFirst({
      where: {
        disciplinaId: disc.id,
        categoriaDisciplinaId,
        tipoDocumento: req.tipoDocumento,
      },
    });

    if (existente) {
      await prisma.disciplinaRequerimientoDoc.update({
        where: { id: existente.id },
        data: { plazoDiasTolerancia: req.plazoDiasTolerancia },
      });
    } else {
      await prisma.disciplinaRequerimientoDoc.create({
        data: {
          disciplinaId: disc.id,
          categoriaDisciplinaId,
          tipoDocumento: req.tipoDocumento,
          plazoDiasTolerancia: req.plazoDiasTolerancia,
        },
      });
    }
  }
  console.log(`  ${requerimientosData.length} requerimientos documentales sincronizados.`);

  // ── 6. Tarifas de Cuota Deportiva (US-20 · TASK-33) ────────────────────────
  const cuotasDeportivasData = [
    // Fútbol Mayor
    { disciplina: 'Fútbol Mayor', categoria: null, periodo: '2026-01', monto: 15000, descuentoSocioPorcentaje: 20 },
    { disciplina: 'Fútbol Mayor', categoria: 'Senior (+35)', periodo: '2026-01', monto: 12000, descuentoSocioPorcentaje: 25 },
    // Fútbol Femenino
    { disciplina: 'Fútbol Femenino', categoria: null, periodo: '2026-01', monto: 14000, descuentoSocioPorcentaje: 20 },
    { disciplina: 'Fútbol Femenino', categoria: 'Sub-16 Femenina', periodo: '2026-01', monto: 11000, descuentoSocioPorcentaje: 20 },
    // Jockey Femenino
    { disciplina: 'Jockey Femenino', categoria: null, periodo: '2026-01', monto: 16000, descuentoSocioPorcentaje: 15 },
    // Natación
    { disciplina: 'Natación', categoria: null, periodo: '2026-01', monto: 18000, descuentoSocioPorcentaje: 20 },
    { disciplina: 'Natación', categoria: 'Escuela Infantil', periodo: '2026-01', monto: 13000, descuentoSocioPorcentaje: 15 },
    { disciplina: 'Natación', categoria: 'Adultos / Libre', periodo: '2026-01', monto: 16000, descuentoSocioPorcentaje: 20 },
    // Pelota Paleta
    { disciplina: 'Pelota Paleta', categoria: null, periodo: '2026-01', monto: 10000, descuentoSocioPorcentaje: 10 },
    // Gimnasio
    { disciplina: 'Gimnasio', categoria: null, periodo: '2026-01', monto: 11000, descuentoSocioPorcentaje: 25 },
    { disciplina: 'Gimnasio', categoria: 'Pase Libre Musculación', periodo: '2026-01', monto: 11000, descuentoSocioPorcentaje: 25 },
    { disciplina: 'Gimnasio', categoria: 'Entrenamiento Funcional', periodo: '2026-01', monto: 13500, descuentoSocioPorcentaje: 20 },
    // Básquet
    { disciplina: 'Básquet', categoria: null, periodo: '2026-01', monto: 12000, descuentoSocioPorcentaje: 20 },
  ];

  for (const c of cuotasDeportivasData) {
    const disc = disciplinasMap.get(c.disciplina);
    if (!disc) continue;
    const cat = c.categoria ? categoriasDisciplinaMap.get(`${c.disciplina}:${c.categoria}`) : null;
    const categoriaDisciplinaId = cat ? cat.id : null;

    const existente = await prisma.configuracionCuotaDeportiva.findFirst({
      where: {
        disciplinaId: disc.id,
        categoriaDisciplinaId,
        periodoAplicacion: c.periodo,
      },
    });

    if (existente) {
      await prisma.configuracionCuotaDeportiva.update({
        where: { id: existente.id },
        data: {
          monto: c.monto,
          descuentoSocioPorcentaje: c.descuentoSocioPorcentaje,
          activo: true,
        },
      });
    } else {
      await prisma.configuracionCuotaDeportiva.create({
        data: {
          disciplinaId: disc.id,
          categoriaDisciplinaId,
          periodoAplicacion: c.periodo,
          monto: c.monto,
          descuentoSocioPorcentaje: c.descuentoSocioPorcentaje,
          activo: true,
        },
      });
    }
  }
  console.log(`  ${cuotasDeportivasData.length} tarifas de cuota deportiva configuradas.`);

  // ── 7. Usuarios y Personas del dominio ─────────────────────────────────────
  const emailAdmin = process.env.SEED_ADMIN_EMAIL ?? 'admin@socialclub.local';
  const passwordPlano = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
  const passwordHash = await bcrypt.hash(passwordPlano, SALT_ROUNDS);

  // 7.1. Administrador (Usuario ADMIN, Persona con DNI, sin Membresía)
  let personaAdmin = await prisma.persona.findUnique({ where: { dni: '10000001' } });
  if (!personaAdmin) {
    personaAdmin = await prisma.persona.create({
      data: {
        nombre: 'Administrador',
        apellido: 'Inicial',
        dni: '10000001',
        email: emailAdmin,
        genero: GeneroDisciplina.MASCULINO,
        fechaNacimiento: new Date('1985-05-12'),
      },
    });
  } else {
    personaAdmin = await prisma.persona.update({
      where: { id: personaAdmin.id },
      data: {
        genero: GeneroDisciplina.MASCULINO,
        fechaNacimiento: new Date('1985-05-12'),
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

  // 7.2. Carlos SinCuenta (Persona con Membresía activa, sin cuenta de Usuario)
  let personaSocioSinCuenta = await prisma.persona.findUnique({ where: { dni: '20000002' } });
  if (!personaSocioSinCuenta) {
    personaSocioSinCuenta = await prisma.persona.create({
      data: {
        nombre: 'Carlos',
        apellido: 'SinCuenta',
        dni: '20000002',
        email: 'carlos.sincuenta@club.local',
        telefono: '3514445566',
        genero: GeneroDisciplina.MASCULINO,
        fechaNacimiento: new Date('1965-08-20'),
        membresias: {
          create: {
            categoriaId: categoriasMap.get('Cuota Senior')!.id,
            activo: true,
            fechaAlta: new Date('2025-01-10'),
          },
        },
      },
    });
  } else {
    personaSocioSinCuenta = await prisma.persona.update({
      where: { id: personaSocioSinCuenta.id },
      data: {
        genero: GeneroDisciplina.MASCULINO,
        fechaNacimiento: new Date('1965-08-20'),
      },
    });
  }

  // 7.3. Lucía Registrada (Usuario SOCIO, Membresía activa Cuota General)
  const emailLucia = 'lucia.registrada@club.local';
  let personaLucia = await prisma.persona.findUnique({ where: { dni: '30000003' } });
  if (!personaLucia) {
    personaLucia = await prisma.persona.create({
      data: {
        nombre: 'Lucía',
        apellido: 'Registrada',
        dni: '30000003',
        email: emailLucia,
        genero: GeneroDisciplina.FEMENINO,
        fechaNacimiento: new Date('1998-11-03'),
        membresias: {
          create: {
            categoriaId: categoriasMap.get('Cuota General')!.id,
            activo: true,
            fechaAlta: new Date('2025-03-01'),
          },
        },
      },
    });
  } else {
    personaLucia = await prisma.persona.update({
      where: { id: personaLucia.id },
      data: {
        genero: GeneroDisciplina.FEMENINO,
        fechaNacimiento: new Date('1998-11-03'),
      },
    });
  }
  const usuarioLucia = await prisma.usuario.upsert({
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

  // 7.4. Martín AdminSocio (Usuario con ADMIN + SOCIO y Membresía activa)
  const emailMartin = 'martin.adminsocio@socialclub.local';
  let personaMartin = await prisma.persona.findUnique({ where: { dni: '40000004' } });
  if (!personaMartin) {
    personaMartin = await prisma.persona.create({
      data: {
        nombre: 'Martín',
        apellido: 'AdminSocio',
        dni: '40000004',
        email: emailMartin,
        genero: GeneroDisciplina.MASCULINO,
        fechaNacimiento: new Date('1978-04-15'),
        membresias: {
          create: {
            categoriaId: categoriasMap.get('Cuota Senior')!.id,
            activo: true,
            fechaAlta: new Date('2024-06-15'),
          },
        },
      },
    });
  } else {
    personaMartin = await prisma.persona.update({
      where: { id: personaMartin.id },
      data: {
        genero: GeneroDisciplina.MASCULINO,
        fechaNacimiento: new Date('1978-04-15'),
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

  // 7.5. Esteban Gimnasio (Persona sin cuenta, NO socio, concurre a gimnasio)
  let personaGimnasio = await prisma.persona.findUnique({ where: { dni: '50000005' } });
  if (!personaGimnasio) {
    personaGimnasio = await prisma.persona.create({
      data: {
        nombre: 'Esteban',
        apellido: 'Gimnasio',
        dni: '50000005',
        email: 'esteban.gim@externo.local',
        genero: GeneroDisciplina.MASCULINO,
        fechaNacimiento: new Date('1995-07-22'),
      },
    });
  } else {
    personaGimnasio = await prisma.persona.update({
      where: { id: personaGimnasio.id },
      data: {
        genero: GeneroDisciplina.MASCULINO,
        fechaNacimiento: new Date('1995-07-22'),
      },
    });
  }

  // 7.6. Valeria Histórica (Membresía histórica dada de baja y una activa)
  let personaValeria = await prisma.persona.findUnique({ where: { dni: '60000006' } });
  if (!personaValeria) {
    personaValeria = await prisma.persona.create({
      data: {
        nombre: 'Valeria',
        apellido: 'Historica',
        dni: '60000006',
        email: 'valeria.historica@club.local',
        genero: GeneroDisciplina.FEMENINO,
        fechaNacimiento: new Date('1992-03-30'),
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
  } else {
    personaValeria = await prisma.persona.update({
      where: { id: personaValeria.id },
      data: {
        genero: GeneroDisciplina.FEMENINO,
        fechaNacimiento: new Date('1992-03-30'),
      },
    });
  }

  // 7.7. Franco Colaborador (Usuario con rol COLABORADOR)
  const emailColaborador = 'colaborador@socialclub.local';
  let personaColaborador = await prisma.persona.findUnique({ where: { dni: '70000007' } });
  if (!personaColaborador) {
    personaColaborador = await prisma.persona.create({
      data: {
        nombre: 'Franco',
        apellido: 'Colaborador',
        dni: '70000007',
        email: emailColaborador,
        genero: GeneroDisciplina.MASCULINO,
        fechaNacimiento: new Date('1990-09-10'),
      },
    });
  } else {
    personaColaborador = await prisma.persona.update({
      where: { id: personaColaborador.id },
      data: {
        genero: GeneroDisciplina.MASCULINO,
        fechaNacimiento: new Date('1990-09-10'),
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

  // 7.8. Diego Delegado (Usuario con rol DELEGADO)
  const emailDelegado = 'delegado@socialclub.local';
  let personaDelegado = await prisma.persona.findUnique({ where: { dni: '80000008' } });
  if (!personaDelegado) {
    personaDelegado = await prisma.persona.create({
      data: {
        nombre: 'Diego',
        apellido: 'Delegado',
        dni: '80000008',
        email: emailDelegado,
        genero: GeneroDisciplina.MASCULINO,
        fechaNacimiento: new Date('1988-06-14'),
      },
    });
  } else {
    personaDelegado = await prisma.persona.update({
      where: { id: personaDelegado.id },
      data: {
        genero: GeneroDisciplina.MASCULINO,
        fechaNacimiento: new Date('1988-06-14'),
      },
    });
  }
  const usuarioDelegado = await prisma.usuario.upsert({
    where: { email: emailDelegado },
    update: { personaId: personaDelegado.id },
    create: {
      email: emailDelegado,
      passwordHash,
      nombre: 'Diego',
      apellido: 'Delegado',
      personaId: personaDelegado.id,
      roles: { create: [{ rolId: rolDelegado.id }] },
    },
  });

  // DT-42: el delegado recibe solo las alertas de sus disciplinas. Se asignan
  // únicamente si no tiene ninguna, para no pisar lo que configure un admin.
  const disciplinasDelDelegado = await prisma.delegadoDisciplina.count({
    where: { usuarioId: usuarioDelegado.id },
  });
  if (disciplinasDelDelegado === 0) {
    await prisma.delegadoDisciplina.createMany({
      data: ['Fútbol Mayor', 'Fútbol Femenino', 'Natación'].map((nombre) => ({
        usuarioId: usuarioDelegado.id,
        disciplinaId: disciplinasMap.get(nombre)!.id,
      })),
    });
  }

  // 7.9. Santiago Menor (Socio infantil con Cuota Juvenil)
  let personaSantiago = await prisma.persona.findUnique({ where: { dni: '90000009' } });
  if (!personaSantiago) {
    personaSantiago = await prisma.persona.create({
      data: {
        nombre: 'Santiago',
        apellido: 'Menor',
        dni: '90000009',
        email: 'santiago.menor@familia.local',
        genero: GeneroDisciplina.MASCULINO,
        fechaNacimiento: new Date('2015-04-10'),
        membresias: {
          create: {
            categoriaId: categoriasMap.get('Cuota Juvenil')!.id,
            activo: true,
            fechaAlta: new Date('2026-01-15'),
          },
        },
      },
    });
  } else {
    personaSantiago = await prisma.persona.update({
      where: { id: personaSantiago.id },
      data: {
        genero: GeneroDisciplina.MASCULINO,
        fechaNacimiento: new Date('2015-04-10'),
      },
    });
  }

  // 7.10. Camila Futbolista (Socia con Cuota General y usuario SOCIO)
  const emailCamila = 'camila.futbol@club.local';
  let personaCamila = await prisma.persona.findUnique({ where: { dni: '90000010' } });
  if (!personaCamila) {
    personaCamila = await prisma.persona.create({
      data: {
        nombre: 'Camila',
        apellido: 'Futbolista',
        dni: '90000010',
        email: emailCamila,
        genero: GeneroDisciplina.FEMENINO,
        fechaNacimiento: new Date('2001-09-18'),
        membresias: {
          create: {
            categoriaId: categoriasMap.get('Cuota General')!.id,
            activo: true,
            fechaAlta: new Date('2025-05-01'),
          },
        },
      },
    });
  } else {
    personaCamila = await prisma.persona.update({
      where: { id: personaCamila.id },
      data: {
        genero: GeneroDisciplina.FEMENINO,
        fechaNacimiento: new Date('2001-09-18'),
      },
    });
  }
  await prisma.usuario.upsert({
    where: { email: emailCamila },
    update: { personaId: personaCamila.id },
    create: {
      email: emailCamila,
      passwordHash,
      nombre: 'Camila',
      apellido: 'Futbolista',
      personaId: personaCamila.id,
      roles: { create: [{ rolId: rolSocio.id }] },
    },
  });

  console.log('  10 combinaciones de Persona, Usuario y Membresía sembradas exitosamente.');

  // ── 8. Inscripciones (US-07 · fechaBaja / US-08 · categoría) ───────────────
  const inscripcionesData = [
    // Esteban en Gimnasio (Pase Libre)
    {
      personaId: personaGimnasio.id,
      disciplinaNombre: 'Gimnasio',
      categoriaNombre: 'Pase Libre Musculación',
      fechaInscripcion: new Date('2026-02-01'),
      activo: true,
      fechaBaja: null,
    },
    // Lucía en Natación (Adultos)
    {
      personaId: personaLucia.id,
      disciplinaNombre: 'Natación',
      categoriaNombre: 'Adultos / Libre',
      fechaInscripcion: new Date('2026-03-15'),
      activo: true,
      fechaBaja: null,
    },
    // Carlos en Fútbol Mayor (Senior +35)
    {
      personaId: personaSocioSinCuenta.id,
      disciplinaNombre: 'Fútbol Mayor',
      categoriaNombre: 'Senior (+35)',
      fechaInscripcion: new Date('2025-04-10'),
      activo: true,
      fechaBaja: null,
    },
    // Camila en Fútbol Femenino (Primera)
    {
      personaId: personaCamila.id,
      disciplinaNombre: 'Fútbol Femenino',
      categoriaNombre: 'Primera Femenina',
      fechaInscripcion: new Date('2026-01-20'),
      activo: true,
      fechaBaja: null,
    },
    // Santiago en Natación (Escuela Infantil)
    {
      personaId: personaSantiago.id,
      disciplinaNombre: 'Natación',
      categoriaNombre: 'Escuela Infantil',
      fechaInscripcion: new Date('2026-03-01'),
      activo: true,
      fechaBaja: null,
    },
    // Valeria en Fútbol Femenino (activa)
    {
      personaId: personaValeria.id,
      disciplinaNombre: 'Fútbol Femenino',
      categoriaNombre: 'Primera Femenina',
      fechaInscripcion: new Date('2026-03-01'),
      activo: true,
      fechaBaja: null,
    },
    // Valeria en Pelota Paleta (dada de baja en 2026-02-15)
    {
      personaId: personaValeria.id,
      disciplinaNombre: 'Pelota Paleta',
      categoriaNombre: null,
      fechaInscripcion: new Date('2025-06-01'),
      activo: false,
      fechaBaja: new Date('2026-02-15'),
    },
  ];

  const inscripcionesMap = new Map<string, any>();
  for (const ins of inscripcionesData) {
    const disc = disciplinasMap.get(ins.disciplinaNombre);
    if (!disc) continue;
    const cat = ins.categoriaNombre
      ? categoriasDisciplinaMap.get(`${ins.disciplinaNombre}:${ins.categoriaNombre}`)
      : null;
    const categoriaDisciplinaId = cat ? cat.id : null;

    const inscripcion = await prisma.inscripcion.upsert({
      where: {
        personaId_disciplinaId: {
          personaId: ins.personaId,
          disciplinaId: disc.id,
        },
      },
      update: {
        categoriaDisciplinaId,
        fechaInscripcion: ins.fechaInscripcion,
        activo: ins.activo,
        fechaBaja: ins.fechaBaja,
      },
      create: {
        personaId: ins.personaId,
        disciplinaId: disc.id,
        categoriaDisciplinaId,
        fechaInscripcion: ins.fechaInscripcion,
        activo: ins.activo,
        fechaBaja: ins.fechaBaja,
      },
    });
    inscripcionesMap.set(`${ins.personaId}:${ins.disciplinaNombre}`, inscripcion);
  }
  console.log(`  ${inscripcionesMap.size} inscripciones deportivas sincronizadas.`);

  // ── 9. Documentaciones obligatorias (US-24 / DT-27) ────────────────────────
  const docsData = [
    // Esteban (Gimnasio): Apto médico vigente + Ficha técnica gimnasio vigente
    {
      personaId: personaGimnasio.id,
      tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA,
      tipo: 'Certificado Médico de Aptitud Física 2026',
      fechaVencimiento: new Date('2026-12-31'),
      archivoNombre: 'apto_medico_esteban.pdf',
      archivoRuta: 'documentos/apto_medico_esteban.pdf',
      mimeType: 'application/pdf',
      tamano: 1048576,
    },
    {
      personaId: personaGimnasio.id,
      tipoDocumento: TipoDocumentacionDisciplina.FICHA_TECNICA_GIMNASIO_FITNESS,
      tipo: 'Ficha Técnica de Gimnasio / Musculación',
      fechaVencimiento: new Date('2027-02-01'),
      archivoNombre: 'ficha_gimnasio_esteban.pdf',
      archivoRuta: 'documentos/ficha_gimnasio_esteban.pdf',
      mimeType: 'application/pdf',
      tamano: 524288,
    },
    // Camila (Fútbol Femenino): DNI + Apto médico vigente
    {
      personaId: personaCamila.id,
      tipoDocumento: TipoDocumentacionDisciplina.DNI,
      tipo: 'Documento Nacional de Identidad',
      fechaVencimiento: new Date('2032-01-01'),
      archivoNombre: 'dni_camila.pdf',
      archivoRuta: 'documentos/dni_camila.pdf',
      mimeType: 'application/pdf',
      tamano: 204800,
    },
    {
      personaId: personaCamila.id,
      tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA,
      tipo: 'Certificado Médico de Alta Competencia',
      fechaVencimiento: new Date('2026-11-30'),
      archivoNombre: 'apto_medico_camila.pdf',
      archivoRuta: 'documentos/apto_medico_camila.pdf',
      mimeType: 'application/pdf',
      tamano: 890000,
    },
    // Santiago (Natación Infantil): Apto médico + Ficha natación + Autorización padres
    {
      personaId: personaSantiago.id,
      tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA,
      tipo: 'Certificado Pediátrico de Aptitud Física',
      fechaVencimiento: new Date('2026-12-15'),
      archivoNombre: 'apto_pediatrico_santiago.pdf',
      archivoRuta: 'documentos/apto_pediatrico_santiago.pdf',
      mimeType: 'application/pdf',
      tamano: 650000,
    },
    {
      personaId: personaSantiago.id,
      tipoDocumento: TipoDocumentacionDisciplina.FICHA_TECNICA_NATACION,
      tipo: 'Ficha Técnica de Pileta y Natatorio',
      fechaVencimiento: new Date('2027-03-01'),
      archivoNombre: 'ficha_pileta_santiago.pdf',
      archivoRuta: 'documentos/ficha_pileta_santiago.pdf',
      mimeType: 'application/pdf',
      tamano: 450000,
    },
    {
      personaId: personaSantiago.id,
      tipoDocumento: TipoDocumentacionDisciplina.AUTORIZACION_PADRES_TUTORES,
      tipo: 'Autorización Firmada por Padres/Tutores',
      fechaVencimiento: new Date('2027-03-01'),
      archivoNombre: 'autorizacion_tutores_santiago.pdf',
      archivoRuta: 'documentos/autorizacion_tutores_santiago.pdf',
      mimeType: 'application/pdf',
      tamano: 320000,
    },
    // Lucía (Natación): Ficha técnica vigente + Apto médico VENCIDO (para alertar estado documental)
    {
      personaId: personaLucia.id,
      tipoDocumento: TipoDocumentacionDisciplina.FICHA_TECNICA_NATACION,
      tipo: 'Ficha Técnica de Natación Adultos',
      fechaVencimiento: new Date('2027-03-01'),
      archivoNombre: 'ficha_natacion_lucia.pdf',
      archivoRuta: 'documentos/ficha_natacion_lucia.pdf',
      mimeType: 'application/pdf',
      tamano: 480000,
    },
    {
      personaId: personaLucia.id,
      tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA,
      tipo: 'Certificado Médico 2025 (Vencido)',
      fechaVencimiento: new Date('2026-01-10'),
      archivoNombre: 'apto_vencido_lucia.pdf',
      archivoRuta: 'documentos/apto_vencido_lucia.pdf',
      mimeType: 'application/pdf',
      tamano: 720000,
    },
  ];

  for (const doc of docsData) {
    const existente = await prisma.documentacion.findFirst({
      where: {
        personaId: doc.personaId,
        tipoDocumento: doc.tipoDocumento,
      },
    });

    if (existente) {
      await prisma.documentacion.update({
        where: { id: existente.id },
        data: {
          tipo: doc.tipo,
          fechaVencimiento: doc.fechaVencimiento,
          archivoNombre: doc.archivoNombre,
          archivoRuta: doc.archivoRuta,
          mimeType: doc.mimeType,
          tamano: doc.tamano,
        },
      });
    } else {
      await prisma.documentacion.create({ data: doc });
    }
  }
  console.log(`  ${docsData.length} documentaciones sincronizadas.`);

  // ── 10. Habilitación Excepcional (US-28) ────────────────────────────────────
  // Lucía tiene el certificado médico vencido, pero cuenta con habilitación excepcional
  const inscripcionLuciaNatacion = inscripcionesMap.get(`${personaLucia.id}:Natación`);
  if (inscripcionLuciaNatacion) {
    const habExistente = await prisma.habilitacionExcepcional.findFirst({
      where: { inscripcionId: inscripcionLuciaNatacion.id },
    });
    if (!habExistente) {
      await prisma.habilitacionExcepcional.create({
        data: {
          inscripcionId: inscripcionLuciaNatacion.id,
          motivo: 'Turno de ergometría médica reprogramado por la clínica para el 25/10/2026.',
          hasta: new Date('2026-10-31T23:59:59Z'),
          responsableId: admin.id,
        },
      });
      console.log('  Habilitación excepcional sembrada para Lucía en Natación.');
    }
  }

  // ── 11. Historial de pagos de cuota social y morosidad ─────────────────────
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

  const planPagosSociales = [
    { persona: personaValeria, desde: '2025-01', hasta: '2026-09' }, // Al día
    { persona: personaCamila, desde: '2025-05', hasta: '2026-09' }, // Al día
    { persona: personaSantiago, desde: '2026-01', hasta: '2026-09' }, // Al día
    { persona: personaSocioSinCuenta, desde: '2025-01', hasta: '2026-08' }, // Debe 2026-09 (1 cuota)
    { persona: personaLucia, desde: '2025-03', hasta: '2026-07' }, // Debe 2026-08 y 2026-09 (2 cuotas)
    { persona: personaMartin, desde: '2024-06', hasta: '2026-06' }, // Debe 2026-07, 2026-08 y 2026-09 (3 cuotas)
  ];

  for (const plan of planPagosSociales) {
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
  console.log('  Pagos sociales y morosidad sembrados (socios al día y con 1, 2 y 3 cuotas adeudadas).');

  // ── 12. Pagos de Cuota Deportiva (US-21) ───────────────────────────────────
  const pagosDeportivosData = [
    // Carlos SinCuenta en Fútbol Mayor (Senior +35): pagó 2026-08 y 2026-09
    {
      personaId: personaSocioSinCuenta.id,
      disciplinaNombre: 'Fútbol Mayor',
      periodo: '2026-08',
      monto: 9000, // $12000 con 25% descuento de socio = $9000
      metodoPago: 'EFECTIVO',
      fechaPago: new Date('2026-08-05T11:00:00Z'),
      responsableId: admin.id,
    },
    {
      personaId: personaSocioSinCuenta.id,
      disciplinaNombre: 'Fútbol Mayor',
      periodo: '2026-09',
      monto: 9000,
      metodoPago: 'TRANSFERENCIA',
      fechaPago: new Date('2026-09-06T10:30:00Z'),
      responsableId: colaborador.id,
    },
    // Camila Futbolista en Fútbol Femenino: pagó 2026-08 y 2026-09 con descuento de socia (20% de $14000 = $11200)
    {
      personaId: personaCamila.id,
      disciplinaNombre: 'Fútbol Femenino',
      periodo: '2026-08',
      monto: 11200,
      metodoPago: 'TRANSFERENCIA',
      fechaPago: new Date('2026-08-10T16:00:00Z'),
      responsableId: admin.id,
    },
    {
      personaId: personaCamila.id,
      disciplinaNombre: 'Fútbol Femenino',
      periodo: '2026-09',
      monto: 11200,
      metodoPago: 'TRANSFERENCIA',
      fechaPago: new Date('2026-09-10T15:45:00Z'),
      responsableId: admin.id,
    },
    // Esteban Gimnasio en Gimnasio: no es socio, pagó tarifa base ($11000) en 2026-08; debe 2026-09
    {
      personaId: personaGimnasio.id,
      disciplinaNombre: 'Gimnasio',
      periodo: '2026-08',
      monto: 11000,
      metodoPago: 'EFECTIVO',
      fechaPago: new Date('2026-08-02T18:00:00Z'),
      responsableId: colaborador.id,
    },
  ];

  for (const pagoDep of pagosDeportivosData) {
    const disc = disciplinasMap.get(pagoDep.disciplinaNombre);
    if (!disc) continue;

    await prisma.pagoCuotaDeportiva.upsert({
      where: {
        personaId_disciplinaId_periodo: {
          personaId: pagoDep.personaId,
          disciplinaId: disc.id,
          periodo: pagoDep.periodo,
        },
      },
      update: {
        monto: pagoDep.monto,
        metodoPago: pagoDep.metodoPago,
        fechaPago: pagoDep.fechaPago,
        responsableId: pagoDep.responsableId,
      },
      create: {
        personaId: pagoDep.personaId,
        disciplinaId: disc.id,
        periodo: pagoDep.periodo,
        monto: pagoDep.monto,
        metodoPago: pagoDep.metodoPago,
        fechaPago: pagoDep.fechaPago,
        responsableId: pagoDep.responsableId,
      },
    });
  }
  console.log(`  ${pagosDeportivosData.length} pagos de cuota deportiva registrados.`);

  // ── 13. Mock de eventos y entradas con código QR (US-29 / US-31 / US-52) ──
  const cantidadEventos = await prisma.evento.count();
  if (cantidadEventos === 0) {
    const eventosData = [
      {
        nombre: 'Torneo de Pádel Abierto 2026',
        descripcion: 'Torneo de pádel dobles masculino y femenino con premios y catering.',
        requiereEntrada: true,
        entradasDisponibles: 50,
        capacidadMaxima: 60,
        fechaEvento: new Date('2026-11-15T15:00:00Z'),
        fechaFin: new Date('2026-11-15T21:00:00Z'),
        imagen: null,
        lugarAcreditacion: 'Canchas de pádel central',
        precio: 2500,
        descuentoSocio: 20,
        estado: EstadoEvento.PUBLICADO,
        inicioVenta: new Date('2026-09-01T00:00:00Z'),
        finVenta: new Date('2026-11-15T14:00:00Z'),
      },
      {
        nombre: 'Fiesta de Fin de Año',
        descripcion: 'Celebración anual del club con cena show, música en vivo y brindis.',
        requiereEntrada: true,
        entradasDisponibles: 148,
        capacidadMaxima: 150,
        fechaEvento: new Date('2026-12-20T21:00:00Z'),
        fechaFin: new Date('2026-12-21T04:00:00Z'),
        imagen: null,
        lugarAcreditacion: 'Salón principal',
        precio: 5000,
        descuentoSocio: 10,
        estado: EstadoEvento.PUBLICADO,
        inicioVenta: new Date('2026-09-01T00:00:00Z'),
        finVenta: new Date('2026-12-20T20:00:00Z'),
      },
      {
        nombre: 'Torneo de Fútbol Interclubes 2026',
        descripcion: 'Torneo interclubes de fútbol 7. Incluye fixture y premiación.',
        requiereEntrada: true,
        entradasDisponibles: 79,
        capacidadMaxima: 80,
        fechaEvento: new Date('2026-11-15T09:00:00Z'),
        fechaFin: new Date('2026-11-15T18:00:00Z'),
        imagen: null,
        lugarAcreditacion: 'Predio deportivo central',
        precio: 2500,
        descuentoSocio: 15,
        estado: EstadoEvento.PUBLICADO,
        inicioVenta: new Date('2026-09-01T00:00:00Z'),
        finVenta: new Date('2026-11-15T08:00:00Z'),
      },
      {
        nombre: 'Jornada Abierta de Yoga y Meditación',
        descripcion: 'Encuentro al aire libre en los jardines del club. Evento de acceso libre sin inscripción.',
        requiereEntrada: false,
        entradasDisponibles: null,
        capacidadMaxima: null,
        fechaEvento: new Date('2026-11-28T10:00:00Z'),
        fechaFin: new Date('2026-11-28T13:00:00Z'),
        imagen: null,
        lugarAcreditacion: 'Jardines del club',
        precio: 0,
        descuentoSocio: 0,
        estado: EstadoEvento.PUBLICADO,
        inicioVenta: null,
        finVenta: null,
      },
      {
        nombre: 'Cena de Gala de Socios',
        descripcion: 'Cena anual exclusiva para socios con entrega de distinciones deportivas.',
        requiereEntrada: true,
        entradasDisponibles: 0,
        capacidadMaxima: 100,
        fechaEvento: new Date('2026-12-05T21:00:00Z'),
        fechaFin: new Date('2026-12-06T02:00:00Z'),
        imagen: null,
        lugarAcreditacion: 'Salón de honores',
        precio: 4500,
        descuentoSocio: 100,
        estado: EstadoEvento.PUBLICADO,
        inicioVenta: new Date('2026-09-01T00:00:00Z'),
        finVenta: new Date('2026-12-05T20:00:00Z'),
      },
      {
        nombre: 'Clase Abierta de Natación y Aquagym',
        descripcion: 'Jornada gratuita participativa para todas las edades en la pileta climatizada.',
        requiereEntrada: true,
        entradasDisponibles: 40,
        capacidadMaxima: 40,
        fechaEvento: new Date('2027-01-10T10:00:00Z'),
        fechaFin: new Date('2027-01-10T13:00:00Z'),
        imagen: null,
        lugarAcreditacion: 'Natatorio techado',
        precio: 0,
        descuentoSocio: 0,
        estado: EstadoEvento.PUBLICADO,
        inicioVenta: new Date('2026-12-01T00:00:00Z'),
        finVenta: new Date('2027-01-10T09:00:00Z'),
      },
      {
        nombre: 'Torneo de Tenis Nocturno',
        descripcion: 'Competición nocturna bajo luces LED con hidratación y fruta para competidores.',
        requiereEntrada: true,
        entradasDisponibles: 20,
        capacidadMaxima: 30,
        fechaEvento: new Date('2026-10-20T19:00:00Z'),
        fechaFin: new Date('2026-10-20T23:00:00Z'),
        imagen: null,
        lugarAcreditacion: 'Canchas de polvo de ladrillo',
        precio: 3000,
        descuentoSocio: 10,
        estado: EstadoEvento.PUBLICADO,
        inicioVenta: new Date('2026-09-01T00:00:00Z'),
        finVenta: new Date('2026-09-30T23:59:59Z'),
      },
      {
        nombre: 'Festival Deportivo y Cultural Primaveral',
        descripcion: 'Jornada multidisciplinaria de deportes, música en vivo y gastronomía.',
        requiereEntrada: true,
        entradasDisponibles: 15,
        capacidadMaxima: 200,
        fechaEvento: new Date('2026-10-01T09:00:00Z'),
        fechaFin: new Date('2026-10-10T22:00:00Z'),
        imagen: null,
        lugarAcreditacion: 'Plaza central del club',
        precio: 1500,
        descuentoSocio: 0,
        estado: EstadoEvento.PUBLICADO,
        inicioVenta: new Date('2026-09-01T00:00:00Z'),
        finVenta: new Date('2026-10-05T18:00:00Z'),
      },
      {
        nombre: 'Torneo de Ajedrez Relámpago',
        descripcion: 'Competencia rápida por sistema suizo a 7 rondas.',
        requiereEntrada: true,
        entradasDisponibles: 0,
        capacidadMaxima: 30,
        fechaEvento: new Date('2026-08-15T14:00:00Z'),
        fechaFin: new Date('2026-08-15T20:00:00Z'),
        imagen: null,
        lugarAcreditacion: 'Biblioteca del club',
        precio: 1000,
        descuentoSocio: 0,
        estado: EstadoEvento.FINALIZADO,
        inicioVenta: new Date('2026-07-01T00:00:00Z'),
        finVenta: new Date('2026-08-15T13:00:00Z'),
      },
      {
        nombre: 'Maratón Anual 10K del Club',
        descripcion: 'Carrera urbana de 10k y caminata recreativa de 3k por el parque (cancelada por remodelaciones).',
        requiereEntrada: true,
        entradasDisponibles: 50,
        capacidadMaxima: 100,
        fechaEvento: new Date('2026-11-01T08:00:00Z'),
        fechaFin: new Date('2026-11-01T12:00:00Z'),
        imagen: null,
        lugarAcreditacion: 'Acceso principal',
        precio: 2000,
        descuentoSocio: 50,
        estado: EstadoEvento.CANCELADO,
        inicioVenta: new Date('2026-09-01T00:00:00Z'),
        finVenta: new Date('2026-11-01T07:00:00Z'),
      },
      {
        nombre: 'Exhibición de Gimnasia Rítmica',
        descripcion: 'Muestra gimnástica de cierre de temporada de las categorías juveniles.',
        requiereEntrada: true,
        entradasDisponibles: 80,
        capacidadMaxima: 80,
        fechaEvento: new Date('2026-12-15T18:00:00Z'),
        fechaFin: new Date('2026-12-15T21:00:00Z'),
        imagen: null,
        lugarAcreditacion: 'Gimnasio multiuso',
        precio: 1200,
        descuentoSocio: 0,
        estado: EstadoEvento.BORRADOR,
        inicioVenta: new Date('2026-11-01T00:00:00Z'),
        finVenta: new Date('2026-12-15T17:00:00Z'),
      },
    ];

    for (const ev of eventosData) {
      await prisma.evento.create({ data: ev });
    }
    console.log(`  ${eventosData.length} eventos de ejemplo creados.`);

    // Crear compra de ejemplo para Lucía en Fiesta de Fin de Año y Torneo de Fútbol
    const eventoFiesta = await prisma.evento.findFirst({
      where: { nombre: 'Fiesta de Fin de Año' },
    });
    if (eventoFiesta) {
      const compraFiesta = await prisma.compraEntrada.create({
        data: {
          usuarioId: usuarioLucia.id,
          eventoId: eventoFiesta.id,
          cantidad: 2,
          precioUnitario: 5000,
          montoTotal: 10000,
          estado: EstadoCompraEntrada.APROBADA,
          metodoPago: 'MOCK_TARJETA',
        },
      });

      // Entrada 1: VÁLIDA
      await prisma.entrada.create({
        data: {
          token: randomUUID(),
          eventoId: eventoFiesta.id,
          compraId: compraFiesta.id,
          estado: EstadoEntrada.VALIDA,
        },
      });

      // Entrada 2: USADA (para probar control de acceso QR)
      await prisma.entrada.create({
        data: {
          token: randomUUID(),
          eventoId: eventoFiesta.id,
          compraId: compraFiesta.id,
          estado: EstadoEntrada.USADA,
        },
      });
      console.log('  2 entradas con QR sembradas para Lucía en Fiesta de Fin de Año (1 VALIDA, 1 USADA).');
    }

    const eventoTorneo = await prisma.evento.findFirst({
      where: { nombre: 'Torneo de Fútbol Interclubes 2026' },
    });
    if (eventoTorneo) {
      const compraTorneo = await prisma.compraEntrada.create({
        data: {
          usuarioId: usuarioLucia.id,
          eventoId: eventoTorneo.id,
          cantidad: 1,
          precioUnitario: 2500,
          montoTotal: 2500,
          estado: EstadoCompraEntrada.APROBADA,
          metodoPago: 'MOCK_TARJETA',
        },
      });

      await prisma.entrada.create({
        data: {
          token: randomUUID(),
          eventoId: eventoTorneo.id,
          compraId: compraTorneo.id,
          estado: EstadoEntrada.VALIDA,
        },
      });
      console.log('  1 entrada con QR sembrada para Lucía en Torneo de Fútbol (VALIDA).');
    }
  }

  console.log('\nSeed completado exitosamente.');
  if (process.env.NODE_ENV !== 'production') {
    console.log(`  Usuario ADMIN:       ${admin.email} / ${passwordPlano}`);
    console.log(`  Usuario COLABORADOR: ${colaborador.email} / ${passwordPlano}`);
    console.log(`  Usuario DELEGADO:    ${usuarioDelegado.email} / ${passwordPlano}`);
    console.log(`  Usuario SOCIO:       ${usuarioLucia.email} / ${passwordPlano}`);
    console.log(`  Usuario SOCIO:       ${emailCamila} / ${passwordPlano}`);
    console.log('  IMPORTANTE: cambiá estas contraseñas fuera del entorno local.');
  } else {
    console.log(`  Usuario ADMIN:       ${admin.email} (contraseña oculta en producción)`);
    console.log(`  Usuario COLABORADOR: ${colaborador.email} (contraseña oculta en producción)`);
    console.log(`  Usuario DELEGADO:    ${usuarioDelegado.email} (contraseña oculta en producción)`);
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

