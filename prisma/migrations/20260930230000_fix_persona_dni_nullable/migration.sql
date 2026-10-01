-- El registro público no solicita DNI (US-38). El esquema Prisma ya lo declara
-- opcional, pero la migración inicial lo creó como NOT NULL.
ALTER TABLE "personas"
ALTER COLUMN "dni" DROP NOT NULL;