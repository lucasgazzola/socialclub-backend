# US-55 · Crear espacio físico y bloqueos de agenda

## Contexto y Problem Statement
La administración del club necesita una plataforma para registrar nuevos espacios físicos (canchas deportivas de pádel/fútbol/básquet, quinchos, salones sociales de fiestas y espacios multiuso). Cada espacio posee una modalidad de reserva (por hora o por día completo), condiciones tarifarias (precio total y seña requerida), disciplinas compatibles permitidas y la posibilidad de definir bloqueos iniciales de agenda (recurrentes para escuelitas/entrenamientos o puntuales para mantenimiento/reformas), previniendo solapamientos con alquileres particulares ya aprobados y garantizando la auditoría inalterable de cada operación.

## Criterios de Aceptación
1. **Criterio 1 (Alta de Espacio y Modalidades):** Registro de nombre, tipo (`DEPORTIVO`, `SOCIAL`, `MULTIUSO`), capacidad máxima (> 0), modalidad (`POR_HORA`, `DIA_COMPLETO`), precio y seña requerida. Seña no puede superar el precio (`montoSena <= precio`).
2. **Criterio 2 (Disciplinas Compatibles):** Los espacios de tipo `SOCIAL` no pueden asociarse a disciplinas deportivas (rechazo con 400 Bad Request). Los espacios `DEPORTIVO` o `MULTIUSO` aceptan una o más disciplinas activas existentes en el catálogo.
3. **Criterio 3 (Bloqueos Recurrentes):** Configuración de entrenamientos o escuelitas periódicas especificando días de la semana (0 a 6), franja horaria completa (`horaInicio`, `horaFin`) con `horaFin > horaInicio`, y fecha límite de vigencia (`vigenteHasta`).
4. **Criterio 4 (Bloqueos Puntuales):** Bloqueos de mantenimiento o eventos con fecha obligatoria (`YYYY-MM-DD`) y motivo descriptivo justificado.
5. **Criterio 5 (Seguridad y RBAC):** Endpoints de mutación (`POST /espacios` y `POST /espacios/:id/bloqueos`) restringidos exclusivamente al rol `ADMIN` (403 Forbidden para otros roles, 401 Unauthorized sin sesión).
6. **Criterio 6 (Conflicto de Agenda):** Si un bloqueo puntual se solapa con una reserva en estado `APROBADA_PENDIENTE_PAGO` o `CONFIRMADA`, se rechaza con `409 Conflict` informando el código de la reserva en conflicto.
7. **Criterio 7 (Auditoría Inalterable - RN14 / RNF03):** Se registra una entrada `CREAR` sobre la entidad `Espacio` o `BloqueoAgenda` con el ID del responsable dentro de una transacción atómica (`prisma.$transaction`). No se admiten mutaciones destructivas directas (`PUT`/`DELETE` responden 404).

---

## Testing Decisions (Estrategia de Pruebas de QA)

Como Tester / QA del equipo NullPointer, se implementó una estrategia integral de pruebas automatizadas en tres niveles:

1. **Aislamiento y Pruebas Unitarias de Servicio (`espacios.service.spec.ts`):**
   - Mocking total de `PrismaService` y `AuditoriaService` vía `jest.fn()` asegurando que ninguna prueba interactúe con la base de datos real.
   - Verificación de caminos felices: creación de espacio deportivo con disciplinas y bloqueos iniciales, y creación de espacio social sin disciplinas en modalidad `DIA_COMPLETO`.
   - Cobertura de validaciones de negocio: validación de seña mayor a precio, disciplinas inactivas/inexistentes, disciplinas en tipo social, bloqueos recurrentes con franja horaria invertida, vigencia invertida y bloqueos puntuales incompletos.
   - Verificación del algoritmo de superposición de agenda (`intervalosDeBloqueo` y `seSolapan`) disparando `409 Conflict` ante reservas preexistentes.
   - Verificación del registro de auditoría (`mockAuditoria.registrar`) con `accion: 'CREAR'`, entidad e ID del responsable autenticado.

