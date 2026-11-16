# Evidencia · US-35 — Generar reporte de estado financiero

Corrida del 10/10/2026 sobre las ramas `feature/US-35-Reporte-estado-financiero`.

**Definiciones acordadas con el equipo (10/10/2026):**
- El reporte se calcula sobre **las cuotas de los meses del período**:
  *recaudado* es lo cobrado de esas cuotas; *adeudado*, las que ya vencieron
  (el **día 10** de su mes, para la cuota social y la deportiva) y siguen sin
  pagar; *morosos*, las personas con al menos una de esas cuotas;
  *porcentaje de cobranza*, recaudado / (recaudado + adeudado).
- Aparte se informa **lo ingresado por fecha de cobro** (la caja del período,
  de cualquier mes).
- Con **disciplina**, el reporte es solo la cuota deportiva de esa disciplina.
- Acceso: ADMIN y COLABORADOR (no hay rol de tesorero).

| Archivo | Qué muestra | Casos |
|---|---|---|
| [`e2e/`](e2e/README.md) | Capturas por paso de las pruebas E2E (Playwright) contra el sistema real: indicadores del 3.º trimestre, mes y rango personalizado, filtro por Natación, coincidencia con el listado de morosos y acceso denegado al delegado | TC-212, TC-215, TC-217, TC-219, TC-220 |
| `api.txt` | Respuestas reales del endpoint: trimestre, filtro por disciplina, rango invertido, más de 36 meses, formato inválido y 403 del delegado | TC-213, TC-216, TC-220 |

**TC-219 (integración):** el E2E genera el reporte de enero a octubre y entra
al listado de morosos de cuota deportiva desde la tabla por concepto: la deuda
vencida total del listado es igual al adeudado de cuota deportiva del reporte,
porque los dos usan el mismo cálculo.

Tests automatizados: `src/reportes/reportes.service.spec.ts` y
`src/reportes/reportes.roles.spec.ts` (backend); `EstadoFinancieroPage.test.tsx`,
`periodo.test.ts` y `reportes.api.test.ts` (frontend).
