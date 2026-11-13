# Reporte de Auditoría y Validación de Calidad (QA) — Módulo de Espacios Físicos

**Proyecto:** SocialClub — UTN FRVM (2026)  
**Responsable de QA:** Mateo Gerbaudo (Product Owner / Tester QA - NullPointer)  
**Historias de Usuario Cubiertas:**  
- **US-55:** Crear espacio físico, bloqueos de agenda y patrón Composite de sub-espacios  
- **US-56:** Editar espacio físico y bloqueos de agenda con validación de conflictos  
- **US-57:** Eliminar / baja lógica de espacio con validación de reservas y cascada  
- **US-58:** Consultar catálogo de espacios con contrato administrativo, roles y jerarquía  
**Rama Base de Integración:** `feature/US-58-consultar-espacios` (engloba US-56, US-57 y US-58)  
**Fecha de Validación:** 09/11/2026  
**Resultado Global:** **APROBADO (121/121 tests pasando, 92.28% Cobertura)**  

---

## 1. Resumen Ejecutivo de QA

Se auditó de forma integral la implementación backend para el ciclo de vida de los espacios físicos del club (alta, modificación, baja lógica, bloqueos recurrentes/puntuales y consulta/catálogo).

### Indicadores Clave de Calidad:
- **Total de Suites Ejecutadas:** 4 (`roles.spec.ts`, `controller.spec.ts`, `service.spec.ts`, `e2e-spec.ts`).
- **Total de Pruebas Automatizadas:** 121 tests (100% PASS).
- **Cobertura de Código en Módulo `espacios`:**
  - `espacios.controller.ts`: **100% Statements, 100% Branches, 100% Functions, 100% Lines**.
  - `espacios.service.ts`: **91.16% Statements, 76.30% Branches, 96.00% Functions, 91.25% Lines**.
  - **Módulo Global (`espacios`):** **92.28% Statements, 76.41% Branches, 97.05% Functions, 92.33% Lines**.
  *(Supera ampliamente el umbral del 70% requerido por `AGENTS.md` y los estándares del proyecto).*
- **Seguridad RBAC:** 100% de los endpoints protegidos con `JwtAuthGuard` y `@Roles(...)`.
- **Auditoría Inalterable (RN14 / RNF03):** Se verificó que todas las mutaciones (`CREAR`, `EDITAR`, `BAJA`) registren eventos inalterables en `registros_auditoria` con su correspondiente `responsableId`.

---

## 2. Matriz de Casos de Prueba Auditados

### A. US-56: Editar Espacio y Bloqueos de Agenda

| ID Caso | Código | Descripción y Regla Validada | Resultado Esperado | Estado |
|---|---|---|---|---|
| TC-300 | `TC-ESP-ED01` | Modificación de datos generales, tarifas (socio/no socio) y disciplinas en espacio deportivo. | `200 OK` + Auditoría `EDITAR` | **Aprobado** |
| TC-301 | `TC-ESP-ED02` | Rechazo de asociación de disciplinas a un espacio con `tipo: 'SOCIAL'`. | `400 Bad Request` | **Aprobado** |
| TC-302 | `TC-ESP-ED03` | Rechazo si se define `montoSena > precio` de alquiler. | `400 Bad Request` | **Aprobado** |
| TC-303 | `TC-ESP-ED04` | Edición de un bloqueo existente sin conflicto de agenda. | `200 OK` + Auditoría `EDITAR` | **Aprobado** |
| TC-304 | `TC-ESP-ED05` | Rechazo por conflicto si la nueva franja del bloqueo se solapa con reserva aprobada (`APROBADA_PENDIENTE_PAGO` o `CONFIRMADA`). Valida espacio propio, padre y sub-espacios hijos. | `409 Conflict` ("El bloqueo modificado entra en conflicto...") | **Aprobado** |
| TC-305 | `TC-ESP-ED06` | Baja lógica de un bloqueo de agenda (`activo = false`). | `200 OK` + Auditoría `BAJA` | **Aprobado** |

### B. US-57: Eliminar / Baja Lógica de Espacio Físico

| ID Caso | Código | Descripción y Regla Validada | Resultado Esperado | Estado |
|---|---|---|---|---|
| TC-306 | `TC-ESP-DEL01` | Baja lógica de espacio sin reservas futuras activas. Desactiva en cascada sub-espacios hijos y bloqueos de agenda asociados. | `200 OK` + Auditoría `BAJA` | **Aprobado** |
| TC-307 | `TC-ESP-DEL02` | Rechazo si el espacio o cualquiera de sus sub-espacios posee reservas futuras (`PENDIENTE_APROBACION`, `APROBADA_PENDIENTE_PAGO`, `CONFIRMADA`). | `409 Conflict` ("No se puede dar de baja el espacio porque tiene reservas futuras...") | **Aprobado** |
| TC-308 | `TC-ESP-DEL03` | Rechazo si el espacio solicitado no existe o ya se encuentra inactivo (`activo = false`). | `404 Not Found` | **Aprobado** |

