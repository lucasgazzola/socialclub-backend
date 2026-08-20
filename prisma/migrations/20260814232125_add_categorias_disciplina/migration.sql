-- CreateTable
CREATE TABLE "categorias_disciplina" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "disciplinaId" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorias_disciplina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inscripciones" (
    "id" SERIAL NOT NULL,
    "personaId" INTEGER NOT NULL,
    "disciplinaId" INTEGER NOT NULL,
    "categoriaDisciplinaId" INTEGER,
    "fechaInscripcion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inscripciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categorias_disciplina_disciplinaId_nombre_key" ON "categorias_disciplina"("disciplinaId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_disciplina_id_disciplinaId_key" ON "categorias_disciplina"("id", "disciplinaId");

-- CreateIndex
CREATE INDEX "inscripciones_disciplinaId_idx" ON "inscripciones"("disciplinaId");

-- CreateIndex
CREATE UNIQUE INDEX "inscripciones_personaId_disciplinaId_key" ON "inscripciones"("personaId", "disciplinaId");

-- AddForeignKey
ALTER TABLE "categorias_disciplina" ADD CONSTRAINT "categorias_disciplina_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplinas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscripciones" ADD CONSTRAINT "inscripciones_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscripciones" ADD CONSTRAINT "inscripciones_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplinas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscripciones" ADD CONSTRAINT "inscripciones_categoriaDisciplinaId_fkey" FOREIGN KEY ("categoriaDisciplinaId") REFERENCES "categorias_disciplina"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "configuraciones_cuota_deportiva_disciplinaId_categoriaId_period" RENAME TO "configuraciones_cuota_deportiva_disciplinaId_categoriaId_pe_key";
