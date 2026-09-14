#!/usr/bin/env node
/**
 * exportar-casos.mjs — Toma casos de prueba en TSV (la salida de /casos-prueba,
 * SIN la columna ID Caso) y los apenda a la planilla CSV "Casos de Prueba",
 * asignando IDs TC-XXX correlativos. El CSV se abre/importa nativamente en Excel.
 *
 * Uso:
 *   node scripts/exportar-casos.mjs --casos=nuevos.tsv --csv="docs/.../Casos de Prueba.csv"
 *   cat nuevos.tsv | node scripts/exportar-casos.mjs --csv="ruta.csv"        (TSV por stdin)
 *   ... --dry-run     (no escribe; solo muestra las filas con su ID)
 *
 * Columnas destino: ID Caso | US asociada | Objetivo | Precondición | Datos de entrada | Pasos | Resultado Esperado | Prioridad | Tipo
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';

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

// Próximo ID correlativo a partir de la planilla existente.
let maxId = 0;
if (existsSync(args.csv)) {
  const csv = readFileSync(args.csv, 'utf8');
  for (const m of csv.matchAll(/\bTC-(\d+)\b/g)) maxId = Math.max(maxId, Number(m[1]));
} else {
  console.error(`Aviso: ${args.csv} no existe; se creará con encabezado.`);
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const nuevas = filas.map((linea, i) => {
  const cols = linea.split('\t');
  if (cols.length !== 8) {
    console.error(`Fila con ${cols.length} columnas (se esperaban 8): ${linea.slice(0, 60)}…`);
    process.exit(1);
  }
  const id = `TC-${String(maxId + i + 1).padStart(3, '0')}`;
  return [id, ...cols].map(csvCell).join(',');
});

if (args['dry-run']) {
  console.log(nuevas.join('\n'));
  console.error(`\n(dry-run) ${nuevas.length} caso(s) — no se escribió nada.`);
  process.exit(0);
}

if (!existsSync(args.csv)) {
  const header = 'ID Caso,US asociada,Objetivo,Precondición,Datos de entrada,Pasos,Resultado Esperado,Prioridad,Tipo';
  writeFileSync(args.csv, header + '\n');
}
const actual = readFileSync(args.csv, 'utf8');
if (actual.length && !actual.endsWith('\n')) appendFileSync(args.csv, '\n');
appendFileSync(args.csv, nuevas.join('\n') + '\n');
console.error(`${nuevas.length} caso(s) agregados a ${args.csv} (${nuevas[0].split(',')[0]}…${nuevas.at(-1).split(',')[0]}).`);
