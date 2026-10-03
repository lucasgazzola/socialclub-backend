-- DT-22 · Servicio centralizado de tareas automáticas: registro de cada
-- ejecución (origen, estado, resultado o error).

-- CreateEnum
CREATE TYPE "OrigenEjecucion" AS ENUM ('PROGRAMADA', 'MANUAL');

-- CreateEnum
CREATE TYPE "EstadoEjecucion" AS ENUM ('EN_CURSO', 'EXITOSA', 'FALLIDA', 'OMITIDA');

-- CreateTable
CREATE TABLE "ejecuciones_tareas" (
    "id" SERIAL NOT NULL,
    "tarea" TEXT NOT NULL,
    "origen" "OrigenEjecucion" NOT NULL,
    "usuarioId" INTEGER,
    "estado" "EstadoEjecucion" NOT NULL DEFAULT 'EN_CURSO',
    "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fin" TIMESTAMP(3),
    "resultado" JSONB,
    "error" TEXT,

    CONSTRAINT "ejecuciones_tareas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ejecuciones_tareas_tarea_inicio_idx" ON "ejecuciones_tareas"("tarea", "inicio");

-- AddForeignKey
ALTER TABLE "ejecuciones_tareas" ADD CONSTRAINT "ejecuciones_tareas_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