2. **Control de Acceso y RBAC (`espacios.roles.spec.ts`):**
   - Validación sistemática del `RolesGuard` sobre cada handler de `EspaciosController`.
   - Comprobación de que `POST /espacios` y `POST /espacios/:id/bloqueos` solo permiten el rol `ADMIN` y lanzan `ForbiddenException` ante roles `COLABORADOR`, `SOCIO`, `DELEGADO`, etc.
   - Comprobación de que `GET /espacios` y `GET /espacios/:id` admiten a `ADMIN`, `COLABORADOR`, `SOCIO` y `DELEGADO`.

3. **Pruebas de Integración E2E con Supertest (`espacios.e2e-spec.ts`):**
   - Validación del pipeline HTTP completo de NestJS conectando `ValidationPipe({ transform: true, whitelist: true })`, controladores, DTOs y guards simulados.
   - **TC-ESP-01 (Happy Path Deportivo):** Envío de payload JSON completo con cancha de pádel, tarifa, seña y bloqueo escuelita. Respuesta 201 y auditoría verificada.
   - **TC-ESP-02 (Happy Path Social):** Salón social sin disciplinas, modalidad `DIA_COMPLETO`. Respuesta 201.
   - **TC-ESP-03 (Regla Social):** Intento de inyectar `disciplinaIds` en espacio social. Respuesta 400 Bad Request con mensaje canónico.
   - **TC-ESP-04 (Restricciones Financieras y Capacidad):**
     - `capacidadMaxima <= 0` -> 400 Bad Request ("La capacidad máxima debe ser mayor a cero").
     - `precio <= 0` -> 400 Bad Request ("El precio de alquiler debe ser mayor a cero").
     - `montoSena <= 0` -> 400 Bad Request ("El monto de la seña debe ser mayor a cero").
     - `montoSena > precio` -> 400 Bad Request ("El monto de la seña requerida no puede ser superior al precio total de alquiler.").
   - **TC-ESP-05 (Validación Bloqueo Recurrente):**
     - Sin días de la semana -> 400 Bad Request.
     - `horaFin <= horaInicio` (ej. 20:00 a 18:00) -> 400 Bad Request.
     - Sin `vigenteHasta` -> 400 Bad Request.
   - **TC-ESP-06 (Validación Bloqueo Puntual):**
     - Sin fecha -> 400 Bad Request.
     - Sin motivo o motivo vacío -> 400 Bad Request.
   - **TC-ESP-07 (Conflicto de Agenda - Criterio 6):** Bloqueo puntual colisionando con reserva confirmada en UTC/local. Respuesta 409 Conflict.
   - **TC-ESP-08 (Auditoría Inalterable e Inmutabilidad):** Verificación de auditoría atómica y verificación de que `PUT /espacios/1` y `DELETE /espacios/1` devuelven 404 Not Found.
   - **Seguridad RBAC:** Peticiones sin token o con rol `SOCIO` sobre endpoints administrativos devuelven 403 Forbidden.

---

## Métricas y Cobertura Obtenida

- **Total de pruebas ejecutadas:** 60 tests (4 suites: `service.spec.ts`, `controller.spec.ts`, `roles.spec.ts`, `e2e-spec.ts`).
- **Tasa de aprobación:** 100% (60/60 tests aprobados, 0 fallos).
- **Cobertura de código en `src/espacios`:**
  - `espacios.controller.ts`: **100%** Stmts, **100%** Branch, **100%** Funcs, **100%** Lines.
  - `espacios.service.ts`: **98.82%** Stmts, **79.59%** Branch, **90.9%** Funcs, **100%** Lines.
  - `create-bloqueo.dto.ts` & `create-espacio.dto.ts`: **100%** en todas las métricas.
  - Cobertura global del módulo: **94.07% de líneas** (superando holgadamente el umbral mínimo del 70% de la cátedra).

---

## Estado de Pruebas E2E en Playwright (Frontend)
- El formulario web de alta de espacios aún no se encuentra desarrollado en `socialclub-frontend`.
- Las pruebas de interfaz en Playwright se incorporarán en la suite de E2E (`e2e/reservas.spec.ts` o `e2e/espacios.spec.ts`) tan pronto el equipo frontend implemente la pantalla `/espacios/nuevo` o modal de gestión.
