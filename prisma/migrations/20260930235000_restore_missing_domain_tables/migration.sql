-- Recuperación de tablas presentes en prisma/schema.prisma pero ausentes del
-- historial original de migraciones.

CREATE TABLE "membresias" (
    "id" SERIAL NOT NULL,
    "personaId" INTEGER NOT NULL,
    "categoriaId" INTEGER NOT NULL,
    "fechaAlta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaBaja" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "membresias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "documentaciones" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "personaId" INTEGER NOT NULL,
    "archivoNombre" TEXT,
    "archivoRuta" TEXT,
    "mimeType" TEXT,
    "tamano" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "documentaciones_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pagos" (
    "id" SERIAL NOT NULL,
    "personaId" INTEGER NOT NULL,
    "periodo" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "metodoPago" TEXT NOT NULL DEFAULT 'MOCK_TARJETA',
    "fechaPago" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "membresias_personaId_idx" ON "membresias"("personaId");
CREATE INDEX "membresias_categoriaId_idx" ON "membresias"("categoriaId");
CREATE INDEX "documentaciones_personaId_idx" ON "documentaciones"("personaId");
CREATE UNIQUE INDEX "pagos_personaId_periodo_key" ON "pagos"("personaId", "periodo");
CREATE INDEX "pagos_personaId_idx" ON "pagos"("personaId");
CREATE INDEX "pagos_periodo_idx" ON "pagos"("periodo");

ALTER TABLE "membresias"
ADD CONSTRAINT "membresias_personaId_fkey"
FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "membresias"
ADD CONSTRAINT "membresias_categoriaId_fkey"
FOREIGN KEY ("categoriaId") REFERENCES "categorias_socio"("id") ON UPDATE CASCADE;

ALTER TABLE "documentaciones"
ADD CONSTRAINT "documentaciones_personaId_fkey"
FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pagos"
ADD CONSTRAINT "pagos_personaId_fkey"
FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;