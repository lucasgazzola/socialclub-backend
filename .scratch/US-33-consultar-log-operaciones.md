# US-33 Consultar el log de operaciones

## Contexto
Como administrador quiero consultar el registro histórico de operaciones para auditar cambios y resolver disputas.

## Criterios de Aceptación
1. El sistema ordena los logs cronológicamente de más reciente a más antiguo por defecto.
2. El sistema permite filtrar los logs por tipo de operación, usuario responsable y rango de fechas.
3. Se aplica el esquema estándar de paginación (`pagina`, `porPagina`).

## Decisiones Técnicas Implementadas en el Backend
- Se re-utilizó el DTO `FindAuditoriaQueryDto` que implementa los filtros (`accion`, `entidad`, `responsableId`, `fechaDesde`, `fechaHasta`) y paginación (`pagina`, `porPagina`).
- Se incorporó el filtro rápido de período (`periodo` o alias `rango`) con opciones:
  - `1h`: Última 1 hora (`ahora - 1h`).
  - `24h`: Últimas 24 horas (`ahora - 24h`).
  - `7d`: Últimos 7 días (`ahora - 7d`).
  - `personalizado`: Usa `fechaDesde` y `fechaHasta`.
- El método `AuditoriaService.listarTodos` resuelve de forma nativa la ordenación cronológica descendente (`orderBy: { fechaHora: 'desc' }`), el cálculo dinámico de `fechaHora.gte` para filtros rápidos y la combinación condicional de filtros en la base de datos usando transacciones de Prisma para el count.
- El controlador de auditoría se documentó con el tag `US-33`.
- Cobertura completa de pruebas unitarias (`auditoria.service.spec.ts`, `auditoria.controller.spec.ts` y `auditoria.roles.spec.ts`).

## Próximos pasos
- [ ] Frontend: Conectar pestañas de filtros rápidos (`Última 1h`, `Últimas 24h`, `Últimos 7 días`, `Personalizado`) enviando `periodo` en la query.
- [ ] QA: Probar todos los filtros y paginación desde el entorno de pruebas.
