import 'dotenv/config';
import {
  PrismaClient,
  GeneroDisciplina,
  TipoDocumentacionDisciplina,
  EstadoEvento,
  EstadoEntrada,
  EstadoCompraEntrada,
  EstadoRevisionDocumento,
  EstadoSolicitudInscripcion,
  TipoEspacio,
  ModalidadReserva,
  TipoBloqueo,
  EstadoReserva,
  AccionAuditoria,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';

/**
 * Nombre legible de cada tipo de documento. Copia de `ETIQUETA_TIPO_DOCUMENTO`
 * (src/disciplinas/requerimientos-doc.ts): el seed se precompila solo
 * (`build:seed`) y no puede importar de `src/` sin romper la imagen Docker.
 */
const ETIQUETA_TIPO_DOCUMENTO: Record<TipoDocumentacionDisciplina, string> = {
  DNI: 'DNI',
  FICHA_INSCRIPCION: 'Ficha de inscripción',
  CERTIFICADO_MEDICO_APTITUD_FISICA: 'Certificado médico de aptitud física',
  SEGURO_COBERTURA_MEDICA: 'Seguro o cobertura médica',
  AUTORIZACION_PADRES_TUTORES: 'Autorización de padres/tutores',
  CARNET_FEDERATIVO_LICENCIA_DEPORTIVA: 'Carnet federativo o licencia deportiva',
  REGLAMENTO_INTERNO_FIRMADO: 'Reglamento interno firmado',
  FICHA_TECNICA_NATACION: 'Ficha técnica: Natación',
  FICHA_TECNICA_GIMNASIO_FITNESS: 'Ficha técnica: Gimnasio/Fitness',
  FICHA_TECNICA_ARTES_MARCIALES: 'Ficha técnica: Artes marciales',
  FICHA_TECNICA_DEPORTES_CONTACTO: 'Ficha técnica: Deportes de contacto',
  COMPROBANTE_PAGO_CUOTA_SOCIAL_DEPORTIVA: 'Comprobante de pago de cuota social/deportiva',
};

/**
 * Padrón de demostración del Club Sportivo Unión de Ordóñez.
 *
 * Idempotente: se puede correr cada vez que arranca el contenedor. Crea lo que
 * falta y no pisa el estado de documentos, solicitudes ni reservas que ya
 * existan (un reinicio no deshace una aprobación hecha en la app). La peña de
 * socios sí se reubica en cada corrida para que la puerta esté abierta el día
 * de la presentación.
 *
 * Las cuentas de siempre entran con SEED_ADMIN_PASSWORD (Admin123! en local):
 * admin@socialclub.local, franco.bustos@socialclub.local,
 * diego.navarro@socialclub.local y lucia.vazquez@club.local.
 */
const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

type Genero = 'FEMENINO' | 'MASCULINO';
type CategoriaSocio = 'Cuota Juvenil' | 'Cuota General' | 'Cuota Senior';
type Doc = 'vigente' | 'por-vencer' | 'vencido' | 'en-revision' | 'rechazado';

interface Ficha {
  nombre: string;
  apellido: string;
  dni: string;
  nacimiento: string;
  genero: Genero;
  email?: string;
  telefono?: string;
  roles?: string[];
  categoria?: CategoriaSocio | null;
  alta?: string;
  baja?: string;
  deudaSocial?: number;
  disciplina?: string;
  categoriaDisciplina?: string;
  altaDisciplina?: string;
  bajaDisciplina?: string;
  deudaDeportiva?: number;
  doc?: Doc;
  excepcionHasta?: string;
  solicitud?: {
    disciplina: string;
    categoria: string;
    estado: EstadoSolicitudInscripcion;
    motivo?: string;
  };
}

const NOMBRES_M = [
  'Juan', 'Pedro', 'Martín', 'Facundo', 'Gonzalo', 'Nicolás', 'Santiago', 'Tomás',
  'Mateo', 'Ignacio', 'Joaquín', 'Ramiro', 'Emiliano', 'Agustín', 'Bruno', 'Benjamín',
  'Leandro', 'Gastón', 'Ezequiel', 'Matías', 'Federico', 'Andrés', 'Cristian', 'Oscar',
];
const NOMBRES_F = [
  'Ana', 'María', 'Florencia', 'Carla', 'Julieta', 'Agustina', 'Luciana', 'Daniela',
  'Carolina', 'Micaela', 'Rocío', 'Brenda', 'Natalia', 'Silvina', 'Andrea', 'Paula',
  'Gabriela', 'Noelia', 'Yamila', 'Celeste', 'Pilar', 'Irene', 'Malena', 'Ailín',
];
const APELLIDOS = [
  'Ferreyra', 'Gómez', 'Pereyra', 'Álvarez', 'Benítez', 'Sosa', 'Luna', 'Quiroga',
  'Molina', 'Aguirre', 'Cáceres', 'Roldán', 'Ponce', 'Ibáñez', 'Domínguez', 'Acosta',
  'Vera', 'Maidana', 'Ortiz', 'Correa', 'Paz', 'Figueroa', 'Herrera', 'Romero',
  'Suárez', 'Medina', 'Castro', 'Rojas', 'Vargas', 'Torres', 'Flores', 'Aguilar',
];

function dia(iso: string) {
  const [anio, mes, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, d, 15, 0, 0));
}

function mesesEntre(desde: Date, hasta: Date) {
  const meses: string[] = [];
  const cursor = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), 1));
  const fin = new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), 1));
  while (cursor <= fin) {
    meses.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return meses;
}

function partesArgentina(ahora = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Argentina/Cordoba',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(ahora)
      .map((parte) => [parte.type, parte.value]),
  );
  return { anio: Number(partes.year), mes: Number(partes.month), dia: Number(partes.day), hora: Number(partes.hour) };
}

/** Un horario de reloj del club (UTC−3), hoy + `dias`. */
function enElClub(dias: number, hora: number, minuto = 0) {
  const hoy = partesArgentina();
  return new Date(Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia + dias, hora + 3, minuto, 0));
}

/**
 * La peña que se valida en la puerta. De noche queda para el día siguiente a
 * las 11:00 (la puerta abre a las 08:00). Durante el día, si todavía no son
 * las 11, es hoy a las 11; si no, empieza dentro de 2 horas y termina a las 23.
 */
function horarioPena(ahora = new Date()) {
  const { hora } = partesArgentina(ahora);
  if (hora >= 18) {
    return { inicio: enElClub(1, 11), fin: enElClub(1, 23) };
  }
  const inicio = hora < 9 ? enElClub(0, 11) : new Date(ahora.getTime() + 2 * 60 * 60 * 1000);
  const fin = enElClub(0, 23);
  return { inicio, fin: fin > inicio ? fin : new Date(inicio.getTime() + 4 * 60 * 60 * 1000) };
}

function cuando(fecha: Date) {
  return fecha.toLocaleString('es-AR', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Cordoba',
  });
}

let secuencia = 0;
function personaDeMasa(genero: Genero, nacimiento: string, telefono: string): Pick<Ficha, 'nombre' | 'apellido' | 'dni' | 'nacimiento' | 'genero' | 'telefono'> {
  const i = secuencia++;
  const nombres = genero === 'MASCULINO' ? NOMBRES_M : NOMBRES_F;
  return {
    nombre: nombres[i % nombres.length],
    apellido: APELLIDOS[(i * 3) % APELLIDOS.length],
    dni: String(41200000 + i * 97),
    nacimiento,
    genero,
    telefono,
  };
}

