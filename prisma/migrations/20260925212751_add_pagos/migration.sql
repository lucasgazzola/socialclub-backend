-- CreateTable
CREATE TABLE "pagos" (
    "id" SERIAL NOT NULL,
    "personaId" INTEGER NOT NULL,
    "periodo" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "metodoPago" TEXT NOT NULL DEFAULT 'MOCK_TARJETA',
    "fechaPago" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pagos_personaId_idx" ON "pagos"("personaId");

-- CreateIndex
CREATE INDEX "pagos_periodo_idx" ON "pagos"("periodo");

-- CreateIndex
CREATE UNIQUE INDEX "pagos_personaId_periodo_key" ON "pagos"("personaId", "periodo");

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
