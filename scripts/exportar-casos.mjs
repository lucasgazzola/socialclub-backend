#!/usr/bin/env node
/**
 * exportar-casos.mjs — Toma casos de prueba en TSV (la salida de /casos-prueba,
 * SIN la columna ID Caso) y los apenda a la planilla CSV "Casos de Prueba",
 * asignando IDs TC-XXX correlativos. El CSV se abre/importa nativamente en Excel.
 *
 * Los IDs los asigna SOLO este script (DT-18). No numerar a mano.
 *
 * Uso:
 *   node scripts/exportar-casos.mjs --casos=nuevos.tsv --csv="docs/exportables/casos-prueba.csv"
 *   cat nuevos.tsv | node scripts/exportar-casos.mjs --csv="ruta.csv"        (TSV por stdin)
 *   ... --dry-run     (no escribe; solo muestra las filas con su ID)
 *
 * Columnas destino: ID Caso | US asociada | Objetivo | Precondición | Datos de entrada | Pasos | Resultado Esperado | Prioridad | Tipo | Ejecutor
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  }),
);
if (!args.csv) {
  console.error('Falta --csv=<ruta a la planilla CSV>. Ver el encabezado del script.');
  process.exit(1);
}

const tsv = args.casos ? readFileSync(args.casos, 'utf8') : readFileSync(0, 'utf8');
const filas = tsv
  .split(/\r?\n/)
  .map((l) => l.trimEnd())
  .filter(Boolean)
  .filter((l) => !/^US asociada\t/i.test(l)); // descarta el encabezado si viene

if (!filas.length) {
  console.error('No se recibieron casos (TSV vacío).');
  process.exit(1);
}

const maxFromText = (text) => {
  let max = 0;
  for (const m of text.matchAll(/\bTC-(\d+)\b/g)) max = Math.max(max, Number(m[1]));
  return max;
};

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

let maxId = 0;

const py = spawnSync('python3', [join(here, 'ids-planilla.py'), '--max', '--check'], {
  encoding: 'utf8',
});
if (py.status === 2) {
  console.error('Aviso: no se encontró el .xlsx; se calcula el máximo desde los CSV de exportables.');
} else if (py.status === 1) {
  console.error(py.stderr || py.stdout);
  console.error('La planilla tiene IDs duplicados. No se asignan IDs nuevos hasta resolverlo.');
  process.exit(1);
} else if (py.status === 0) {
  maxId = Math.max(maxId, Number((py.stdout || '').trim()) || 0);
} else {
  console.error(py.stderr || 'No se pudo leer la planilla .xlsx.');
  process.exit(1);
}

const exportables = join(repoRoot, 'docs/exportables');
if (existsSync(exportables)) {
  for (const name of readdirSync(exportables)) {
    if (!name.endsWith('.csv')) continue;
    maxId = Math.max(maxId, maxFromText(readFileSync(join(exportables, name), 'utf8')));
  }
}
if (existsSync(args.csv)) {
  maxId = Math.max(maxId, maxFromText(readFileSync(args.csv, 'utf8')));
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const nuevas = filas.map((linea, i) => {
  const cols = linea.split('\t');
  if (cols.length !== 8 && cols.length !== 9) {
    console.error(
      `Fila con ${cols.length} columnas (se esperaban 8 o 9, sin ID Caso): ${linea.slice(0, 60)}…`,
    );
    process.exit(1);
  }
  const id = `TC-${String(maxId + i + 1).padStart(3, '0')}`;
  return [id, ...cols].map(csvCell).join(',');
});

if (args['dry-run']) {
  console.log(nuevas.join('\n'));
  console.error(`\n(dry-run) ${nuevas.length} caso(s) — próximo ID ${nuevas[0].split(',')[0]} — no se escribió nada.`);
  process.exit(0);
}

if (!existsSync(args.csv)) {
  const header =
    'ID Caso,US asociada,Objetivo,Precondición,Datos de entrada,Pasos,Resultado Esperado,Prioridad,Tipo,Ejecutor';
  writeFileSync(args.csv, header + '\n');
}
const actual = readFileSync(args.csv, 'utf8');
if (actual.length && !actual.endsWith('\n')) appendFileSync(args.csv, '\n');
appendFileSync(args.csv, nuevas.join('\n') + '\n');
console.error(
  `${nuevas.length} caso(s) agregados a ${args.csv} (${nuevas[0].split(',')[0]}…${nuevas.at(-1).split(',')[0]}).`,
);
