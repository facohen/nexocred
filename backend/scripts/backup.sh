#!/usr/bin/env bash
# Backup de la base NexoCred via pg_dump (formato custom, comprimido).
# Uso:
#   backend/scripts/backup.sh [destino_dir]
# Variables:
#   DATABASE_URL_SYNC  cadena psycopg sync (default: local docker compose).
#   BACKUP_DIR         directorio de salida (default: ./backups o $1).
set -euo pipefail

DB_URL="${DATABASE_URL_SYNC:-postgresql://nexocred:nexocred@localhost:5432/nexocred}"
DEST_DIR="${1:-${BACKUP_DIR:-./backups}}"
mkdir -p "$DEST_DIR"

STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="${DEST_DIR}/nexocred_${STAMP}.dump"

echo "Backup -> ${OUT}"
# -Fc: formato custom (restaurable con pg_restore, soporta -j paralelo).
pg_dump --dbname="$DB_URL" --format=custom --no-owner --no-privileges --file="$OUT"
echo "OK: $(du -h "$OUT" | cut -f1) en ${OUT}"
