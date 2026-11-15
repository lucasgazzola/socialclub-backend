-- TASK-60: el titular sube su documentación desde Mi club y queda en revisión.
-- Los documentos existentes (cargados por el club) quedan APROBADO por defecto.

-- CreateEnum
CREATE TYPE "EstadoRevisionDocumento" AS ENUM ('APROBADO', 'PENDIENTE_REVISION', 'RECHAZADO');

-- AlterTable
ALTER TABLE "documentaciones" ADD COLUMN     "cargadoPorTitular" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "estadoRevision" "EstadoRevisionDocumento" NOT NULL DEFAULT 'APROBADO',
ADD COLUMN     "motivoRechazo" TEXT,
ADD COLUMN     "revisadoEn" TIMESTAMP(3),
ADD COLUMN     "revisadoPorId" INTEGER;

-- CreateIndex
CREATE INDEX "documentaciones_estadoRevision_idx" ON "documentaciones"("estadoRevision");

-- AddForeignKey
ALTER TABLE "documentaciones" ADD CONSTRAINT "documentaciones_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

