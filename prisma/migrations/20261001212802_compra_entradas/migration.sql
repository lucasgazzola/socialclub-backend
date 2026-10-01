/*
  Warnings:

  - You are about to drop the column `categoriaId` on the `personas` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[email]` on the table `personas` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "membresias" DROP CONSTRAINT "membresias_categoriaId_fkey";

-- DropForeignKey
ALTER TABLE "personas" DROP CONSTRAINT "personas_categoriaId_fkey";

-- AlterTable
ALTER TABLE "personas" DROP COLUMN "categoriaId";

-- CreateIndex
CREATE UNIQUE INDEX "personas_email_key" ON "personas"("email");

-- AddForeignKey
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias_socio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
