-- CreateTable
CREATE TABLE "configuraciones_cuota_social" (
    "id" SERIAL NOT NULL,
    "categoriaId" INTEGER NOT NULL,
    "periodoAplicacion" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuraciones_cuota_social_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "configuraciones_cuota_social_periodoAplicacion_idx" ON "configuraciones_cuota_social"("periodoAplicacion");

-- CreateIndex
CREATE UNIQUE INDEX "configuraciones_cuota_social_categoriaId_periodoAplicacion_key" ON "configuraciones_cuota_social"("categoriaId", "periodoAplicacion");

-- AddForeignKey
ALTER TABLE "configuraciones_cuota_social" ADD CONSTRAINT "configuraciones_cuota_social_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias_socio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
