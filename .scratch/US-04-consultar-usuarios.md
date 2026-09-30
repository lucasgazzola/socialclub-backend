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

- **DTO**: Se creará un `GetUsuariosQueryDto` utilizando `class-validator` y `class-transformer` para asegurar el parseo estricto de los query params (`nombre`, `rol`).
- **Endpoint**: Se agregará el decorador `@Get()` al `UsuariosController`.
- **Servicio**: En `UsuariosService`, se implementará el método `findAll` (o se actualizará si ya existe) usando Prisma. Se usará `OR` para buscar el texto tanto en `nombre` como en `apellido` del usuario con `contains` y `mode: 'insensitive'`.
- **Relaciones**: Para mostrar el DNI (que vive en la entidad `Persona`) y el rol (que vive en `Rol` a través de `UsuarioRol`), el query a Prisma incluirá `include: { persona: true, roles: { include: { rol: true } } }`.
- El mapeo a los datos básicos (nombre, DNI, rol, correo) se puede hacer en el servicio o se retornará la data y el front lo acomoda (se devolverá la información estrictamente necesaria).

## Testing Decisions

- Se probará el comportamiento externo del endpoint `GET /usuarios` en `usuarios.controller.spec.ts` o en los tests e2e.
- Las pruebas en `usuarios.service.spec.ts` simularán `prisma.usuario.findMany` para verificar que:
  - Sin parámetros, retorna todo.
  - Con parámetro `nombre`, Prisma recibe la consulta de búsqueda ignorando mayúsculas/minúsculas.
  - Con parámetro `rol`, Prisma recibe el filtro por la relación `roles`.
  - Retorna un array vacío si `findMany` no encuentra nada.
- Sólo probamos el comportamiento de los filtros, no la lógica interna de Prisma.

## Out of Scope

- Edición, creación o eliminación de usuarios (eso pertenece a otras User Stories).
- Búsqueda por DNI (la US específica buscar por nombre y filtrar por rol).

## Further Notes

- Se requiere verificar la inmutabilidad o auditoría si el endpoint de listar debe registrar lecturas en auditoría (generalmente no aplica a acciones `GET`, ver reglas en `AGENTS.md` - sólo menciona CREAR, EDITAR, BAJA, REACTIVAR, LOGIN, LOGOUT).
