# SocialClub — Backend

API REST del sistema **SocialClub**, desarrollada por el **Equipo Nullpointer** para
la materia Proyecto Final (UTN FRVM, Ingeniería en Sistemas de Información).

Gestiona la administración y operación de organizaciones deportivas y sociales:
acceso seguro, usuarios con roles, socios y auditoría inalterable de operaciones.

> Esta es la **versión inicial (Sprint 1)**. Está pensada como base sobre la que el
> equipo seguirá construyendo, priorizando una arquitectura **modular, mantenible y
> escalable** (un módulo por área funcional).

---

## Stack tecnológico

| Capa            | Tecnología                         | Versión |
| --------------- | ---------------------------------- | ------- |
| Runtime         | Node.js                            | 22 LTS  |
| Framework       | NestJS                             | 11.1    |
| ORM             | Prisma                             | 6.19    |
| Base de datos   | PostgreSQL                         | 18      |
| Autenticación   | JWT (cookie httpOnly) + bcrypt     | —       |
| Validación      | class-validator / class-transformer| —       |
| Documentación   | Swagger (OpenAPI)                  | —       |
| Tests           | Jest + Supertest                   | —       |
| Lenguaje        | TypeScript                         | 6.0     |

> **¿Por qué Prisma 6 y no 7?** Prisma 7 introduce cambios de fondo (ESM obligatorio
> y adaptadores de driver obligatorios) que agregan complejidad innecesaria para el
> alcance actual. Mantenemos la última 6.x (estable y mejor documentada) y dejamos la
> migración a 7.x como evaluación de un sprint futuro.

---

## Alcance funcional (Sprint 1)

| Módulo       | Historias de usuario      | Descripción                                       |
| ------------ | ------------------------- | ------------------------------------------------- |
| `auth`       | US-39, US-40              | Login / logout con JWT en cookie httpOnly         |
| `usuarios`   | US-01, US-02, US-03       | ABM de usuarios administrativos con roles         |
| `socios`     | US-12, US-13, US-14, US-15| ABM y consulta de socios (Persona)                |
| `auditoria`  | US-32                     | Registro **inalterable** de operaciones (RF12)    |

---

## Requisitos previos

- **Node.js 22 LTS** y **npm** (solo para correr sin Docker).
- **Docker** y **Docker Compose** (opción recomendada: no requiere instalar nada más).

---

## Puesta en marcha

### Opción A — con Docker (recomendada)

Levanta PostgreSQL + la API, aplica el esquema y ejecuta el seed automáticamente.

```bash
cp .env.example .env   # 1) crear el archivo de entorno (solo la primera vez)
npm run up             # 2) levantar DB + API en background
```

- API:     <http://localhost:3000/api/v1>
- Swagger:  <http://localhost:3000/api/docs>
- Postgres: `localhost:5432` (usuario / pass / db: `socialclub`)

Para detener: `npm run down` (o `docker compose down -v` para borrar también los datos).

### Opción B — local, sin Docker

Necesitás un PostgreSQL accesible. Ajustá `DATABASE_URL` en `.env` (host `localhost`).

```bash
cp .env.example .env
npm install
npm run db:setup            # aplica migraciones/esquema + seed
npm run dev                 # API con hot-reload
```

---

## Usuario administrador inicial

El seed crea (valores configurables en `.env`):

```
email:     admin@socialclub.local
password:  Admin123!
```

> Cambiá esta contraseña en cualquier entorno que no sea local.

---

## Variables de entorno

Todas están documentadas en [`.env.example`](./.env.example). Las críticas:

| Variable        | Descripción                                              |
| --------------- | -------------------------------------------------------- |
| `DATABASE_URL`  | Cadena de conexión a PostgreSQL.                         |
| `JWT_SECRET`    | Secreto para firmar los JWT (mínimo 16 caracteres).      |
| `JWT_EXPIRES_IN`| Duración del token (`8h`, `1d`, ...).                    |
| `CORS_ORIGIN`   | Orígenes permitidos (URL del frontend), separados por coma. |

La configuración se **valida al arrancar**: si falta una variable crítica, el proceso
falla con un mensaje claro en vez de romperse más tarde.

---

## Scripts disponibles

