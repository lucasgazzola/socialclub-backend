-- CreateTable
CREATE TABLE "disciplinas" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disciplinas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuraciones_cuota_deportiva" (
    "id" SERIAL NOT NULL,
    "disciplinaId" INTEGER NOT NULL,
    "categoriaId" INTEGER NOT NULL,
    "periodoAplicacion" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuraciones_cuota_deportiva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "disciplinas_nombre_key" ON "disciplinas"("nombre");

-- CreateIndex
CREATE INDEX "configuraciones_cuota_deportiva_periodoAplicacion_idx" ON "configuraciones_cuota_deportiva"("periodoAplicacion");

-- CreateIndex
CREATE UNIQUE INDEX "configuraciones_cuota_deportiva_disciplinaId_categoriaId_periodoAplicacion_key" ON "configuraciones_cuota_deportiva"("disciplinaId", "categoriaId", "periodoAplicacion");

-- AddForeignKey
ALTER TABLE "configuraciones_cuota_deportiva" ADD CONSTRAINT "configuraciones_cuota_deportiva_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplinas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuraciones_cuota_deportiva" ADD CONSTRAINT "configuraciones_cuota_deportiva_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias_socio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
