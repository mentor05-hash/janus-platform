#!/usr/bin/env bash
# DB 동기화 원커맨드 (근본처방) — git pull 후 이것 하나만 실행하면 됨.
#   ./ops/db-sync.sh
# ① 마이그레이션 전체 적용(schema_migrations 원장 기반 멱등 — prisma CLI 불요, pg 직접 실행)
# ② 기본 시드(dist-seed 컴파일본 — ts-node 불요, 멱등)
# ③ Q&A 데모 선생님 SQL 시드(멱등)
set -euo pipefail
cd "$(dirname "$0")/.."
C=(docker compose -f docker-compose.full.yml)
echo "▶ ① 마이그레이션 적용"
"${C[@]}" exec -T api node scripts/apply-migrations.mjs
echo "▶ ② 기본 시드"
"${C[@]}" exec -T api npm run seed:prod
echo "▶ ③ Q&A 데모 선생님 시드"
"${C[@]}" exec -T postgres psql -U itall -d itall < apps/api/prisma/seed-qna-teachers.sql
echo "✅ DB 동기화 완료"
