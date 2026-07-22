#!/usr/bin/env bash
# 마이그레이션 원장 1회성 정합화 — 호스트에서 실행(api 이미지 상태와 무관, postgres 컨테이너만 필요).
# 용도: DB 는 이미 현행(수동 psql 적용 등)인데 schema_migrations 원장만 뒤처진 경우,
#       repo 의 모든 마이그레이션 파일명을 "적용됨"으로 기록만 한다(SQL 실행 없음).
#   ./ops/db-baseline.sh   →   ./ops/db-sync.sh
set -euo pipefail
cd "$(dirname "$0")/.."
{
  echo "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());"
  for f in apps/api/migrations/*.sql; do
    echo "INSERT INTO schema_migrations(name) VALUES ('$(basename "$f")') ON CONFLICT DO NOTHING;"
  done
  echo "SELECT count(*) AS ledger_rows FROM schema_migrations;"
} | docker compose -f docker-compose.full.yml exec -T postgres psql -U janus -d janus -v ON_ERROR_STOP=1
echo "✅ 베이스라인 완료 — 이제 ./ops/db-sync.sh 를 실행하세요."