### C. US-58: Consultar Catálogo de Espacios Físicos

| ID Caso | Código | Descripción y Regla Validada | Resultado Esperado | Estado |
|---|---|---|---|---|
| TC-309 | `TC-ESP-CON01` | Consulta paginada con contrato completo (`items`, `total`, `pagina`, `porPagina`, `counts: { todos, activos, inactivos }`) para roles `ADMIN` y `COLABORADOR`. | `200 OK` con contrato full-stack | **Aprobado** |
| TC-310 | `TC-ESP-CON02` | Visibilidad restringida para rol `SOCIO`: solo retorna activos y oculta conteo de inactivos (`counts.inactivos = 0`). | `200 OK` con activos y conteo seguro | **Aprobado** |
| TC-311 | `TC-ESP-CON03` | Filtrado multicriterio combinando rango de capacidad (`capacidadMin`, `capacidadMax`), tipo de espacio y modalidad de alquiler. | `200 OK` con cláusula Prisma filtrada | **Aprobado** |
| TC-312 | `TC-ESP-CON04` | Navegación de jerarquía Composite: filtro por `soloRaiz=true` y por `espacioPadreId`. | `200 OK` con unidades correspondientes | **Aprobado** |

---

## 3. Matriz de Control de Acceso y Permisos (RBAC)

Se verificó el comportamiento de cada endpoint según el rol del usuario autenticado:

| Endpoint | Método | Roles Permitidos | Roles No Autorizados / Respuesta |
|---|---|---|---|
| `/espacios` | `POST` | `ADMIN` | `SOCIO`, `COLABORADOR`, `PROFESOR` -> `403 Forbidden` |
| `/espacios/:id/bloqueos` | `POST` | `ADMIN` | `SOCIO`, `COLABORADOR`, `PROFESOR` -> `403 Forbidden` |
| `/espacios/:id` | `PATCH` | `ADMIN` | `SOCIO`, `COLABORADOR` -> `403 Forbidden` |
| `/espacios/:id/bloqueos/:bloqueoId` | `PATCH` | `ADMIN` | `SOCIO`, `COLABORADOR` -> `403 Forbidden` |
| `/espacios/:id/bloqueos/:bloqueoId` | `DELETE` | `ADMIN` | `SOCIO`, `COLABORADOR` -> `403 Forbidden` |
| `/espacios/:id` | `DELETE` | `ADMIN` | `SOCIO`, `COLABORADOR` -> `403 Forbidden` |
| `/espacios` | `GET` | `ADMIN`, `COLABORADOR`, `SOCIO` | Público sin autenticar -> `401 Unauthorized` |
| `/espacios/:id` | `GET` | `ADMIN`, `COLABORADOR`, `SOCIO` | Público sin autenticar -> `401 Unauthorized` |

---

## 4. Reglas de Negocio Auditadas (RN)

1. **Inalterabilidad de Auditoría (RN14 / RNF03):**
   - No se expone ningún endpoint de modificación directa sobre los registros de auditoría.
   - Las operaciones de edición (`PATCH /espacios/:id` y `PATCH /espacios/:id/bloqueos/:id`) registran evento con acción `EDITAR`.
   - Las operaciones de baja (`DELETE /espacios/:id` y `DELETE /espacios/:id/bloqueos/:id`) son bajas lógicas (`activo: false`) y registran evento con acción `BAJA`.
2. **Patrón Composite (Jerarquía de Espacios):**
   - Máximo 2 niveles de jerarquía (Espacio Contenedor / Padre -> Sub-espacios directos). Se rechaza con `400 Bad Request` si se intenta asociar un padre que ya es sub-espacio.
   - Propagación bidireccional de conflictos: tanto al crear como al editar bloqueos o al solicitar bajas, se inspecciona toda la familia física (espacio, padre y sub-espacios).
3. **Restricciones de Tipología Social vs. Deportiva:**
   - Los espacios de tipo `SOCIAL` tienen terminantemente prohibido vincularse con disciplinas deportivas tanto en el alta como en la edición.

---

## 5. Dictamen Final de QA

La suite de pruebas para **US-56**, **US-57** y **US-58** cumple con todos los criterios de aceptación, estándares full-stack del equipo NullPointer y reglas de negocio.
- **Estado de la rama `feature/US-58-consultar-espacios`:** **LISTA PARA INTEGRACIÓN**
- **Siguiente paso:** Crear Pull Request hacia `dev` siguiendo la guía de automatización de PRs una vez autorizado por el Project Manager. No se realiza `git push` en este ciclo conforme a las directivas del usuario.
