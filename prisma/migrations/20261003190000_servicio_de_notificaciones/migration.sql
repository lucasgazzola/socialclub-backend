-- DT-36 · Servicio centralizado de notificaciones.
-- La tabla `notificaciones` es el outbox de todos los avisos y reemplaza a
-- `alertas_documentacion_notificadas` (US-26). Lo ya avisado se migra como
-- notificaciones ENVIADAS para que no se vuelva a enviar.

-- CreateEnum
CREATE TYPE "CanalNotificacion" AS ENUM ('EMAIL');

-- CreateEnum
CREATE TYPE "EstadoNotificacion" AS ENUM ('PENDIENTE', 'ENVIADA', 'FALLIDA');

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "canal" "CanalNotificacion" NOT NULL,
    "usuarioId" INTEGER,
    "destino" TEXT NOT NULL,
    "contenido" JSONB NOT NULL,
    "referencias" TEXT[],
    "estado" "EstadoNotificacion" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimoError" TEXT,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadaEn" TIMESTAMP(3),

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificaciones_tipo_idx" ON "notificaciones"("tipo");

-- CreateIndex
CREATE INDEX "notificaciones_estado_idx" ON "notificaciones"("estado");

-- CreateIndex
CREATE INDEX "notificaciones_referencias_idx" ON "notificaciones" USING GIN ("referencias");

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Datos: cada día de avisos de US-26 pasa a ser una notificación ENVIADA con
-- las claves de esas alertas como referencias (no se conocen los destinatarios).
INSERT INTO "notificaciones" ("tipo", "canal", "destino", "contenido", "referencias", "estado", "intentos", "creadaEn", "enviadaEn")
SELECT 'ALERTAS_DOCUMENTACION',
       'EMAIL',
       'delegados (migrado de US-26)',
       '{}'::jsonb,
       array_agg("clave" ORDER BY "clave"),
       'ENVIADA',
       1,
       min("notificadaEn"),
       min("notificadaEn")
FROM "alertas_documentacion_notificadas"
GROUP BY date_trunc('day', "notificadaEn");

-- DropForeignKey
ALTER TABLE "alertas_documentacion_notificadas" DROP CONSTRAINT "alertas_documentacion_notificadas_inscripcionId_fkey";

-- DropTable
DROP TABLE "alertas_documentacion_notificadas";
