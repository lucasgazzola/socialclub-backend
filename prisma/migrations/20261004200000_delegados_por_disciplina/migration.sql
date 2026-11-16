-- DT-42: disciplinas a cargo de cada delegado.
-- CreateTable
CREATE TABLE "delegados_disciplinas" (
    "usuarioId" INTEGER NOT NULL,
    "disciplinaId" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delegados_disciplinas_pkey" PRIMARY KEY ("usuarioId","disciplinaId")
);

-- CreateIndex
CREATE INDEX "delegados_disciplinas_disciplinaId_idx" ON "delegados_disciplinas"("disciplinaId");

-- AddForeignKey
ALTER TABLE "delegados_disciplinas" ADD CONSTRAINT "delegados_disciplinas_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegados_disciplinas" ADD CONSTRAINT "delegados_disciplinas_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplinas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

