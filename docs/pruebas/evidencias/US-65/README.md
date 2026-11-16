# Evidencias de pruebas · US-65: Cancelar solicitud y documentación

Fecha de verificación: 15/11/2026  
Módulos: `socialclub-backend` / `socialclub-frontend`  
Ejecutor: Guajardo Lautaro

## Casos verificados

| ID | Tipo | Resultado |
|---|---|---|
| TC-322 | Unitario | Aprobado |
| TC-323 | Integración | Aprobado |
| TC-324 | Funcional | Aprobado |
| TC-325 | Regresión | Aprobado |
| TC-326 | Aceptación | Aprobado |
| TC-327 | No funcional | Aprobado |
| US65-APROBADA | Funcional | Aprobado |
| US65-DOCUMENTACION | Integración | Aprobado |
| US65-BLOQUEOS | Aceptación | Aprobado |

## Evidencia automatizada

Backend:

```text
PASS src/inscripcion/cancelar-solicitud.spec.ts
PASS src/inscripcion/inscripcion.controller.spec.ts
PASS src/inscripcion/inscripcion.roles.spec.ts
Tests: 20 passed (suite focalizada)
```

Frontend:

```text
PASS src/features/inscripcion/api/inscripcion.api.test.ts
PASS src/features/inscripcion/components/MisSolicitudesInscripcionTable.test.tsx
Tests: 28 passed (suite focalizada)
```

La interfaz muestra solicitudes pendientes, pendientes de documentación, aprobadas,
rechazadas y canceladas. La cancelación exige confirmación y está disponible para
pendientes, pendientes de documentación y aprobadas vigentes; las aprobadas además
dan de baja la inscripción activa. La documentación acepta PDF e imágenes y puede
adjuntarse durante la postulación o desde “Mis solicitudes” mientras el estado lo
permite.

La suite backend completa registra 1250 pruebas aprobadas y una falla preexistente
en `reservas/reservas-solicitud.service.spec.ts` (US-59), no relacionada con US-65.
