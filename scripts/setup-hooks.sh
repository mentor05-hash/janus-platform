#!/usr/bin/env bash
# janus-platform git 훅 활성화 (실행계획서 §1-3) — 클론마다 1회 실행.
# 활성화는 opt-in: `npm run hooks:setup`. (자동 prepare 배선은 gitleaks 미설치 시
# fail-closed 로 커밋을 막을 수 있어 의도적으로 제외 — 활성화 전 gitleaks 설치 필요.)

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$ROOT" ]; then
  echo "[setup-hooks] git repo가 아님 — 건너뜀."
  exit 0
fi

git -C "$ROOT" config core.hooksPath .githooks
chmod +x "$ROOT/.githooks/"* 2>/dev/null
echo "[setup-hooks] core.hooksPath=.githooks 설정 완료 (pre-commit: gitleaks 스캔)."

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "[setup-hooks] ⚠ gitleaks 미설치 — 이 상태로는 커밋이 차단됩니다(fail-closed)."
  echo "               brew install gitleaks  또는  sudo apt-get install gitleaks"
fi

exit 0
