-- DT-41: historial de períodos de cada inscripción (alta y baja).
-- CreateTable
CREATE TABLE "periodos_inscripcion" (
    "id" SERIAL NOT NULL,
    "inscripcionId" INTEGER NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL,
    "hasta" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "periodos_inscripcion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "periodos_inscripcion_inscripcionId_idx" ON "periodos_inscripcion"("inscripcionId");

-- AddForeignKey
ALTER TABLE "periodos_inscripcion" ADD CONSTRAINT "periodos_inscripcion_inscripcionId_fkey" FOREIGN KEY ("inscripcionId") REFERENCES "inscripciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: un período por inscripción existente con lo que se conoce hoy.
-- Los tramos anteriores a una reinscripción ya se perdieron (era el bug).
INSERT INTO "periodos_inscripcion" ("inscripcionId", "desde", "hasta")
SELECT "id",
       "fechaInscripcion",
       CASE WHEN "activo" THEN NULL ELSE COALESCE("fechaBaja", "actualizadoEn") END
FROM "inscripciones";
