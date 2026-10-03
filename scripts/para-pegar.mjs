#!/usr/bin/env node
/**
 * para-pegar.mjs — Regenera los TSV que se pegan en la planilla de Drive a
 * partir de los CSV consolidados de `docs/pruebas/`.
 *
 * Los CSV son la fuente (celdas con saltos de línea reales, como en la
 * planilla); los TSV son derivados: una fila = una fila y los saltos de línea
 * de cada celda pasan a " / ", así Sheets no parte las filas. Correrlo después
 * de /exportar-casos o /ejecutar-pruebas.
 *
 * Uso: node scripts/para-pegar.mjs   (o npm run docs:para-pegar)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pruebas = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'pruebas');

/** Parser de CSV con comillas (RFC 4180): soporta comas, comillas y saltos de línea en celdas. */
function leerCsv(texto) {
  const filas = [];
  let fila = [];
  let celda = '';
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') {
      fila.push(celda);
      celda = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = '';
    } else celda += c;
  }
  if (celda || fila.length) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas.filter((f) => f.some((v) => v !== ''));
}

const aTsv = (filas) =>
  filas.map((f) => f.map((v) => v.replace(/\r?\n/g, ' / ').replace(/\t/g, ' ')).join('\t')).join('\n') + '\n';

mkdirSync(join(pruebas, 'para-pegar'), { recursive: true });
for (const hoja of ['casos-prueba', 'ejecucion']) {
  const csv = readFileSync(join(pruebas, `${hoja}.csv`), 'utf8').replace(/^﻿/, '');
  const [, ...filas] = leerCsv(csv); // sin encabezado: se pega desde A2
  writeFileSync(join(pruebas, 'para-pegar', `${hoja}.tsv`), aTsv(filas));
  console.error(`docs/pruebas/para-pegar/${hoja}.tsv: ${filas.length} filas`);
}
