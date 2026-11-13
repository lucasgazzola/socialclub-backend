# Evidencia de pruebas · US-55

## Crear espacio físico, bloqueos de agenda y Patrón Composite

Fecha de verificación: 09/11/2026  
Módulos: `socialclub-backend` (`src/espacios/`) y `socialclub-frontend` (`src/features/espacios/`)  
Responsable de QA: Mateo Gerbaudo (Tester / QA - NullPointer)

Se verificó integralmente la funcionalidad para que la administración del club pueda registrar nuevos espacios físicos (canchas deportivas, quinchos, salones sociales y espacios multiuso), asociar disciplinas compatibles, programar bloqueos de agenda iniciales (recurrentes para escuelitas/entrenamientos o puntuales por mantenimiento/eventos institucionales), gestionar la jerarquía de espacios contenedores y sub-espacios generados en lote bajo el **Patrón Composite**, validar solapamientos y preservar la auditoría inalterable.

---

### Criterios de Aceptación y Reglas Verificadas

1. **Alta de Espacio y Modalidades (Criterio 1):**
   - Registro de datos principales: nombre, tipo (`DEPORTIVO`, `SOCIAL`, `MULTIUSO`), capacidad máxima (> 0), modalidad (`POR_HORA`, `DIA_COMPLETO`), precio y seña requerida.
   - Cálculo y validación financiera: `montoSena <= precio` y `precio > 0`.
2. **Disciplinas Compatibles (Criterio 2):**
   - Espacios `DEPORTIVO` o `MULTIUSO` permiten vincular disciplinas activas del club.
   - Los espacios de tipo `SOCIAL` rechazan con `400 Bad Request` cualquier intento de asociar disciplinas deportivas.
3. **Bloqueos Recurrentes de Agenda (Criterio 3):**
   - Configuración periódica para entrenamientos institucionales o escuelitas deportivas indicando días de la semana (0 a 6), franja horaria completa (`horaInicio`, `horaFin`) y fecha límite de vigencia (`vigenteHasta`).
   - Validación de consistencia: `horaFin > horaInicio` y días requeridos.
4. **Bloqueos Puntuales de Agenda (Criterio 4):**
   - Bloqueos específicos por mantenimiento o reformas requiriendo fecha obligatoria (`YYYY-MM-DD`) y motivo justificado.
   - Soporte para día completo o rango horario delimitado.
5. **Control de Acceso y RBAC (Seguridad):**
   - Los endpoints de mutación `POST /espacios` y `POST /espacios/:id/bloqueos` están restringidos exclusivamente al rol `ADMIN` (`403 Forbidden` para otros roles, `401 Unauthorized` sin sesión).
   - `GET /espacios` y `GET /espacios/:id` permiten consulta a `ADMIN`, `COLABORADOR`, `SOCIO` y `DELEGADO`, soportando los filtros `soloRaiz` y `espacioPadreId`.
6. **Detección de Conflictos de Agenda (Criterio 6):**
   - Si se intenta agregar un bloqueo que se superpone con un alquiler particular aprobado o confirmado (`APROBADA_PENDIENTE_PAGO` o `CONFIRMADA`), el sistema lo rechaza con `409 Conflict` advirtiendo el código de la reserva.
7. **Auditoría Inalterable (RN14 / RNF03 / RN-ESP04):**
   - Cada alta de espacio y cada configuración de bloqueo registra un evento inalterable (`CREAR`) en la tabla `registros_auditoria` con el `id` del responsable autenticado dentro de una transacción atómica (`prisma.$transaction`).
   - La API no expone métodos destructivos ni de modificación directa (`PUT`, `DELETE` responden `404 Not Found`).
8. **Patrón Composite - Sub-espacios en Lote y Jerarquía:**
   - Creación en lote de N sub-espacios a partir de `cantidadSubespacios`, `prefijoSubespacio` y `capacidadSubespacio`, heredando ubicación, precios y disciplinas.
   - Restricción estricta de dos niveles: `Padre -> Sub-espacio`. Rechazo con `400 Bad Request` si se intenta subdividir un sub-espacio.
   - Propagación bidireccional de conflictos de agenda: 409 Conflict al bloquear un padre si algún hijo está reservado, y 409 Conflict al bloquear un hijo si el padre está reservado.

---

### Matriz de Casos de Prueba

