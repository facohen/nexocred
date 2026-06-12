#!/usr/bin/env bash
# Restore de un backup NexoCred via pg_restore (dump formato custom).
# Uso:
#   backend/scripts/restore.sh <archivo.dump>
# Variables:
#   DATABASE_URL_SYNC  cadena psycopg sync (default: local docker compose).
# ADVERTENCIA: --clean DROPea los objetos existentes antes de recrearlos.
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Uso: restore.sh <archivo.dump>" >&2
  exit 2
fi

DUMP="$1"
DB_URL="${DATABASE_URL_SYNC:-postgresql://nexocred:nexocred@localhost:5432/nexocred}"

if [[ ! -f "$DUMP" ]]; then
  echo "No existe el dump: ${DUMP}" >&2
  exit 1
fi

echo "Restore <- ${DUMP} hacia ${DB_URL}"
# --clean --if-exists: recrea limpio; --no-owner: ignora ownership del dump.
pg_restore --dbname="$DB_URL" --clean --if-exists --no-owner --no-privileges "$DUMP"
echo "OK: restaurado desde ${DUMP}"
