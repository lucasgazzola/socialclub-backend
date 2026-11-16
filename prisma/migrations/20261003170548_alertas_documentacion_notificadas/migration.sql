-- CreateTable
CREATE TABLE "alertas_documentacion_notificadas" (
    "id" SERIAL NOT NULL,
    "clave" TEXT NOT NULL,
    "inscripcionId" INTEGER NOT NULL,
    "tipoDocumento" "TipoDocumentacionDisciplina" NOT NULL,
    "tipoAlerta" TEXT NOT NULL,
    "fechaReferencia" DATE NOT NULL,
    "notificadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alertas_documentacion_notificadas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alertas_documentacion_notificadas_clave_key" ON "alertas_documentacion_notificadas"("clave");

-- CreateIndex
CREATE INDEX "alertas_documentacion_notificadas_inscripcionId_idx" ON "alertas_documentacion_notificadas"("inscripcionId");

-- AddForeignKey
ALTER TABLE "alertas_documentacion_notificadas" ADD CONSTRAINT "alertas_documentacion_notificadas_inscripcionId_fkey" FOREIGN KEY ("inscripcionId") REFERENCES "inscripciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