function armarMasa(): Ficha[] {
  const fichas: Ficha[] = [];
  const sumar = (cantidad: number, armar: (i: number) => Ficha) => {
    for (let i = 0; i < cantidad; i += 1) fichas.push(armar(i));
  };
  const base = (genero: Genero, anio: number, i: number, extra: Partial<Ficha>): Ficha => ({
    ...personaDeMasa(genero, `${anio}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`, `3534-${String(430000 + secuencia).padStart(6, '0')}`),
    categoria: 'Cuota General',
    alta: '2026-03-15',
    altaDisciplina: '2026-03-15',
    doc: 'vigente',
    ...extra,
  });

  sumar(12, (i) => base('MASCULINO', 1990 + (i % 10), i, { disciplina: 'Fútbol', categoriaDisciplina: 'Primera' }));
  sumar(5, (i) => base('MASCULINO', 1968 + i, i, { disciplina: 'Fútbol', categoriaDisciplina: 'Veteranos' }));
  sumar(5, (i) => base('MASCULINO', 2014 + (i % 3), i, { categoria: 'Cuota Juvenil', disciplina: 'Fútbol', categoriaDisciplina: 'Escuelita' }));
  sumar(8, (i) => base('FEMENINO', 1994 + (i % 8), i, { disciplina: 'Hockey sobre césped', categoriaDisciplina: 'Primera' }));
  sumar(4, (i) => base('FEMENINO', 2015 + (i % 2), i, { categoria: 'Cuota Juvenil', disciplina: 'Hockey sobre césped', categoriaDisciplina: 'Escuelita' }));
  sumar(4, (i) => base(i % 2 === 0 ? 'FEMENINO' : 'MASCULINO', 1988 + i, i, { disciplina: 'Básquet', categoriaDisciplina: 'Primera' }));
  sumar(6, (i) => base(i % 2 === 0 ? 'FEMENINO' : 'MASCULINO', 1985 + i, i, { disciplina: 'Natación', categoriaDisciplina: 'Adultos' }));
  sumar(4, (i) => base(i % 2 === 0 ? 'FEMENINO' : 'MASCULINO', 2016 + (i % 2), i, { categoria: null, disciplina: 'Natación', categoriaDisciplina: 'Escuelita', alta: undefined }));
  sumar(6, (i) => base(i % 2 === 0 ? 'FEMENINO' : 'MASCULINO', 1952 + i, i, { categoria: 'Cuota Senior', disciplina: 'Bochas', categoriaDisciplina: 'Única', doc: undefined }));
  sumar(4, (i) => base(i % 2 === 0 ? 'FEMENINO' : 'MASCULINO', 1980 + i, i, { disciplina: 'Gimnasio', categoriaDisciplina: 'Libre' }));
  sumar(4, (i) => base('FEMENINO', 2012 + (i % 3), i, { categoria: 'Cuota Juvenil', disciplina: 'Patín', categoriaDisciplina: 'Avanzadas' }));
  sumar(6, (i) => base(i % 2 === 0 ? 'FEMENINO' : 'MASCULINO', 1978 + i, i, { disciplina: undefined, categoriaDisciplina: undefined, altaDisciplina: undefined, doc: undefined }));
  sumar(2, (i) => base('MASCULINO', 1986 + i, i, { disciplina: 'Fútbol', categoriaDisciplina: 'Primera', deudaSocial: 1 }));
  sumar(2, (i) => base('FEMENINO', 1991 + i, i, { disciplina: 'Hockey sobre césped', categoriaDisciplina: 'Primera', deudaSocial: 2 }));
  sumar(2, (i) => base('MASCULINO', 1975 + i, i, { disciplina: 'Gimnasio', categoriaDisciplina: 'Libre', deudaSocial: 3 }));
  sumar(3, (i) => base('MASCULINO', 1996 + i, i, { disciplina: 'Fútbol', categoriaDisciplina: 'Primera', deudaDeportiva: 2 }));
  sumar(3, (i) => base(i % 2 === 0 ? 'FEMENINO' : 'MASCULINO', 1982 + i, i, {
    disciplina: 'Gimnasio',
    categoriaDisciplina: 'Libre',
    alta: '2025-08-15',
    baja: '2026-06-15',
    altaDisciplina: '2025-08-15',
    bajaDisciplina: '2026-06-15',
    doc: undefined,
  }));
  return fichas;
}

const HISTORIAS: Ficha[] = [
  {
    nombre: 'Alejandro', apellido: 'Ramos', dni: '27884521', nacimiento: '1982-05-12', genero: 'MASCULINO',
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@socialclub.local', telefono: '3534-420100', roles: ['ADMIN'],
  },
  {
    nombre: 'Franco', apellido: 'Bustos', dni: '33410287', nacimiento: '1990-11-03', genero: 'MASCULINO',
    email: 'franco.bustos@socialclub.local', telefono: '3534-420210', roles: ['COLABORADOR'],
  },
  {
    nombre: 'Diego', apellido: 'Navarro', dni: '31220844', nacimiento: '1988-02-19', genero: 'MASCULINO',
    email: 'diego.navarro@socialclub.local', telefono: '3534-420330', roles: ['DELEGADO', 'SOCIO'],
    categoria: 'Cuota General', alta: '2024-03-15', disciplina: 'Fútbol', categoriaDisciplina: 'Primera',
    altaDisciplina: '2024-03-15', doc: 'vigente',
  },
  {
    nombre: 'Laura', apellido: 'Ferreyra', dni: '30119456', nacimiento: '1986-07-22', genero: 'FEMENINO',
    email: 'laura.ferreyra@socialclub.local', telefono: '3534-420340', roles: ['DELEGADO', 'SOCIO'],
    categoria: 'Cuota General', alta: '2023-04-15', disciplina: 'Natación', categoriaDisciplina: 'Adultos',
    altaDisciplina: '2023-04-15', doc: 'vigente',
  },
  {
    nombre: 'Lucía', apellido: 'Vázquez', dni: '40155290', nacimiento: '1998-09-14', genero: 'FEMENINO',
    email: 'lucia.vazquez@club.local', telefono: '3534-421590', roles: ['SOCIO'],
    categoria: 'Cuota General', alta: '2024-02-15', disciplina: 'Hockey sobre césped', categoriaDisciplina: 'Primera',
    altaDisciplina: '2024-02-15', doc: 'vigente',
  },
  {
    nombre: 'Pablo', apellido: 'Sosa', dni: '28901334', nacimiento: '1979-01-28', genero: 'MASCULINO',
    email: 'pablo.sosa@club.local', telefono: '3534-421602', roles: ['SOCIO'],
    categoria: 'Cuota General', alta: '2025-05-15', disciplina: 'Fútbol', categoriaDisciplina: 'Veteranos',
    altaDisciplina: '2025-05-15', doc: 'vigente', deudaSocial: 2,
  },
  {
    nombre: 'Valentina', apellido: 'Luna', dni: '42110873', nacimiento: '2001-04-09', genero: 'FEMENINO',
    email: 'valentina.luna@club.local', telefono: '3534-421714', roles: ['SOCIO'],
    categoria: 'Cuota General', alta: '2026-02-15', disciplina: 'Hockey sobre césped', categoriaDisciplina: 'Primera',
    altaDisciplina: '2026-02-15', doc: 'vigente',
    solicitud: { disciplina: 'Natación', categoria: 'Adultos', estado: EstadoSolicitudInscripcion.PENDIENTE },
  },
  {
    nombre: 'Sofía', apellido: 'Ibáñez', dni: '41882015', nacimiento: '2003-12-02', genero: 'FEMENINO',
    email: 'sofia.ibanez@club.local', telefono: '3534-421803', roles: ['SOCIO'],
    categoria: 'Cuota General', alta: '2026-04-15', disciplina: 'Básquet', categoriaDisciplina: 'Primera',
    altaDisciplina: '2026-04-15', doc: 'rechazado',
  },
  {
    nombre: 'Marcos', apellido: 'Vera', dni: '35661208', nacimiento: '1995-06-18', genero: 'MASCULINO',
    email: 'marcos.vera@club.local', telefono: '3534-421911', roles: ['SOCIO'],
    categoria: 'Cuota General', alta: '2026-01-15', disciplina: 'Fútbol', categoriaDisciplina: 'Primera',
    altaDisciplina: '2026-01-15', doc: 'en-revision',
  },
  {
    nombre: 'Camila', apellido: 'Ortiz', dni: '40773412', nacimiento: '2000-08-30', genero: 'FEMENINO',
    email: 'camila.ortiz@club.local', telefono: '3534-422015', roles: [],
    disciplina: 'Natación', categoriaDisciplina: 'Adultos', altaDisciplina: '2026-05-15', doc: 'en-revision',
  },
  {
    nombre: 'Juana', apellido: 'Pereyra', dni: '52109448', nacimiento: '2014-03-11', genero: 'FEMENINO',
    telefono: '3534-422120', categoria: 'Cuota Juvenil', alta: '2026-03-15',
    disciplina: 'Hockey sobre césped', categoriaDisciplina: 'Escuelita', altaDisciplina: '2026-03-15', doc: 'por-vencer',
  },
  {
    nombre: 'Thiago', apellido: 'Gómez', dni: '53021876', nacimiento: '2015-10-07', genero: 'MASCULINO',
    telefono: '3534-422233', disciplina: 'Fútbol', categoriaDisciplina: 'Escuelita', altaDisciplina: '2026-04-15',
    doc: 'vencido', excepcionHasta: '2026-11-30',
  },
  {
    nombre: 'Rosa', apellido: 'Medina', dni: '14550923', nacimiento: '1954-02-25', genero: 'FEMENINO',
    telefono: '3534-422340', categoria: 'Cuota Senior', alta: '2019-03-15',
    disciplina: 'Bochas', categoriaDisciplina: 'Única', altaDisciplina: '2019-03-15',
  },
  {
    nombre: 'Hernán', apellido: 'Correa', dni: '26334019', nacimiento: '1981-09-05', genero: 'MASCULINO',
    telefono: '3534-422401', categoria: 'Cuota General', alta: '2025-03-15', baja: '2026-06-15',
    disciplina: 'Gimnasio', categoriaDisciplina: 'Libre', altaDisciplina: '2025-03-15', bajaDisciplina: '2026-06-15',
  },
  {
    nombre: 'Emma', apellido: 'Roldán', dni: '54017662', nacimiento: '2017-01-19', genero: 'FEMENINO',
    telefono: '3534-422515',
    solicitud: {
      disciplina: 'Natación', categoria: 'Escuelita',
      estado: EstadoSolicitudInscripcion.PENDIENTE_DOCUMENTACION,
      motivo: 'Falta el certificado médico de aptitud física.',
    },
  },
  {
    nombre: 'Ricardo', apellido: 'Paz', dni: '22441807', nacimiento: '1972-11-16', genero: 'MASCULINO',
    telefono: '3534-422608', categoria: 'Cuota General', alta: '2022-05-15',
    disciplina: 'Gimnasio', categoriaDisciplina: 'Libre', altaDisciplina: '2022-05-15', doc: 'vigente',
    solicitud: {
      disciplina: 'Fútbol', categoria: 'Veteranos',
      estado: EstadoSolicitudInscripcion.RECHAZADA,
      motivo: 'La categoría de Veteranos completó el cupo de este año.',
    },
  },
];