| ID Caso | Nombre / Objetivo | Tipo | Resultado |
|---|---|---|---|
| **TC-ESP-01** (`TC-289`) | Happy Path - Espacio Deportivo con disciplinas, modalidad `POR_HORA`, seña y bloqueo escuelita | Integración (Supertest) | **Aprobado (201 Created)** |
| **TC-ESP-02** (`TC-290`) | Happy Path - Espacio Social con modalidad `DIA_COMPLETO` y sin disciplinas | Integración (Supertest) | **Aprobado (201 Created)** |
| **TC-ESP-03** (`TC-291`) | Validación Regla Social: rechazar disciplinas deportivas en espacios tipo `SOCIAL` | Funcional (Supertest) | **Aprobado (400 Bad Request)** |
| **TC-ESP-04** (`TC-292`) | Validaciones Monetarias y Capacidad: capacidad <= 0, precio <= 0, seña <= 0 y seña > precio | Funcional (ValidationPipe) | **Aprobado (400 Bad Request)** |
| **TC-ESP-05** (`TC-293`) | Validación Bloqueo Recurrente: días requeridos, `horaFin <= horaInicio` y `vigenteHasta` obligatorio | Funcional (Supertest) | **Aprobado (400 Bad Request)** |
| **TC-ESP-06** (`TC-294`) | Validación Bloqueo Puntual: fecha y motivo obligatorios | Funcional (Supertest) | **Aprobado (400 Bad Request)** |
| **TC-ESP-07** (`TC-295`) | Conflicto de Agenda (Criterio 6): superposición con reserva particular aprobada/confirmada | Funcional (Supertest) | **Aprobado (409 Conflict)** |
| **TC-ESP-08** (`TC-296`) | Auditoría Inalterable (RN14): registro en auditoría y no existencia de `PUT`/`DELETE` | Seguridad (Supertest) | **Aprobado (Auditoría OK / 404)** |
| **TC-ESP-09** (`TC-297`) | Patrón Composite: generación de sub-espacios en lote vinculados al espacio padre | Integración (Supertest) | **Aprobado (201 Created)** |
| **TC-ESP-10** (`TC-298`) | Patrón Composite: límite de jerarquía a 2 niveles (Padre -> Sub-espacio) | Funcional (Supertest) | **Aprobado (400 / 404)** |
| **TC-ESP-11** (`TC-299`) | Patrón Composite: propagación bidireccional de conflictos de agenda Padre/Hijo | Integración (Supertest) | **Aprobado (409 Conflict)** |

---

### Evidencia Automatizada Backend (NestJS + Jest + Supertest)

Comando ejecutado desde `socialclub-backend`:

```bash
npm test -- src/espacios/
```

Resultado de ejecución:

```text
PASS src/espacios/espacios.roles.spec.ts (5.776 s)
PASS src/espacios/espacios.controller.spec.ts (6.708 s)
PASS src/espacios/espacios.service.spec.ts (6.821 s)
PASS src/espacios/espacios.e2e-spec.ts (8.576 s)

Test Suites: 4 passed, 4 total
Tests:       73 passed, 73 total
Snapshots:   0 total
Time:        8.576 s
```

---

### Reporte de Cobertura de Código (`npm test -- src/espacios/ --coverage`)

```text
-----------------------------|---------|----------|---------|---------|-------------------
File                         | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-----------------------------|---------|----------|---------|---------|-------------------
All files                    |   90.95 |    75.21 |   86.36 |   93.26 |                   
 espacios                    |   92.94 |     79.9 |   94.11 |   94.55 |                   
  espacios.controller.ts     |     100 |      100 |     100 |     100 |                   
  espacios.service.ts        |   97.56 |     79.9 |   91.66 |    98.3 | 44,90             
 espacios/dto                |   86.15 |     12.5 |      60 |   90.16 |                   
  create-bloqueo.dto.ts      |     100 |      100 |     100 |     100 |                   
  create-espacio.dto.ts      |   96.77 |      100 |      50 |   96.77 | 154               
  find-espacios-query.dto.ts |    61.9 |     12.5 |   66.66 |   70.58 | 15-17,42-43       
-----------------------------|---------|----------|---------|---------|-------------------
Total módulo espacios: 93.26% de líneas (Supera con creces el umbral mínimo del 70%)
```

---

### Evidencia Automatizada Frontend (`socialclub-frontend`)

Comando ejecutado desde `socialclub-frontend`:

```bash
npx vitest run src/features/espacios
```

Resultado:

```text
 ✓ src/features/espacios/schemas/espacio.schema.test.ts (7 tests)
 ✓ src/features/espacios/api/espacios.api.test.ts (4 tests)
 ✓ src/features/espacios/pages/EspaciosPage.test.tsx (2 tests)
 ✓ src/features/espacios/components/EspacioForm.test.tsx (5 tests)

Test Files  4 passed (4)
Tests       18 passed (18)
```
