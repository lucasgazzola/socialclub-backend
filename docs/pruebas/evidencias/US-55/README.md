# Evidencia de pruebas · US-55

## Crear espacio físico y bloqueos de agenda

Fecha de verificación: 08/11/2026  
Módulos: `socialclub-backend` (`src/espacios/`)  
Responsable de QA: Mateo Gerbaudo (Tester / QA - NullPointer)

Se verificó integralmente la funcionalidad para que la administración del club pueda registrar nuevos espacios físicos (canchas deportivas, quinchos, salones sociales y espacios multiuso), asociar disciplinas compatibles y programar bloqueos de agenda iniciales (recurrentes para escuelitas/entrenamientos o puntuales por mantenimiento/eventos institucionales), con validación estricta de conflictos y auditoría inalterable.

---

### Criterios de Aceptación Verificados

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
   - `GET /espacios` y `GET /espacios/:id` permiten consulta a `ADMIN`, `COLABORADOR`, `SOCIO` y `DELEGADO`.
6. **Detección de Conflictos de Agenda (Criterio 6):**
   - Si se intenta agregar un bloqueo que se superpone con un alquiler particular aprobado o confirmado (`APROBADA_PENDIENTE_PAGO` o `CONFIRMADA`), el sistema lo rechaza con `409 Conflict` advirtiendo el código de la reserva.
7. **Auditoría Inalterable (RN14 / RNF03 / RN-ESP04):**
   - Cada alta de espacio y cada configuración de bloqueo registra un evento inalterable (`CREAR`) en la tabla `registros_auditoria` con el `id` del responsable autenticado dentro de la misma transacción atómica de base de datos (`prisma.$transaction`).
   - La API no expone métodos destructivos ni de modificación directa (`PUT`, `DELETE` responden `404 Not Found`).

---

### Matriz de Casos de Prueba

| ID Caso | Nombre / Objetivo | Tipo | Resultado |
|---|---|---|---|
| **TC-ESP-01** (TC-289) | Happy Path - Espacio Deportivo con disciplinas, modalidad `POR_HORA`, seña y bloqueo escuelita | Integración (Supertest) | **Aprobado (201 Created)** |
| **TC-ESP-02** (TC-290) | Happy Path - Espacio Social con modalidad `DIA_COMPLETO` y sin disciplinas | Integración (Supertest) | **Aprobado (201 Created)** |
| **TC-ESP-03** (TC-291) | Validación Regla Social: rechazar disciplinas deportivas en espacios tipo `SOCIAL` | Funcional (Supertest) | **Aprobado (400 Bad Request)** |
| **TC-ESP-04** (TC-292) | Validaciones Monetarias y Capacidad: capacidad <= 0, precio <= 0, seña <= 0 y seña > precio | Funcional (ValidationPipe) | **Aprobado (400 Bad Request)** |
| **TC-ESP-05** (TC-293) | Validación Bloqueo Recurrente: días requeridos, `horaFin <= horaInicio` y `vigenteHasta` obligatorio | Funcional (Supertest) | **Aprobado (400 Bad Request)** |
| **TC-ESP-06** (TC-294) | Validación Bloqueo Puntual: fecha y motivo obligatorios | Funcional (Supertest) | **Aprobado (400 Bad Request)** |
| **TC-ESP-07** (TC-295) | Conflicto de Agenda (Criterio 6): superposición con reserva particular aprobada/confirmada | Funcional (Supertest) | **Aprobado (409 Conflict)** |
| **TC-ESP-08** (TC-296) | Auditoría Inalterable (RN14): registro en auditoría y no existencia de `PUT`/`DELETE` | Seguridad (Supertest) | **Aprobado (Auditoría OK / 404)** |

---

### Evidencia Automatizada Backend (NestJS + Jest + Supertest)

Comando ejecutado desde `socialclub-backend`:

```bash
npm test -- src/espacios/
```

Resultado de ejecución:

```text
PASS src/espacios/espacios.roles.spec.ts (5.543 s)
PASS src/espacios/espacios.service.spec.ts (5.545 s)
PASS src/espacios/espacios.controller.spec.ts
PASS src/espacios/espacios.e2e-spec.ts (6.032 s)

Test Suites: 4 passed, 4 total
Tests:       60 passed, 60 total
Snapshots:   0 total
Time:        6.93 s
```

---

### Reporte de Cobertura de Código (`npm test -- src/espacios/ --coverage`)

```text
-----------------------------|---------|----------|---------|---------|-----------------------------------
File                         | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s                 
-----------------------------|---------|----------|---------|---------|-----------------------------------
All files                    |   91.35 |    75.48 |   88.88 |   94.07 |                                   
 espacios                    |   92.37 |    79.59 |   93.75 |   94.54 |                                   
  espacios.controller.ts     |     100 |      100 |     100 |     100 |                                   
  espacios.service.ts        |   98.82 |    79.59 |    90.9 |     100 |                                   
 espacios/dto                |   88.63 |        0 |      50 |   92.85 |                                   
  create-bloqueo.dto.ts      |     100 |      100 |     100 |     100 |                                   
  create-espacio.dto.ts      |     100 |      100 |     100 |     100 |                                   
  find-espacios-query.dto.ts |   61.53 |        0 |       0 |   72.72 | 15-17                             
-----------------------------|---------|----------|---------|---------|-----------------------------------
```

> [!NOTE]
> **Estado de Frontend:**  
> La interfaz visual para el alta de espacios físicos (formulario web) aún no ha sido implementada en `socialclub-frontend`. Por lo tanto, los tests E2E de navegador en Playwright se incorporarán en la etapa de testing de interfaz una vez que el equipo de frontend desarrolle la pantalla y componentes correspondientes, garantizando el flujo completo end-to-end.