const CUOTAS_SOCIALES: Record<CategoriaSocio, Record<string, number>> = {
  'Cuota Juvenil': { '2025-01': 8000, '2026-01': 12000, '2026-07': 15000 },
  'Cuota General': { '2025-01': 14000, '2026-01': 20000, '2026-07': 24000 },
  'Cuota Senior': { '2025-01': 10000, '2026-01': 15000, '2026-07': 18000 },
};

const DESCRIPCION_CUOTA: Record<CategoriaSocio, string> = {
  'Cuota Juvenil': 'Hasta los 17 años. Incluye el ingreso a la sede y el descuento de socio en las actividades.',
  'Cuota General': 'De 18 a 59 años. La cuota del socio del club.',
  'Cuota Senior': 'Desde los 60 años.',
};

interface DisciplinaSeed {
  nombre: string;
  descripcion: string;
  genero: GeneroDisciplina | null;
  edadMinima: number | null;
  edadMaxima: number | null;
  categorias: { nombre: string; edadMinima: number | null; edadMaxima: number | null; genero?: GeneroDisciplina | null }[];
  certificado: boolean;
  autorizacionEn: string[];
  fichaNatacionEn: string[];
  tarifa: number;
  descuento: number;
}

const DISCIPLINAS: DisciplinaSeed[] = [
  {
    nombre: 'Fútbol',
    descripcion: 'Fútbol masculino: escuelita, inferiores, primera y veteranos. Entrena en la cancha 1.',
    genero: GeneroDisciplina.MASCULINO, edadMinima: 5, edadMaxima: null,
    categorias: [
      { nombre: 'Escuelita', edadMinima: 5, edadMaxima: 12 },
      { nombre: 'Infantiles', edadMinima: 13, edadMaxima: 15 },
      { nombre: 'Juveniles', edadMinima: 16, edadMaxima: 17 },
      { nombre: 'Primera', edadMinima: 18, edadMaxima: 35 },
      { nombre: 'Veteranos', edadMinima: 36, edadMaxima: null },
    ],
    certificado: true, autorizacionEn: ['Escuelita', 'Infantiles', 'Juveniles'], fichaNatacionEn: [],
    tarifa: 12000, descuento: 20,
  },
  {
    nombre: 'Hockey sobre césped',
    descripcion: 'Hockey femenino sobre césped, de la escuelita a primera. El club lo practica desde hace décadas.',
    genero: GeneroDisciplina.FEMENINO, edadMinima: 5, edadMaxima: null,
    categorias: [
      { nombre: 'Escuelita', edadMinima: 5, edadMaxima: 12 },
      { nombre: 'Juveniles', edadMinima: 13, edadMaxima: 17 },
      { nombre: 'Primera', edadMinima: 18, edadMaxima: null },
    ],
    certificado: true, autorizacionEn: ['Escuelita', 'Juveniles'], fichaNatacionEn: [],
    tarifa: 10000, descuento: 20,
  },
  {
    nombre: 'Básquet',
    descripcion: 'Básquet en el playón techado, formativas y primera.',
    genero: null, edadMinima: 10, edadMaxima: null,
    categorias: [
      { nombre: 'Formativas', edadMinima: 10, edadMaxima: 17 },
      { nombre: 'Primera', edadMinima: 18, edadMaxima: null },
    ],
    certificado: true, autorizacionEn: ['Formativas'], fichaNatacionEn: [],
    tarifa: 9000, descuento: 15,
  },
  {
    nombre: 'Natación',
    descripcion: 'Escuelita y adultos en la pileta del club, con turno mañana y tarde.',
    genero: null, edadMinima: 4, edadMaxima: null,
    categorias: [
      { nombre: 'Escuelita', edadMinima: 4, edadMaxima: 12 },
      { nombre: 'Adultos', edadMinima: 13, edadMaxima: null },
    ],
    certificado: true, autorizacionEn: ['Escuelita'], fichaNatacionEn: ['Adultos'],
    tarifa: 14000, descuento: 10,
  },
  {
    nombre: 'Bochas',
    descripcion: 'Bochas en la cancha de polvo, de martes a jueves por la tarde.',
    genero: null, edadMinima: 40, edadMaxima: null,
    categorias: [{ nombre: 'Única', edadMinima: 40, edadMaxima: null }],
    certificado: false, autorizacionEn: [], fichaNatacionEn: [],
    tarifa: 5000, descuento: 25,
  },
  {
    nombre: 'Gimnasio',
    descripcion: 'Sala de musculación y clases. Abierta para socios y participantes desde los 16 años.',
    genero: null, edadMinima: 16, edadMaxima: null,
    categorias: [{ nombre: 'Libre', edadMinima: 16, edadMaxima: null }],
    certificado: true, autorizacionEn: [], fichaNatacionEn: [],
    tarifa: 16000, descuento: 10,
  },
  {
    nombre: 'Patín',
    descripcion: 'Patín artístico para nenas y adolescentes, escuelita y avanzadas.',
    genero: GeneroDisciplina.FEMENINO, edadMinima: 5, edadMaxima: 18,
    categorias: [
      { nombre: 'Escuelita', edadMinima: 5, edadMaxima: 10 },
      { nombre: 'Avanzadas', edadMinima: 11, edadMaxima: 18 },
    ],
    certificado: true, autorizacionEn: ['Escuelita', 'Avanzadas'], fichaNatacionEn: [],
    tarifa: 8000, descuento: 15,
  },
];