| Script                   | Descripción                                        |
| ------------------------ | -------------------------------------------------- |
| `npm run dev`            | Levanta la API en modo desarrollo (hot-reload).    |
| `npm run build`          | Compila a JavaScript en `dist/`.                   |
| `npm run start:prod`     | Ejecuta la build de producción.                    |
| `npm run lint`           | ESLint + Prettier (corrige automáticamente).       |
| `npm run format`         | Formatea el código con Prettier.                   |
| `npm test`               | Tests unitarios.                                   |
| `npm run test:e2e`       | Tests end-to-end (requiere base de datos).         |
| `npm run test:cov`       | Cobertura (DoD: mínimo 70%).                        |
| `npm run prisma:migrate` | Crea/aplica una migración en desarrollo.           |
| `npm run prisma:seed`    | Ejecuta el seed (roles + admin inicial).           |
| `npm run prisma:studio`  | Abre Prisma Studio (explorador visual de la BD).   |
| `npm run db:setup`       | Migración + seed en un solo comando.               |
| `npm run up`             | Levanta DB + API con Docker Compose (detached).    |
| `npm run down`           | Detiene y elimina los contenedores de Docker.      |

---

## Estructura del proyecto

```
src/
├── main.ts                 # Bootstrap: prefijo /api/v1, CORS, helmet, Swagger
├── app.module.ts           # Módulo raíz (compone los módulos de dominio)
├── app.controller.ts       # Healthcheck (GET /api/v1/health)
├── config/
│   └── env.validation.ts   # Validación de variables de entorno al arranque
├── common/                 # Código transversal reutilizable
│   ├── decorators/         # @Roles, @CurrentUser
│   ├── guards/             # JwtAuthGuard, RolesGuard
│   ├── filters/            # Filtro de excepciones (formato de error uniforme)
│   └── dto/                # PaginationQueryDto
├── prisma/                 # PrismaService / PrismaModule (acceso a datos)
├── auditoria/              # Registro inalterable de operaciones (global)
├── auth/                   # Login / logout (US-39, US-40)
├── usuarios/               # Usuarios administrativos (US-01 a US-03)
└── socios/                 # Socios (US-12 a US-15)

prisma/
├── schema.prisma           # Modelo de datos
└── seed.ts                 # Datos iniciales (roles + admin)
```

### Cómo agregar un nuevo módulo de dominio

Cada área funcional es un módulo independiente. Para una nueva (ej: `cuotas`):

```bash
nest g module cuotas
nest g controller cuotas
nest g service cuotas
```

Seguí el patrón de `socios/`: **DTOs** (validación de entrada), **Service** (lógica de
negocio + auditoría), **Controller** (rutas + guards/roles). Registrá las operaciones
relevantes con `AuditoriaService` y protegé las rutas con `@Roles(...)`.

---

## Auditoría (RF12 / RNF03)

Toda alta, baja, modificación y evento de sesión queda registrado de forma
**inalterable** en la tabla `registros_auditoria`. El `AuditoriaService` es el **único
punto de escritura** y solo expone operaciones de inserción y consulta: nunca update ni
delete. Esto garantiza la trazabilidad exigida por el proyecto.

---

## Convenciones del equipo

Ramas, formato de commits (`<prefijo>[US]: descripción`), Pull Requests, linting y
Definition of Done están definidos en el documento de **Sprint 0**. Recordá: **nunca**
se commitea el archivo `.env`.

---

## API principal (resumen)

Base: `http://localhost:3000/api/v1`

| Método   | Ruta              | Roles                | Descripción              |
| -------- | ----------------- | -------------------- | ------------------------ |
| `POST`   | `/auth/login`     | público              | Iniciar sesión           |
| `POST`   | `/auth/logout`    | autenticado          | Cerrar sesión            |
| `GET`    | `/auth/me`        | autenticado          | Usuario de la sesión     |
| `GET`    | `/usuarios`       | ADMIN                | Listar usuarios          |
| `POST`   | `/usuarios`       | ADMIN                | Crear usuario            |
| `PATCH`  | `/usuarios/:id`   | ADMIN                | Editar usuario           |
| `DELETE` | `/usuarios/:id`   | ADMIN                | Baja lógica de usuario   |
| `GET`    | `/socios`         | ADMIN, COLABORADOR   | Consultar socios         |
| `POST`   | `/socios`         | ADMIN                | Registrar socio          |
| `PATCH`  | `/socios/:id`     | ADMIN                | Editar socio             |
| `DELETE` | `/socios/:id`     | ADMIN                | Baja lógica de socio     |

La documentación interactiva completa está en **Swagger** (`/api/docs`).
