# US-36: Reporte de Asistencia y Ocupación de Eventos

## Contexto & Problem Statement
La dirigencia y secretaría del club (ADMIN y COLABORADOR) necesitan analizar el desempeño, convocatoria y concurrencia real a los eventos deportivos y sociales organizados por la institución, identificando tasas de ocupación de las instalaciones, niveles de ausentismo (no-show) y recaudación obtenida, para la toma de decisiones estratégicas y planificación de cupos futuros.

Adicionalmente, se integraron mejoras de usabilidad en la pantalla de Usuarios (US-04 y US-01) implementando ordenamiento interactivo tri-estado y estabilidad visual en las acciones de activación/desactivación.

---

## Criterios de Aceptación (CA)

1. **CA 1 — Seguridad y RBAC:** El endpoint y la pantalla son de acceso exclusivo para usuarios con roles `ADMIN` y `COLABORADOR`. Cualquier intento sin credenciales responde `401 Unauthorized` y con roles ajenos (ej. `SOCIO`, `DELEGADO`) responde `403 Forbidden`.
2. **CA 2 — Tablero de KPIs Consolidado:** Se exponen 4 tarjetas con métricas globales calculadas:
   - *Asistentes validados:* Conteo estricto de entradas en estado `USADA` (acreditadas por QR en puerta).
   - *Entradas vendidas:* Suma total de tickets emitidos/adquiridos y recaudación consolidada.
   - *Ocupación promedio:* Cálculo de plazas cubiertas por asistentes reales respecto a la capacidad física del club `(totalAsistentes / totalCapacidad) * 100`.
   - *Ausentismo (No-Show):* Tickets comprados cuyos portadores no se presentaron al evento `(totalEntradas - totalAsistentes)`.
3. **CA 3 — Filtros Reactivos:** Posibilidad de filtrar por evento puntual (`eventoId`), rango de fechas (`desde` y `hasta`), y estado del evento (`BORRADOR`, `PUBLICADO`, `FINALIZADO`, `CANCELADO`). Botón "Limpiar filtros" para reestablecer la vista por defecto.
4. **CA 4 — Gráfico Comparativo Interactivo:** Canvas SVG accesible que contrasta en barras por evento: Capacidad máxima (gris neutro), Entradas vendidas (azul institucional) y Asistentes validados (verde esmeralda), con tooltips flotantes que informan las cifras exactas al interactuar con el mouse.
5. **CA 5 — Tabla de Desglose Individual y Semáforo:** Tabla con detalle de cada evento, insignia semántica de salud de asistencia (<50% rojo, <80% ámbar, >=80% esmeralda), barra visual de ocupación y fila de totales consolidados al pie.
6. **CA 6 — Exportación Multiformato:**
   - *Exportar CSV:* Archivo con codificación UTF-8 con BOM (`\uFEFF`) compatible con Microsoft Excel y Google Sheets, respetando tildes y caracteres especiales, delimitador punto y coma y fila de totales al cierre.
   - *Exportar PDF:* Documento ejecutivo en orientación horizontal (A4 landscape) con cabecera institucional, membrete, tarjetas KPI y tabla estilizada con paginación automática.
7. **CA 7 — Usabilidad en Grilla de Usuarios (US-04/US-01):**
   - Ciclo de ordenamiento de 3 estados en cabeceras de columnas: Neutro (`⇅`) → Ascendente (`↑`) → Descendente (`↓`) → Neutro (`⇅`).
   - Botón de cambio de estado con ancho fijo anclado (`w-[102px]`) e íconos de idéntica escala (`14px`) para evitar sacudidas o desplazamientos horizontales en la tabla.

---

## Testing Decisions & QA Execution

### 1. Pruebas Backend (Jest + Supertest)
Se estructuraron y ejecutaron las pruebas automáticas en `socialclub-backend`:

* **`reportes.roles.spec.ts`:**
  - Valida el `RolesGuard` asegurando acceso permitido a `ADMIN` y `COLABORADOR`.
  - Comprueba bloqueo con `403 Forbidden` para roles no autorizados (`SOCIO`, `DELEGADO`).
