-- CreateEnum
CREATE TYPE "TipoTokenUsuario" AS ENUM ('VERIFICACION_EMAIL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccionAuditoria" ADD VALUE 'ENVIAR_VERIFICACION';
ALTER TYPE "AccionAuditoria" ADD VALUE 'VERIFICAR_EMAIL';

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "emailVerificadoEn" TIMESTAMP(3),
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- DT-54: las cuentas que ya existen entraban sin verificar el email. Se las da
-- por verificadas desde su alta para que nadie pierda el acceso.
UPDATE "usuarios" SET "emailVerificadoEn" = "creadoEn" WHERE "emailVerificadoEn" IS NULL;

-- CreateTable
CREATE TABLE "tokens_usuario" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tipo" "TipoTokenUsuario" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "usadoEn" TIMESTAMP(3),
    "anuladoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tokens_usuario_tokenHash_key" ON "tokens_usuario"("tokenHash");

-- CreateIndex
CREATE INDEX "tokens_usuario_usuarioId_tipo_idx" ON "tokens_usuario"("usuarioId", "tipo");

-- AddForeignKey
ALTER TABLE "tokens_usuario" ADD CONSTRAINT "tokens_usuario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
