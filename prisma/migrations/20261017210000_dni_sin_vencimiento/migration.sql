-- DT-43: el DNI no requiere fecha de vencimiento.
-- AlterTable
ALTER TABLE "documentaciones" ALTER COLUMN "fechaVencimiento" DROP NOT NULL;

