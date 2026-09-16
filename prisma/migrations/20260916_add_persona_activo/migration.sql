-- US-07: estado propio del participante.
-- Agrega `personas.activo` (default true) para marcar a un participante dado
-- de baja por el delegado. NOTA: la migración 20260915050001 había eliminado
-- `personas.activo` como columna legacy de socio; se reintroduce con otra
-- semántica (estado del participante, no del socio) y con un flujo real que
-- la usa: baja (US-07), bloqueo de inscripción y reactivación.
-- `DEFAULT true` deja activos a todos los existentes: estar sin disciplinas
-- no es estar dado de baja (la baja es un acto explícito y auditado).
ALTER TABLE "personas" ADD COLUMN "activo" BOOLEAN NOT NULL DEFAULT true;

-- Índice para filtrar participantes por estado.
CREATE INDEX "personas_activo_idx" ON "personas"("activo");
