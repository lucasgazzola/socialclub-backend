# SocialClub — Backend (API)

Contexto para agentes de IA (Claude Code, Cursor, etc.). Leé esto antes de tocar el repo.
Objetivo: que cualquier sesión de IA, de cualquier integrante, produzca lo mismo y respete el estándar del equipo.

## Qué es
API REST de **SocialClub** (gestión de un club social/deportivo). Equipo **Nullpointer**.
Repo hermano: `socialclub-frontend` (SPA React que consume esta API).

## Stack
- **NestJS 11** + **Prisma 6** + **PostgreSQL**. Node ≥ 22. Auth con **JWT en cookie httpOnly** + bcrypt.
- Validación con `class-validator`/`class-transformer`. Docs con Swagger (`/api/docs`, solo fuera de producción).
- Tests: **Jest** (unitarios con dependencias mockeadas) + supertest (e2e).

## Arquitectura y convenciones de código
- **Un módulo por dominio** (`auth`, `usuarios`, `socios`, `categorias`, `disciplinas`, `cuotas`, `eventos`, `entradas`, `auditoria`). Escalabilidad modular.
- Guards, decorators y filtros compartidos en `src/common/` (`JwtAuthGuard`, `RolesGuard`, `@Roles`, `@CurrentUser`, `HttpExceptionFilter`).
- DTOs con decoradores de validación; `ValidationPipe` global con `whitelist + forbidNonWhitelisted + transform`.
- Todas las rutas bajo el prefijo **`/api/v1`**.
- **Auditoría inalterable**: `AuditoriaService` solo hace INSERT (nunca UPDATE/DELETE sobre `registros_auditoria`). Registrá acciones relevantes (crear/editar/baja/login/logout, control de acceso, etc.).
- Roles del sistema: `ADMIN`, `COLABORADOR`, `DELEGADO`, `SOCIO`. Protegé endpoints con `@Roles(...)` + `@UseGuards(JwtAuthGuard, RolesGuard)`.

## Idioma (IMPORTANTE)
- **Código, identificadores, tablas y campos: en español** (estándar actual del proyecto). Hay un plan de estandarización a inglés **en stand-by** — no migrar sin aviso.
- **Textos de usuario (mensajes de error/API) y datos de dominio (categorías, disciplinas): en español.**

## Git — flujo y nomenclatura (Git Flow del equipo)
Fuente: `docs/documentacion/gestion-del-proyecto/03 ... Ciclo de vida y enfoque de desarrollo`.
- **`main`** — producción. Solo se fusiona desde `dev` vía PR, con aprobación de todo el equipo. No debe contener errores.
- **`dev`** — integración. Se fusionan las ramas completadas; se despliega al entorno de pruebas.
- **`test`** — QA. Se fusionan cambios validados desde `dev`; pruebas automatizadas y manuales. Sin desarrollo directo.
- **`feature/<nombre>`** — nuevas funcionalidades. Se crean desde `dev` y vuelven a `dev` vía **PR aprobado por al menos otro integrante**.
- **`hotfix/<descripción>`** — correcciones urgentes; se crean desde `main` y se fusionan a `main` y `dev`.
- En la práctica también se usan ramas `issue/<TASK-N-...>` y `fix/<...>`. Ejemplos: `feature/US-31-Validar-acceso-mediante-lectura-QR`, `issue/TASK-6-Fix-US-30`.
- **Commits atómicos**, formato `<prefijo>[scope]: <descripción>` (`feat`, `fix`, `docs`, `test`, `ci`, `chore`). Ej.: `feat[US-31]: Validar acceso mediante lectura de QR`.
- **Nunca** agregar el trailer `Co-Authored-By: Claude` ni ninguna atribución de IA.
- Merge a `dev` **vía Pull Request**, enlazando el PR a la tarjeta de la US en GitHub Projects.
- Entornos: `test` y `main` tienen **cada uno su API + base de datos** (Azure Container Apps + Postgres Flexible); frontend en Vercel. Despliegue por CI/CD (GitHub Actions + OIDC).

## Definition of Done
Fuente: `docs/documentacion/gestion-del-proyecto/03 ... Ciclo de vida ...` §3.9. Una tarea/funcionalidad está **terminada** cuando:
1. Se cumple el objetivo de la tarea.
2. El código está commiteado y pusheado a la rama correspondiente.
3. Se escribieron y pasaron los **tests unitarios** (cobertura mínima **70%**).
4. Fue **testeada por un integrante externo** al que la desarrolló (pruebas cruzadas).
5. Fue testeada en conjunto con otras funcionalidades en desarrollo.
6. Se actualizó la **documentación** del proyecto.
7. Fue **desplegada en el entorno de pruebas** y es accesible.
> Criterios de aceptación: validada por el Product Owner en la Sprint Review; se ajusta a las especificaciones; es usable; integra con el resto; ejecuta sin errores.

## Testing
- Patrón de test unitario: mockear `PrismaService` y `AuditoriaService`; probar la lógica del service. Ver `*.service.spec.ts` como referencia.
- Al implementar una US: sumar tests (camino feliz + rechazos/validaciones) y cargar los casos en la matriz de pruebas con el skill **`/casos-prueba`** (tipos válidos: Unitaria, Integral, Funcional, Regresión, Aceptación, No funcional).

## Comandos
```bash
npm run dev            # NestJS en watch
npm test               # Jest (unitarios); usar antes de commitear
npm run test:cov       # cobertura
npm run lint           # eslint --fix
docker compose up -d db        # Postgres local
npx prisma db push && npm run prisma:seed   # sincronizar esquema + seed (admin@socialclub.local / Admin123!)
```
> En prod la cookie de sesión usa `SameSite=None; Secure` (front y API en dominios distintos). El seed corre en cada arranque del contenedor.

## Reglas para agentes de IA
- **Seguí el flujo y la nomenclatura de arriba.** No mergees ni pushees sin que el usuario lo pida.
- No inventes endpoints/campos: revisá el módulo existente y el `schema.prisma` antes.
- Preservá los mensajes en español; no traduzcas identificadores (estandarización en stand-by).
- Verificá con `npm test` + typecheck antes de dar algo por terminado.
- La documentación del proyecto vive en `docs/` — leéla antes de generar casos de prueba o documentación de cierre.
- Skills del equipo en `.claude/skills/` (p. ej. `/casos-prueba`, `/cierre-sprint`).

## Punteros
- Documentación (DoD, convenciones, plantillas, PMBOK): `docs/` — ver `docs/README.md`.
- Despliegue e infraestructura: ver notas de handoff del equipo.
