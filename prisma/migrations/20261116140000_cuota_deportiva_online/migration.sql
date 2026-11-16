-- AlterEnum
ALTER TYPE "ConceptoCobro" ADD VALUE 'CUOTA_DEPORTIVA';

-- AlterTable
ALTER TABLE "pagos_cuota_deportiva" ADD COLUMN "ordenPagoId" INTEGER;

-- CreateIndex
CREATE INDEX "pagos_cuota_deportiva_ordenPagoId_idx" ON "pagos_cuota_deportiva"("ordenPagoId");

-- AddForeignKey
ALTER TABLE "pagos_cuota_deportiva" ADD CONSTRAINT "pagos_cuota_deportiva_ordenPagoId_fkey" FOREIGN KEY ("ordenPagoId") REFERENCES "ordenes_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;
