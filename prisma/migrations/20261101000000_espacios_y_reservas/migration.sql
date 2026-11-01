-- CreateEnum
CREATE TYPE "TipoEspacio" AS ENUM ('DEPORTIVO', 'SOCIAL', 'MULTIUSO');

-- CreateEnum
CREATE TYPE "ModalidadReserva" AS ENUM ('POR_HORA', 'DIA_COMPLETO');

-- CreateEnum
CREATE TYPE "TipoBloqueo" AS ENUM ('RECURRENTE', 'PUNTUAL');

-- CreateEnum
CREATE TYPE "EstadoReserva" AS ENUM ('PENDIENTE_APROBACION', 'APROBADA_PENDIENTE_PAGO', 'CONFIRMADA', 'RECHAZADA', 'CANCELADA_USUARIO', 'CANCELADA_FALTA_PAGO', 'CANCELADA_INSTITUCION');

-- CreateTable
CREATE TABLE "espacios" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoEspacio" NOT NULL,
    "capacidadMaxima" INTEGER NOT NULL,
    "modalidad" "ModalidadReserva" NOT NULL,
    "ubicacion" TEXT,
    "descripcion" TEXT,
    "precio" DECIMAL(12,2) NOT NULL,
    "precioSocio" DECIMAL(12,2),
    "montoSena" DECIMAL(12,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "espacios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "espacios_disciplinas" (
    "espacioId" INTEGER NOT NULL,
    "disciplinaId" INTEGER NOT NULL,

    CONSTRAINT "espacios_disciplinas_pkey" PRIMARY KEY ("espacioId","disciplinaId")
);

-- CreateTable
CREATE TABLE "bloqueos_agenda" (
    "id" SERIAL NOT NULL,
    "espacioId" INTEGER NOT NULL,
    "tipo" "TipoBloqueo" NOT NULL,
    "diasSemana" INTEGER[],
    "fecha" DATE,
    "horaInicio" TEXT,
    "horaFin" TEXT,
    "vigenteDesde" DATE,
    "vigenteHasta" DATE,
    "disciplinaId" INTEGER,
    "motivo" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoPorId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bloqueos_agenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservas" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "espacioId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoReserva" NOT NULL DEFAULT 'PENDIENTE_APROBACION',
    "esSocio" BOOLEAN NOT NULL DEFAULT false,
    "montoTotal" DECIMAL(12,2) NOT NULL,
    "montoSena" DECIMAL(12,2) NOT NULL,
    "observaciones" TEXT,
    "limitePagoSena" TIMESTAMP(3),
    "senaPagadaEn" TIMESTAMP(3),
    "metodoPagoSena" TEXT,
    "evaluadaPorId" INTEGER,
    "evaluadaEn" TIMESTAMP(3),
    "motivoRechazo" TEXT,
    "canceladaPorId" INTEGER,
    "canceladaEn" TIMESTAMP(3),
    "motivoCancelacion" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "espacios_activo_idx" ON "espacios"("activo");

-- CreateIndex
CREATE INDEX "espacios_disciplinas_disciplinaId_idx" ON "espacios_disciplinas"("disciplinaId");

-- CreateIndex
CREATE INDEX "bloqueos_agenda_espacioId_activo_idx" ON "bloqueos_agenda"("espacioId", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "reservas_codigo_key" ON "reservas"("codigo");

-- CreateIndex
CREATE INDEX "reservas_espacioId_inicio_fin_idx" ON "reservas"("espacioId", "inicio", "fin");

-- CreateIndex
CREATE INDEX "reservas_usuarioId_creadoEn_idx" ON "reservas"("usuarioId", "creadoEn");

-- CreateIndex
CREATE INDEX "reservas_estado_limitePagoSena_idx" ON "reservas"("estado", "limitePagoSena");

-- AddForeignKey
ALTER TABLE "espacios_disciplinas" ADD CONSTRAINT "espacios_disciplinas_espacioId_fkey" FOREIGN KEY ("espacioId") REFERENCES "espacios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "espacios_disciplinas" ADD CONSTRAINT "espacios_disciplinas_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplinas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloqueos_agenda" ADD CONSTRAINT "bloqueos_agenda_espacioId_fkey" FOREIGN KEY ("espacioId") REFERENCES "espacios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloqueos_agenda" ADD CONSTRAINT "bloqueos_agenda_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplinas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloqueos_agenda" ADD CONSTRAINT "bloqueos_agenda_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_espacioId_fkey" FOREIGN KEY ("espacioId") REFERENCES "espacios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_evaluadaPorId_fkey" FOREIGN KEY ("evaluadaPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_canceladaPorId_fkey" FOREIGN KEY ("canceladaPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

