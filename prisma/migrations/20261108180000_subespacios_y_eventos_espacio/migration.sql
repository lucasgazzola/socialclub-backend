-- AlterTable
ALTER TABLE "bloqueos_agenda" ADD COLUMN     "eventoId" INTEGER;

-- AlterTable
ALTER TABLE "espacios" ADD COLUMN     "espacioPadreId" INTEGER;

-- AlterTable
ALTER TABLE "eventos" ADD COLUMN     "espacioId" INTEGER;

-- CreateIndex
CREATE INDEX "bloqueos_agenda_eventoId_idx" ON "bloqueos_agenda"("eventoId");

-- CreateIndex
CREATE INDEX "espacios_espacioPadreId_idx" ON "espacios"("espacioPadreId");

-- CreateIndex
CREATE INDEX "eventos_espacioId_idx" ON "eventos"("espacioId");

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_espacioId_fkey" FOREIGN KEY ("espacioId") REFERENCES "espacios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "espacios" ADD CONSTRAINT "espacios_espacioPadreId_fkey" FOREIGN KEY ("espacioPadreId") REFERENCES "espacios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloqueos_agenda" ADD CONSTRAINT "bloqueos_agenda_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
