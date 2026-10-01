#!/usr/bin/env node
/**
 * registro-ejecucion.mjs — Convierte la salida JSON de Jest/Vitest en el
 * "Registro de Ejecución" del equipo (formato EJ), listo para abrir en Excel.
 *
 * Uso:
 *   npm test -- --json --outputFile=jest-results.json   (o vitest --reporter=json --outputFile=...)
 *   node scripts/registro-ejecucion.mjs jest-results.json --sprint="Sprint 3" --ejecutor="CI" > registro-ejecucion.csv
 *
 * Columnas: ID de ejecución | Sprint | Caso de prueba asociado | Ejecutor | Resultado | Evidencia
 * (mapea 1 fila por test; el "Caso" sale del nombre del describe/it, que se etiqueta con la US).
 */
import { readFileSync } from 'node:fs';

const [file, ...rest] = process.argv.slice(2);
if (!file) {
  console.error('Falta el archivo JSON de resultados. Ver el encabezado del script.');
  process.exit(1);
}
const opt = Object.fromEntries(
  rest.map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  }),
);
const sprint = opt.sprint ?? '';
const ejecutor = opt.ejecutor ?? 'CI';

const data = JSON.parse(readFileSync(file, 'utf8'));

const RESULTADO = { passed: 'Aprobado', failed: 'Fallido', pending: 'Bloqueado', skipped: 'Bloqueado', todo: 'Bloqueado' };
const stripAnsi = (s) => String(s).replace(/\[[0-9;]*m/g, '');
const oneLine = (s) => stripAnsi(s).replace(/\s+/g, ' ').trim().slice(0, 500);

const rows = [];
for (const suite of data.testResults ?? []) {
  for (const t of suite.assertionResults ?? []) {
    const caso = [...(t.ancestorTitles ?? []), t.title].join(' · ');
    const resultado = RESULTADO[t.status] ?? t.status;
    const evidencia =
      t.status === 'failed'
        ? oneLine((t.failureMessages ?? []).join(' | ')) || 'Falló sin mensaje'
        : 'Ejecución automática OK';
    rows.push({ caso, resultado, evidencia });
  }
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const header = ['ID de ejecución', 'Sprint', 'Caso de prueba asociado', 'Ejecutor', 'Resultado', 'Evidencia'];
const lines = [header.join(',')];
rows.forEach((r, i) => {
  const id = `EJ-${String(i + 1).padStart(3, '0')}`;
  lines.push([id, sprint, r.caso, ejecutor, r.resultado, r.evidencia].map(csvCell).join(','));
});

const total = rows.length;
const aprobados = rows.filter((r) => r.resultado === 'Aprobado').length;
process.stderr.write(`Registro de Ejecución: ${aprobados}/${total} aprobados (${sprint || 'sin sprint'}).\n`);
process.stdout.write(lines.join('\n') + '\n');
