# Informe de Auditoría y Testing QA — US-55

## US-55: Crear espacio físico, bloqueos de agenda y Patrón Composite de Sub-espacios

- **Proyecto:** Social Club (NullPointer - UTN FRVM)
- **Rol:** QA Engineer / Mateo Gerbaudo (Tester / QA)
- **Fecha:** 09/11/2026
- **Rama Backend:** `feature/US-55-crear-espacio`
- **Rama Frontend:** `feature/US-55-crear-espacio`
- **Estado General:** **100% Aprobado (PASS)** — Sin bloqueantes, cobertura superior al 70%.

---

### 1. Resumen Ejecutivo de la Auditoría

Se auditó de forma exhaustiva la funcionalidad completa de la **US-55**, que abarca el alta de espacios físicos deportivos, sociales y multiuso, la configuración de bloqueos de agenda (recurrentes y puntuales), la detección de conflictos de agenda en tiempo real, el registro de auditoría inalterable y la implementación del **Patrón Composite para la gestión jerárquica de espacios contenedores y sub-espacios generados en lote** (ej. sectores de quinchos/parrillas o complejos con múltiples canchas).

Tanto el backend en NestJS como el frontend en React + Tailwind + React Hook Form fueron verificados de extremo a extremo, confirmando el cumplimiento estricto de las reglas de negocio de `AGENTS.md` (RN14 inalterabilidad, RN11/12/13 conflictos de agenda) y las directrices de `ESTANDARES_UI_UX.md`.

---

### 2. Matriz Consolidada de Casos de Prueba (QA Matrix)

| ID Caso | Nombre / Escenario | Nivel / Herramienta | Resultado |
|---|---|---|---|
| **TC-ESP-01** (`TC-289`) | **Happy Path Deportivo:** Alta de espacio `DEPORTIVO` con modalidad `POR_HORA`, tarifas socio/no socio, seña obligatoria, disciplinas y bloqueo recurrente escuelita. | Integración (Supertest) + Unitario | **Aprobado (201 Created)** + Auditoría verificada |
| **TC-ESP-02** (`TC-290`) | **Happy Path Social Indivisible:** Alta de espacio `SOCIAL` (Salón Principal) con modalidad `DIA_COMPLETO`, sin disciplinas. | Integración (Supertest) + Unitario | **Aprobado (201 Created)** |
| **TC-ESP-03** (`TC-291`) | **Regla Tipo Social (Criterio 2):** Rechazo con 400 Bad Request si se envían `disciplinaIds` en un espacio `SOCIAL`. | Integración (Supertest) + Unitario | **Aprobado (400 Bad Request)** |
| **TC-ESP-04** (`TC-292`) | **Validaciones Monetarias y Capacidad:** Rechazo con 400 Bad Request si `capacidadMaxima <= 0`, `precio <= 0`, `montoSena <= 0` o `montoSena > precio`. | Validación DTO + Supertest | **Aprobado (400 Bad Request)** |
| **TC-ESP-05** (`TC-293`) | **Validación Bloqueo Recurrente (Criterio 3):** Rechazo si falta `diasSemana`, `horaFin <= horaInicio` o falta `vigenteHasta`. | Integración (Supertest) + Unitario | **Aprobado (400 Bad Request)** |
| **TC-ESP-06** (`TC-294`) | **Validación Bloqueo Puntual (Criterio 4):** Rechazo si falta `fecha` o falta `motivo`. | Integración (Supertest) + Unitario | **Aprobado (400 Bad Request)** |
| **TC-ESP-07** (`TC-295`) | **Conflicto de Agenda (Criterio 6):** Rechazo con 409 Conflict si un bloqueo choca con una reserva particular aprobada/confirmada. | Integración (Supertest) + Unitario | **Aprobado (409 Conflict)** |
| **TC-ESP-08** (`TC-296`) | **Auditoría Inalterable (RN14 / RNF03):** Registro atómico en `registros_auditoria` con ID del responsable; ausencia de endpoints `PUT`/`DELETE`. | Seguridad (Supertest) | **Aprobado (Auditoría OK / 404)** |
| **TC-ESP-09** (`TC-297`) | **Patrón Composite - Sub-espacios en Lote:** Alta de espacio padre con `cantidadSubespacios`, `prefijoSubespacio` y `capacidadSubespacio`, creando N hijos heredando tarifas y disciplinas. | Integración (Supertest) + Unitario | **Aprobado (201 Created)** |
| **TC-ESP-10** (`TC-298`) | **Patrón Composite - Límite de Jerarquía:** Rechazo si `espacioPadreId` ya es un sub-espacio (máximo 2 niveles: Padre -> Sub-espacio) o 404 si el padre no existe. | Integración (Supertest) + Unitario | **Aprobado (400 / 404)** |
| **TC-ESP-11** (`TC-299`) | **Patrón Composite - Propagación de Conflictos:** 409 Conflict al bloquear Padre si Hijo está reservado, y 409 Conflict al bloquear Hijo si Padre está reservado. | Integración (Supertest) + Unitario | **Aprobado (409 Conflict en ambos sentidos)** |
| **RBAC** | **Control de Acceso:** Exclusividad `ADMIN` para `POST /espacios` y `POST /espacios/:id/bloqueos`; soporte de `soloRaiz` y `espacioPadreId` en `GET /espacios`. | RolesGuard + Supertest | **Aprobado (403 Forbidden para SOCIO/COLABORADOR)** |

