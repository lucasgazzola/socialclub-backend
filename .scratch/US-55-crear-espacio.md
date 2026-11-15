# US-55 · Crear espacio físico, bloqueos de agenda y Patrón Composite

## Contexto y Problem Statement
La administración del club necesita una plataforma para registrar nuevos espacios físicos (canchas deportivas de pádel/fútbol/básquet, quinchos, salones sociales de fiestas y espacios multiuso). Cada espacio posee una modalidad de reserva (por hora o por día completo), condiciones tarifarias (precio total y seña requerida), disciplinas compatibles permitidas y la posibilidad de definir bloqueos iniciales de agenda (recurrentes para escuelitas/entrenamientos o puntuales para mantenimiento/reformas).

Asimismo, mediante el **Patrón Composite**, el sistema soporta espacios contenedores que generan N sub-espacios en lote (ej. sector de parrillas o complejo con múltiples canchas) manteniendo una jerarquía estricta de 2 niveles (Padre -> Sub-espacio) con propagación bidireccional de conflictos de agenda para evitar que un padre se reserve si un hijo está ocupado o viceversa, asegurando además la auditoría inalterable de cada operación.

## Criterios de Aceptación
1. **Criterio 1 (Alta de Espacio y Modalidades):** Registro de nombre, tipo (`DEPORTIVO`, `SOCIAL`, `MULTIUSO`), capacidad máxima (> 0), modalidad (`POR_HORA`, `DIA_COMPLETO`), precio y seña requerida. Seña no puede superar el precio (`montoSena <= precio`).
2. **Criterio 2 (Disciplinas Compatibles):** Los espacios de tipo `SOCIAL` no pueden asociarse a disciplinas deportivas (rechazo con 400 Bad Request). Los espacios `DEPORTIVO` o `MULTIUSO` aceptan una o más disciplinas activas existentes en el catálogo.
3. **Criterio 3 (Bloqueos Recurrentes):** Configuración de entrenamientos o escuelitas periódicas especificando días de la semana (0 a 6), franja horaria completa (`horaInicio`, `horaFin`) con `horaFin > horaInicio`, y fecha límite de vigencia (`vigenteHasta`).
4. **Criterio 4 (Bloqueos Puntuales):** Bloqueos de mantenimiento o eventos con fecha obligatoria (`YYYY-MM-DD`) y motivo descriptivo justificado.
5. **Criterio 5 (Seguridad y RBAC):** Endpoints de mutación (`POST /espacios` y `POST /espacios/:id/bloqueos`) restringidos exclusivamente al rol `ADMIN` (403 Forbidden para otros roles, 401 Unauthorized sin sesión). Soporte de filtros `soloRaiz` y `espacioPadreId` en `GET /espacios`.
6. **Criterio 6 (Conflicto de Agenda):** Si un bloqueo puntual se solapa con una reserva en estado `APROBADA_PENDIENTE_PAGO` o `CONFIRMADA`, se rechaza con `409 Conflict` informando el código de la reserva en conflicto.
7. **Criterio 7 (Auditoría Inalterable - RN14 / RNF03):** Se registra una entrada `CREAR` sobre la entidad `Espacio` o `BloqueoAgenda` con el ID del responsable dentro de una transacción atómica (`prisma.$transaction`). No se admiten mutaciones destructivas directas (`PUT`/`DELETE` responden 404).
8. **Criterio 8 (Patrón Composite - Sub-espacios y Jerarquía):** Generación atómica en lote de N sub-espacios vinculados al padre; control de 2 niveles de jerarquía; propagación bidireccional de conflictos de agenda entre padre e hijos.

---

## Testing Decisions (Estrategia de Pruebas de QA)

Como Tester / QA del equipo NullPointer, se implementó una estrategia integral de pruebas automatizadas:

1. **Aislamiento y Pruebas Unitarias de Servicio (`espacios.service.spec.ts`):**
   - Mocking total de `PrismaService` y `AuditoriaService` vía `jest.fn()` asegurando que ninguna prueba interactúe con la base de datos real.
   - Verificación de caminos felices: creación de espacio deportivo con disciplinas y bloqueos iniciales, y creación de espacio social sin disciplinas en modalidad `DIA_COMPLETO`.
   - Cobertura de validaciones de negocio: seña mayor a precio, disciplinas inactivas/inexistentes, disciplinas en tipo social, bloqueos recurrentes y puntuales incompletos.
   - **Patrón Composite Unitario:**
     - Generación de N sub-espacios en lote (`TC-ESP11`).
     - Validación de seña en sub-espacios (`TC-ESP12`).
     - Límite de jerarquía a 2 niveles y 404 en padre inexistente (`TC-ESP13`).
     - Propagación de conflictos padre -> hijo (`TC-ESP14`) e hijo -> padre (`TC-ESP14b`).
     - Filtros de jerarquía `soloRaiz` y `espacioPadreId` en `findAll`.

2. **Control de Acceso y RBAC (`espacios.roles.spec.ts`):**
   - Validación sistemática del `RolesGuard` sobre cada handler de `EspaciosController`.
   - Comprobación de exclusividad `ADMIN` en `create` y `agregarBloqueo` (403 Forbidden para otros roles).
   - Comprobación de acceso para `ADMIN`, `COLABORADOR`, `SOCIO` y `DELEGADO` en `findAll` y `findOne`.

3. **Pruebas de Integración E2E con Supertest (`espacios.e2e-spec.ts`):**
   - Validación del pipeline HTTP completo de NestJS conectando `ValidationPipe({ transform: true, whitelist: true })`, controladores, DTOs y guards simulados.
   - Verificación de `TC-ESP-01` a `TC-ESP-08` para validaciones monetarias, reglas de negocio, códigos de estado (201, 400, 403, 404, 409) y auditoría inalterable.
   - **Patrón Composite Integración:**
     - `TC-ESP-09`: Creación en lote de 3 parrillas con prefijo y capacidad (201 Created).
     - `TC-ESP-10`: 404 si el padre no existe, y 400 si se intenta asignar como padre a un sub-espacio.
     - `TC-ESP-11`: 409 Conflict bidireccional al bloquear padre con hijo ocupado o hijo con padre ocupado.
     - Filtros `soloRaiz` y `espacioPadreId` en `GET /espacios`.

4. **Integración con Frontend (`socialclub-frontend`):**
   - Verificación de la suite de Vitest: `EspacioForm.test.tsx`, `EspaciosPage.test.tsx`, `espacio.schema.test.ts`, `espacios.api.test.ts` (16 tests aprobados).

---

## Métricas y Cobertura Obtenida

- **Total de pruebas ejecutadas Backend:** 73 tests (4 suites: `service.spec.ts`, `controller.spec.ts`, `roles.spec.ts`, `e2e-spec.ts`).
- **Tasa de aprobación:** 100% (73/73 tests aprobados, 0 fallos).
- **Cobertura de código en `src/espacios`:**
  - `espacios.controller.ts`: **100%** Stmts, **100%** Branch, **100%** Funcs, **100%** Lines.
  - `espacios.service.ts`: **97.56%** Stmts, **79.9%** Branch, **91.66%** Funcs, **98.3%** Lines.
  - `create-bloqueo.dto.ts` & `create-espacio.dto.ts`: > 96% en todas las métricas.
  - Cobertura global del módulo: **93.26% de líneas** (superando holgadamente el umbral mínimo del 70% de la cátedra).
