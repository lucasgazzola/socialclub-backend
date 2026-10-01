-- US-52: ventana de venta y compras de entradas
ALTER TABLE "eventos"
ADD COLUMN "inicioVenta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "finVenta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TYPE "EstadoCompraEntrada" AS ENUM ('APROBADA');

CREATE TABLE "compras_entradas" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "eventoId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioUnitario" DECIMAL(12,2) NOT NULL,
    "montoTotal" DECIMAL(12,2) NOT NULL,
    "estado" "EstadoCompraEntrada" NOT NULL DEFAULT 'APROBADA',
    "metodoPago" TEXT NOT NULL DEFAULT 'MOCK_TARJETA',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compras_entradas_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "entradas" ADD COLUMN "compraId" INTEGER;

CREATE INDEX "compras_entradas_usuarioId_creadoEn_idx" ON "compras_entradas"("usuarioId", "creadoEn");
CREATE INDEX "compras_entradas_eventoId_idx" ON "compras_entradas"("eventoId");
CREATE INDEX "entradas_compraId_idx" ON "entradas"("compraId");

ALTER TABLE "compras_entradas"
ADD CONSTRAINT "compras_entradas_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "compras_entradas"
ADD CONSTRAINT "compras_entradas_eventoId_fkey"
FOREIGN KEY ("eventoId") REFERENCES "eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "entradas"
ADD CONSTRAINT "entradas_compraId_fkey"
FOREIGN KEY ("compraId") REFERENCES "compras_entradas"("id") ON DELETE SET NULL ON UPDATE CASCADE;