---

### 3. Estrategia Técnica de QA Aplicada

1. **Aislamiento de Base de Datos y Mocks Controlados:**  
   Siguiendo la skill `nestjs-testing`, todos los tests de servicios y controladores aíslan `PrismaService` y `AuditoriaService` con `jest.fn()`, evitando mutaciones en bases de datos reales o colisiones en entornos de integración continua.
2. **Pruebas de Integración HTTP con Supertest:**  
   Se utiliza `ValidationPipe({ transform: true, whitelist: true })` en `espacios.e2e-spec.ts` para verificar la transformación de tipos, validación de decoradores `class-validator` y generación de respuestas JSON con códigos de estado HTTP precisos (201, 400, 403, 404, 409).
3. **Auditoría Inalterable (RN14 / RNF03):**  
   Se verificó que tanto la creación de espacios como la adición de bloqueos ocurran dentro de una transacción atómica (`prisma.$transaction`), invocando `auditoria.registrar` con la acción `CREAR` y el ID del responsable. Asimismo, se validó que no existan rutas expuestas para modificar o eliminar espacios vía `PUT`, `PATCH` o `DELETE`.
4. **Validación del Algoritmo de Conflictos Composite:**  
   Se probó que la búsqueda de solapamiento (`intervalosDeBloqueo` y `seSolapan`) recolecte los IDs del espacio y de toda su jerarquía (padre y sub-espacios hijos), bloqueando la creación de bloqueos si cualquiera de las unidades relacionadas tiene un alquiler aprobado (`APROBADA_PENDIENTE_PAGO` o `CONFIRMADA`).

---

### 4. Resultados de Cobertura y Métricas de Calidad

#### Backend (`socialclub-backend`):
- **Suites:** 4 aprobadas (100%)
  - `src/espacios/espacios.roles.spec.ts` (11 tests)
  - `src/espacios/espacios.controller.spec.ts` (5 tests)
  - `src/espacios/espacios.service.spec.ts` (30 tests)
  - `src/espacios/espacios.e2e-spec.ts` (27 tests)
- **Total Tests Backend:** **73 aprobados / 0 fallos**.
- **Cobertura de Código (`src/espacios`):**
  - Statements: **90.95%**
  - Branches: **75.21%**
  - Functions: **86.36%**
  - Lines: **93.26%** (Servicio: **98.3%**, Controlador: **100%**)
  - Cumplimiento de regla de cobertura mínima (> 70%): **SUPERADO**.

#### Frontend (`socialclub-frontend`):
- **Suites:** 4 aprobadas (100%)
  - `src/features/espacios/api/espacios.api.test.ts` (4 tests)
  - `src/features/espacios/pages/EspaciosPage.test.tsx` (2 tests)
  - `src/features/espacios/schemas/espacio.schema.test.ts` (7 tests)
  - `src/features/espacios/components/EspacioForm.test.tsx` (5 tests)
- **Total Tests Frontend:** **18 aprobados / 0 fallos**.

---

### 5. Archivos de Documentación Actualizados

- `test/evidencia-us55.txt`: Transcripción y log de ejecución de Jest.
- `TESTING_US55.md`: Informe técnico de auditoría de QA.
- `docs/pruebas/evidencias/US-55/README.md`: Evidencia consolidada con tablas y reportes.
- `.scratch/US-55-crear-espacio.md`: Decisiones de testing y trazabilidad de requerimientos.
- `docs/pruebas/casos-prueba.csv` y `ejecucion.csv`: Incorporación de `TC-297` a `TC-299` y `EJ-326` a `EJ-328`.
- `docs/pruebas/para-pegar/`: TSVs regenerados para la sincronización con Google Sheets.
