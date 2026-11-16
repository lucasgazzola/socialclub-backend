-- AlterTable
ALTER TABLE "eventos" DROP COLUMN "cierreInscripcion",
ADD COLUMN     "fechaFin" TIMESTAMP(3);
