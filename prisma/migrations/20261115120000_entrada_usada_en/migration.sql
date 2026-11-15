-- TASK-60: fecha y hora en que la entrada se validó en la puerta.
ALTER TABLE "entradas" ADD COLUMN "usadaEn" TIMESTAMP(3);
