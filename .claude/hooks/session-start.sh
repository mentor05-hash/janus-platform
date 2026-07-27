#!/bin/bash
# 야누스 모노레포 세션 시작 훅 — 웹 세션에서 테스트·타입체크·린트가 바로 동작하도록
# 의존성 설치 + Prisma Client 생성. 멱등(재실행 안전).
set -euo pipefail

# 원격(Claude Code on the web)에서만 실행 — 로컬 개발환경은 각자 셋업 사용.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

echo "[session-start] npm install (workspaces) …"
npm install --no-audit --no-fund

echo "[session-start] Prisma Client 생성 (apps/api) …"
npm run prisma:generate --workspace apps/api

echo "[session-start] 준비 완료."
