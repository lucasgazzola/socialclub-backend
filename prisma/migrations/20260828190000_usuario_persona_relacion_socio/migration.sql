-- Relación 1:1 entre Usuario y Persona (US-09).
ALTER TABLE "usuarios" ADD COLUMN "personaId" INTEGER;

INSERT INTO "personas" ("nombre", "apellido", "dni", "email", "creadoEn", "actualizadoEn")
SELECT "nombre", "apellido",
       COALESCE("dni", 'MIGRADO-' || "id"),
       "email", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "usuarios"
WHERE "personaId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "personas" p WHERE p."email" = "usuarios"."email"
  );

UPDATE "usuarios" u
SET "personaId" = p."id"
FROM "personas" p
WHERE u."personaId" IS NULL
  AND p."email" = u."email";

ALTER TABLE "usuarios" ALTER COLUMN "personaId" SET NOT NULL;
CREATE UNIQUE INDEX "usuarios_personaId_key" ON "usuarios"("personaId");

ALTER TABLE "usuarios"
ADD CONSTRAINT "usuarios_personaId_fkey"
FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "usuarios_dni_key";
ALTER TABLE "usuarios" DROP COLUMN "dni";
