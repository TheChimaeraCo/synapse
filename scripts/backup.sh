#!/usr/bin/env bash
# backup.sh - Automated daily backup for Synapse
# Usage: ./scripts/backup.sh
# Cron: 0 3 * * * /root/clawd/projects/chimera-gateway/synapse/scripts/backup.sh
set -euo pipefail

SYNAPSE_DIR="/root/clawd/projects/chimera-gateway/synapse"
BACKUP_DIR="/root/clawd/backups"
DATE=$(date +%Y-%m-%d)
BACKUP_FILE="$BACKUP_DIR/synapse-$DATE.tar.gz"
KEEP_DAYS=7
TEMP_DIR=$(mktemp -d)

trap "rm -rf $TEMP_DIR" EXIT

echo "[backup] Starting Synapse backup for $DATE"

mkdir -p "$BACKUP_DIR" "$TEMP_DIR/synapse-backup"

# 1. Backup config files
echo "[backup] Copying config files..."
for f in .env.local CHANGELOG.md package.json convex/schema.ts; do
  if [ -f "$SYNAPSE_DIR/$f" ]; then
    mkdir -p "$TEMP_DIR/synapse-backup/$(dirname "$f")"
    cp "$SYNAPSE_DIR/$f" "$TEMP_DIR/synapse-backup/$f"
  fi
done

# 2. Export Convex data via snapshot
echo "[backup] Exporting Convex data..."
CONVEX_URL="${CONVEX_SELF_HOSTED_URL:-http://127.0.0.1:3220}"
ADMIN_KEY="${CONVEX_SELF_HOSTED_ADMIN_KEY:-}"

if [ -z "$ADMIN_KEY" ]; then
  # Try loading from .env.local
  if [ -f "$SYNAPSE_DIR/.env.local" ]; then
    ADMIN_KEY=$(grep "CONVEX_SELF_HOSTED_ADMIN_KEY" "$SYNAPSE_DIR/.env.local" | cut -d= -f2- | head -1)
  fi
fi

if [ -n "$ADMIN_KEY" ]; then
  # Request snapshot export
  EXPORT_RESP=$(curl -s -X POST "$CONVEX_URL/api/export_snapshot" \
    -H "Authorization: Convex $ADMIN_KEY" \
    -H "Content-Type: application/json" \
    --max-time 30 2>/dev/null || echo "FAIL")

  if echo "$EXPORT_RESP" | jq -e '.' > /dev/null 2>&1; then
    echo "$EXPORT_RESP" > "$TEMP_DIR/synapse-backup/convex-export.json"
    echo "[backup] Convex export saved"
  else
    echo "[backup] Convex snapshot export not available, dumping key tables..."
    # Fallback: query key tables individually
    for table in sessions messages channels config; do
      RESP=$(curl -s "$CONVEX_URL/api/query" \
        -H "Authorization: Convex $ADMIN_KEY" \
        -H "Content-Type: application/json" \
        -d "{\"path\":\"functions:${table}:list\",\"args\":{}}" \
        --max-time 15 2>/dev/null || echo "[]")
      echo "$RESP" > "$TEMP_DIR/synapse-backup/table-${table}.json"
    done
    echo "[backup] Table dumps saved"
  fi
else
  echo "[backup] WARNING: No admin key found, skipping Convex export"
fi

# 3. Backup workspace files
echo "[backup] Copying workspace files..."
if [ -d "$SYNAPSE_DIR/workspace" ]; then
  cp -r "$SYNAPSE_DIR/workspace" "$TEMP_DIR/synapse-backup/"
fi

# 4. Compress
echo "[backup] Compressing to $BACKUP_FILE..."
tar -czf "$BACKUP_FILE" -C "$TEMP_DIR" synapse-backup

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[backup] Backup complete: $BACKUP_FILE ($SIZE)"

# 5. Cleanup old backups
echo "[backup] Cleaning up backups older than $KEEP_DAYS days..."
find "$BACKUP_DIR" -name "synapse-*.tar.gz" -mtime +$KEEP_DAYS -delete 2>/dev/null || true
REMAINING=$(ls "$BACKUP_DIR"/synapse-*.tar.gz 2>/dev/null | wc -l)
echo "[backup] $REMAINING backup(s) retained"

echo "[backup] Done!"
