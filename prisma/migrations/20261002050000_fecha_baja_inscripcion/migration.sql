-- AlterTable
ALTER TABLE "inscripciones" ADD COLUMN     "fechaBaja" TIMESTAMP(3);


-- Datos: las inscripciones ya dadas de baja toman como fecha de baja su última modificación.
UPDATE "inscripciones" SET "fechaBaja" = "actualizadoEn" WHERE "activo" = false AND "fechaBaja" IS NULL;