function montoSocial(categoria: CategoriaSocio, periodo: string) {
  const escalas = Object.entries(CUOTAS_SOCIALES[categoria]).sort(([a], [b]) => a.localeCompare(b));
  let monto = escalas[0][1];
  for (const [desde, valor] of escalas) {
    if (desde <= periodo) monto = valor;
  }
  return monto;
}

function montoDeportivo(disciplina: string, esSocio: boolean) {
  const tarifa = DISCIPLINAS.find((d) => d.nombre === disciplina);
  if (!tarifa) return 0;
  const descuento = esSocio ? tarifa.descuento : 0;
  return Math.round((tarifa.tarifa * (100 - descuento)) ) / 100;
}

function esMenor(nacimiento: string) {
  return 2026 - Number(nacimiento.slice(0, 4)) < 18;
}

async function main() {
  console.log('Iniciando seed de demostración (Club Sportivo Unión de Ordóñez)...');
  const passwordPlano = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
  const passwordHash = await bcrypt.hash(passwordPlano, SALT_ROUNDS);
  const verificadoEn = new Date('2026-01-10T15:00:00.000Z');
  const hoy = new Date();

  const roles = new Map<string, number>();
  for (const [nombre, descripcion] of [
    ['ADMIN', 'Acceso completo al sistema'],
    ['COLABORADOR', 'Secretaría y operación diaria: socios, cobros y puerta'],
    ['DELEGADO', 'Delegado de una disciplina: inscripciones y documentación'],
    ['SOCIO', 'Socio del club, con acceso a Mi club'],
  ] as const) {
    const rol = await prisma.rol.upsert({
      where: { nombre },
      update: { descripcion },
      create: { nombre, descripcion },
    });
    roles.set(nombre, rol.id);
  }

  const categorias = new Map<string, number>();
  for (const nombre of Object.keys(CUOTAS_SOCIALES) as CategoriaSocio[]) {
    const categoria = await prisma.categoriaSocio.upsert({
      where: { nombre },
      update: { descripcion: DESCRIPCION_CUOTA[nombre] },
      create: { nombre, descripcion: DESCRIPCION_CUOTA[nombre] },
    });
    categorias.set(nombre, categoria.id);
    for (const [periodoAplicacion, monto] of Object.entries(CUOTAS_SOCIALES[nombre])) {
      await prisma.configuracionCuotaSocial.upsert({
        where: { categoriaId_periodoAplicacion: { categoriaId: categoria.id, periodoAplicacion } },
        update: { monto, activo: true },
        create: { categoriaId: categoria.id, periodoAplicacion, monto, activo: true },
      });
    }
  }

  const disciplinas = new Map<string, number>();
  const categoriasDisciplina = new Map<string, number>();
  for (const disciplina of DISCIPLINAS) {
    const guardada = await prisma.disciplina.upsert({
      where: { nombre: disciplina.nombre },
      update: {
        descripcion: disciplina.descripcion,
        genero: disciplina.genero,
        edadMinima: disciplina.edadMinima,
        edadMaxima: disciplina.edadMaxima,
        solicitaDocumentacion: disciplina.certificado,
        activo: true,
      },
      create: {
        nombre: disciplina.nombre,
        descripcion: disciplina.descripcion,
        genero: disciplina.genero,
        edadMinima: disciplina.edadMinima,
        edadMaxima: disciplina.edadMaxima,
        solicitaDocumentacion: disciplina.certificado,
        activo: true,
      },
    });
    disciplinas.set(disciplina.nombre, guardada.id);

    for (const categoria of disciplina.categorias) {
      const cat = await prisma.categoriaDisciplina.upsert({
        where: { disciplinaId_nombre: { disciplinaId: guardada.id, nombre: categoria.nombre } },
        update: { edadMinima: categoria.edadMinima, edadMaxima: categoria.edadMaxima, genero: categoria.genero ?? null, activo: true },
        create: {
          disciplinaId: guardada.id,
          nombre: categoria.nombre,
          edadMinima: categoria.edadMinima,
          edadMaxima: categoria.edadMaxima,
          genero: categoria.genero ?? null,
          activo: true,
        },
      });
      categoriasDisciplina.set(`${disciplina.nombre}:${categoria.nombre}`, cat.id);
    }
    await prisma.categoriaDisciplina.updateMany({
      where: {
        disciplinaId: guardada.id,
        nombre: { notIn: disciplina.categorias.map((categoria) => categoria.nombre) },
      },
      data: { activo: false },
    });

    for (const periodoAplicacion of ['2025-01', '2026-01']) {
      const monto = periodoAplicacion === '2025-01' ? Math.round(disciplina.tarifa * 0.75) : disciplina.tarifa;
      const existente = await prisma.configuracionCuotaDeportiva.findFirst({
        where: { disciplinaId: guardada.id, categoriaDisciplinaId: null, periodoAplicacion },
      });
      if (existente) {
        await prisma.configuracionCuotaDeportiva.update({
          where: { id: existente.id },
          data: { monto, descuentoSocioPorcentaje: disciplina.descuento, activo: true },
        });
      } else {
        await prisma.configuracionCuotaDeportiva.create({
          data: {
            disciplinaId: guardada.id,
            categoriaDisciplinaId: null,
            periodoAplicacion,
            monto,
            descuentoSocioPorcentaje: disciplina.descuento,
            activo: true,
          },
        });
      }
    }

    const requisitos: { tipo: TipoDocumentacionDisciplina; categoria: string | null; plazo: number }[] = [];
    if (disciplina.certificado) {
      requisitos.push({ tipo: TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA, categoria: null, plazo: 15 });
    }
    for (const categoria of disciplina.autorizacionEn) {
      requisitos.push({ tipo: TipoDocumentacionDisciplina.AUTORIZACION_PADRES_TUTORES, categoria, plazo: 0 });
    }
    for (const categoria of disciplina.fichaNatacionEn) {
      requisitos.push({ tipo: TipoDocumentacionDisciplina.FICHA_TECNICA_NATACION, categoria, plazo: 30 });
    }
    for (const requisito of requisitos) {
      const categoriaDisciplinaId = requisito.categoria
        ? categoriasDisciplina.get(`${disciplina.nombre}:${requisito.categoria}`) ?? null
        : null;
      const ya = await prisma.disciplinaRequerimientoDoc.findFirst({
        where: { disciplinaId: guardada.id, categoriaDisciplinaId, tipoDocumento: requisito.tipo },
      });
      if (!ya) {
        await prisma.disciplinaRequerimientoDoc.create({
          data: {
            disciplinaId: guardada.id,
            categoriaDisciplinaId,
            tipoDocumento: requisito.tipo,
            plazoDiasTolerancia: requisito.plazo,
          },
        });
      }
    }
  }

  await prisma.disciplina.updateMany({
    where: {
      nombre: {
        in: [
          'Jockey Femenino',
          'Administrador',
          'Algo',
          'Fútbol Prueba',
          'Fútbol Mayor',
          'Fútbol Femenino',
          'Pelota Paleta',
        ],
      },
    },
    data: { activo: false },
  });

  const fichas = [...HISTORIAS, ...armarMasa()];
  const usuariosPorEmail = new Map<string, number>();
  const personaPorDni = new Map<string, number>();
  const pagosSociales: { personaId: number; periodo: string; monto: number; metodoPago: string; fechaPago: Date }[] = [];
  const pagosDeportivos: { personaId: number; disciplinaId: number; periodo: string; monto: number; metodoPago: string; fechaPago: Date }[] = [];

  for (const ficha of fichas) {
    const email = ficha.email ?? null;
    const porDni = await prisma.persona.findUnique({ where: { dni: ficha.dni } });
    const porEmail = email ? await prisma.persona.findUnique({ where: { email } }) : null;
    const datosPersona = {
      nombre: ficha.nombre,
      apellido: ficha.apellido,
      dni: ficha.dni,
      email,
      telefono: ficha.telefono ?? null,
      genero: ficha.genero === 'FEMENINO' ? GeneroDisciplina.FEMENINO : GeneroDisciplina.MASCULINO,
      fechaNacimiento: dia(ficha.nacimiento),
      activo: true,
    };
    const persona = porDni ?? porEmail
      ? await prisma.persona.update({ where: { id: (porDni ?? porEmail)!.id }, data: datosPersona })
      : await prisma.persona.create({ data: datosPersona });
    personaPorDni.set(ficha.dni, persona.id);

    let usuarioId: number | null = null;
    if (email) {
      const usuario = await prisma.usuario.upsert({
        where: { personaId: persona.id },
        update: { email, nombre: ficha.nombre, apellido: ficha.apellido, emailVerificadoEn: verificadoEn, activo: true },
        create: {
          email, nombre: ficha.nombre, apellido: ficha.apellido, personaId: persona.id,
          passwordHash, emailVerificadoEn: verificadoEn, activo: true,
        },
      });
      usuarioId = usuario.id;
      usuariosPorEmail.set(email, usuario.id);
      const rolesDeseados = (ficha.roles ?? [])
        .map((rol) => roles.get(rol))
        .filter((rolId): rolId is number => rolId !== undefined);
      for (const rolId of rolesDeseados) {
        await prisma.usuarioRol.upsert({
          where: { usuarioId_rolId: { usuarioId: usuario.id, rolId } },
          update: {},
          create: { usuarioId: usuario.id, rolId },
        });
      }
      await prisma.usuarioRol.deleteMany({
        where: {
          usuarioId: usuario.id,
          ...(rolesDeseados.length > 0 ? { rolId: { notIn: rolesDeseados } } : {}),
        },
      });
    }

    if (ficha.categoria && ficha.alta) {
      const categoriaId = categorias.get(ficha.categoria)!;
      const fechaAlta = dia(ficha.alta);
      const fechaBaja = ficha.baja ? dia(ficha.baja) : null;
      const membresia = await prisma.membresia.findFirst({ where: { personaId: persona.id } });
      if (membresia) {
        await prisma.membresia.update({
          where: { id: membresia.id },
          data: { categoriaId, fechaAlta, fechaBaja, activo: !fechaBaja },
        });
      } else {
        await prisma.membresia.create({
          data: { personaId: persona.id, categoriaId, fechaAlta, fechaBaja, activo: !fechaBaja },
        });
      }
      const hasta = fechaBaja ?? hoy;
      const periodos = mesesEntre(fechaAlta, hasta);
      const impagos = new Set(periodos.slice(periodos.length - (ficha.deudaSocial ?? 0)));
      periodos.forEach((periodo, indice) => {
        if (impagos.has(periodo)) return;
        const metodos = ['EFECTIVO', 'TRANSFERENCIA', 'MERCADO_PAGO'];
        pagosSociales.push({
          personaId: persona.id,
          periodo,
          monto: montoSocial(ficha.categoria!, periodo),
          metodoPago: metodos[indice % metodos.length],
          fechaPago: dia(`${periodo}-08`),
        });
      });
    }

    if (ficha.disciplina && ficha.categoriaDisciplina && ficha.altaDisciplina) {
      const disciplinaId = disciplinas.get(ficha.disciplina);
      const categoriaDisciplinaId = categoriasDisciplina.get(`${ficha.disciplina}:${ficha.categoriaDisciplina}`);
      if (disciplinaId && categoriaDisciplinaId) {
        const fechaAlta = dia(ficha.altaDisciplina);
        const fechaBaja = ficha.bajaDisciplina ? dia(ficha.bajaDisciplina) : null;
        const inscripcion = await prisma.inscripcion.upsert({
          where: { personaId_disciplinaId: { personaId: persona.id, disciplinaId } },
          update: { categoriaDisciplinaId, fechaInscripcion: fechaAlta, fechaBaja, activo: !fechaBaja },
          create: {
            personaId: persona.id, disciplinaId, categoriaDisciplinaId,
            fechaInscripcion: fechaAlta, fechaBaja, activo: !fechaBaja,
          },
        });
        const periodo = await prisma.periodoInscripcion.findFirst({ where: { inscripcionId: inscripcion.id } });
        if (!periodo) {
          await prisma.periodoInscripcion.create({ data: { inscripcionId: inscripcion.id, desde: fechaAlta, hasta: fechaBaja } });
        }
        const esSocio = Boolean(ficha.categoria);
        const periodos = mesesEntre(fechaAlta, fechaBaja ?? hoy);
        const impagos = new Set(periodos.slice(periodos.length - (ficha.deudaDeportiva ?? 0)));
        periodos.forEach((periodo, indice) => {
          if (impagos.has(periodo)) return;
          pagosDeportivos.push({
            personaId: persona.id,
            disciplinaId,
            periodo,
            monto: montoDeportivo(ficha.disciplina!, esSocio),
            metodoPago: indice % 2 === 0 ? 'EFECTIVO' : 'TRANSFERENCIA',
            fechaPago: dia(`${periodo}-08`),
          });
        });

        if (ficha.doc) {
          await asegurarDocumentacion(
            persona.id,
            ficha,
            usuariosPorEmail.get(process.env.SEED_ADMIN_EMAIL ?? 'admin@socialclub.local') ?? null,
          );
        }
        if (ficha.excepcionHasta) {
          const ya = await prisma.habilitacionExcepcional.findFirst({ where: { inscripcionId: inscripcion.id } });
          const adminId = usuariosPorEmail.get(process.env.SEED_ADMIN_EMAIL ?? 'admin@socialclub.local');
          if (!ya && adminId) {
            await prisma.habilitacionExcepcional.create({
              data: {
                inscripcionId: inscripcion.id,
                motivo: 'El certificado nuevo está en trámite en el hospital de Ordóñez. Se lo habilita hasta fin de mes.',
                hasta: dia(ficha.excepcionHasta),
                responsableId: adminId,
              },
            });
          }
        }
      }
    }

    if (ficha.solicitud) {
      const disciplinaId = disciplinas.get(ficha.solicitud.disciplina);
      const categoriaDisciplinaId = categoriasDisciplina.get(`${ficha.solicitud.disciplina}:${ficha.solicitud.categoria}`) ?? null;
      if (disciplinaId) {
        const ya = await prisma.solicitudInscripcion.findFirst({
          where: { personaId: persona.id, disciplinaId, estado: ficha.solicitud.estado },
        });
        if (!ya) {
          const resuelta = ficha.solicitud.estado === 'APROBADA' || ficha.solicitud.estado === 'RECHAZADA';
          await prisma.solicitudInscripcion.create({
            data: {
              personaId: persona.id,
              disciplinaId,
              categoriaDisciplinaId,
              estado: ficha.solicitud.estado,
              fechaSolicitud: dia('2026-11-08'),
              fechaResolucion: resuelta ? dia('2026-11-10') : null,
              motivoRechazo: ficha.solicitud.motivo ?? null,
              revisadoPorId: resuelta ? usuariosPorEmail.get('diego.navarro@socialclub.local') ?? null : null,
            },
          });
        }
      }
    }
  }

  await crearPagos(pagosSociales, pagosDeportivos, usuariosPorEmail.get('franco.bustos@socialclub.local') ?? null);

  const diegoId = usuariosPorEmail.get('diego.navarro@socialclub.local');
  const lauraId = usuariosPorEmail.get('laura.ferreyra@socialclub.local');
  if (diegoId) await encargar(diegoId, ['Fútbol', 'Hockey sobre césped', 'Básquet'], disciplinas);
  if (lauraId) await encargar(lauraId, ['Natación', 'Patín'], disciplinas);

  const espacios = await asegurarEspacios(disciplinas);
  const adminId = usuariosPorEmail.get(process.env.SEED_ADMIN_EMAIL ?? 'admin@socialclub.local') ?? null;
  await asegurarBloqueos(espacios, disciplinas, adminId);
  await asegurarReservas(espacios, usuariosPorEmail, adminId);
  await asegurarEventos(espacios, usuariosPorEmail);
  await asegurarAuditoria(adminId, personaPorDni);

  const [socios, participantes, disciplinasActivas] = await Promise.all([
    prisma.persona.count({ where: { membresias: { some: { activo: true } } } }),
    prisma.persona.count({ where: { inscripciones: { some: { activo: true } } } }),
    prisma.disciplina.count({ where: { activo: true } }),
  ]);
  const pena = horarioPena();
  console.log('\nSeed de demostración listo.');
  console.log(`  ${socios} socios activos, ${participantes} personas inscriptas, ${disciplinasActivas} disciplinas.`);
  console.log(`  Peña de socios: ${cuando(pena.inicio)} (la puerta abre 3 h antes).`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`  Entran con ${passwordPlano}:`);
    console.log('    admin@socialclub.local            administrador');
    console.log('    franco.bustos@socialclub.local    colaborador, en la puerta');
    console.log('    diego.navarro@socialclub.local    delegado de fútbol, hockey y básquet, y socio');
    console.log('    laura.ferreyra@socialclub.local   delegada de natación y patín, y socia');
    console.log('    lucia.vazquez@club.local          socia, hockey. Es quien se muestra en Mi club');
    console.log('    pablo.sosa@club.local             socio con dos cuotas sociales adeudadas');
    console.log('    camila.ortiz@club.local           participante, sin rol. Su certificado está en revisión');
  } else {
    console.log('  Cuentas de staff y socios creadas. Contraseñas ocultas en producción.');
  }
}

