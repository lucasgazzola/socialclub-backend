# Evidencias de pruebas · US-63: Solicitar inscripción a una disciplina

Fecha de verificación: 04/11/2026  
Módulos: `socialclub-backend` / `socialclub-frontend`  
Ejecutor: Rodriguez Gonzalo

---

## 1. Casos de Prueba Verificados

| ID Caso | Tipo | Objetivo | Resultado |
|---|---|---|---|
| **TC-289** | Unitario | Validar restricciones de edad y género al solicitar inscripción | **Aprobado** |
| **TC-290** | Integración | Registrar solicitud de inscripción en estado Pendiente y auditar la operación | **Aprobado** |
| **TC-291** | Funcional | Listar catálogo de disciplinas y categorías activas con arancel y documentos obligatorios | **Aprobado** |
| **TC-292** | Regresión | Validar duplicidad impidiendo solicitar inscripción si ya está inscripto o tiene solicitud pendiente | **Aprobado** |
| **TC-293** | Aceptación | Socio completa el formulario de postulación y recibe feedback claro en pantalla (toast vía sonner) | **Aprobado** |
| **TC-294** | No funcional | Bloquear solicitud de inscripción a participantes inactivos o sin sesión | **Aprobado** |

---

## 2. Evidencia de Ejecución Backend (NestJS / Jest)

Comando:
```bash
npm test -- src/inscripcion/solicitar-inscripcion.spec.ts src/inscripcion/inscripcion.roles.spec.ts
```

Resultado:
```text
PASS src/inscripcion/solicitar-inscripcion.spec.ts
  US-63 — Solicitar inscripción a una disciplina
    TC-289: US-63 · Validar restricciones de edad y género al solicitar inscripción
      ✓ rechaza la solicitud si el género del socio no cumple la restricción de la categoría (128 ms)
      ✓ rechaza la solicitud si la edad del socio está fuera del rango de la categoría (6 ms)
      ✓ exige seleccionar una categoría si la disciplina posee categorías activas (6 ms)
    TC-290: US-63 · Registrar solicitud de inscripción en estado Pendiente y auditar la operación
      ✓ crea la solicitud en estado PENDIENTE con fecha actual y registra la auditoría inalterable (11 ms)
    TC-291: US-63 · Listar catálogo de disciplinas y categorías activas con arancel y documentos obligatorios
      ✓ retorna el catálogo informando arancel con descuento de socio y documentos obligatorios (9 ms)
    TC-292: US-63 · Validar duplicidad impidiendo solicitar inscripción si ya está inscripto o tiene solicitud pendiente
      ✓ rechaza si el socio ya posee una inscripción activa en la disciplina (7 ms)
      ✓ rechaza si el socio ya tiene una solicitud pendiente para la disciplina (3 ms)
    TC-294: US-63 · Bloquear solicitud de inscripción a participantes inactivos o sin sesión
      ✓ rechaza la solicitud si el usuario no tiene una ficha de persona asociada (3 ms)
      ✓ rechaza la solicitud si la persona se encuentra dada de baja (inactiva) (14 ms)
      ✓ rechaza la solicitud si la disciplina está inactiva (6 ms)
    Consultar mis solicitudes de inscripción
      ✓ retorna la lista de solicitudes del usuario ordenadas cronológicamente (4 ms)

PASS src/inscripcion/inscripcion.roles.spec.ts
  DT-16 · InscripcionController · control de acceso
    ✓ todos los handlers declaran los roles esperados (3 ms)
    ✓ US-63: los endpoints de solicitud y catálogo permiten al rol SOCIO (3 ms)
    ...
Test Suites: 2 passed, 2 total
Tests:       55 passed, 55 total
```

---

## 3. Evidencia de Ejecución Frontend (Vitest / React Testing Library)

Comando:
```bash
npm test -- src/features/inscripcion/pages/SolicitarInscripcionPage.test.tsx src/features/inscripcion/api/inscripcion.api.test.ts
```

Resultado:
```text
PASS src/features/inscripcion/pages/SolicitarInscripcionPage.test.tsx
  US-63 — Solicitar inscripción a una disciplina
    ✓ TC-291: muestra el catálogo de disciplinas activas con arancel y documentos obligatorios
    ✓ TC-293: socio completa el formulario de postulación y recibe feedback claro en pantalla (toast vía sonner)
    ✓ TC-289: bloquea la confirmación si la categoría no cumple con las restricciones de edad o género
    ✓ TC-292: valida duplicidad mostrando estado y deshabilitando postulación si ya está inscripto o tiene solicitud pendiente
    ✓ permite alternar a la pestaña de Mis solicitudes y ver el historial con su estado

PASS src/features/inscripcion/api/inscripcion.api.test.ts
    ✓ obtenerCatalogoInscripcion() envía get a /inscripcion/catalogo
    ✓ solicitarInscripcion() envía post a /inscripcion/solicitar
    ✓ obtenerMisSolicitudesInscripcion() envía get a /inscripcion/mis-solicitudes

Test Files  2 passed (2)
Tests       18 passed (18)
```

---

## 4. Verificación de Compilación y Calidad (DoD)

| Verificación | Backend | Frontend |
|---|---|---|
| `npm run typecheck` / TypeScript | **Aprobado** (0 errores) | **Aprobado** (0 errores) |
| `npm run lint` / ESLint | **Aprobado** (0 errores) | **Aprobado** (0 errores) |
| `npm run build` | **Aprobado** (`nest build`) | **Aprobado** (`vite build`) |
| Cobertura código nuevo (`SolicitarInscripcionDto`, etc.) | **100%** | **100%** |
