#!/bin/sh
set -eu
if [ -z "${DATABASE_URL:-}" ] && [ -n "${PGHOST:-}" ]; then
  ENC=$(node -e "process.stdout.write(encodeURIComponent(process.env.PGPASSWORD || ''))")
  export DATABASE_URL="postgresql://${PGUSER}:${ENC}@${PGHOST}:${PGPORT:-5432}/${PGDATABASE}"
fi
if [ "${1:-app}" = "worker" ]; then
  i=0
  until npx prisma migrate deploy >/dev/null 2>&1 || [ "$i" -gt 30 ]; do
    i=$((i + 1))
    sleep 2
  done
  exec npx tsx worker/index.ts
fi
npx prisma migrate deploy
npx tsx prisma/seed.ts
exec npx next start -p "${PORT:-43123}"
