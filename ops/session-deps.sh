#!/bin/bash
# 세션 의존성 정합 스크립트 — 락파일과 정확히 일치하는 node_modules 를 보장하고
# 리눅스 네이티브 바이너리 갭(rollup)을 보완한다. 멱등(재실행 안전).
#
# 배경(2026-07-22 근본 처방):
#  1) `npm install` 은 캐시된 stale node_modules 를 "up to date" 로 넘겨 hoisting/optional 이
#     어긋난 채 방치했다(jest30 이 hoisting 된 ts-jest 를 미해석 → 테스트 러너 실패).
#     → 락파일 해시가 바뀐 세션에서만 `npm ci`(락파일대로 클린 설치, CI/ubuntu 와 동일 상태).
#     불변 세션은 생략해 빠른 재개 유지.
#  2) 락파일이 macOS 개발기에서 생성되어 rollup 리눅스 optional 바이너리가 빠져 있다
#     (@rollup/rollup-darwin-arm64 만 존재) → 리눅스 컨테이너의 vite build 실패.
#     설치된 rollup 버전·현재 arch/libc 에 맞춰 --no-save 로 보충(락파일 무변경).
#
# 사용: 저장소 루트에서 `bash ops/session-deps.sh` (SessionStart 훅이 호출).
set -euo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

# ── 1) 의존성: 락파일 변경 시에만 클린 설치(그 외 빠른 재개) ──────────────
SENTINEL="node_modules/.janus-install-lock"   # node_modules 와 함께 소멸 → 일관
LOCK_HASH="$(sha1sum package-lock.json | cut -d' ' -f1)"
if [ ! -d node_modules ] || [ "${LOCK_HASH}" != "$(cat "$SENTINEL" 2>/dev/null || true)" ]; then
  echo "[session-deps] npm ci (락파일 변경/신규 — 클린 설치) …"
  npm ci --no-audit --no-fund
  echo "${LOCK_HASH}" > "$SENTINEL"
else
  echo "[session-deps] deps 최신(락파일 불변) — 설치 생략."
fi

# ── 2) rollup 네이티브 바이너리 보충(리눅스 전용, 락파일 갭 보완) ──────────
# ⚠ `npm install --no-save` 는 트리를 재조정(프루닝)해 jest 의 ts-jest 해석을 깨뜨린다.
#    그래서 tarball 만 받아(node_modules 미변경) 대상 폴더에 직접 푼다(외과적 배치).
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

echo "[session-deps] 준비 완료."
