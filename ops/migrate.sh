#!/usr/bin/env bash
# 마이그레이션 통합 러너 — apps/api/migrations/*.sql 를 순서대로 1회씩만 적용(추적).
#   schema_migrations 테이블에 적용 이력을 기록해 재실행 시 미적용분만 반영(idempotent).
#
# 사용:
#   ./ops/migrate.sh status     # 적용/미적용 목록
#   ./ops/migrate.sh baseline   # 이미 수동 적용된 DB — 전 파일을 '적용됨'으로 표시(실행 안 함)
#   ./ops/migrate.sh            # 미적용 마이그레이션을 순서대로 적용(각 파일 트랜잭션)
#
# 대상 DB: 기본은 로컬 postgres 컨테이너. 클라우드는 PSQL 로 접속 문자열 지정.
#   예) PSQL='psql "$DATABASE_URL"' ./ops/migrate.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIG_DIR="$ROOT/apps/api/migrations"
CONTAINER="${PG_CONTAINER:-itall-mentoring-postgres-1}"
DB="${PGDATABASE:-itall}"
USER="${PGUSER:-itall}"
# psql 실행기: PSQL 미지정 시 도커 컨테이너 exec.
run_sql() { if [ -n "${PSQL:-}" ]; then eval "$PSQL" -v ON_ERROR_STOP=1 "$@"; else docker exec -i "$CONTAINER" psql -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 "$@"; fi; }
run_file() { if [ -n "${PSQL:-}" ]; then eval "$PSQL" -v ON_ERROR_STOP=1 -f "$1"; else docker exec -i "$CONTAINER" psql -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 < "$1"; fi; }

ensure_table() {
  run_sql -q -c "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());" >/dev/null
}
applied_set() { run_sql -tAq -c "SELECT name FROM schema_migrations ORDER BY name;"; }
# 공백 포함 경로 안전: glob 루프로 basename 추출.
all_files() { local f; for f in "$MIG_DIR"/*.sql; do [ -e "$f" ] && basename "$f"; done | sort; }

cmd="${1:-migrate}"
ensure_table
APPLIED="$(applied_set)"

case "$cmd" in
  status)
    echo "[migrate] $MIG_DIR"
    for f in $(all_files); do
      if grep -qx "$f" <<<"$APPLIED"; then echo "  ✓ $f"; else echo "  · $f (미적용)"; fi
    done
    ;;
  baseline)
    n=0
    for f in $(all_files); do
      grep -qx "$f" <<<"$APPLIED" && continue
      run_sql -q -c "INSERT INTO schema_migrations(name) VALUES ('$f') ON CONFLICT DO NOTHING;" >/dev/null
      n=$((n+1))
    done
    echo "[migrate] baseline — ${n}개를 '적용됨'으로 표시(실행하지 않음)."
    ;;
  migrate|"")
    n=0
    for f in $(all_files); do
      grep -qx "$f" <<<"$APPLIED" && continue
      echo "[migrate] 적용: $f"
      run_file "$MIG_DIR/$f"
      run_sql -q -c "INSERT INTO schema_migrations(name) VALUES ('$f') ON CONFLICT DO NOTHING;" >/dev/null
      n=$((n+1))
    done
    echo "[migrate] 완료 — 신규 ${n}개 적용. 총 $(all_files | wc -l | tr -d ' ')개 중 $(applied_set | grep -c . || true)개 반영."
    echo "[migrate] 참고: prisma client 는 'npm run prisma:generate --workspace apps/api' 로 재생성하세요."
    ;;
  *) echo "usage: $0 [status|baseline|migrate]"; exit 1 ;;
esac
