#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Entrypoint del contenedor de backend.
# Prepara la base de datos antes de arrancar la API:
#   1. Si existen migraciones versionadas (prisma/migrations), las aplica.
#   2. Si todavía no hay migraciones, sincroniza el esquema con `db push`
#      (cómodo para la primera versión / desarrollo).
#   3. Ejecuta el seed (idempotente: usa upserts) para dejar el usuario admin
#      y los roles base.
# Luego ejecuta el comando recibido (npm run dev | node dist/main).
# ─────────────────────────────────────────────────────────────────────────────
set -e

echo "[entrypoint] Generando Prisma Client..."
npx prisma generate >/dev/null 2>&1 || true

if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  echo "[entrypoint] Aplicando migraciones (prisma migrate deploy)..."
  npx prisma migrate deploy
else
  echo "[entrypoint] Sin migraciones versionadas: sincronizando esquema (prisma db push)..."
  npx prisma db push --skip-generate
fi

echo "[entrypoint] Ejecutando seed..."
npm run prisma:seed || echo "[entrypoint] Seed omitido o ya aplicado."

echo "[entrypoint] Iniciando aplicación..."
exec "$@"
