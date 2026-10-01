-- Consolidar drift posterior a fix[Task-9] y US-24 (Opción B: DB local recreada desde cero, sin backfill):
--   - Crea `membresias` y `documentaciones` (modelos agregados sin migración).
--   - Vincula Usuario 1:1 con Persona vía `usuarios.personaId` (reemplaza `usuarios.dni`).
--   - Limpia columnas legacy de `personas` (`activo`, `categoriaId`) y relaja `dni` a nullable.
-- DropForeignKey
ALTER TABLE "personas" DROP CONSTRAINT "personas_categoriaId_fkey";

-- DropIndex
DROP INDEX "usuarios_dni_key";

-- AlterTable
ALTER TABLE "personas" DROP COLUMN "activo",
DROP COLUMN "categoriaId",
ALTER COLUMN "dni" DROP NOT NULL;

-- AlterTable
ALTER TABLE "usuarios" DROP COLUMN "dni",
ADD COLUMN     "personaId" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "membresias" (
    "id" SERIAL NOT NULL,
    "personaId" INTEGER NOT NULL,
    "categoriaId" INTEGER NOT NULL,
    "fechaAlta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaBaja" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membresias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentaciones" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "personaId" INTEGER NOT NULL,
    "archivoNombre" TEXT,
    "archivoRuta" TEXT,
    "mimeType" TEXT,
    "tamano" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documentaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "membresias_personaId_idx" ON "membresias"("personaId");

-- CreateIndex
CREATE INDEX "membresias_categoriaId_idx" ON "membresias"("categoriaId");

-- CreateIndex
CREATE INDEX "documentaciones_personaId_idx" ON "documentaciones"("personaId");

-- CreateIndex
CREATE UNIQUE INDEX "personas_email_key" ON "personas"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_personaId_key" ON "usuarios"("personaId");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias_socio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentaciones" ADD CONSTRAINT "documentaciones_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
