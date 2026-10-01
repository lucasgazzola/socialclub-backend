-- DropIndex
DROP INDEX "disciplina_requerimientos_doc_disciplinaId_tipoDocumento_key";

-- AlterTable
ALTER TABLE "categorias_disciplina" ADD COLUMN     "edadMaxima" INTEGER,
ADD COLUMN     "edadMinima" INTEGER,
ADD COLUMN     "genero" "GeneroDisciplina";

-- AlterTable
ALTER TABLE "disciplina_requerimientos_doc" ADD COLUMN     "categoriaDisciplinaId" INTEGER;

-- AlterTable
ALTER TABLE "documentaciones" ADD COLUMN     "tipoDocumento" "TipoDocumentacionDisciplina";

-- AlterTable
ALTER TABLE "inscripciones" ADD COLUMN     "requisitosDesde" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "personas" ADD COLUMN     "genero" "GeneroDisciplina";

-- CreateTable
CREATE TABLE "habilitaciones_excepcionales" (
    "id" SERIAL NOT NULL,
    "inscripcionId" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "hasta" TIMESTAMP(3) NOT NULL,
    "responsableId" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "habilitaciones_excepcionales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "habilitaciones_excepcionales_inscripcionId_idx" ON "habilitaciones_excepcionales"("inscripcionId");

-- CreateIndex
CREATE INDEX "disciplina_requerimientos_doc_categoriaDisciplinaId_idx" ON "disciplina_requerimientos_doc"("categoriaDisciplinaId");

-- CreateIndex
CREATE UNIQUE INDEX "disciplina_requerimientos_doc_disciplinaId_categoriaDiscipl_key" ON "disciplina_requerimientos_doc"("disciplinaId", "categoriaDisciplinaId", "tipoDocumento");

-- CreateIndex
CREATE INDEX "documentaciones_personaId_tipoDocumento_idx" ON "documentaciones"("personaId", "tipoDocumento");

-- AddForeignKey
ALTER TABLE "disciplina_requerimientos_doc" ADD CONSTRAINT "disciplina_requerimientos_doc_categoriaDisciplinaId_fkey" FOREIGN KEY ("categoriaDisciplinaId") REFERENCES "categorias_disciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habilitaciones_excepcionales" ADD CONSTRAINT "habilitaciones_excepcionales_inscripcionId_fkey" FOREIGN KEY ("inscripcionId") REFERENCES "inscripciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habilitaciones_excepcionales" ADD CONSTRAINT "habilitaciones_excepcionales_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Datos: mapea al catálogo los documentos ya cargados con tipo libre.
-- Lo que no coincide queda con "tipoDocumento" NULL (no se pierde: sigue en "tipo").
UPDATE "documentaciones" SET "tipoDocumento" = CASE
    WHEN "tipo" ILIKE '%apto%' OR "tipo" ILIKE '%certificado m%dico%' THEN 'CERTIFICADO_MEDICO_APTITUD_FISICA'::"TipoDocumentacionDisciplina"
    WHEN "tipo" ILIKE '%dni%' OR "tipo" ILIKE '%documento nacional%' THEN 'DNI'::"TipoDocumentacionDisciplina"
    WHEN "tipo" ILIKE '%seguro%' THEN 'SEGURO_COBERTURA_MEDICA'::"TipoDocumentacionDisciplina"
    WHEN "tipo" ILIKE '%autorizaci%' THEN 'AUTORIZACION_PADRES_TUTORES'::"TipoDocumentacionDisciplina"
    WHEN "tipo" ILIKE '%carnet%' OR "tipo" ILIKE '%licencia%' OR "tipo" ILIKE '%federativ%' THEN 'CARNET_FEDERATIVO_LICENCIA_DEPORTIVA'::"TipoDocumentacionDisciplina"
    WHEN "tipo" ILIKE '%reglamento%' THEN 'REGLAMENTO_INTERNO_FIRMADO'::"TipoDocumentacionDisciplina"
    WHEN "tipo" ILIKE '%ficha%inscrip%' THEN 'FICHA_INSCRIPCION'::"TipoDocumentacionDisciplina"
    ELSE NULL
END
WHERE "tipoDocumento" IS NULL;
