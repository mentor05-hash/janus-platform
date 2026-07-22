#!/usr/bin/env bash
# 기기이전 번들 생성 — 【구 기기(맥 미니)에서 실행】.
# git 안에 있는 것(코드·문서)은 clone/pull 로 복원되므로 제외.
# git '밖'에 있어 유일본인 자산만 ~/janus-migrate/ 로 모은다(→ AirDrop/rsync → 신 기기).
# 원칙: 저작권·시크릿은 git·클라우드 금지, 직접 전송만. 완료 후 번들 삭제(PII 잔존 방지).
#
# 사용:  bash ops/기기이전_번들_생성.sh
# 환경변수(기본값 있음):
#   JANUS_HOME=~/janus            # janus 루트(20_data·40_workbench 상위)
#   OUT=~/janus-migrate           # 번들 출력 폴더
#   CPN=janus-platform           # COMPOSE_PROJECT_NAME(볼륨명 일치 — 고정)
#   COMPOSE="docker compose -f docker-compose.full.yml"
set -uo pipefail

JANUS_HOME="${JANUS_HOME:-$HOME/janus}"
OUT="${OUT:-$HOME/janus-migrate}"
CPN="${CPN:-janus-platform}"
COMPOSE="${COMPOSE:-docker compose -f docker-compose.full.yml}"
export COMPOSE_PROJECT_NAME="$CPN"

mkdir -p "$OUT"
MAN="$OUT/MANIFEST.txt"
: > "$MAN"
log() { echo "$@"; echo "$@" >> "$MAN"; }
have() { command -v "$1" >/dev/null 2>&1; }

log "# 기기이전 번들 — 생성 $(date '+%Y-%m-%d %H:%M')"
log "# JANUS_HOME=$JANUS_HOME  OUT=$OUT  CPN=$CPN"
log ""

# ── 1) DB 덤프(현재 상태 그대로) ──
log "## 1) DB 덤프"
if $COMPOSE ps postgres >/dev/null 2>&1 && $COMPOSE ps postgres 2>/dev/null | grep -q .; then
  if $COMPOSE exec -T postgres pg_dump -U janus -d janus --clean --if-exists > "$OUT/db.sql" 2>/dev/null; then
    log "  ✓ db.sql ($(du -h "$OUT/db.sql" | cut -f1))"
  else
    log "  ⚠ pg_dump 실패 — postgres 컨테이너 실행 상태 확인 후 재시도(경로2). 신규 재시드로 대체 가능."
    rm -f "$OUT/db.sql"
  fi
else
  log "  · postgres 컨테이너 미실행 — 스택 up 후 재실행하거나, 신 기기에서 재시드(런북 B-1 경로1)"
fi
log ""

# ── 2) 저작권 데이터(20_data / janus-data — JANUS_DATA_DIR 원본) ──
log "## 2) 저작권 데이터(배치표 등 — git·클라우드 금지)"
for d in "$JANUS_HOME/20_data" "$JANUS_HOME/janus-data"; do
  if [ -d "$d" ]; then
    base=$(basename "$d")
    tar czf "$OUT/${base}.tgz" -C "$(dirname "$d")" "$base" && log "  ✓ ${base}.tgz ($(du -h "$OUT/${base}.tgz" | cut -f1))"
  else
    log "  · $d 없음 — 건너뜀"
  fi
done
log ""

# ── 3) 업로드/녹화 볼륨(자료·첨부 보존 시) ──
log "## 3) 도커 볼륨(storage)"
for v in "${CPN}_storage" "${CPN}_rooms_storage"; do
  if docker volume inspect "$v" >/dev/null 2>&1; then
    docker run --rm -v "$v":/d -v "$OUT":/b alpine tar czf "/b/${v}.tgz" -C /d . \
      && log "  ✓ ${v}.tgz ($(du -h "$OUT/${v}.tgz" | cut -f1))"
  else
    log "  · 볼륨 $v 없음 — 건너뜀"
  fi
done
log ""

# ── 4) 터널 자격증명(고정 도메인 무변경 전환) ──
log "## 4) cloudflared 터널 자격(민감)"
if [ -d "$HOME/.cloudflared" ] && [ -n "$(ls -A "$HOME/.cloudflared" 2>/dev/null)" ]; then
  tar czf "$OUT/cloudflared.tgz" -C "$HOME" .cloudflared && log "  ✓ cloudflared.tgz (⚠ 시크릿 — AirDrop 직접 전송, 로그·클라우드 금지)"
else
  log "  · ~/.cloudflared 없음 — 퀵터널만 쓰면 불필요"
fi
log ""

# ── 5) env / override (인라인 env면 대부분 불필요) ──
log "## 5) .env* / docker-compose.override.yml"
PLAT="$(cd "$(dirname "$0")/.." && pwd)"
n=0
for f in "$PLAT"/.env "$PLAT"/.env.* "$PLAT"/docker-compose.override.yml; do
  [ -e "$f" ] || continue
  case "$(basename "$f")" in .env.example) continue;; esac
  cp "$f" "$OUT/" && log "  ✓ $(basename "$f")" && n=$((n+1))
done
[ "$n" = 0 ] && log "  · 이전 대상 .env/override 없음(compose 인라인 env — 정상)"
log ""

# ── 6) 워크벤치 시안(선택 — git X) ──
log "## 6) 40_workbench(시안·임시물 — 선택)"
if [ -d "$JANUS_HOME/40_workbench" ]; then
  sz=$(du -sh "$JANUS_HOME/40_workbench" 2>/dev/null | cut -f1)
  log "  · 존재($sz). 필요 시: tar czf $OUT/40_workbench.tgz -C $JANUS_HOME 40_workbench  (용량 크면 선별 권장)"
else
  log "  · 없음"
fi
log ""

# ── 7) 재clone 대상 git repo 목록(번들 아님 — 신 기기에서 clone) ──
log "## 7) git repo(번들 X — 신 기기에서 clone/pull)"
if git -C "$PLAT" remote -v >/dev/null 2>&1; then
  log "  janus-platform: $(git -C "$PLAT" remote get-url origin 2>/dev/null)  branch=$(git -C "$PLAT" branch --show-current 2>/dev/null)"
fi
for r in "$JANUS_HOME/30_public/janus-public"; do
  [ -d "$r/.git" ] && log "  $(basename "$r"): $(git -C "$r" remote get-url origin 2>/dev/null)"
done
log "  ⚠ janus-data 가 로컬 전용 git(remote 없음)이면 §2 로 이미 번들됨 — clone 아님"
log ""

log "## 완료 — 아래를 신 기기로 전송"
ls -lh "$OUT" | tee -a "$MAN"
log ""
log "다음: 신 기기에서  bash ops/기기이전_번들_복원.sh  (또는 런북 C·D 수동)"
log "⚠ 전송·복원 확인 후 이 폴더($OUT)는 삭제 — 저작권·PII·시크릿 잔존 방지."
echo ""
echo "▶ 번들 준비 완료: $OUT  (MANIFEST.txt 확인)"
