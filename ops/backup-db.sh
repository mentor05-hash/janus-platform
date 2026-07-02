#!/usr/bin/env bash
# 잇올 데모 DB 백업 — postgres 컨테이너를 pg_dump 하여 타임스탬프 파일로 저장 + 14개 로테이션.
# 사용: ./ops/backup-db.sh   (크론 예: 0 3 * * *  /path/ops/backup-db.sh)
set -euo pipefail
DIR="${BACKUP_DIR:-$HOME/itall-backups}"
CONTAINER="${PG_CONTAINER:-itall-mentoring-postgres-1}"
DB="${PGDATABASE:-itall}"
USER="${PGUSER:-itall}"
KEEP="${KEEP:-14}"
mkdir -p "$DIR"
TS="$(date '+%Y%m%d-%H%M%S')"
OUT="$DIR/itall-$TS.sql.gz"

echo "[backup] $CONTAINER/$DB → $OUT"
docker exec "$CONTAINER" pg_dump -U "$USER" -d "$DB" --no-owner | gzip > "$OUT"
SIZE="$(du -h "$OUT" | cut -f1)"
echo "[backup] 완료 ($SIZE)"

# 오래된 백업 정리(최근 $KEEP개 유지)
ls -1t "$DIR"/itall-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -I{} rm -f {} 2>/dev/null || true
echo "[backup] 보관 $(ls -1 "$DIR"/itall-*.sql.gz 2>/dev/null | wc -l | tr -d ' ')개"
echo "복구 예: gunzip -c $OUT | docker exec -i $CONTAINER psql -U $USER -d $DB"
