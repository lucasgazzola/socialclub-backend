---
name: casos-a-tests
description: >-
  Convierte una Historia de Usuario y sus casos de prueba en tests AUTOMATIZADOS
  (Jest en backend, Vitest en frontend), siguiendo el patrón real del repo y
  etiquetados con la US para trazabilidad. Usalo después de definir los casos con
  /casos-prueba, o para cubrir una US ya implementada.
---

# Skill: casos-a-tests (Equipo Nullpointer)

Objetivo: pasar de **casos definidos** a **tests que se ejecutan solos** en el CI,
verificando el **comportamiento real** del código (no lo que "debería" hacer).

## Entrada
- La **US** (título + criterios de aceptación) y, si existen, sus **casos** (`/casos-prueba`).
- El repo: **backend** (Jest) o **frontend** (Vitest).

## Antes de escribir: leer el código real
- Backend: el `*.service.ts` / `*.controller.ts` / DTO / guard de la US. Verificar endpoints, validaciones, roles (`@Roles`), mensajes y auditoría reales.
- Frontend: el componente/hook/`*.api.ts` de la feature. Verificar props, validación zod, llamadas a la API.
- **No inventar**: si un comportamiento no está implementado, no escribir un test que lo asuma; marcarlo.

## Patrón de tests (seguir el existente del repo)

### Backend — Jest (`src/**/<x>.service.spec.ts`)
- Mockear `PrismaService` y `AuditoriaService` (ver `auth.service.spec.ts`, `socios.service.spec.ts` como plantilla).
- Un `describe` por servicio/US; un `it` por caso. Probar camino feliz + rechazos/validaciones + auditoría.
- Integración (tipo **Integral**): e2e con **supertest** usando `test/jest-e2e.json` (requiere DB de test).

### Frontend — Vitest + Testing Library (`src/features/<x>/**/<y>.spec.tsx`)
- Mockear la capa `*.api.ts` con `vi.mock`; envolver hooks en `QueryClientProvider` (ver `useCreateUsuario.spec.tsx`, `UsuarioForm.spec.tsx`).
- Formularios: validar mensajes zod y el submit; hooks: éxito/error y toasts.

## Trazabilidad (obligatorio)
- Nombrar los `describe`/`it` con el **ID de la US** (y del caso si existe). Ej.:
  `describe('US-15 · Consultar socios', () => { it('TC-… busca por coincidencia parcial', …) })`.
- Así la matriz US ↔ caso ↔ test ↔ resultado queda ligada por nombre.

## Mapeo tipo de caso → test
- **Unitaria** → test unitario (Jest/Vitest, dependencias mockeadas).
- **Integral / Integración** → e2e supertest (back) o test de integración de hook+api (front).
- **Funcional (UI)** → test de componente (Testing Library).
- **Aceptación (navegador de punta a punta)** → **fuera de este skill** (requiere Playwright): dejar el caso marcado como "manual/E2E" hasta que exista Playwright.
- **Regresión** → no se escribe test nuevo: se cubre re-corriendo la suite en el CI.
- **No funcional (seguridad)** → cuando aplique (p. ej. acceso denegado por rol), sí como test.

## Cierre (siempre)
1. Crear el/los archivo(s) de test siguiendo el patrón.
2. Correr **solo** ese archivo y luego la suite:
   - Back: `npx jest <ruta>` → `npm run test:cov`.
   - Front: `npx vitest run <ruta>` → `npm run test:cov`.
3. Confirmar que pasan y que **la cobertura no baja** (el ratchet del CI la protege).
4. Reportar: qué casos quedaron cubiertos por tests automáticos y cuáles siguen siendo manuales (Aceptación/E2E), para el registro de ejecución.

## Reglas
- Los tests deben **fallar si el comportamiento se rompe** (asserts significativos, no `expect(true)`).
- No tocar código de producción para "hacer pasar" un test sin justificación.
- Textos/mensajes esperados: en **español**, tal cual el código.
