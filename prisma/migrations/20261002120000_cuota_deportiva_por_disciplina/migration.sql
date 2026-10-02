-- TASK-33 · US-20: la tarifa de la cuota deportiva pasa de "disciplina +
-- categoría de socio" a "disciplina + categoría de la disciplina (opcional)",
-- con descuento para socios.

-- DropForeignKey
ALTER TABLE "configuraciones_cuota_deportiva" DROP CONSTRAINT "configuraciones_cuota_deportiva_categoriaId_fkey";

-- DropIndex
DROP INDEX "configuraciones_cuota_deportiva_disciplinaId_categoriaId_pe_key";

-- Datos: las tarifas por categoría de socio no tienen equivalente directo. Se
-- conserva una sola tarifa base por disciplina y período: la de monto más alto
-- (para no cobrar de menos); el descuento para socios arranca en 0.
DELETE FROM "configuraciones_cuota_deportiva" c
USING "configuraciones_cuota_deportiva" otra
WHERE c."disciplinaId" = otra."disciplinaId"
  AND c."periodoAplicacion" = otra."periodoAplicacion"
  AND (otra."monto" > c."monto" OR (otra."monto" = c."monto" AND otra."id" < c."id"));

-- AlterTable
ALTER TABLE "configuraciones_cuota_deportiva" DROP COLUMN "categoriaId",
ADD COLUMN     "categoriaDisciplinaId" INTEGER,
ADD COLUMN     "descuentoSocioPorcentaje" INTEGER NOT NULL DEFAULT 0;

-- El descuento es un porcentaje entero de 0 a 100.
ALTER TABLE "configuraciones_cuota_deportiva" ADD CONSTRAINT "configuraciones_cuota_deportiva_descuento_check" CHECK ("descuentoSocioPorcentaje" BETWEEN 0 AND 100);

-- CreateIndex
CREATE INDEX "configuraciones_cuota_deportiva_categoriaDisciplinaId_idx" ON "configuraciones_cuota_deportiva"("categoriaDisciplinaId");

-- CreateIndex
CREATE UNIQUE INDEX "configuraciones_cuota_deportiva_disciplinaId_categoriaDisci_key" ON "configuraciones_cuota_deportiva"("disciplinaId", "categoriaDisciplinaId", "periodoAplicacion");

-- AddForeignKey
ALTER TABLE "configuraciones_cuota_deportiva" ADD CONSTRAINT "configuraciones_cuota_deportiva_categoriaDisciplinaId_fkey" FOREIGN KEY ("categoriaDisciplinaId") REFERENCES "categorias_disciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;
