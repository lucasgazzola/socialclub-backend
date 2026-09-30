## Problem Statement

El administrador del sistema necesita una forma rápida y eficiente de buscar y filtrar a los usuarios administrativos existentes en la plataforma, para acceder rápidamente a su información (como DNI, correo, o roles asignados) sin tener que revisar manualmente todos los registros.

## Solution

Desarrollar un endpoint en el backend (`GET /usuarios`) que reciba parámetros de consulta (`query params`) como nombre y rol, y retorne un listado filtrado de usuarios administrativos. Si no se proveen filtros, se debe retornar un listado paginado o completo (según contexto general, aunque la US no pide explícitamente paginación, los filtros deben combinarse).

## User Stories

1. As an Administrador, I want a endpoint de búsqueda de usuarios por nombre, so that pueda encontrar a una persona específica tipeando una parte de su nombre o apellido.
2. As an Administrador, I want a endpoint de filtrado de usuarios por rol, so that pueda ver todos los usuarios que tienen un rol particular (ej. ADMIN, COLABORADOR).
3. As an Administrador, I want a combinaciones de filtros de búsqueda, so that pueda buscar por nombre Y rol al mismo tiempo.
4. As an Administrador, I want a respuesta con datos básicos, so that pueda ver el nombre, DNI, rol y correo de cada usuario en los resultados, extraídos de la relación con Persona.
5. As an Administrador, I want a recibir un array vacío en caso de no haber coincidencias, so that el front-end pueda mostrar el mensaje “No se encontraron resultados”.

## Implementation Decisions

- **DTO**: Se creará un `GetUsuariosQueryDto` utilizando `class-validator` y `class-transformer` para asegurar el parseo estricto de los query params (`busqueda`, `rolId`, `pagina`, `porPagina`).
- **Endpoint**: Se agregará el decorador `@Get()` al `UsuariosController` para recibir este DTO.
- **Servicio**: En `UsuariosService`, el método `findAll` usará `skip` y `take` de Prisma para paginar, además del uso de `contains` (mode: 'insensitive') para `nombre/apellido` y de buscar en `roles` si se pide. El endpoint retornará la misma estructura estandarizada que `socios` (con `items`, `total`, `pagina`, `porPagina` y `counts`).
- **Relaciones**: Para mostrar el DNI (que vive en la entidad `Persona`) y el rol (que vive en `Rol` a través de `UsuarioRol`), el query a Prisma incluirá `include: { persona: true, roles: { include: { rol: true } } }`.
- El mapeo a los datos básicos (nombre, DNI, rol, correo) se puede hacer en el servicio o se retornará la data y el front lo acomoda (se devolverá la información estrictamente necesaria).


### Frontend Implementation Decisions (React + TanStack Query)

- **Filtros UI**: Se integró React Hook Form junto a Zod (con usuariosFilterSchema) para gestionar el estado de los filtros (nombre y rol) en la barra de búsqueda superior.
- **Iconografía y Componentes**: Siguiendo ESTANDARES_UI_UX.md, se utilizaron los íconos <Search /> para el <Input /> de nombre y <Filter /> para el <Select /> de roles.
- **Jerarquía Visual**: La vista no utiliza centrado mx-auto forzado y mantiene la tipografía obligatoria en el <h1>.
- **Integración con API**: Se actualizó el hook useUsers y usuariosApi.list para aceptar un parámetro opcional GetUsuariosParams que mapea a los query params correspondientes en el endpoint GET /usuarios.
- **Experiencia de Usuario**: Se mantuvo el componente StatusTabs para la vista de estados lógicos del front y se aseguró de que si la API retorna un array vacío tras filtrar, se muestre la tarjeta adecuada (ej. "Ningún usuario coincide con el filtro seleccionado.").

## Testing Decisions

- Se probaron unitariamente los endpoints en `usuarios.controller.spec.ts` aislando el servicio para garantizar que los filtros, los datos del cuerpo y los roles operativos se propagan correctamente hacia la capa de negocio.
- Se amplió la cobertura en `usuarios.service.spec.ts` simulando `prisma.usuario.findMany` para verificar que:
  - Sin parámetros, retorna todo.
  - Con parámetro `busqueda`, Prisma recibe la consulta de búsqueda usando un bloque `OR` con `contains` e ignorando mayúsculas/minúsculas (`mode: 'insensitive'`).
  - Con parámetro `rolId`, Prisma recibe el filtro por la relación `roles`.
- Se diseñaron y ejecutaron **pruebas de integración (E2E) en `usuarios.e2e-spec.ts`**:
  - **Filtro por Nombre**: Se envió una petición HTTP GET con `?nombre=...` y se verificó que devuelva la estructura completa esperada y que invoque al servicio de BD con el criterio correcto.
  - **Filtro por Rol**: Se envió una petición con `?rol=...` verificando el comportamiento del endpoint.
  - **Filtros Combinados**: Se envió una petición con `?nombre=...&rol=...` comprobando la combinación en la consulta (`OR` para nombre y `roles` para el rol).
  - **Casos Borde (Sin resultados)**: Se probó explícitamente enviar filtros que no coinciden con registros en BD, garantizando que el endpoint responda exitosamente con un array vacío `[]` (y no devuelva null ni un error 404).
- Sólo probamos el comportamiento de los filtros y la interacción de la API, delegando la lógica interna final a Prisma.

## Out of Scope

- Edición, creación o eliminación de usuarios (eso pertenece a otras User Stories).
- Búsqueda por DNI (la US específica buscar por nombre y filtrar por rol).

## Further Notes

- Se requiere verificar la inmutabilidad o auditoría si el endpoint de listar debe registrar lecturas en auditoría (generalmente no aplica a acciones `GET`, ver reglas en `AGENTS.md` - sólo menciona CREAR, EDITAR, BAJA, REACTIVAR, LOGIN, LOGOUT).
