-- CreateEnum
CREATE TYPE "EstadoSolicitudInscripcion" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "solicitudes_inscripcion" (
    "id" SERIAL NOT NULL,
    "personaId" INTEGER NOT NULL,
    "disciplinaId" INTEGER NOT NULL,
    "categoriaDisciplinaId" INTEGER,
    "estado" "EstadoSolicitudInscripcion" NOT NULL DEFAULT 'PENDIENTE',
    "fechaSolicitud" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaResolucion" TIMESTAMP(3),
    "motivoRechazo" TEXT,
    "revisadoPorId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitudes_inscripcion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "solicitudes_inscripcion_personaId_estado_idx" ON "solicitudes_inscripcion"("personaId", "estado");

-- CreateIndex
CREATE INDEX "solicitudes_inscripcion_disciplinaId_estado_idx" ON "solicitudes_inscripcion"("disciplinaId", "estado");

-- AddForeignKey
ALTER TABLE "solicitudes_inscripcion" ADD CONSTRAINT "solicitudes_inscripcion_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_inscripcion" ADD CONSTRAINT "solicitudes_inscripcion_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplinas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_inscripcion" ADD CONSTRAINT "solicitudes_inscripcion_categoriaDisciplinaId_fkey" FOREIGN KEY ("categoriaDisciplinaId") REFERENCES "categorias_disciplina"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_inscripcion" ADD CONSTRAINT "solicitudes_inscripcion_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
