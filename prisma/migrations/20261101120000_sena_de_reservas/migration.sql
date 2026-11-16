-- AlterEnum
ALTER TYPE "ConceptoCobro" ADD VALUE 'RESERVA';

-- AlterTable
ALTER TABLE "reservas" ADD COLUMN     "ordenPagoId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "reservas_ordenPagoId_key" ON "reservas"("ordenPagoId");

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_ordenPagoId_fkey" FOREIGN KEY ("ordenPagoId") REFERENCES "ordenes_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

