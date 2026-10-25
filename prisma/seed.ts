import 'dotenv/config';
import {
  PrismaClient,
  GeneroDisciplina,
  TipoDocumentacionDisciplina,
  EstadoEvento,
  EstadoEntrada,
  EstadoCompraEntrada,
  Persona,
  Inscripcion,
  Disciplina,
  CategoriaDisciplina,
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
        monto:
          cat.nombre === 'Cuota Juvenil' ? 6000 : cat.nombre === 'Cuota General' ? 10000 : 8000,
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
    } catch {
      // Ignorar si el modelo legacy no existe
    }
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

  const disciplinasMap = new Map<string, Disciplina>();
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
    {
      disciplina: 'Fútbol Mayor',
      nombre: 'Primera División',
      edadMinima: 18,
      edadMaxima: null,
      genero: GeneroDisciplina.MASCULINO,
    },
    {
      disciplina: 'Fútbol Mayor',
      nombre: 'Reserva',
      edadMinima: 18,
      edadMaxima: 23,
      genero: GeneroDisciplina.MASCULINO,
    },
    {
      disciplina: 'Fútbol Mayor',
      nombre: 'Senior (+35)',
      edadMinima: 35,
      edadMaxima: null,
      genero: GeneroDisciplina.MASCULINO,
    },
    // Fútbol Femenino
    {
      disciplina: 'Fútbol Femenino',
      nombre: 'Primera Femenina',
      edadMinima: 17,
      edadMaxima: null,
      genero: GeneroDisciplina.FEMENINO,
    },
    {
      disciplina: 'Fútbol Femenino',
      nombre: 'Sub-16 Femenina',
      edadMinima: 13,
      edadMaxima: 16,
      genero: GeneroDisciplina.FEMENINO,
    },
    // Jockey Femenino
    {
      disciplina: 'Jockey Femenino',
      nombre: 'Primera',
      edadMinima: 15,
      edadMaxima: null,
      genero: GeneroDisciplina.FEMENINO,
    },
    {
      disciplina: 'Jockey Femenino',
      nombre: 'Sub-14',
      edadMinima: 10,
      edadMaxima: 14,
      genero: GeneroDisciplina.FEMENINO,
    },
    // Natación
    {
      disciplina: 'Natación',
      nombre: 'Escuela Infantil',
      edadMinima: 4,
      edadMaxima: 12,
      genero: null,
    },
    {
      disciplina: 'Natación',
      nombre: 'Adultos / Libre',
      edadMinima: 13,
      edadMaxima: null,
      genero: null,
    },
    // Gimnasio
    {
      disciplina: 'Gimnasio',
      nombre: 'Pase Libre Musculación',
      edadMinima: 14,
      edadMaxima: null,
      genero: null,
    },
    {
      disciplina: 'Gimnasio',
      nombre: 'Entrenamiento Funcional',
      edadMinima: 14,
      edadMaxima: null,
      genero: null,
    },
    // Básquet
    { disciplina: 'Básquet', nombre: 'Mini Básquet', edadMinima: 8, edadMaxima: 12, genero: null },
    { disciplina: 'Básquet', nombre: 'Juveniles', edadMinima: 13, edadMaxima: 18, genero: null },
  ];

  const categoriasDisciplinaMap = new Map<string, CategoriaDisciplina>();
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
    {
      disciplina: 'Fútbol Mayor',
      categoria: null,
      tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA,
      plazoDiasTolerancia: 15,
    },
    {
      disciplina: 'Fútbol Mayor',
      categoria: null,
      tipoDocumento: TipoDocumentacionDisciplina.SEGURO_COBERTURA_MEDICA,
      plazoDiasTolerancia: 30,
    },
    {
      disciplina: 'Fútbol Mayor',
      categoria: null,
      tipoDocumento: TipoDocumentacionDisciplina.DNI,
      plazoDiasTolerancia: 0,
    },
    // Fútbol Femenino
    {
      disciplina: 'Fútbol Femenino',
      categoria: null,
      tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA,
      plazoDiasTolerancia: 15,
    },
    {
      disciplina: 'Fútbol Femenino',
      categoria: null,
      tipoDocumento: TipoDocumentacionDisciplina.DNI,
      plazoDiasTolerancia: 0,
    },
    // Jockey Femenino
    {
      disciplina: 'Jockey Femenino',
      categoria: null,
      tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA,
      plazoDiasTolerancia: 15,
    },
    {
      disciplina: 'Jockey Femenino',
      categoria: null,
      tipoDocumento: TipoDocumentacionDisciplina.CARNET_FEDERATIVO_LICENCIA_DEPORTIVA,
      plazoDiasTolerancia: 30,
    },
    // Natación
    {
      disciplina: 'Natación',
      categoria: null,
      tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA,
      plazoDiasTolerancia: 10,
    },
    {
      disciplina: 'Natación',
      categoria: null,
      tipoDocumento: TipoDocumentacionDisciplina.FICHA_TECNICA_NATACION,
      plazoDiasTolerancia: 0,
    },
    // Requisito adicional para Natación - Escuela Infantil
    {
      disciplina: 'Natación',
      categoria: 'Escuela Infantil',
      tipoDocumento: TipoDocumentacionDisciplina.AUTORIZACION_PADRES_TUTORES,
      plazoDiasTolerancia: 0,
    },
    // Gimnasio
    {
      disciplina: 'Gimnasio',
      categoria: null,
      tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA,
      plazoDiasTolerancia: 15,
    },
    {
      disciplina: 'Gimnasio',
      categoria: null,
      tipoDocumento: TipoDocumentacionDisciplina.FICHA_TECNICA_GIMNASIO_FITNESS,
      plazoDiasTolerancia: 0,
    },
    // Básquet
    {
      disciplina: 'Básquet',
      categoria: null,
      tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA,
      plazoDiasTolerancia: 15,
    },
  ];

  for (const req of requerimientosData) {
    const disc = disciplinasMap.get(req.disciplina);
    if (!disc) continue;
    const cat = req.categoria
      ? categoriasDisciplinaMap.get(`${req.disciplina}:${req.categoria}`)
      : null;
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
    {
      disciplina: 'Fútbol Mayor',
      categoria: null,
      periodo: '2026-01',
      monto: 15000,
      descuentoSocioPorcentaje: 20,
    },
    {
      disciplina: 'Fútbol Mayor',
      categoria: 'Senior (+35)',
      periodo: '2026-01',
      monto: 12000,
      descuentoSocioPorcentaje: 25,
    },
    // Fútbol Femenino
    {
      disciplina: 'Fútbol Femenino',
      categoria: null,
      periodo: '2026-01',
      monto: 14000,
      descuentoSocioPorcentaje: 20,
    },
    {
      disciplina: 'Fútbol Femenino',
      categoria: 'Sub-16 Femenina',
      periodo: '2026-01',
      monto: 11000,
      descuentoSocioPorcentaje: 20,
    },
    // Jockey Femenino
    {
      disciplina: 'Jockey Femenino',
      categoria: null,
      periodo: '2026-01',
      monto: 16000,
      descuentoSocioPorcentaje: 15,
    },
    // Natación
    {
      disciplina: 'Natación',
      categoria: null,
      periodo: '2026-01',
      monto: 18000,
      descuentoSocioPorcentaje: 20,
    },
    {
      disciplina: 'Natación',
      categoria: 'Escuela Infantil',
      periodo: '2026-01',
      monto: 13000,
      descuentoSocioPorcentaje: 15,
    },
    {
      disciplina: 'Natación',
      categoria: 'Adultos / Libre',
      periodo: '2026-01',
      monto: 16000,
      descuentoSocioPorcentaje: 20,
    },
    // Pelota Paleta
    {
      disciplina: 'Pelota Paleta',
      categoria: null,
      periodo: '2026-01',
      monto: 10000,
      descuentoSocioPorcentaje: 10,
    },
    // Gimnasio
    {
      disciplina: 'Gimnasio',
      categoria: null,
      periodo: '2026-01',
      monto: 11000,
      descuentoSocioPorcentaje: 25,
    },
    {
      disciplina: 'Gimnasio',
      categoria: 'Pase Libre Musculación',
      periodo: '2026-01',
      monto: 11000,
      descuentoSocioPorcentaje: 25,
    },
    {
      disciplina: 'Gimnasio',
      categoria: 'Entrenamiento Funcional',
      periodo: '2026-01',
      monto: 13500,
      descuentoSocioPorcentaje: 20,
    },
    // Básquet
    {
      disciplina: 'Básquet',
      categoria: null,
      periodo: '2026-01',
      monto: 12000,
      descuentoSocioPorcentaje: 20,
    },
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

  // 7.11. Roberto Moroso (Socio con 10 meses de morosidad de cuota social - US-19)
  const emailRoberto = 'roberto.moroso@socialclub.local';
  let personaRoberto = await prisma.persona.findUnique({ where: { dni: '70000011' } });
  if (!personaRoberto) {
    personaRoberto = await prisma.persona.create({
      data: {
        nombre: 'Roberto',
        apellido: 'MorosoDiezMeses',
        dni: '70000011',
        email: emailRoberto,
        genero: GeneroDisciplina.MASCULINO,
        fechaNacimiento: new Date('1985-06-20'),
        membresias: {
          create: {
            categoriaId: categoriasMap.get('Cuota General')!.id,
            activo: true,
            fechaAlta: new Date('2025-01-01'),
          },
        },
      },
    });
  } else {
    personaRoberto = await prisma.persona.update({
      where: { id: personaRoberto.id },
      data: {
        genero: GeneroDisciplina.MASCULINO,
        fechaNacimiento: new Date('1985-06-20'),
      },
    });
  }
  await prisma.usuario.upsert({
    where: { email: emailRoberto },
    update: { personaId: personaRoberto.id },
    create: {
      email: emailRoberto,
      passwordHash,
      nombre: 'Roberto',
      apellido: 'MorosoDiezMeses',
      personaId: personaRoberto.id,
      roles: { create: [{ rolId: rolSocio.id }] },
    },
  });

  // Mapa centralizado de Personas por DNI para vincular inscripciones, documentaciones y pagos
  const personasMap = new Map<string, Persona>();
  personasMap.set('10000001', personaAdmin);
  personasMap.set('20000002', personaSocioSinCuenta);
  personasMap.set('30000003', personaLucia);
  personasMap.set('40000004', personaMartin);
  personasMap.set('50000005', personaGimnasio);
  personasMap.set('60000006', personaValeria);
  personasMap.set('70000007', personaColaborador);
  personasMap.set('80000008', personaDelegado);
  personasMap.set('90000009', personaSantiago);
  personasMap.set('90000010', personaCamila);
  personasMap.set('70000011', personaRoberto);

  // 7.12 a 7.35. Ampliación de Personas, Socios y Usuarios (mínimo ~20 de cada entidad)
  interface SeedPersonaUsuarioData {
    dni: string;
    nombre: string;
    apellido: string;
    email: string;
    telefono?: string;
    genero: GeneroDisciplina;
    fechaNacimiento: Date;
    membresias?: {
      categoria: 'Cuota Juvenil' | 'Cuota General' | 'Cuota Senior';
      activo: boolean;
      fechaAlta: Date;
      fechaBaja?: Date | null;
    }[];
    usuario?: {
      roles: ('ADMIN' | 'COLABORADOR' | 'DELEGADO' | 'SOCIO')[];
      activo?: boolean;
      disciplinasDelegadas?: string[];
    };
  }

  const nuevasPersonasData: SeedPersonaUsuarioData[] = [
    // 7.12. Mariana Colaboradora (Personal operativo del club)
    {
      dni: '70000012',
      nombre: 'Mariana',
      apellido: 'Colaboradora',
      email: 'mariana.colaboradora@socialclub.local',
      telefono: '3515551212',
      genero: GeneroDisciplina.FEMENINO,
      fechaNacimiento: new Date('1993-04-18'),
      usuario: { roles: ['COLABORADOR'], activo: true },
    },
    // 7.13. Pablo Delegado (Delegado a cargo de Básquet y Gimnasio)
    {
      dni: '80000013',
      nombre: 'Pablo',
      apellido: 'Delegado',
      email: 'pablo.delegado@socialclub.local',
      telefono: '3515551313',
      genero: GeneroDisciplina.MASCULINO,
      fechaNacimiento: new Date('1986-11-25'),
      usuario: {
        roles: ['DELEGADO'],
        activo: true,
        disciplinasDelegadas: ['Básquet', 'Gimnasio'],
      },
    },
    // 7.14. Julián Gómez (Socio activo Cuota General, jugador de Reserva en Fútbol Mayor)
    {
      dni: '30000014',
      nombre: 'Julián',
      apellido: 'Gómez',
      email: 'julian.gomez@club.local',
      telefono: '3515551414',
      genero: GeneroDisciplina.MASCULINO,
      fechaNacimiento: new Date('1996-08-14'),
      membresias: [
        {
          categoria: 'Cuota General',
          activo: true,
          fechaAlta: new Date('2025-02-10'),
        },
      ],
      usuario: { roles: ['SOCIO'], activo: true },
    },
    // 7.15. Sofía Martínez (Socia activa Cuota General, jugadora de Jockey Femenino Primera)
    {
      dni: '30000015',
      nombre: 'Sofía',
      apellido: 'Martínez',
      email: 'sofia.martinez@club.local',
      telefono: '3515551515',
      genero: GeneroDisciplina.FEMENINO,
      fechaNacimiento: new Date('1999-03-22'),
      membresias: [
        {
          categoria: 'Cuota General',
          activo: true,
          fechaAlta: new Date('2025-04-01'),
        },
      ],
      usuario: { roles: ['SOCIO'], activo: true },
    },
    // 7.16. Mateo Rossi (Socio activo Cuota General, practica Pelota Paleta)
    {
      dni: '30000016',
      nombre: 'Mateo',
      apellido: 'Rossi',
      email: 'mateo.rossi@club.local',
      telefono: '3515551616',
      genero: GeneroDisciplina.MASCULINO,
      fechaNacimiento: new Date('1994-12-05'),
      membresias: [
        {
          categoria: 'Cuota General',
          activo: true,
          fechaAlta: new Date('2024-11-15'),
        },
      ],
      usuario: { roles: ['SOCIO'], activo: true },
    },
    // 7.17. Florencia Benítez (Socia activa Cuota General, nada en Adultos / Libre)
    {
      dni: '30000017',
      nombre: 'Florencia',
      apellido: 'Benítez',
      email: 'florencia.benitez@club.local',
      telefono: '3515551717',
      genero: GeneroDisciplina.FEMENINO,
      fechaNacimiento: new Date('1997-07-30'),
      membresias: [
        {
          categoria: 'Cuota General',
          activo: true,
          fechaAlta: new Date('2025-06-01'),
        },
      ],
      usuario: { roles: ['SOCIO'], activo: true },
    },
    // 7.18. Lucas Díaz (Socio activo Cuota General, Primera de Fútbol Mayor)
    {
      dni: '30000018',
      nombre: 'Lucas',
      apellido: 'Díaz',
      email: 'lucas.diaz@club.local',
      telefono: '3515551818',
      genero: GeneroDisciplina.MASCULINO,
      fechaNacimiento: new Date('1991-05-19'),
      membresias: [
        {
          categoria: 'Cuota General',
          activo: true,
          fechaAlta: new Date('2025-03-15'),
        },
      ],
      usuario: { roles: ['SOCIO'], activo: true },
    },
    // 7.19. Valentina Fernández (Socia activa Cuota General, Primera de Fútbol Femenino)
    {
      dni: '30000019',
      nombre: 'Valentina',
      apellido: 'Fernández',
      email: 'valentina.fernandez@club.local',
      telefono: '3515551919',
      genero: GeneroDisciplina.FEMENINO,
      fechaNacimiento: new Date('2000-10-12'),
      membresias: [
        {
          categoria: 'Cuota General',
          activo: true,
          fechaAlta: new Date('2025-01-20'),
        },
      ],
      usuario: { roles: ['SOCIO'], activo: true },
    },
    // 7.20. Joaquín Romero (Socio activo Cuota General, concurre a Entrenamiento Funcional)
    {
      dni: '30000020',
      nombre: 'Joaquín',
      apellido: 'Romero',
      email: 'joaquin.romero@club.local',
      telefono: '3515552020',
      genero: GeneroDisciplina.MASCULINO,
      fechaNacimiento: new Date('1995-02-28'),
      membresias: [
        {
          categoria: 'Cuota General',
          activo: true,
          fechaAlta: new Date('2025-05-10'),
        },
      ],
      usuario: { roles: ['SOCIO'], activo: true },
    },
    // 7.21. Agustín Morales (Socio activo Cuota General, Básquet)
    {
      dni: '30000021',
      nombre: 'Agustín',
      apellido: 'Morales',
      email: 'agustin.morales@club.local',
      telefono: '3515552121',
      genero: GeneroDisciplina.MASCULINO,
      fechaNacimiento: new Date('1993-09-08'),
      membresias: [
        {
          categoria: 'Cuota General',
          activo: true,
          fechaAlta: new Date('2025-04-20'),
        },
      ],
      usuario: { roles: ['SOCIO'], activo: true },
    },
    // 7.22. Rocío Álvarez (Socia activa Cuota General, Jockey Femenino)
    {
      dni: '30000022',
      nombre: 'Rocío',
      apellido: 'Álvarez',
      email: 'rocio.alvarez@club.local',
      telefono: '3515552222',
      genero: GeneroDisciplina.FEMENINO,
      fechaNacimiento: new Date('1998-01-17'),
      membresias: [
        {
          categoria: 'Cuota General',
          activo: true,
          fechaAlta: new Date('2025-07-01'),
        },
      ],
      usuario: { roles: ['SOCIO'], activo: true },
    },
    // 7.23. Tomás Herrera (Socio Juvenil activo con usuario autogestionado)
    {
      dni: '30000023',
      nombre: 'Tomás',
      apellido: 'Herrera',
      email: 'tomas.herrera@club.local',
      telefono: '3515552323',
      genero: GeneroDisciplina.MASCULINO,
      fechaNacimiento: new Date('2010-06-14'),
      membresias: [
        {
          categoria: 'Cuota Juvenil',
          activo: true,
          fechaAlta: new Date('2026-01-10'),
        },
      ],
      usuario: { roles: ['SOCIO'], activo: true },
    },
    // 7.24. Mía Castro (Socia Juvenil activa con usuario autogestionado, Jockey Sub-14)
    {
      dni: '30000024',
      nombre: 'Mía',
      apellido: 'Castro',
      email: 'mia.castro@club.local',
      telefono: '3515552424',
      genero: GeneroDisciplina.FEMENINO,
      fechaNacimiento: new Date('2011-11-20'),
      membresias: [
        {
          categoria: 'Cuota Juvenil',
          activo: true,
          fechaAlta: new Date('2026-02-01'),
        },
      ],
      usuario: { roles: ['SOCIO'], activo: true },
    },
    // 7.25. Benjamín López (Socio Juvenil activo infantil, sin usuario, gestionado por padres)
    {
      dni: '30000025',
      nombre: 'Benjamín',
      apellido: 'López',
      email: 'benjamin.lopez@familia.local',
      telefono: '3515552525',
      genero: GeneroDisciplina.MASCULINO,
      fechaNacimiento: new Date('2014-03-05'),
      membresias: [
        {
          categoria: 'Cuota Juvenil',
          activo: true,
          fechaAlta: new Date('2026-02-15'),
        },
      ],
    },
    // 7.26. Clara Navarro (Socia Juvenil activa, sin usuario, Fútbol Sub-16)
    {
      dni: '30000026',
      nombre: 'Clara',
      apellido: 'Navarro',
      email: 'clara.navarro@familia.local',
      telefono: '3515552626',
      genero: GeneroDisciplina.FEMENINO,
      fechaNacimiento: new Date('2012-08-19'),
      membresias: [
        {
          categoria: 'Cuota Juvenil',
          activo: true,
          fechaAlta: new Date('2026-03-01'),
        },
      ],
    },
    // 7.27. Pedro Gutiérrez (Socio Senior activo + Usuario SOCIO)
    {
      dni: '20000027',
      nombre: 'Pedro',
      apellido: 'Gutiérrez',
      email: 'pedro.gutierrez@club.local',
      telefono: '3515552727',
      genero: GeneroDisciplina.MASCULINO,
      fechaNacimiento: new Date('1958-09-12'),
      membresias: [
        {
          categoria: 'Cuota Senior',
          activo: true,
          fechaAlta: new Date('2024-05-10'),
        },
      ],
      usuario: { roles: ['SOCIO'], activo: true },
    },
    // 7.28. Carmen Domínguez (Socia Senior activa + Usuario SOCIO, Natación Adultos)
    {
      dni: '20000028',
      nombre: 'Carmen',
      apellido: 'Domínguez',
      email: 'carmen.dominguez@club.local',
      telefono: '3515552828',
      genero: GeneroDisciplina.FEMENINO,
      fechaNacimiento: new Date('1961-04-03'),
      membresias: [
        {
          categoria: 'Cuota Senior',
          activo: true,
          fechaAlta: new Date('2024-08-20'),
        },
      ],
      usuario: { roles: ['SOCIO'], activo: true },
    },
    // 7.29. Jorge Méndez (Socio Senior activo, sin usuario)
    {
      dni: '20000029',
      nombre: 'Jorge',
      apellido: 'Méndez',
      email: 'jorge.mendez@club.local',
      telefono: '3515552929',
      genero: GeneroDisciplina.MASCULINO,
      fechaNacimiento: new Date('1955-12-18'),
      membresias: [
        {
          categoria: 'Cuota Senior',
          activo: true,
          fechaAlta: new Date('2023-10-01'),
        },
      ],
    },
    // 7.30. Elena Paz (Socia inactiva con baja y Usuario inactivo)
    {
      dni: '30000030',
      nombre: 'Elena',
      apellido: 'Paz',
      email: 'elena.paz@club.local',
      telefono: '3515553030',
      genero: GeneroDisciplina.FEMENINO,
      fechaNacimiento: new Date('1989-07-21'),
      membresias: [
        {
          categoria: 'Cuota General',
          activo: false,
          fechaAlta: new Date('2024-01-10'),
          fechaBaja: new Date('2025-12-31'),
        },
      ],
      usuario: { roles: ['SOCIO'], activo: false },
    },
    // 7.31. Gonzalo Torres (Socio inactivo con baja y Usuario activo)
    {
      dni: '30000031',
      nombre: 'Gonzalo',
      apellido: 'Torres',
      email: 'gonzalo.torres@club.local',
      telefono: '3515553131',
      genero: GeneroDisciplina.MASCULINO,
      fechaNacimiento: new Date('1987-02-14'),
      membresias: [
        {
          categoria: 'Cuota General',
          activo: false,
          fechaAlta: new Date('2024-03-01'),
          fechaBaja: new Date('2025-11-30'),
        },
      ],
      usuario: { roles: ['SOCIO'], activo: true },
    },
    // 7.32. Paula Ruiz (Socia inactiva con baja, sin usuario)
    {
      dni: '30000032',
      nombre: 'Paula',
      apellido: 'Ruiz',
      email: 'paula.ruiz@club.local',
      telefono: '3515553232',
      genero: GeneroDisciplina.FEMENINO,
      fechaNacimiento: new Date('1993-10-05'),
      membresias: [
        {
          categoria: 'Cuota General',
          activo: false,
          fechaAlta: new Date('2024-06-15'),
          fechaBaja: new Date('2025-10-01'),
        },
      ],
    },
    // 7.33. Rodrigo Vega (Participante no socio, usuario SOCIO autogestionado)
    {
      dni: '50000033',
      nombre: 'Rodrigo',
      apellido: 'Vega',
      email: 'rodrigo.vega@externo.local',
      telefono: '3515553333',
      genero: GeneroDisciplina.MASCULINO,
      fechaNacimiento: new Date('1996-05-11'),
      usuario: { roles: ['SOCIO'], activo: true },
    },
    // 7.34. Nicolás Giménez (Participante no socio, sin usuario)
    {
      dni: '50000034',
      nombre: 'Nicolás',
      apellido: 'Giménez',
      email: 'nicolas.gimenez@externo.local',
      telefono: '3515553434',
      genero: GeneroDisciplina.MASCULINO,
      fechaNacimiento: new Date('2002-08-29'),
    },
    // 7.35. Patricia Sosa (Usuario inactivo rol COLABORADOR)
    {
      dni: '70000035',
      nombre: 'Patricia',
      apellido: 'Sosa',
      email: 'patricia.colaboradora@socialclub.local',
      telefono: '3515553535',
      genero: GeneroDisciplina.FEMENINO,
      fechaNacimiento: new Date('1982-12-04'),
      usuario: { roles: ['COLABORADOR'], activo: false },
    },
  ];

  for (const pData of nuevasPersonasData) {
    let persona = await prisma.persona.findUnique({ where: { dni: pData.dni } });
    if (!persona) {
      persona = await prisma.persona.create({
        data: {
          nombre: pData.nombre,
          apellido: pData.apellido,
          dni: pData.dni,
          email: pData.email,
          telefono: pData.telefono,
          genero: pData.genero,
          fechaNacimiento: pData.fechaNacimiento,
        },
      });
    } else {
      persona = await prisma.persona.update({
        where: { id: persona.id },
        data: {
          nombre: pData.nombre,
          apellido: pData.apellido,
          email: pData.email,
          telefono: pData.telefono,
          genero: pData.genero,
          fechaNacimiento: pData.fechaNacimiento,
        },
      });
    }

    if (pData.membresias?.length) {
      for (const m of pData.membresias) {
        const cat = categoriasMap.get(m.categoria);
        if (cat) {
          const memExistente = await prisma.membresia.findFirst({
            where: { personaId: persona.id, categoriaId: cat.id },
          });
          if (!memExistente) {
            await prisma.membresia.create({
              data: {
                personaId: persona.id,
                categoriaId: cat.id,
                activo: m.activo,
                fechaAlta: m.fechaAlta,
                fechaBaja: m.fechaBaja ?? null,
              },
            });
          } else {
            await prisma.membresia.update({
              where: { id: memExistente.id },
              data: {
                activo: m.activo,
                fechaAlta: m.fechaAlta,
                fechaBaja: m.fechaBaja ?? null,
              },
            });
          }
        }
      }
    }

    if (pData.usuario) {
      const rolesParaAsignar = pData.usuario.roles.map((rNombre) => {
        if (rNombre === 'ADMIN') return rolAdmin.id;
        if (rNombre === 'COLABORADOR') return rolColaborador.id;
        if (rNombre === 'DELEGADO') return rolDelegado.id;
        return rolSocio.id;
      });

      const usuario = await prisma.usuario.upsert({
        where: { email: pData.email },
        update: {
          personaId: persona.id,
          nombre: pData.nombre,
          apellido: pData.apellido,
          activo: pData.usuario.activo ?? true,
        },
        create: {
          email: pData.email,
          passwordHash,
          nombre: pData.nombre,
          apellido: pData.apellido,
          activo: pData.usuario.activo ?? true,
          personaId: persona.id,
          roles: {
            create: rolesParaAsignar.map((rolId) => ({ rolId })),
          },
        },
      });

      for (const rolId of rolesParaAsignar) {
        await prisma.usuarioRol.upsert({
          where: {
            usuarioId_rolId: {
              usuarioId: usuario.id,
              rolId,
            },
          },
          update: {},
          create: {
            usuarioId: usuario.id,
            rolId,
          },
        });
      }

      if (pData.usuario.disciplinasDelegadas?.length) {
        const countDelegadas = await prisma.delegadoDisciplina.count({
          where: { usuarioId: usuario.id },
        });
        if (countDelegadas === 0) {
          await prisma.delegadoDisciplina.createMany({
            data: pData.usuario.disciplinasDelegadas.map((nombreDisc) => ({
              usuarioId: usuario.id,
              disciplinaId: disciplinasMap.get(nombreDisc)!.id,
            })),
          });
        }
      }
    }

    personasMap.set(pData.dni, persona);
  }

  console.log(
    `  ${personasMap.size} personas sembradas exitosamente con socios y usuarios correspondientes.`,
  );

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
    // Julián Gómez en Fútbol Mayor (Reserva)
    {
      personaId: personasMap.get('30000014')!.id,
      disciplinaNombre: 'Fútbol Mayor',
      categoriaNombre: 'Reserva',
      fechaInscripcion: new Date('2026-01-15'),
      activo: true,
      fechaBaja: null,
    },
    // Sofía Martínez en Jockey Femenino (Primera)
    {
      personaId: personasMap.get('30000015')!.id,
      disciplinaNombre: 'Jockey Femenino',
      categoriaNombre: 'Primera',
      fechaInscripcion: new Date('2026-02-01'),
      activo: true,
      fechaBaja: null,
    },
    // Mateo Rossi en Pelota Paleta
    {
      personaId: personasMap.get('30000016')!.id,
      disciplinaNombre: 'Pelota Paleta',
      categoriaNombre: null,
      fechaInscripcion: new Date('2025-11-20'),
      activo: true,
      fechaBaja: null,
    },
    // Florencia Benítez en Natación (Adultos / Libre)
    {
      personaId: personasMap.get('30000017')!.id,
      disciplinaNombre: 'Natación',
      categoriaNombre: 'Adultos / Libre',
      fechaInscripcion: new Date('2026-02-10'),
      activo: true,
      fechaBaja: null,
    },
    // Lucas Díaz en Fútbol Mayor (Primera División)
    {
      personaId: personasMap.get('30000018')!.id,
      disciplinaNombre: 'Fútbol Mayor',
      categoriaNombre: 'Primera División',
      fechaInscripcion: new Date('2025-05-01'),
      activo: true,
      fechaBaja: null,
    },
    // Lucas Díaz en Gimnasio (dada de baja en 2026-01-31)
    {
      personaId: personasMap.get('30000018')!.id,
      disciplinaNombre: 'Gimnasio',
      categoriaNombre: 'Pase Libre Musculación',
      fechaInscripcion: new Date('2025-06-01'),
      activo: false,
      fechaBaja: new Date('2026-01-31'),
    },
    // Valentina Fernández en Fútbol Femenino (Primera)
    {
      personaId: personasMap.get('30000019')!.id,
      disciplinaNombre: 'Fútbol Femenino',
      categoriaNombre: 'Primera Femenina',
      fechaInscripcion: new Date('2026-01-10'),
      activo: true,
      fechaBaja: null,
    },
    // Joaquín Romero en Gimnasio (Entrenamiento Funcional)
    {
      personaId: personasMap.get('30000020')!.id,
      disciplinaNombre: 'Gimnasio',
      categoriaNombre: 'Entrenamiento Funcional',
      fechaInscripcion: new Date('2025-08-01'),
      activo: true,
      fechaBaja: null,
    },
    // Agustín Morales en Básquet (Juveniles)
    {
      personaId: personasMap.get('30000021')!.id,
      disciplinaNombre: 'Básquet',
      categoriaNombre: 'Juveniles',
      fechaInscripcion: new Date('2025-09-01'),
      activo: true,
      fechaBaja: null,
    },
    // Rocío Álvarez en Jockey Femenino (Primera)
    {
      personaId: personasMap.get('30000022')!.id,
      disciplinaNombre: 'Jockey Femenino',
      categoriaNombre: 'Primera',
      fechaInscripcion: new Date('2025-10-15'),
      activo: true,
      fechaBaja: null,
    },
    // Tomás Herrera en Básquet (Juveniles)
    {
      personaId: personasMap.get('30000023')!.id,
      disciplinaNombre: 'Básquet',
      categoriaNombre: 'Juveniles',
      fechaInscripcion: new Date('2026-01-20'),
      activo: true,
      fechaBaja: null,
    },
    // Mía Castro en Jockey Femenino (Sub-14)
    {
      personaId: personasMap.get('30000024')!.id,
      disciplinaNombre: 'Jockey Femenino',
      categoriaNombre: 'Sub-14',
      fechaInscripcion: new Date('2026-02-01'),
      activo: true,
      fechaBaja: null,
    },
    // Benjamín López en Natación (Escuela Infantil)
    {
      personaId: personasMap.get('30000025')!.id,
      disciplinaNombre: 'Natación',
      categoriaNombre: 'Escuela Infantil',
      fechaInscripcion: new Date('2026-02-15'),
      activo: true,
      fechaBaja: null,
    },
    // Clara Navarro en Fútbol Femenino (Sub-16 Femenina)
    {
      personaId: personasMap.get('30000026')!.id,
      disciplinaNombre: 'Fútbol Femenino',
      categoriaNombre: 'Sub-16 Femenina',
      fechaInscripcion: new Date('2026-03-01'),
      activo: true,
      fechaBaja: null,
    },
    // Pedro Gutiérrez en Pelota Paleta
    {
      personaId: personasMap.get('20000027')!.id,
      disciplinaNombre: 'Pelota Paleta',
      categoriaNombre: null,
      fechaInscripcion: new Date('2024-06-01'),
      activo: true,
      fechaBaja: null,
    },
    // Carmen Domínguez en Natación (Adultos / Libre)
    {
      personaId: personasMap.get('20000028')!.id,
      disciplinaNombre: 'Natación',
      categoriaNombre: 'Adultos / Libre',
      fechaInscripcion: new Date('2024-09-01'),
      activo: true,
      fechaBaja: null,
    },
    // Rodrigo Vega en Gimnasio (Pase Libre Musculación)
    {
      personaId: personasMap.get('50000033')!.id,
      disciplinaNombre: 'Gimnasio',
      categoriaNombre: 'Pase Libre Musculación',
      fechaInscripcion: new Date('2026-01-05'),
      activo: true,
      fechaBaja: null,
    },
    // Nicolás Giménez en Básquet (Juveniles)
    {
      personaId: personasMap.get('50000034')!.id,
      disciplinaNombre: 'Básquet',
      categoriaNombre: 'Juveniles',
      fechaInscripcion: new Date('2026-02-01'),
      activo: true,
      fechaBaja: null,
    },
  ];

  const inscripcionesMap = new Map<string, Inscripcion>();
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
    // DT-41: la deuda deportiva se calcula sobre el historial de períodos.
    // Se crea el período inicial solo si la inscripción no tiene ninguno.
    const periodos = await prisma.periodoInscripcion.count({
      where: { inscripcionId: inscripcion.id },
    });
    if (periodos === 0) {
      await prisma.periodoInscripcion.create({
        data: {
          inscripcionId: inscripcion.id,
          desde: ins.fechaInscripcion,
          hasta: ins.activo ? null : ins.fechaBaja,
        },
      });
    }
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
    // Julián Gómez (Fútbol Mayor)
    {
      personaId: personasMap.get('30000014')!.id,
      tipoDocumento: TipoDocumentacionDisciplina.DNI,
      tipo: 'Documento Nacional de Identidad',
      fechaVencimiento: new Date('2034-01-01'),
      archivoNombre: 'dni_julian.pdf',
      archivoRuta: 'documentos/dni_julian.pdf',
      mimeType: 'application/pdf',
      tamano: 220000,
    },
    {
      personaId: personasMap.get('30000014')!.id,
      tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA,
      tipo: 'Certificado Médico de Aptitud Física',
      fechaVencimiento: new Date('2026-12-31'),
      archivoNombre: 'apto_medico_julian.pdf',
      archivoRuta: 'documentos/apto_medico_julian.pdf',
      mimeType: 'application/pdf',
      tamano: 680000,
    },
    // Sofía Martínez (Jockey Femenino)
    {
      personaId: personasMap.get('30000015')!.id,
      tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA,
      tipo: 'Certificado Médico Aptitud Competitiva',
      fechaVencimiento: new Date('2026-11-30'),
      archivoNombre: 'apto_medico_sofia.pdf',
      archivoRuta: 'documentos/apto_medico_sofia.pdf',
      mimeType: 'application/pdf',
      tamano: 750000,
    },
    {
      personaId: personasMap.get('30000015')!.id,
      tipoDocumento: TipoDocumentacionDisciplina.CARNET_FEDERATIVO_LICENCIA_DEPORTIVA,
      tipo: 'Carnet de Jugadora Federada 2026',
      fechaVencimiento: new Date('2027-01-15'),
      archivoNombre: 'carnet_federativo_sofia.pdf',
      archivoRuta: 'documentos/carnet_federativo_sofia.pdf',
      mimeType: 'application/pdf',
      tamano: 340000,
    },
    // Florencia Benítez (Natación)
    {
      personaId: personasMap.get('30000017')!.id,
      tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA,
      tipo: 'Certificado Médico Natatorio',
      fechaVencimiento: new Date('2026-10-15'),
      archivoNombre: 'apto_medico_florencia.pdf',
      archivoRuta: 'documentos/apto_medico_florencia.pdf',
      mimeType: 'application/pdf',
      tamano: 600000,
    },
    {
      personaId: personasMap.get('30000017')!.id,
      tipoDocumento: TipoDocumentacionDisciplina.FICHA_TECNICA_NATACION,
      tipo: 'Ficha de Pileta y Natatorio',
      fechaVencimiento: new Date('2027-02-28'),
      archivoNombre: 'ficha_natacion_florencia.pdf',
      archivoRuta: 'documentos/ficha_natacion_florencia.pdf',
      mimeType: 'application/pdf',
      tamano: 410000,
    },
    // Lucas Díaz (Fútbol Mayor)
    {
      personaId: personasMap.get('30000018')!.id,
      tipoDocumento: TipoDocumentacionDisciplina.DNI,
      tipo: 'Documento Nacional de Identidad',
      fechaVencimiento: new Date('2032-05-19'),
      archivoNombre: 'dni_lucas.pdf',
      archivoRuta: 'documentos/dni_lucas.pdf',
      mimeType: 'application/pdf',
      tamano: 230000,
    },
    {
      personaId: personasMap.get('30000018')!.id,
      tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA,
      tipo: 'Apto Médico Alta Competencia',
      fechaVencimiento: new Date('2026-12-31'),
      archivoNombre: 'apto_medico_lucas.pdf',
      archivoRuta: 'documentos/apto_medico_lucas.pdf',
      mimeType: 'application/pdf',
      tamano: 820000,
    },
    {
      personaId: personasMap.get('30000018')!.id,
      tipoDocumento: TipoDocumentacionDisciplina.SEGURO_COBERTURA_MEDICA,
      tipo: 'Póliza Seguro Deportivo Anual',
      fechaVencimiento: new Date('2026-12-31'),
      archivoNombre: 'seguro_deportivo_lucas.pdf',
      archivoRuta: 'documentos/seguro_deportivo_lucas.pdf',
      mimeType: 'application/pdf',
      tamano: 512000,
    },
    // Valentina Fernández (Fútbol Femenino)
    {
      personaId: personasMap.get('30000019')!.id,
      tipoDocumento: TipoDocumentacionDisciplina.DNI,
      tipo: 'Documento Nacional de Identidad',
      fechaVencimiento: new Date('2035-10-12'),
      archivoNombre: 'dni_valentina.pdf',
      archivoRuta: 'documentos/dni_valentina.pdf',
      mimeType: 'application/pdf',
      tamano: 215000,
    },
    {
      personaId: personasMap.get('30000019')!.id,
      tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA,
      tipo: 'Certificado de Aptitud Física',
      fechaVencimiento: new Date('2026-11-15'),
      archivoNombre: 'apto_medico_valentina.pdf',
      archivoRuta: 'documentos/apto_medico_valentina.pdf',
      mimeType: 'application/pdf',
      tamano: 710000,
    },
    // Joaquín Romero (Gimnasio)
    {
      personaId: personasMap.get('30000020')!.id,
      tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA,
      tipo: 'Apto Médico Gimnasio Funcional',
      fechaVencimiento: new Date('2026-09-30'),
      archivoNombre: 'apto_medico_joaquin.pdf',
      archivoRuta: 'documentos/apto_medico_joaquin.pdf',
      mimeType: 'application/pdf',
      tamano: 640000,
    },
    {
      personaId: personasMap.get('30000020')!.id,
      tipoDocumento: TipoDocumentacionDisciplina.FICHA_TECNICA_GIMNASIO_FITNESS,
      tipo: 'Ficha Técnica Funcional',
      fechaVencimiento: new Date('2027-01-01'),
      archivoNombre: 'ficha_funcional_joaquin.pdf',
      archivoRuta: 'documentos/ficha_funcional_joaquin.pdf',
      mimeType: 'application/pdf',
      tamano: 460000,
    },
    // Agustín Morales (Básquet)
    {
      personaId: personasMap.get('30000021')!.id,
      tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA,
      tipo: 'Apto Físico Básquetbol',
      fechaVencimiento: new Date('2026-08-31'),
      archivoNombre: 'apto_basquet_agustin.pdf',
      archivoRuta: 'documentos/apto_basquet_agustin.pdf',
      mimeType: 'application/pdf',
      tamano: 590000,
    },
    // Tomás Herrera (Básquet)
    {
      personaId: personasMap.get('30000023')!.id,
      tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA,
      tipo: 'Certificado Médico Formativo Básquet',
      fechaVencimiento: new Date('2026-12-31'),
      archivoNombre: 'apto_tomas.pdf',
      archivoRuta: 'documentos/apto_tomas.pdf',
      mimeType: 'application/pdf',
      tamano: 630000,
    },
    // Mía Castro (Jockey Femenino)
    {
      personaId: personasMap.get('30000024')!.id,
      tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA,
      tipo: 'Apto Físico Juvenil Jockey',
      fechaVencimiento: new Date('2026-12-15'),
      archivoNombre: 'apto_mia.pdf',
      archivoRuta: 'documentos/apto_mia.pdf',
      mimeType: 'application/pdf',
      tamano: 610000,
    },
    {
      personaId: personasMap.get('30000024')!.id,
      tipoDocumento: TipoDocumentacionDisciplina.CARNET_FEDERATIVO_LICENCIA_DEPORTIVA,
      tipo: 'Carnet Federativo Juvenil 2026',
      fechaVencimiento: new Date('2027-03-01'),
      archivoNombre: 'carnet_federativo_mia.pdf',
      archivoRuta: 'documentos/carnet_federativo_mia.pdf',
      mimeType: 'application/pdf',
      tamano: 310000,
    },
    // Benjamín López (Natación Escuela Infantil)
    {
      personaId: personasMap.get('30000025')!.id,
      tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA,
      tipo: 'Apto Pediátrico Pileta Climatizada',
      fechaVencimiento: new Date('2026-12-31'),
      archivoNombre: 'apto_benjamin.pdf',
      archivoRuta: 'documentos/apto_benjamin.pdf',
      mimeType: 'application/pdf',
      tamano: 570000,
    },
    {
      personaId: personasMap.get('30000025')!.id,
      tipoDocumento: TipoDocumentacionDisciplina.FICHA_TECNICA_NATACION,
      tipo: 'Ficha Técnica Infantil Pileta',
      fechaVencimiento: new Date('2027-02-15'),
      archivoNombre: 'ficha_natacion_benjamin.pdf',
      archivoRuta: 'documentos/ficha_natacion_benjamin.pdf',
      mimeType: 'application/pdf',
      tamano: 390000,
    },
    {
      personaId: personasMap.get('30000025')!.id,
      tipoDocumento: TipoDocumentacionDisciplina.AUTORIZACION_PADRES_TUTORES,
      tipo: 'Consentimiento Parental Pileta Climatizada',
      fechaVencimiento: new Date('2027-02-15'),
      archivoNombre: 'autorizacion_tutores_benjamin.pdf',
      archivoRuta: 'documentos/autorizacion_tutores_benjamin.pdf',
      mimeType: 'application/pdf',
      tamano: 290000,
    },
    // Clara Navarro (Fútbol Femenino Sub-16)
    {
      personaId: personasMap.get('30000026')!.id,
      tipoDocumento: TipoDocumentacionDisciplina.DNI,
      tipo: 'Documento Nacional de Identidad',
      fechaVencimiento: new Date('2036-01-01'),
      archivoNombre: 'dni_clara.pdf',
      archivoRuta: 'documentos/dni_clara.pdf',
      mimeType: 'application/pdf',
      tamano: 195000,
    },
    {
      personaId: personasMap.get('30000026')!.id,
      tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA,
      tipo: 'Apto Médico Competitivo Sub-16',
      fechaVencimiento: new Date('2026-11-30'),
      archivoNombre: 'apto_clara.pdf',
      archivoRuta: 'documentos/apto_clara.pdf',
      mimeType: 'application/pdf',
      tamano: 640000,
    },
    // Rodrigo Vega (Gimnasio) - Documento vencido para pruebas de alertas de documentación
    {
      personaId: personasMap.get('50000033')!.id,
      tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA,
      tipo: 'Certificado Médico Gimnasio 2025 (Vencido)',
      fechaVencimiento: new Date('2026-02-10'),
      archivoNombre: 'apto_vencido_rodrigo.pdf',
      archivoRuta: 'documentos/apto_vencido_rodrigo.pdf',
      mimeType: 'application/pdf',
      tamano: 530000,
    },
    // Nicolás Giménez (Básquet)
    {
      personaId: personasMap.get('50000034')!.id,
      tipoDocumento: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA,
      tipo: 'Apto Médico Torneo Básquetbol',
      fechaVencimiento: new Date('2026-12-31'),
      archivoNombre: 'apto_nicolas.pdf',
      archivoRuta: 'documentos/apto_nicolas.pdf',
      mimeType: 'application/pdf',
      tamano: 710000,
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
    // Socios al día (cubren hasta 2026-09)
    { persona: personaValeria, desde: '2025-01', hasta: '2026-09' },
    { persona: personaCamila, desde: '2025-05', hasta: '2026-09' },
    { persona: personaSantiago, desde: '2026-01', hasta: '2026-09' },
    { persona: personasMap.get('30000014'), desde: '2025-02', hasta: '2026-09' }, // Julián Gómez
    { persona: personasMap.get('30000015'), desde: '2025-04', hasta: '2026-09' }, // Sofía Martínez
    { persona: personasMap.get('30000016'), desde: '2024-11', hasta: '2026-09' }, // Mateo Rossi
    { persona: personasMap.get('30000018'), desde: '2025-03', hasta: '2026-09' }, // Lucas Díaz
    { persona: personasMap.get('30000023'), desde: '2026-01', hasta: '2026-09' }, // Tomás Herrera
    { persona: personasMap.get('20000027'), desde: '2024-05', hasta: '2026-09' }, // Pedro Gutiérrez
    { persona: personasMap.get('20000029'), desde: '2023-10', hasta: '2026-09' }, // Jorge Méndez

    // Socios con morosidad escalonada (1 a 10 cuotas adeudadas)
    { persona: personaSocioSinCuenta, desde: '2025-01', hasta: '2026-08' }, // Debe 2026-09 (1 cuota)
    { persona: personasMap.get('30000017'), desde: '2025-06', hasta: '2026-08' }, // Florencia Benítez - Debe 1 cuota
    { persona: personaLucia, desde: '2025-03', hasta: '2026-07' }, // Lucía - Debe 2 cuotas
    { persona: personasMap.get('30000019'), desde: '2025-01', hasta: '2026-07' }, // Valentina Fernández - Debe 2 cuotas
    { persona: personasMap.get('30000020'), desde: '2025-05', hasta: '2026-07' }, // Joaquín Romero - Debe 2 cuotas
    { persona: personaMartin, desde: '2024-06', hasta: '2026-06' }, // Martín - Debe 3 cuotas
    { persona: personasMap.get('30000021'), desde: '2025-04', hasta: '2026-06' }, // Agustín Morales - Debe 3 cuotas
    { persona: personasMap.get('30000026'), desde: '2026-03', hasta: '2026-06' }, // Clara Navarro - Debe 3 cuotas
    { persona: personasMap.get('30000022'), desde: '2025-07', hasta: '2026-05' }, // Rocío Álvarez - Debe 4 cuotas
    { persona: personasMap.get('30000024'), desde: '2026-02', hasta: '2026-05' }, // Mía Castro - Debe 4 cuotas
    { persona: personasMap.get('20000028'), desde: '2024-08', hasta: '2026-04' }, // Carmen Domínguez - Debe 5 cuotas
    { persona: personasMap.get('30000025'), desde: '2026-02', hasta: '2026-03' }, // Benjamín López - Debe 6 cuotas
    { persona: personaRoberto, desde: '2025-01', hasta: '2025-11' }, // Roberto - Debe 10 cuotas

    // Socios históricos dados de baja (pagaron todo hasta su fecha de baja)
    { persona: personasMap.get('30000030'), desde: '2024-01', hasta: '2025-12' }, // Elena Paz
    { persona: personasMap.get('30000031'), desde: '2024-03', hasta: '2025-11' }, // Gonzalo Torres
    { persona: personasMap.get('30000032'), desde: '2024-06', hasta: '2025-10' }, // Paula Ruiz
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
  console.log(
    '  Pagos sociales y morosidad sembrados para 26 socios (al día y con morosidad escalonada de 1 a 10 cuotas).',
  );

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
    // Julián Gómez en Fútbol Mayor (Reserva): pagó 2026-08 y 2026-09 con 20% descuento socio
    {
      personaId: personasMap.get('30000014')!.id,
      disciplinaNombre: 'Fútbol Mayor',
      periodo: '2026-08',
      monto: 12000,
      metodoPago: 'TRANSFERENCIA',
      fechaPago: new Date('2026-08-05T14:00:00Z'),
      responsableId: admin.id,
    },
    {
      personaId: personasMap.get('30000014')!.id,
      disciplinaNombre: 'Fútbol Mayor',
      periodo: '2026-09',
      monto: 12000,
      metodoPago: 'TRANSFERENCIA',
      fechaPago: new Date('2026-09-05T14:00:00Z'),
      responsableId: admin.id,
    },
    // Sofía Martínez en Jockey Femenino (Primera): pagó 2026-08 y 2026-09 con 15% descuento
    {
      personaId: personasMap.get('30000015')!.id,
      disciplinaNombre: 'Jockey Femenino',
      periodo: '2026-08',
      monto: 13600,
      metodoPago: 'TRANSFERENCIA',
      fechaPago: new Date('2026-08-08T18:00:00Z'),
      responsableId: colaborador.id,
    },
    {
      personaId: personasMap.get('30000015')!.id,
      disciplinaNombre: 'Jockey Femenino',
      periodo: '2026-09',
      monto: 13600,
      metodoPago: 'TRANSFERENCIA',
      fechaPago: new Date('2026-09-08T18:00:00Z'),
      responsableId: colaborador.id,
    },
    // Lucas Díaz en Fútbol Mayor: pagó 2026-08 (debe 2026-09)
    {
      personaId: personasMap.get('30000018')!.id,
      disciplinaNombre: 'Fútbol Mayor',
      periodo: '2026-08',
      monto: 12000,
      metodoPago: 'EFECTIVO',
      fechaPago: new Date('2026-08-03T10:00:00Z'),
      responsableId: colaborador.id,
    },
    // Valentina Fernández en Fútbol Femenino: pagó 2026-08 y 2026-09
    {
      personaId: personasMap.get('30000019')!.id,
      disciplinaNombre: 'Fútbol Femenino',
      periodo: '2026-08',
      monto: 11200,
      metodoPago: 'TRANSFERENCIA',
      fechaPago: new Date('2026-08-12T17:00:00Z'),
      responsableId: admin.id,
    },
    {
      personaId: personasMap.get('30000019')!.id,
      disciplinaNombre: 'Fútbol Femenino',
      periodo: '2026-09',
      monto: 11200,
      metodoPago: 'TRANSFERENCIA',
      fechaPago: new Date('2026-09-12T17:00:00Z'),
      responsableId: admin.id,
    },
    // Joaquín Romero en Gimnasio: pagó 2026-08 con 20% descuento socio (debe 2026-09)
    {
      personaId: personasMap.get('30000020')!.id,
      disciplinaNombre: 'Gimnasio',
      periodo: '2026-08',
      monto: 10800,
      metodoPago: 'EFECTIVO',
      fechaPago: new Date('2026-08-04T19:00:00Z'),
      responsableId: colaborador.id,
    },
    // Florencia Benítez en Natación: pagó 2026-08 y 2026-09 con 20% descuento socio
    {
      personaId: personasMap.get('30000017')!.id,
      disciplinaNombre: 'Natación',
      periodo: '2026-08',
      monto: 12800,
      metodoPago: 'TRANSFERENCIA',
      fechaPago: new Date('2026-08-07T11:00:00Z'),
      responsableId: admin.id,
    },
    {
      personaId: personasMap.get('30000017')!.id,
      disciplinaNombre: 'Natación',
      periodo: '2026-09',
      monto: 12800,
      metodoPago: 'TRANSFERENCIA',
      fechaPago: new Date('2026-09-07T11:00:00Z'),
      responsableId: admin.id,
    },
    // Benjamín López en Natación: pagó 2026-08 (debe 2026-09)
    {
      personaId: personasMap.get('30000025')!.id,
      disciplinaNombre: 'Natación',
      periodo: '2026-08',
      monto: 11050,
      metodoPago: 'EFECTIVO',
      fechaPago: new Date('2026-08-06T15:00:00Z'),
      responsableId: colaborador.id,
    },
    // Tomás Herrera en Básquet: pagó 2026-08 y 2026-09 con 20% descuento socio
    {
      personaId: personasMap.get('30000023')!.id,
      disciplinaNombre: 'Básquet',
      periodo: '2026-08',
      monto: 9600,
      metodoPago: 'TRANSFERENCIA',
      fechaPago: new Date('2026-08-09T18:30:00Z'),
      responsableId: admin.id,
    },
    {
      personaId: personasMap.get('30000023')!.id,
      disciplinaNombre: 'Básquet',
      periodo: '2026-09',
      monto: 9600,
      metodoPago: 'TRANSFERENCIA',
      fechaPago: new Date('2026-09-09T18:30:00Z'),
      responsableId: admin.id,
    },
    // Pedro Gutiérrez en Pelota Paleta: pagó 2026-08 y 2026-09 con 10% descuento socio
    {
      personaId: personasMap.get('20000027')!.id,
      disciplinaNombre: 'Pelota Paleta',
      periodo: '2026-08',
      monto: 9000,
      metodoPago: 'EFECTIVO',
      fechaPago: new Date('2026-08-02T10:00:00Z'),
      responsableId: colaborador.id,
    },
    {
      personaId: personasMap.get('20000027')!.id,
      disciplinaNombre: 'Pelota Paleta',
      periodo: '2026-09',
      monto: 9000,
      metodoPago: 'EFECTIVO',
      fechaPago: new Date('2026-09-02T10:00:00Z'),
      responsableId: colaborador.id,
    },
    // Rodrigo Vega en Gimnasio: no es socio, pagó tarifa base ($11000) en 2026-08 (debe 2026-09)
    {
      personaId: personasMap.get('50000033')!.id,
      disciplinaNombre: 'Gimnasio',
      periodo: '2026-08',
      monto: 11000,
      metodoPago: 'EFECTIVO',
      fechaPago: new Date('2026-08-05T19:00:00Z'),
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

  // ── 13. Eventos y entradas con código QR y accesos validados (US-29 / US-31 / US-36 / US-52) ──
  const eventosData = [
    {
      nombre: 'Torneo Apertura de Pádel 2026',
      descripcion: 'Torneo de pádel dobles masculino y femenino con premios y catering.',
      requiereEntrada: true,
      entradasDisponibles: 12,
      capacidadMaxima: 60,
      fechaEvento: new Date('2026-08-15T15:00:00Z'),
      fechaFin: new Date('2026-08-15T21:00:00Z'),
      imagen: null,
      lugarAcreditacion: 'Canchas de pádel central',
      precio: 2500,
      descuentoSocio: 20,
      estado: EstadoEvento.FINALIZADO,
      inicioVenta: new Date('2026-07-01T00:00:00Z'),
      finVenta: new Date('2026-08-15T14:00:00Z'),
      entradasVendidas: 48,
      entradasUsadas: 42,
    },
    {
      nombre: 'Festival Gastronómico y Peña Social',
      descripcion: 'Cena típica tradicional, peña folclórica y sorteos del club.',
      requiereEntrada: true,
      entradasDisponibles: 10,
      capacidadMaxima: 150,
      fechaEvento: new Date('2026-09-12T20:30:00Z'),
      fechaFin: new Date('2026-09-13T03:00:00Z'),
      imagen: null,
      lugarAcreditacion: 'Salón principal de eventos',
      precio: 3500,
      descuentoSocio: 15,
      estado: EstadoEvento.FINALIZADO,
      inicioVenta: new Date('2026-08-01T00:00:00Z'),
      finVenta: new Date('2026-09-12T19:00:00Z'),
      entradasVendidas: 140,
      entradasUsadas: 128,
    },
    {
      nombre: 'Torneo Relámpago de Básquet 3x3',
      descripcion: 'Torneo intensivo de básquet callejero 3x3 en categorías mixtas.',
      requiereEntrada: true,
      entradasDisponibles: 5,
      capacidadMaxima: 50,
      fechaEvento: new Date('2026-09-26T16:00:00Z'),
      fechaFin: new Date('2026-09-26T22:00:00Z'),
      imagen: null,
      lugarAcreditacion: 'Gimnasio techado 1',
      precio: 2000,
      descuentoSocio: 10,
      estado: EstadoEvento.FINALIZADO,
      inicioVenta: new Date('2026-08-15T00:00:00Z'),
      finVenta: new Date('2026-09-26T15:00:00Z'),
      entradasVendidas: 45,
      entradasUsadas: 39,
    },
    {
      nombre: 'Festival Deportivo Primaveral',
      descripcion: 'Jornada multidisciplinaria de deportes, música en vivo y gastronomía.',
      requiereEntrada: true,
      entradasDisponibles: 20,
      capacidadMaxima: 200,
      fechaEvento: new Date('2026-10-05T09:00:00Z'),
      fechaFin: new Date('2026-10-05T22:00:00Z'),
      imagen: null,
      lugarAcreditacion: 'Plaza central del club',
      precio: 1500,
      descuentoSocio: 0,
      estado: EstadoEvento.FINALIZADO,
      inicioVenta: new Date('2026-09-01T00:00:00Z'),
      finVenta: new Date('2026-10-05T08:00:00Z'),
      entradasVendidas: 180,
      entradasUsadas: 156,
    },
    {
      nombre: 'Masterclass y Torneo de Tenis Nocturno',
      descripcion: 'Competición nocturna bajo luces LED con hidratación y fruta para competidores.',
      requiereEntrada: true,
      entradasDisponibles: 2,
      capacidadMaxima: 40,
      fechaEvento: new Date('2026-10-18T19:00:00Z'),
      fechaFin: new Date('2026-10-18T23:30:00Z'),
      imagen: null,
      lugarAcreditacion: 'Canchas de tenis polvo de ladrillo',
      precio: 3000,
      descuentoSocio: 10,
      estado: EstadoEvento.FINALIZADO,
      inicioVenta: new Date('2026-09-01T00:00:00Z'),
      finVenta: new Date('2026-10-18T18:00:00Z'),
      entradasVendidas: 38,
      entradasUsadas: 35,
    },
    {
      nombre: 'Torneo de Fútbol Interclubes 2026',
      descripcion: 'Torneo interclubes de fútbol 7 con fixture y premiación.',
      requiereEntrada: true,
      entradasDisponibles: 15,
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
      entradasVendidas: 65,
      entradasUsadas: 0,
    },
    {
      nombre: 'Fiesta de Fin de Año',
      descripcion: 'Celebración anual del club con cena show, música en vivo y brindis.',
      requiereEntrada: true,
      entradasDisponibles: 25,
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
      entradasVendidas: 125,
      entradasUsadas: 0,
    },
  ];

  for (const evData of eventosData) {
    const { entradasVendidas, entradasUsadas, ...datosEvento } = evData;
    let ev = await prisma.evento.findFirst({ where: { nombre: datosEvento.nombre } });
    if (!ev) {
      ev = await prisma.evento.create({ data: datosEvento });
    } else {
      ev = await prisma.evento.update({
        where: { id: ev.id },
        data: datosEvento,
      });
    }

    const entradasActuales = await prisma.entrada.count({ where: { eventoId: ev.id } });
    if (entradasActuales < entradasVendidas) {
      const faltantes = entradasVendidas - entradasActuales;
      const montoTotal = faltantes * Number(ev.precio);

      const compra = await prisma.compraEntrada.create({
        data: {
          usuarioId: usuarioLucia.id,
          eventoId: ev.id,
          cantidad: faltantes,
          precioUnitario: ev.precio,
          montoTotal,
          estado: EstadoCompraEntrada.APROBADA,
          metodoPago: 'MOCK_TARJETA',
        },
      });

      // Crear entradas
      const nuevasEntradas = [];
      for (let i = 0; i < faltantes; i++) {
        const esUsada = i < entradasUsadas;
        nuevasEntradas.push({
          token: randomUUID(),
          eventoId: ev.id,
          compraId: compra.id,
          estado: esUsada ? EstadoEntrada.USADA : EstadoEntrada.VALIDA,
        });
      }

      await prisma.entrada.createMany({ data: nuevasEntradas });
    }
  }
  console.log(
    `  ${eventosData.length} eventos asegurados con entradas, compras y métricas de asistencia.`,
  );

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
    console.log(
      `  Usuario DELEGADO:    ${usuarioDelegado.email} (contraseña oculta en producción)`,
    );
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
