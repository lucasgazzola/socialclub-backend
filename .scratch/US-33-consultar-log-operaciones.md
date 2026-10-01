# US-33 Consultar el log de operaciones

## Contexto
Como administrador quiero consultar el registro histórico de operaciones para auditar cambios y resolver disputas.

## Criterios de Aceptación
1. El sistema ordena los logs cronológicamente de más reciente a más antiguo por defecto.
2. El sistema permite filtrar los logs por tipo de operación, usuario responsable y rango de fechas.
3. Se aplica el esquema estándar de paginación (`pagina`, `porPagina`).

## Decisiones Técnicas Implementadas en el Backend
- Se re-utilizó el DTO `FindAuditoriaQueryDto` que ya implementaba los filtros (`accion`, `entidad`, `responsableId`, `fechaDesde`, `fechaHasta`) y paginación (`pagina`, `porPagina`).
- El método `AuditoriaService.listarTodos` ya resolvía de forma nativa la ordenación cronológica descendente (`orderBy: { fechaHora: 'desc' }`) y la combinación condicional de filtros en la base de datos usando transacciones de Prisma para el count.
- El controlador de auditoría se documentó con el tag `US-33`.
- Se agregó el archivo `auditoria.controller.spec.ts` que faltaba para garantizar 100% de cobertura del controlador.

## Próximos pasos
- [ ] Frontend: Implementar pantalla con tabla de auditoría, incluyendo filtros por rango de fechas (datepicker), combo de acciones y paginado.
- [ ] QA: Probar todos los filtros y paginación desde el entorno de pruebas.