async function asegurarDocumentacion(personaId: number, ficha: Ficha, revisorId: number | null) {
  const disciplina = DISCIPLINAS.find((d) => d.nombre === ficha.disciplina);
  if (!disciplina || !ficha.doc) return;
  const menor = esMenor(ficha.nacimiento);
  const tipos: TipoDocumentacionDisciplina[] = [];
  if (disciplina.certificado) tipos.push(TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA);
  if (menor && disciplina.autorizacionEn.includes(ficha.categoriaDisciplina ?? '')) {
    tipos.push(TipoDocumentacionDisciplina.AUTORIZACION_PADRES_TUTORES);
  }
  if (disciplina.fichaNatacionEn.includes(ficha.categoriaDisciplina ?? '')) {
    tipos.push(TipoDocumentacionDisciplina.FICHA_TECNICA_NATACION);
  }

  for (const tipo of tipos) {
    const ya = await prisma.documentacion.findFirst({ where: { personaId, tipoDocumento: tipo } });
    if (ya) {
      // El padrón viejo guardó el enum en el texto libre. Se corrige sin tocar la revisión.
      if (ya.tipo === tipo) {
        await prisma.documentacion.update({
          where: { id: ya.id },
          data: { tipo: ETIQUETA_TIPO_DOCUMENTO[tipo] },
        });
      }
      continue;
    }
    const esCertificado = tipo === TipoDocumentacionDisciplina.CERTIFICADO_MEDICO_APTITUD_FISICA;
    const estado = esCertificado
      ? ficha.doc === 'en-revision'
        ? EstadoRevisionDocumento.PENDIENTE_REVISION
        : ficha.doc === 'rechazado'
          ? EstadoRevisionDocumento.RECHAZADO
          : EstadoRevisionDocumento.APROBADO
      : EstadoRevisionDocumento.APROBADO;
    const vencimiento = !esCertificado
      ? null
      : ficha.doc === 'vencido'
        ? dia('2026-10-01')
        : ficha.doc === 'por-vencer'
          ? dia('2026-12-01')
          : ficha.doc === 'en-revision' || ficha.doc === 'rechazado'
            ? dia('2027-04-30')
            : dia('2027-04-30');
    await prisma.documentacion.create({
      data: {
        personaId,
        tipo: ETIQUETA_TIPO_DOCUMENTO[tipo],
        tipoDocumento: tipo,
        fechaVencimiento: vencimiento,
        estadoRevision: estado,
        cargadoPorTitular: estado !== EstadoRevisionDocumento.APROBADO,
        revisadoPorId: estado === EstadoRevisionDocumento.APROBADO ? revisorId : estado === EstadoRevisionDocumento.RECHAZADO ? revisorId : null,
        revisadoEn: estado === EstadoRevisionDocumento.PENDIENTE_REVISION ? null : dia('2026-08-20'),
        motivoRechazo: estado === EstadoRevisionDocumento.RECHAZADO
          ? 'La foto del certificado no se lee. Hay que subirla de nuevo.'
          : null,
        archivoNombre: esCertificado ? 'certificado-medico.pdf' : null,
      },
    });
  }
}

