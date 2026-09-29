-- CreateEnum
CREATE TYPE "GeneroDisciplina" AS ENUM ('FEMENINO', 'MASCULINO', 'NO_BINARIO_NO_ESPECIFICADO');

-- CreateEnum
CREATE TYPE "TipoDocumentacionDisciplina" AS ENUM ('DNI', 'FICHA_INSCRIPCION', 'CERTIFICADO_MEDICO_APTITUD_FISICA', 'SEGURO_COBERTURA_MEDICA', 'AUTORIZACION_PADRES_TUTORES', 'CARNET_FEDERATIVO_LICENCIA_DEPORTIVA', 'REGLAMENTO_INTERNO_FIRMADO', 'FICHA_TECNICA_NATACION', 'FICHA_TECNICA_GIMNASIO_FITNESS', 'FICHA_TECNICA_ARTES_MARCIALES', 'FICHA_TECNICA_DEPORTES_CONTACTO', 'COMPROBANTE_PAGO_CUOTA_SOCIAL_DEPORTIVA');

-- AlterTable
ALTER TABLE "disciplinas" ADD COLUMN     "edadMaxima" INTEGER,
ADD COLUMN     "edadMinima" INTEGER,
ADD COLUMN     "genero" "GeneroDisciplina",
ADD COLUMN     "solicitaDocumentacion" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "disciplina_requerimientos_doc" (
    "id" SERIAL NOT NULL,
    "disciplinaId" INTEGER NOT NULL,
    "tipoDocumento" "TipoDocumentacionDisciplina" NOT NULL,
    "plazoDiasTolerancia" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disciplina_requerimientos_doc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos_cuota_deportiva" (
    "id" SERIAL NOT NULL,
    "personaId" INTEGER NOT NULL,
    "disciplinaId" INTEGER NOT NULL,
    "periodo" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "metodoPago" TEXT NOT NULL DEFAULT 'EFECTIVO',
    "fechaPago" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responsableId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_cuota_deportiva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "disciplina_requerimientos_doc_disciplinaId_idx" ON "disciplina_requerimientos_doc"("disciplinaId");

-- CreateIndex
CREATE UNIQUE INDEX "disciplina_requerimientos_doc_disciplinaId_tipoDocumento_key" ON "disciplina_requerimientos_doc"("disciplinaId", "tipoDocumento");

-- CreateIndex
CREATE INDEX "pagos_cuota_deportiva_personaId_idx" ON "pagos_cuota_deportiva"("personaId");

-- CreateIndex
CREATE INDEX "pagos_cuota_deportiva_disciplinaId_idx" ON "pagos_cuota_deportiva"("disciplinaId");

-- CreateIndex
CREATE INDEX "pagos_cuota_deportiva_periodo_idx" ON "pagos_cuota_deportiva"("periodo");

-- CreateIndex
CREATE UNIQUE INDEX "pagos_cuota_deportiva_personaId_disciplinaId_periodo_key" ON "pagos_cuota_deportiva"("personaId", "disciplinaId", "periodo");

-- AddForeignKey
ALTER TABLE "disciplina_requerimientos_doc" ADD CONSTRAINT "disciplina_requerimientos_doc_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplinas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_cuota_deportiva" ADD CONSTRAINT "pagos_cuota_deportiva_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_cuota_deportiva" ADD CONSTRAINT "pagos_cuota_deportiva_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplinas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_cuota_deportiva" ADD CONSTRAINT "pagos_cuota_deportiva_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
