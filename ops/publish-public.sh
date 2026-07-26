#!/usr/bin/env bash
# 무료판 공개 배포 — 정적 산출물을 공개 repo(janus-public)로 밀어 GitHub Pages 로 서빙한다.
#   사용: ./ops/publish-public.sh <공개할_디렉터리> ["커밋 메시지"]
#   예)  ./ops/publish-public.sh public-dist "무료 배치표 v23 첫 공개"
#
# 왜 GitHub Pages 인가:
#   O38 이 janus-public 을 **공개 repo** 로 계획했다 → 공개 repo 의 Pages 는 무료이고 계정 추가가 없다.
#   목표("맥이 꺼져도 무료판이 서빙된다")를 Cloudflare 계정 개설(백로그 B014) 없이 지금 달성한다.
#   커스텀 도메인·R2·터널이 필요해지면 그때 Cloudflare 로 옮긴다 — 산출물은 그대로 재사용된다.
#
# 필요 ENV:
#   PUBLIC_REPO   공개 repo (기본 값 없음. 예: git@github.com:<계정>/janus-public.git)
#   PUBLIC_BRANCH 배포 브랜치(기본 main — Pages 소스를 main/root 로 설정한 경우)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
DIR="${1:-}"
MSG="${2:-무료판 정적 산출물 갱신}"
BRANCH="${PUBLIC_BRANCH:-main}"

[ -n "$DIR" ] || { echo "usage: $0 <공개할_디렉터리> [\"커밋 메시지\"]"; exit 1; }
[ -d "$DIR" ] || { echo "✖ 디렉터리 없음: $DIR"; exit 1; }

if [ -z "${PUBLIC_REPO:-}" ]; then
  cat <<'MSG_END'
✖ PUBLIC_REPO 가 설정되지 않았습니다.

최초 1회 준비(약 3분):
  1) GitHub 에서 **공개(public)** repo 생성 — 이름 예: janus-public
     ⚠ 반드시 public. private repo 의 Pages 는 유료 플랜이 필요합니다.
  2) 그 repo Settings → Pages → Source = "Deploy from a branch", Branch = main / root
  3) export PUBLIC_REPO=git@github.com:<계정>/janus-public.git

이 repo(janus-platform)는 private 로 유지됩니다 — 공개되는 것은 무료판 산출물뿐입니다.
MSG_END
  exit 1
fi

# ── 1. 공개 게이트 (통과 못하면 여기서 멈춘다) ──────────────────────
echo "[publish] 공개 게이트 실행…"
( cd "$ROOT" && "$HERE/publish-gate.sh" "$(cd "$DIR" && pwd)" )

# ── 2. 공개 repo 를 임시로 받아 동기화 ──────────────────────────────
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echo "[publish] $PUBLIC_REPO ($BRANCH) 클론…"
if ! git clone --depth 1 --branch "$BRANCH" "$PUBLIC_REPO" "$TMP/repo" 2>/dev/null; then
  echo "[publish] $BRANCH 브랜치가 없어 새로 만듭니다."
  git clone --depth 1 "$PUBLIC_REPO" "$TMP/repo"
  ( cd "$TMP/repo" && git checkout -B "$BRANCH" )
fi

# 기존 산출물 제거(.git·CNAME 은 보존 — CNAME 을 지우면 커스텀 도메인이 끊긴다)
( cd "$TMP/repo" && find . -mindepth 1 -maxdepth 1 ! -name '.git' ! -name 'CNAME' -exec rm -rf {} + )
cp -R "$DIR"/. "$TMP/repo"/

# Jekyll 처리 비활성 — _ 로 시작하는 파일·디렉터리가 무시되는 것을 막는다
touch "$TMP/repo/.nojekyll"

# ── 3. 커밋·푸시 ────────────────────────────────────────────────────
cd "$TMP/repo"
if git diff --quiet && git diff --cached --quiet && [ -z "$(git status --porcelain)" ]; then
  echo "[publish] 변경 없음 — 배포를 건너뜁니다."
  exit 0
fi
git add -A
git -c user.name="janus-publisher" -c user.email="noreply@users.noreply.github.com" commit -q -m "$MSG"
git push -u origin "$BRANCH"

OWNER_REPO="$(printf '%s' "$PUBLIC_REPO" | sed -E 's#.*[:/]([^/]+/[^/]+?)(\.git)?$#\1#')"
OWNER="${OWNER_REPO%%/*}"; REPO="${OWNER_REPO##*/}"
echo ""
echo "✓ 배포 완료 — https://${OWNER}.github.io/${REPO}/"
echo "  (첫 배포는 Pages 빌드에 1~2분 걸립니다. Settings → Pages 에서 상태 확인)"
