#!/bin/bash
# 세션 준비 스크립트(원격 Claude Code on the web 전용) — 의존성을 락파일과 정확히 일치시키고
# 리눅스 네이티브 갭(rollup)을 보완한 뒤 Prisma Client 를 생성한다. 멱등(재실행 안전).
# SessionStart 훅(.claude/settings.json)이 이 스크립트를 호출한다.
#
# 근본 처방(2026-07-22) — 왜 `npm install` 을 안 쓰는가:
#  · 이 저장소 락파일은 macOS 개발기에서 생성된다. 리눅스 컨테이너에서 `npm install` 을 돌리면
#    트리를 재조정하며 **jest30 이 hoisting 된 ts-jest 를 해석 못 하게** 만든다(실측: npm ci 직후
#    HEALTHY → npm install 직후 BROKEN). 그래서 설치는 **락파일대로 클린 설치하는 `npm ci`** 만 쓴다.
#  · 실행 비용을 줄이려고 락파일 해시가 바뀌었거나 jest 상태가 깨졌을 때만 `npm ci`(그 외 빠른 재개).
#  · 락파일에 rollup 리눅스 optional 바이너리가 빠져 있어(@rollup/rollup-darwin-arm64 만 존재)
#    vite build 가 실패한다. `npm install` 은 트리 프루닝으로 jest 를 재차 깨므로, tarball 만 받아
#    대상 폴더에 직접 푸는 **외과적 배치**로 보완한다(node_modules 미변경).
set -euo pipefail

# 원격에서만 실행 — 로컬(Mac) 개발환경은 각자 셋업 사용(무영향).
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

# ── 1) 의존성: 락파일 변경 또는 jest 상태 손상 시에만 클린 설치 ────────────
SENTINEL="node_modules/.janus-install-lock"   # node_modules 와 함께 소멸 → 일관
LOCK_HASH="$(sha1sum package-lock.json | cut -d' ' -f1)"
NEED_CI=false
if [ ! -d node_modules ] || [ "${LOCK_HASH}" != "$(cat "$SENTINEL" 2>/dev/null || true)" ]; then
  NEED_CI=true
elif ! ( cd apps/api && npx --no-install jest --showConfig >/dev/null 2>&1 ); then
  # jest 가 transform(ts-jest) 을 해석 못 하는 손상 상태 → 클린 설치로 복구.
  echo "[session-deps] jest 상태 손상 감지 — 클린 설치로 복구."
  NEED_CI=true
fi

if [ "$NEED_CI" = true ]; then
  echo "[session-deps] npm ci (클린 설치) …"
  npm ci --no-audit --no-fund
  echo "${LOCK_HASH}" > "$SENTINEL"
else
  echo "[session-deps] deps 최신·jest 정상 — 설치 생략(빠른 재개)."
fi

# ── 2) rollup 네이티브 바이너리 보충(리눅스 전용, 락파일 갭 보완·외과적) ────
if [ -d node_modules/rollup ]; then
  ARCH="$(uname -m)"; case "$ARCH" in x86_64) ARCH=x64;; aarch64|arm64) ARCH=arm64;; esac
  LIBC=gnu; if ldd --version 2>&1 | grep -qi musl; then LIBC=musl; fi
  ROLLUP_PKG="@rollup/rollup-linux-${ARCH}-${LIBC}"
  ROLLUP_DEST="node_modules/${ROLLUP_PKG}"
  if [ ! -f "${ROLLUP_DEST}/package.json" ]; then
    ROLLUP_V="$(node -p "require('./node_modules/rollup/package.json').version")"
    echo "[session-deps] rollup 네이티브 보충(외과적): ${ROLLUP_PKG}@${ROLLUP_V} …"
    TMP="$(mktemp -d)"
    if ( cd "$TMP" && npm pack "${ROLLUP_PKG}@${ROLLUP_V}" --silent >/dev/null 2>&1 ) && ls "$TMP"/*.tgz >/dev/null 2>&1; then
      mkdir -p "$ROLLUP_DEST"
      tar -xzf "$TMP"/*.tgz -C "$ROLLUP_DEST" --strip-components=1
    else
      echo "[session-deps] ⚠ rollup 네이티브 다운로드 실패(빌드 시 확인 필요)."
    fi
    rm -rf "$TMP"
  fi
fi

# ── 3) Prisma Client ────────────────────────────────────────────────────
echo "[session-deps] Prisma Client 생성 (apps/api) …"
npm run prisma:generate --workspace apps/api

# ── 4) git 훅 연결 ──────────────────────────────────────────────────────
# 훅 두 개를 켠다:
#   pre-commit  gitleaks 시크릿·금지파일 스캔 (실행계획서 §1-3, fail-closed)
#   pre-push    기본 브랜치 직접 push 차단 (무료 플랜이라 GitHub 브랜치 보호를 못 쓴다)
#
# 매 세션이 새 클론에서 시작하는데 git 설정은 클론에 따라오지 않는다 — 그래서 매번 연결한다.
# **그동안 이게 없어서 에이전트 세션의 커밋은 시크릿 스캔을 거치지 않았다.**
#
# 순서가 중요하다: gitleaks 없이 hooksPath 를 걸면 pre-commit 이 fail-closed 로
# **모든 커밋을 막는다**(scripts/setup-hooks.sh 가 자동 배선을 피한 이유가 그것이다).
# 그래서 먼저 설치하고, 확보됐을 때만 연결한다.
if [ -d .githooks ]; then
  if ! command -v gitleaks >/dev/null 2>&1; then
    echo "[session-deps] gitleaks 설치 …"
    if command -v sudo >/dev/null 2>&1; then
      sudo apt-get install -y -qq gitleaks >/dev/null 2>&1 || true
    else
      apt-get install -y -qq gitleaks >/dev/null 2>&1 || true
    fi
  fi
  chmod +x .githooks/* 2>/dev/null || true
  if command -v gitleaks >/dev/null 2>&1; then
    git config core.hooksPath .githooks
    echo "[session-deps] git 훅 연결 — 시크릿 스캔(pre-commit) · 기본 브랜치 직접 push 차단(pre-push)."
  else
    git config --unset core.hooksPath 2>/dev/null || true
    echo "[session-deps] ⚠ gitleaks 설치 실패 — 훅 미연결(커밋 전면 차단 방지)."
    echo "[session-deps]   시크릿 스캔과 직접 push 차단이 **모두 꺼진 상태**다. 수동 설치 후:"
    echo "[session-deps]   npm run hooks:setup"
  fi
fi

echo "[session-deps] 준비 완료."