async function crearPagos(
  sociales: { personaId: number; periodo: string; monto: number; metodoPago: string; fechaPago: Date }[],
  deportivos: { personaId: number; disciplinaId: number; periodo: string; monto: number; metodoPago: string; fechaPago: Date }[],
  responsableId: number | null,
) {
  const personas = [...new Set(sociales.map((p) => p.personaId))];
  const yaSociales = new Set(
    (await prisma.pago.findMany({ where: { personaId: { in: personas } }, select: { personaId: true, periodo: true } }))
      .map((p) => `${p.personaId}:${p.periodo}`),
  );
  const nuevosSociales = sociales.filter((p) => !yaSociales.has(`${p.personaId}:${p.periodo}`));
  for (let i = 0; i < nuevosSociales.length; i += 500) {
    await prisma.pago.createMany({ data: nuevosSociales.slice(i, i + 500) });
  }

  const yaDeportivos = new Set(
    (await prisma.pagoCuotaDeportiva.findMany({
      where: { personaId: { in: [...new Set(deportivos.map((p) => p.personaId))] } },
      select: { personaId: true, disciplinaId: true, periodo: true },
    })).map((p) => `${p.personaId}:${p.disciplinaId}:${p.periodo}`),
  );
  const nuevosDeportivos = deportivos
    .filter((p) => !yaDeportivos.has(`${p.personaId}:${p.disciplinaId}:${p.periodo}`))
    .map((p) => ({ ...p, responsableId }));
  for (let i = 0; i < nuevosDeportivos.length; i += 500) {
    await prisma.pagoCuotaDeportiva.createMany({ data: nuevosDeportivos.slice(i, i + 500) });
  }
  console.log(`  ${nuevosSociales.length} cuotas sociales y ${nuevosDeportivos.length} cuotas deportivas nuevas.`);
}

async function encargar(usuarioId: number, nombres: string[], disciplinas: Map<string, number>) {
  for (const nombre of nombres) {
    const disciplinaId = disciplinas.get(nombre);
    if (!disciplinaId) continue;
    await prisma.delegadoDisciplina.upsert({
      where: { usuarioId_disciplinaId: { usuarioId, disciplinaId } },
      update: {},
      create: { usuarioId, disciplinaId },
    });
  }
}

