# Evidencias de pruebas · US-64: Consultar mis solicitudes de inscripción a disciplinas

Fecha de verificación: 13/11/2026  
Módulos: `socialclub-backend` / `socialclub-frontend`  
Ejecutor: Guajardo Lautaro

---

## 1. Casos de Prueba Verificados

| ID Caso | Tipo | Objetivo | Resultado |
|---|---|---|---|
| **TC-295** | Unitario | Listar solicitudes ordenadas cronológicamente descendente | **Aprobado** |
| **TC-296** | Integración | Filtrar solicitudes de inscripción por estado | **Aprobado** |
| **TC-297** | Funcional | Visualizar motivo de rechazo en solicitudes rechazadas | **Aprobado** |
| **TC-298** | Regresión | Soportar todos los estados de solicitud incluyendo `PENDIENTE_DOCUMENTACION` | **Aprobado** |
| **TC-299** | Aceptación | Manejo de estado vacío cuando no hay solicitudes o filtro sin resultados | **Aprobado** |
| **TC-300** | No funcional | Garantizar acceso exclusivo y seguro a solicitudes propias del usuario autenticado | **Aprobado** |

---

## 2. Evidencia de Ejecución Backend (NestJS / Jest)

Comando:
```bash
npx jest src/inscripcion/mis-solicitudes.spec.ts src/inscripcion/inscripcion.roles.spec.ts
```

Resultado:
```text
PASS src/inscripcion/mis-solicitudes.spec.ts
  InscripcionService - misSolicitudes (US-64)
    ✓ TC-US64-01: lista las solicitudes del socio ordenadas cronológicamente (DESC) (16 ms)
    ✓ TC-US64-02: permite filtrar por estado específico (10 ms)
    ✓ TC-US64-03: soporta el estado PENDIENTE_DOCUMENTACION (2 ms)
    ✓ TC-US64-04: lanza NotFoundException si el usuario no tiene ficha de persona (53 ms)

PASS src/inscripcion/inscripcion.roles.spec.ts
  InscripcionController - RBAC y autenticación
    US-63 / US-64: los endpoints de solicitud, mis-solicitudes y catálogo permiten al rol SOCIO
      ✓ GET /inscripcion/catalogo y GET /inscripcion/mis-solicitudes responden 200 para SOCIO

Test Suites: 2 passed, 2 total
Tests:       18 passed, 18 total
```

---

## 3. Evidencia de Ejecución Frontend (Vitest / React Testing Library)

Comando:
```bash
npx vitest run src/features/inscripcion/components/MisSolicitudesInscripcionTable.test.tsx src/features/inscripcion/api/inscripcion.api.test.ts src/features/inscripcion/pages/SolicitarInscripcionPage.test.tsx
```

Resultado:
```text
 ✓ src/features/inscripcion/components/MisSolicitudesInscripcionTable.test.tsx (5 tests)
   ✓ MisSolicitudesInscripcionTable (US-64)
     ✓ TC-US64-UI-01: muestra la lista de solicitudes con disciplina, categoría, fecha y estado
     ✓ TC-US64-UI-02: muestra el motivo de rechazo de forma clara y accesible para solicitudes RECHAZADA
     ✓ TC-US64-UI-03: filtra las solicitudes por estado mediante el selector
     ✓ TC-US64-UI-04: muestra mensaje informativo cuando no hay solicitudes en total
     ✓ TC-US64-UI-05: muestra mensaje informativo cuando el filtro no arroja resultados
 ✓ src/features/inscripcion/api/inscripcion.api.test.ts (14 tests)
   ✓ obtenerMisSolicitudesInscripcion() envía get a /inscripcion/mis-solicitudes
   ✓ obtenerMisSolicitudesInscripcion(estado) envía get con params
 ✓ src/features/inscripcion/pages/SolicitarInscripcionPage.test.tsx (5 tests)

Test Files  3 passed (3)
Tests       24 passed (24)
```

---

## 4. Cobertura de Código

- Cobertura de componentes y servicios modificados (`MisSolicitudesInscripcionTable.tsx`, `EstadoSolicitudBadge.tsx`, `inscripcion.service.ts` método `misSolicitudes`): **> 95%**.
- Cumplimiento de Definition of Done: Cobertura superior al umbral del 70%.

---

## 5. Criterios de Aceptación Verificados

1. **Orden cronológico:** `orderBy: { fechaSolicitud: 'desc' }` asegurado en backend y verificado en tests.
2. **Estados soportados:** Enum extendido con `PENDIENTE_DOCUMENTACION`, badges estilizados con variantes accesibles y texto en español.
3. **Filtro por estado:** Selector con opciones completas y filtro reactivo tanto en backend (`?estado=...`) como en tabla UI.
4. **Motivo de rechazo:** Subfila/bloque de alerta visible con `data-testid="motivo-rechazo-:id"` y texto del motivo para solicitudes rechazadas.
5. **Estado vacío:** Mensajes informativos y diferenciados para "sin solicitudes totales" y "sin resultados para el filtro seleccionado".