* **`reportes.service.spec.ts`:**
  - Valida consolidación acumulada de eventos con capacidades, entradas vendidas, entradas usadas (`USADA`) y recaudación por compras aprobadas.
  - Comprueba cálculo de porcentajes y prevención de división por cero cuando un evento no tiene cupo o no tiene entradas vendidas (retorna `null`).
  - Valida filtros combinados (`eventoId`, `estado`, `desde`, `hasta`) y construcción de fechas ISO gte/lte.
  - Verifica rechazo con `400 BadRequestException` si la fecha `desde` es posterior a `hasta`.
* **`reportes.controller.spec.ts` (Unit & Supertest E2E):**
  - CP-01: Verificación de `401 Unauthorized` si no existe token JWT.
  - CP-02: Verificación de `403 Forbidden` para roles sin permisos.
  - CP-03: Verificación de `200 OK` con respuesta serializada para `ADMIN` y `COLABORADOR`.
  - CP-04 a CP-06: Validación de DTOs (`ValidationPipe`), comprobando que tipos incorrectos (ej. `eventoId` alfanumérico o `estado` fuera del enum) retornen `400 Bad Request`.
* **`usuarios.e2e-spec.ts` & `usuarios.service.spec.ts`:**
  - Verificación de ordenamiento multicriterio y ordenamiento neutral por defecto.

**Resultado Backend:** 80/80 tests pasados exitosamente en los módulos `src/reportes/` y `src/usuarios/`. Cobertura en `src/reportes` supera el 98% (100% de líneas en `reportes.service.ts`).

---

### 2. Pruebas Frontend (Vitest + React Testing Library)
Se ejecutaron y complementaron las pruebas en `socialclub-frontend`:

* **`ReporteAsistenciaPage.test.tsx`:**
  - Comprueba estructura tipográfica y títulos acordes a `ESTANDARES_UI_UX.md`.
  - Verifica renderizado de las 4 tarjetas de KPIs con valores mockeados.
  - Verifica interacción de botones de exportación CSV y PDF.
  - Prueba filtrado por estado y botón de restablecimiento de filtros.
  - Valida manejo de estados asíncronos: spinner de carga y mensaje amigable de error con reintento.
* **`exportarReporteAsistencia.test.ts`:**
  - Valida generación de CSV con BOM `\uFEFF`, tipo `text/csv;charset=utf-8;`, formateo monetario y fila de totales consolidados.
  - Valida generación de documento PDF A4 horizontal sin errores de ejecución ni desbordes.
* **`GraficoAsistenciaEventos.test.tsx`:**
  - Comprueba estado vacío cuando no hay datos para graficar.
  - Verifica renderizado de leyenda comparativa de 3 variables.
  - Valida accesibilidad del SVG y formato abreviado de títulos largos.
  - Comprueba activación del tooltip flotante al interactuar con el mouse sobre las barras, exponiendo las métricas exactas.
* **`UsuariosPage.spec.tsx` & `UsuariosGrid.tsx`:**
  - Valida el ciclo tri-estado de flechas de ordenamiento (`neutral -> asc -> desc -> neutral`).
  - Valida ordenamiento por fecha de alta, DNI, nombre, email, roles y estado.
  - Valida persistencia de layout y ancho fijo en botones de acción.

**Resultado Frontend:** 87/87 tests pasados en `reportes` y `usuarios` (y 574/574 tests totales en verde en toda la suite de frontend).

---

## Observaciones del Tester (QA)
- Se constató que el cálculo de `porcentajeOcupacion` implementado en el backend y frontend corresponde a la **Ocupación Real de Plazas** (`totalAsistentes / totalCapacidad * 100`), coherente con la etiqueta de interfaz *"X de Y plazas totales"*.
- Todos los criterios de aceptación y estándares UI/UX fueron satisfechos sin registrarse bugs ni desvíos funcionales.