async function asegurarEspacios(disciplinas: Map<string, number>) {
  const definiciones: {
    nombre: string; tipo: TipoEspacio; modalidad: ModalidadReserva; capacidad: number;
    ubicacion: string; descripcion: string; precio: number; precioSocio: number; seña: number; descuento: number;
    disciplinas: string[];
  }[] = [
    { nombre: 'Cancha 1', tipo: TipoEspacio.DEPORTIVO, modalidad: ModalidadReserva.POR_HORA, capacidad: 22, ubicacion: 'Predio del club, Ordóñez', descripcion: 'Cancha de fútbol 11 con iluminación.', precio: 14000, precioSocio: 11000, seña: 5000, descuento: 20, disciplinas: ['Fútbol'] },
    { nombre: 'Cancha de hockey', tipo: TipoEspacio.DEPORTIVO, modalidad: ModalidadReserva.POR_HORA, capacidad: 22, ubicacion: 'Predio del club, Ordóñez', descripcion: 'Cancha de césped de hockey.', precio: 12000, precioSocio: 9000, seña: 4000, descuento: 25, disciplinas: ['Hockey sobre césped'] },
    { nombre: 'Salón social', tipo: TipoEspacio.SOCIAL, modalidad: ModalidadReserva.POR_HORA, capacidad: 120, ubicacion: 'Sede del club, Ordóñez', descripcion: 'Salón con cocina, escenario y mesas. Se usa para peñas, cumpleaños y asambleas.', precio: 35000, precioSocio: 28000, seña: 15000, descuento: 20, disciplinas: [] },
    { nombre: 'Quincho', tipo: TipoEspacio.SOCIAL, modalidad: ModalidadReserva.DIA_COMPLETO, capacidad: 40, ubicacion: 'Parque del club, Ordóñez', descripcion: 'Quincho techado con parrilla, mesas y baño. Se reserva el día completo.', precio: 40000, precioSocio: 30000, seña: 12000, descuento: 25, disciplinas: [] },
    { nombre: 'Pileta', tipo: TipoEspacio.DEPORTIVO, modalidad: ModalidadReserva.POR_HORA, capacidad: 30, ubicacion: 'Sede del club, Ordóñez', descripcion: 'Pileta del club, con vestuarios.', precio: 18000, precioSocio: 14000, seña: 6000, descuento: 20, disciplinas: ['Natación'] },
    { nombre: 'Cancha de bochas', tipo: TipoEspacio.DEPORTIVO, modalidad: ModalidadReserva.POR_HORA, capacidad: 8, ubicacion: 'Predio del club, Ordóñez', descripcion: 'Cancha de bochas de polvo de ladrillo.', precio: 6000, precioSocio: 4000, seña: 2000, descuento: 30, disciplinas: ['Bochas'] },
  ];
  const espacios = new Map<string, number>();
  for (const definicion of definiciones) {
    const { disciplinas: nombres, capacidad, seña, ...datos } = definicion;
    const existente = await prisma.espacio.findFirst({ where: { nombre: definicion.nombre } });
    const espacio = existente
      ? await prisma.espacio.update({
          where: { id: existente.id },
          data: {
            tipo: datos.tipo, modalidad: datos.modalidad, capacidadMaxima: capacidad, ubicacion: datos.ubicacion,
            descripcion: datos.descripcion, precio: datos.precio, precioSocio: datos.precioSocio, montoSena: seña,
            descuentoSocio: datos.descuento, activo: true,
          },
        })
      : await prisma.espacio.create({
          data: {
            nombre: definicion.nombre, tipo: datos.tipo, modalidad: datos.modalidad, capacidadMaxima: capacidad,
            ubicacion: datos.ubicacion, descripcion: datos.descripcion, precio: datos.precio, precioSocio: datos.precioSocio,
            montoSena: seña, descuentoSocio: datos.descuento, activo: true,
          },
        });
    espacios.set(definicion.nombre, espacio.id);
    const vinculos = await prisma.espacioDisciplina.count({ where: { espacioId: espacio.id } });
    if (vinculos === 0) {
      const data = nombres
        .map((nombre) => disciplinas.get(nombre))
        .filter((id): id is number => id !== undefined)
        .map((disciplinaId) => ({ espacioId: espacio.id, disciplinaId }));
      if (data.length > 0) await prisma.espacioDisciplina.createMany({ data });
    }
  }
  return espacios;
}

async function asegurarBloqueos(espacios: Map<string, number>, disciplinas: Map<string, number>, creadoPorId: number | null) {
  const bloqueos: { espacio: string; disciplina: string; dias: number[]; desde: string; hasta: string; horaInicio: string; horaFin: string; motivo: string }[] = [
    { espacio: 'Cancha 1', disciplina: 'Fútbol', dias: [2, 4], desde: '19:00', hasta: '21:00', horaInicio: '19:00', horaFin: '21:00', motivo: 'Entrenamiento de Fútbol, Primera y Veteranos' },
    { espacio: 'Cancha de hockey', disciplina: 'Hockey sobre césped', dias: [1, 3], desde: '18:00', hasta: '20:00', horaInicio: '18:00', horaFin: '20:00', motivo: 'Entrenamiento de Hockey sobre césped' },
    { espacio: 'Pileta', disciplina: 'Natación', dias: [1, 2, 3, 4, 5], desde: '17:00', hasta: '19:00', horaInicio: '17:00', horaFin: '19:00', motivo: 'Turno de Natación, escuelita y adultos' },
    { espacio: 'Cancha de bochas', disciplina: 'Bochas', dias: [2, 4], desde: '15:00', hasta: '17:00', horaInicio: '15:00', horaFin: '17:00', motivo: 'Partidos de Bochas' },
  ];
  for (const bloqueo of bloqueos) {
    const espacioId = espacios.get(bloqueo.espacio);
    const disciplinaId = disciplinas.get(bloqueo.disciplina);
    if (!espacioId || !disciplinaId) continue;
    const ya = await prisma.bloqueoAgenda.findFirst({ where: { motivo: bloqueo.motivo } });
    if (ya) continue;
    await prisma.bloqueoAgenda.create({
      data: {
        espacioId, disciplinaId, tipo: TipoBloqueo.RECURRENTE, diasSemana: bloqueo.dias,
        horaInicio: bloqueo.horaInicio, horaFin: bloqueo.horaFin,
        vigenteDesde: dia('2026-03-01'), vigenteHasta: dia('2026-12-15'),
        motivo: bloqueo.motivo, activo: true, creadoPorId,
      },
    });
  }
}

async function asegurarReservas(espacios: Map<string, number>, usuarios: Map<string, number>, adminId: number | null) {
  const lucia = usuarios.get('lucia.vazquez@club.local');
  const valentina = usuarios.get('valentina.luna@club.local');
  const diego = usuarios.get('diego.navarro@socialclub.local');
  const quincho = espacios.get('Quincho');
  const salon = espacios.get('Salón social');
  const cancha = espacios.get('Cancha 1');
  if (!lucia || !valentina || !diego || !quincho || !salon || !cancha) return;

  const reservas: {
    codigo: string; espacioId: number; usuarioId: number; inicio: Date; fin: Date;
    estado: EstadoReserva; montoTotal: number; montoSena: number; observaciones: string;
    limitePagoSena?: Date; senaPagadaEn?: Date; metodoPagoSena?: string; motivoRechazo?: string;
  }[] = [
    {
      codigo: 'RES-1842', espacioId: quincho, usuarioId: lucia,
      inicio: enElClub(12, 0), fin: enElClub(13, 0), estado: EstadoReserva.CONFIRMADA,
      montoTotal: 30000, montoSena: 12000, observaciones: 'Asado de fin de año de la familia.',
      senaPagadaEn: dia('2026-11-12'), metodoPagoSena: 'TRANSFERENCIA',
    },
    {
      codigo: 'RES-1847', espacioId: salon, usuarioId: valentina,
      inicio: enElClub(8, 21), fin: enElClub(9, 1), estado: EstadoReserva.PENDIENTE_APROBACION,
      montoTotal: 84000, montoSena: 15000, observaciones: 'Cumpleaños de 15, unas 80 personas.',
    },
    {
      codigo: 'RES-1838', espacioId: cancha, usuarioId: diego,
      inicio: enElClub(5, 20), fin: enElClub(5, 22), estado: EstadoReserva.APROBADA_PENDIENTE_PAGO,
      montoTotal: 22000, montoSena: 5000, observaciones: 'Fútbol 5 con el grupo de los jueves.',
      limitePagoSena: enElClub(3, 18),
    },
    {
      codigo: 'RES-1795', espacioId: salon, usuarioId: lucia,
      inicio: enElClub(-18, 20), fin: enElClub(-18, 23), estado: EstadoReserva.RECHAZADA,
      montoTotal: 84000, montoSena: 15000, observaciones: 'Peña chica.',
      motivoRechazo: 'Ese sábado el salón ya estaba reservado para una boda.',
    },
  ];

  for (const reserva of reservas) {
    const ya = await prisma.reserva.findUnique({ where: { codigo: reserva.codigo } });
    if (ya) {
      await prisma.reserva.update({ where: { id: ya.id }, data: { inicio: reserva.inicio, fin: reserva.fin } });
      continue;
    }
    await prisma.reserva.create({
      data: {
        ...reserva,
        esSocio: true,
        evaluadaPorId: reserva.estado === EstadoReserva.PENDIENTE_APROBACION ? null : adminId,
        evaluadaEn: reserva.estado === EstadoReserva.PENDIENTE_APROBACION ? null : dia('2026-11-11'),
      },
    });
  }
}

