#!/usr/bin/env bash
# DB 복구 — backup-db.sh 로 만든 .sql.gz 백업을 복원. 파괴적 작업이라 확인을 요구.
#   사용: ./ops/restore-db.sh <백업파일.sql.gz> [--yes]
#   예)  ./ops/restore-db.sh ~/itall-backups/itall-20260702-030000.sql.gz
#
# 복구 리허설(권장): 정기적으로 최신 백업을 별도 DB(예: itall_restore_test)로 복원해
#   덤프가 실제로 되살아나는지 확인한다. RESTORE_DB 로 대상 DB 지정 가능.
set -euo pipefail
FILE="${1:-}"
YES="${2:-}"
CONTAINER="${PG_CONTAINER:-itall-mentoring-postgres-1}"
DB="${RESTORE_DB:-${PGDATABASE:-itall}}"
USER="${PGUSER:-itall}"

[ -z "$FILE" ] && { echo "usage: $0 <backup.sql.gz> [--yes]  (RESTORE_DB 로 대상 DB 변경 가능)"; exit 1; }
[ -f "$FILE" ] || { echo "백업 파일 없음: $FILE"; exit 1; }

echo "[restore] 대상: $CONTAINER/$DB  ←  $FILE"
if [ "$YES" != "--yes" ]; then
  echo "⚠ '$DB' 의 기존 데이터를 덮어씁니다(파괴적). 계속하려면 DB 이름을 입력하세요:"
  read -r CONFIRM
  [ "$CONFIRM" = "$DB" ] || { echo "취소됨(입력이 일치하지 않음)."; exit 1; }
fi

# 대상 DB 없으면 생성(리허설용 별도 DB일 때).
docker exec -i "$CONTAINER" psql -U "$USER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1 || \
  docker exec -i "$CONTAINER" psql -U "$USER" -d postgres -c "CREATE DATABASE \"$DB\";"

echo "[restore] 복원 중…"
gunzip -c "$FILE" | docker exec -i "$CONTAINER" psql -U "$USER" -d "$DB" -v ON_ERROR_STOP=0 >/dev/null
# 되살아남 검증(핵심 테이블 카운트)
echo "[restore] 검증:"
docker exec -i "$CONTAINER" psql -U "$USER" -d "$DB" -c \
  "SELECT (SELECT count(*) FROM account) AS accounts, (SELECT count(*) FROM booking) AS bookings, (SELECT count(*) FROM credit_account) AS credit_accounts;"
echo "[restore] 완료 — 위 카운트가 0이 아니면 정상 복원."
