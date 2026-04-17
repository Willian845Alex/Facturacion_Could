#!/bin/bash
# ============================================================
# backup.sh — PostgreSQL backup for Facturacion SRI
# ============================================================
# Install:
#   sudo cp scripts/backup.sh /opt/facturacion/backup.sh
#   sudo chmod +x /opt/facturacion/backup.sh
#   crontab -e
#     0 2 * * * /opt/facturacion/backup.sh >> /opt/facturacion/backup.log 2>&1
# ============================================================

set -euo pipefail

# --- Configuration ---
DB_NAME="${DB_NAME:-facturacion}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
BACKUP_DIR="${BACKUP_DIR:-/opt/facturacion/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# Load .env if present (production deployment path)
ENV_FILE="/opt/facturacion/.env"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' "$ENV_FILE" | grep -E '^[A-Z_]+=.+' | xargs)
fi

# --- Setup ---
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.dump"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting backup → $FILENAME"

# --- Dump ---
PGPASSWORD="${DB_PASSWORD:-}" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -Fc \
  --no-password \
  "$DB_NAME" \
  > "$FILENAME"

SIZE=$(du -sh "$FILENAME" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup complete — $SIZE"

# --- Compress (already compressed with -Fc, just verify) ---
# pg_dump -Fc produces compressed custom format; no extra gzip needed.

# --- Rotate old backups ---
DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.dump" -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Rotated $DELETED backup(s) older than ${RETENTION_DAYS} days"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Done."

# ============================================================
# Restore:
#   pg_restore -h localhost -U postgres -d facturacion \
#     --clean --if-exists /opt/facturacion/backups/<file>.dump
# ============================================================