async function asegurarEventos(espacios: Map<string, number>, usuarios: Map<string, number>) {
  const pena = horarioPena();
  const salon = espacios.get('Salón social') ?? null;
  const cancha = espacios.get('Cancha 1') ?? null;
  const lucia = usuarios.get('lucia.vazquez@club.local');
  const compradores = ['diego.navarro@socialclub.local', 'laura.ferreyra@socialclub.local', 'valentina.luna@club.local', 'marcos.vera@club.local', 'pablo.sosa@club.local']
    .map((email) => usuarios.get(email))
    .filter((id): id is number => id !== undefined);

  const eventos: {
    nombre: string; descripcion: string; inicio: Date; fin: Date; lugar: string; espacioId: number | null;
    precio: number; descuento: number; estado: EstadoEvento; capacidad: number; vendidas: number; usadas: number;
    excluir?: number;
  }[] = [
    {
      nombre: 'Peña del día de la primavera',
      descripcion: 'Peña de septiembre en el salón, con cena y folklore.',
      inicio: dia('2026-09-19'), fin: new Date('2026-09-20T02:00:00.000Z'),
      lugar: 'Salón social', espacioId: salon, precio: 8000, descuento: 15,
      estado: EstadoEvento.FINALIZADO, capacidad: 120, vendidas: 86, usadas: 74,
    },
    {
      nombre: 'Clásico de veteranos',
      descripcion: 'Partido de veteranos contra el club de Laborde, con entrada para la hinchada.',
      inicio: dia('2026-10-11'), fin: new Date('2026-10-11T21:00:00.000Z'),
      lugar: 'Cancha 1', espacioId: cancha, precio: 4000, descuento: 20,
      estado: EstadoEvento.FINALIZADO, capacidad: 200, vendidas: 64, usadas: 58,
    },
    {
      nombre: 'Peña de socios',
      descripcion: 'Encuentro de socios con cena y música. La entrada se compra desde Mi club y se muestra en la puerta.',
      inicio: pena.inicio, fin: pena.fin,
      lugar: 'Salón social', espacioId: salon, precio: 8000, descuento: 20,
      estado: EstadoEvento.PUBLICADO, capacidad: 120, vendidas: 34, usadas: 0,
      excluir: lucia,
    },
    {
      nombre: 'Cena de fin de año',
      descripcion: 'Cena de fin de año del club, con brindis y sorteos entre los socios.',
      inicio: new Date('2026-12-19T22:30:00.000Z'), fin: new Date('2026-12-20T03:00:00.000Z'),
      lugar: 'Salón social', espacioId: salon, precio: 18000, descuento: 10,
      estado: EstadoEvento.PUBLICADO, capacidad: 120, vendidas: 28, usadas: 0,
    },
    {
      nombre: 'Torneo de verano infantil',
      descripcion: 'Encuentro de fútbol infantil con los clubes de la zona.',
      inicio: new Date('2027-01-17T12:00:00.000Z'), fin: new Date('2027-01-17T16:00:00.000Z'),
      lugar: 'Cancha 1', espacioId: cancha, precio: 3000, descuento: 0,
      estado: EstadoEvento.PUBLICADO, capacidad: 150, vendidas: 20, usadas: 0,
    },
    {
      nombre: 'Bingo de la comisión',
      descripcion: 'Se suspendió por lluvia y se va a reprogramar.',
      inicio: dia('2026-11-08'), fin: new Date('2026-11-08T23:00:00.000Z'),
      lugar: 'Salón social', espacioId: salon, precio: 2500, descuento: 0,
      estado: EstadoEvento.CANCELADO, capacidad: 80, vendidas: 0, usadas: 0,
    },
  ];

  for (const evento of eventos) {
    const datos = {
      nombre: evento.nombre,
      descripcion: evento.descripcion,
      requiereEntrada: true,
      capacidadMaxima: evento.capacidad,
      precio: evento.precio,
      descuentoSocio: evento.descuento,
      estado: evento.estado,
      fechaEvento: evento.inicio,
      fechaFin: evento.fin,
      lugarAcreditacion: evento.lugar,
      espacioId: evento.espacioId,
      inicioVenta: dia('2026-08-01'),
      finVenta: evento.fin,
    };
    const existente = await prisma.evento.findFirst({ where: { nombre: evento.nombre } });
    const guardado = existente
      ? await prisma.evento.update({ where: { id: existente.id }, data: datos })
      : await prisma.evento.create({ data: datos });

    const quienes = compradores.filter((id) => id !== evento.excluir);
    if (quienes.length > 0 && evento.vendidas > 0) {
      await vender(guardado.id, evento.precio, evento.descuento, evento.vendidas, evento.usadas, quienes, evento.inicio);
    }
    if (lucia && evento.nombre === 'Cena de fin de año') {
      await venderPropias(guardado.id, lucia, 2, 0, evento.precio, evento.descuento, evento.inicio);
    }
    if (lucia && evento.nombre === 'Peña del día de la primavera') {
      await venderPropias(guardado.id, lucia, 2, 2, evento.precio, evento.descuento, evento.inicio);
    }
    const vendidas = await prisma.entrada.count({ where: { eventoId: guardado.id } });
    await prisma.evento.update({
      where: { id: guardado.id },
      data: { entradasDisponibles: Math.max(evento.capacidad - vendidas, 0) },
    });
  }
}

async function vender(eventoId: number, precio: number, descuento: number, cantidad: number, usadas: number, compradores: number[], inicio: Date) {
  const hay = await prisma.entrada.count({ where: { eventoId } });
  if (hay >= cantidad || compradores.length === 0) return;
  const faltan = cantidad - hay;
  const porPersona = Math.ceil(faltan / compradores.length);
  let usadasPendientes = Math.max(usadas - hay, 0);
  let restantes = faltan;
  for (const comprador of compradores) {
    if (restantes <= 0) break;
    const lote = Math.min(porPersona, restantes);
    const deEsteLoteUsadas = Math.min(lote, usadasPendientes);
    const creadas = await venderPropias(eventoId, comprador, lote, deEsteLoteUsadas, precio, descuento, inicio);
    restantes -= creadas;
    usadasPendientes -= Math.min(deEsteLoteUsadas, creadas);
  }
}

async function venderPropias(eventoId: number, usuarioId: number, cantidad: number, usadas: number, precio: number, descuento: number, inicio: Date) {
  const ya = await prisma.compraEntrada.findFirst({ where: { eventoId, usuarioId } });
  if (ya) return 0;
  const unitario = Math.round((precio * (100 - descuento))) / 100;
  const compra = await prisma.compraEntrada.create({
    data: {
      usuarioId, eventoId, cantidad, precioUnitario: unitario, montoTotal: unitario * cantidad,
      estado: EstadoCompraEntrada.APROBADA, metodoPago: 'MERCADO_PAGO',
    },
  });
  await prisma.entrada.createMany({
    data: Array.from({ length: cantidad }, (_, i) => ({
      token: randomUUID(),
      eventoId,
      compraId: compra.id,
      estado: i < usadas ? EstadoEntrada.USADA : EstadoEntrada.VALIDA,
      usadaEn: i < usadas ? new Date(inicio.getTime() + 45 * 60 * 1000) : null,
    })),
  });
  return cantidad;
}

async function asegurarAuditoria(adminId: number | null, personas: Map<string, number>) {
  if (!adminId) return;
  const registros: { detalle: string; entidad: string; dni?: string }[] = [
    { detalle: 'Alta de socia: Lucía Vázquez, Cuota General', entidad: 'Membresia', dni: '40155290' },
    { detalle: 'Alta de participante: Thiago Gómez, escuelita de Fútbol', entidad: 'Inscripcion', dni: '53021876' },
    { detalle: 'Cobro de cuota social de noviembre en secretaría', entidad: 'Pago' },
    { detalle: 'Habilitación excepcional de Thiago Gómez hasta el 30/11', entidad: 'HabilitacionExcepcional', dni: '53021876' },
  ];
  for (const registro of registros) {
    const ya = await prisma.registroAuditoria.findFirst({ where: { detalle: registro.detalle } });
    if (ya) continue;
    await prisma.registroAuditoria.create({
      data: {
        accion: AccionAuditoria.CREAR,
        entidad: registro.entidad,
        idEntidad: registro.dni ? personas.get(registro.dni) ?? null : null,
        detalle: registro.detalle,
        responsableId: adminId,
        fechaHora: dia('2026-11-12'),
      },
    });
  }
}

main()
  .catch((error) => {
    console.error('Error ejecutando el seed de demostración:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
