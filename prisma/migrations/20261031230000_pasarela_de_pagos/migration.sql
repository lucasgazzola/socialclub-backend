-- CreateEnum
CREATE TYPE "ConceptoCobro" AS ENUM ('CUOTA_SOCIAL', 'ENTRADAS');

-- CreateEnum
CREATE TYPE "EstadoOrdenPago" AS ENUM ('PENDIENTE', 'APROBADA', 'CANCELADA', 'VENCIDA', 'REQUIERE_REVISION');

-- AlterTable
ALTER TABLE "compras_entradas" ADD COLUMN     "ordenPagoId" INTEGER;

-- AlterTable
ALTER TABLE "pagos" ADD COLUMN     "ordenPagoId" INTEGER;

-- CreateTable
CREATE TABLE "ordenes_pago" (
    "id" SERIAL NOT NULL,
    "referencia" TEXT NOT NULL,
    "concepto" "ConceptoCobro" NOT NULL,
    "estado" "EstadoOrdenPago" NOT NULL DEFAULT 'PENDIENTE',
    "pasarela" TEXT NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "datos" JSONB NOT NULL,
    "idCobroExterno" TEXT,
    "urlPago" TEXT,
    "idPagoExterno" TEXT,
    "detalleEstado" TEXT,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "resueltaEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordenes_pago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_pago_referencia_key" ON "ordenes_pago"("referencia");

-- CreateIndex
CREATE INDEX "ordenes_pago_usuarioId_creadoEn_idx" ON "ordenes_pago"("usuarioId", "creadoEn");

-- CreateIndex
CREATE INDEX "ordenes_pago_estado_expiraEn_idx" ON "ordenes_pago"("estado", "expiraEn");

-- CreateIndex
CREATE UNIQUE INDEX "compras_entradas_ordenPagoId_key" ON "compras_entradas"("ordenPagoId");

-- CreateIndex
CREATE INDEX "pagos_ordenPagoId_idx" ON "pagos"("ordenPagoId");

-- AddForeignKey
ALTER TABLE "compras_entradas" ADD CONSTRAINT "compras_entradas_ordenPagoId_fkey" FOREIGN KEY ("ordenPagoId") REFERENCES "ordenes_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_ordenPagoId_fkey" FOREIGN KEY ("ordenPagoId") REFERENCES "ordenes_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_pago" ADD CONSTRAINT "ordenes_pago_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

