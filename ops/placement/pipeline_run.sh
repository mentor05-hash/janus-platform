#!/usr/bin/env bash
# 가채점 배치표 원커맨드 파이프라인 (N4-P1)
#
# 수능 당일(11/19) 19:30 에 데이터를 넣으면 20:00 에 배치표가 나와야 한다. 창은 30분이다.
# 이 스크립트는 그 30분 안에서 **사람이 판단할 일을 남기지 않는 것**이 목적이다.
#
#   0) 선검사   — 여기서 죽어야 한다. 4단계까지 갔다가 죽으면 남은 시간이 없다.
#   1) 환산표   — gachaejeom_convert.py (P2)
#   2) 마스터   — 데이터트랙 몫. --master-cmd 를 주면 실행, 아니면 기존 마스터를 쓴다.
#   3) 티어빌드 — tier_build.py --all
#   4) 티어검증 — tier_verify.py × 4
#   5) 청정검증 — check_clean_build.py (V3 경로)
#   6) 배포     — JANUS_DATA_DIR/placement-hub/ 로 복사
#   7) 사이드카 — janus-build.json 동반 확인 (A4 배포 감지)
#   8) 실측     — GET /placement-hub/list 로 available 확인
#   9) 로그     — 단계별 소요시간 기록
#
# ⚠ 0단계가 이 스크립트의 존재 이유다. 드라이런은 합성 픽스처(센티넬 있음)로 통과하지만
#   실마스터는 센티넬이 0건일 수 있고, 그러면 4단계 tier_verify 에서 죽는다.
#   그걸 19:55 에 알게 되면 끝이다 — 그래서 빌드 전에 센티넬부터 센다.
#
# 사용:
#   ops/placement/pipeline_run.sh --mode dry-run
#   ops/placement/pipeline_run.sh --mode gachaejeom --data-dir "$JANUS_DATA_DIR" \
#       --master <마스터.html> --base <전년도환산표.json> --difficulty <등급컷.json>
set -euo pipefail

MODE=""
DATA_DIR="${JANUS_DATA_DIR:-}"
MASTER=""
MASTER_CMD=""
BASE=""
DIFFICULTY="${JANUS_DIFFICULTY_ADJUST:-}"
TARGET_YEAR=""
OUT=""
API="${JANUS_API_BASE:-http://localhost:3000/api/v1}"
BUDGET_SEC=1800
SKIP_DEPLOY=0
SKIP_PROBE=0

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

usage() { sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --mode) MODE="${2:-}"; shift 2;;
    --data-dir) DATA_DIR="${2:-}"; shift 2;;
    --master) MASTER="${2:-}"; shift 2;;
    --master-cmd) MASTER_CMD="${2:-}"; shift 2;;
    --base) BASE="${2:-}"; shift 2;;
    --difficulty) DIFFICULTY="${2:-}"; shift 2;;
    --target-year) TARGET_YEAR="${2:-}"; shift 2;;
    --out) OUT="${2:-}"; shift 2;;
    --api) API="${2:-}"; shift 2;;
    --budget-sec) BUDGET_SEC="${2:-}"; shift 2;;
    --skip-deploy) SKIP_DEPLOY=1; shift;;
    --skip-probe) SKIP_PROBE=1; shift;;
    -h|--help) usage;;
    *) echo "알 수 없는 인자: $1" >&2; usage;;
  esac
done

[ -n "$MODE" ] || { echo "--mode 는 필수다 (gachaejeom|silchaejeom|dry-run)" >&2; exit 2; }
case "$MODE" in gachaejeom|silchaejeom|dry-run) ;; *) echo "알 수 없는 --mode: $MODE" >&2; exit 2;; esac

TS="$(date +%Y%m%d-%H%M%S)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/janus-pipeline-XXXXXX")"
OUT="${OUT:-$WORK/dist-tier}"
LOG_DIR="${JANUS_PIPELINE_LOG_DIR:-$WORK}"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/pipeline-run-$TS.log"

START_ALL=$(date +%s)
STEP_NO=0
declare -a STEP_NAMES=() STEP_SECS=()

log()  { printf '%s\n' "$*" | tee -a "$LOG"; }
fail() { log ""; log "✗ 중단(단계 $STEP_NO): $*"; log "  로그: $LOG"; exit 1; }

step() {  # step "이름"  → 이후 end_step
  STEP_NO=$((STEP_NO + 1))
  CUR_NAME="$1"; CUR_START=$(date +%s)
  log ""
  log "── [$STEP_NO] $CUR_NAME ──────────────────────────────"
}
end_step() {
  local s=$(( $(date +%s) - CUR_START ))
  STEP_NAMES+=("$CUR_NAME"); STEP_SECS+=("$s")
  log "   ↳ ${s}초"
}

log "야누스 배치표 파이프라인 — mode=$MODE · $TS"
log "  repo=$REPO"
log "  로그=$LOG"

# ── dry-run 기본값: 합성 픽스처 ─────────────────────────────────────────────
if [ "$MODE" = "dry-run" ]; then
  [ -n "$TARGET_YEAR" ] || TARGET_YEAR=2027
  SKIP_DEPLOY=1
  [ -n "$DATA_DIR" ] || DATA_DIR="$WORK/data"
  mkdir -p "$DATA_DIR"
  if [ -z "$MASTER" ]; then
    # 2.5KB 픽스처로 재면 1초 만에 끝나고 30분 예산을 전혀 시험하지 못한다 —
    # "초록인데 아무것도 검증 안 함"의 전형이다. 실마스터 규모(5~13MB)의
    # **합성** 대용량을 그 자리에서 만들어 태운다(저작권 데이터 0바이트).
    MASTER="$WORK/synthetic-master.html"
    log "· dry-run 마스터 생성 중 (${JANUS_DRY_MB:-6}MB 합성 · 센티넬 포함)"
    python3 "$HERE/fixtures/gen_bulk_master.py" --out "$MASTER" \
      --mb "${JANUS_DRY_MB:-6}" --sentinel 3 2>&1 | tee -a "$LOG" \
      || { echo "합성 마스터 생성 실패" >&2; exit 1; }
  fi
  log "  (dry-run — 합성 마스터 · 배포 생략 · 임시 작업트리 $WORK)"
fi

# ══ 0) 선검사 — 빌드 전에 죽는다 ═══════════════════════════════════════════
step "선검사 — 재료가 실제로 쓸 수 있는 상태인가"

[ -n "$MASTER" ] || fail "--master 가 없다. 마스터 HTML 경로를 줘야 한다."
[ -f "$MASTER" ] || fail "마스터 파일이 없다: $MASTER"
MASTER_MB=$(python3 -c "import os,sys;print('%.2f'%(os.path.getsize(sys.argv[1])/1e6))" "$MASTER")
log "· 마스터: $MASTER (${MASTER_MB}MB)"

# ★ 센티넬 — 이것이 0 이면 tier_verify 가 4단계에서 죽는다. 여기서 먼저 죽인다.
# grep -c 는 '줄 수'라 한 줄에 여러 영역이 있으면 1 로 센다 — 출현 수로 센다.
# ⚠ `grep -o` 는 매치 0건이면 exit 1 이다. set -e + pipefail 아래에서 그대로 쓰면
# **센티넬이 없을 때 사유를 말하기도 전에 스크립트가 즉사한다** — 정확히 이 게이트가
# 잡아야 할 상황에서 침묵하고 죽는다. `|| true` 로 감싸 판정을 아래 if 로 넘긴다.
SENT=$( { grep -o 'JANUS-TIER' "$MASTER" || true; } | wc -l | tr -d ' ')
log "· 센티넬 JANUS-TIER: ${SENT}건"
if [ "$SENT" -eq 0 ]; then
  fail "마스터에 JANUS-TIER 센티넬이 0건이다 — 티어 빌드가 아무것도 제거하지 못한다.
     이 상태로 진행하면 4단계 tier_verify 에서 '제거 0건'으로 죽거나(운이 좋으면),
     질량 예산에 걸려 죽는다(그것도 운이 좋으면). 마스터 생성기 쪽에서 센티넬을
     태깅한 뒤 다시 돌려야 한다 — 배치표 독립 트랙 몫이다.
     확인: grep -o 'JANUS-TIER' '$MASTER' | wc -l"
fi

# 환산표 — 이번 회차에 만들 것인지, 이미 있는 것을 쓸 것인지
TABLE=""
if [ -n "$BASE" ]; then
  [ -f "$BASE" ] || fail "기저 환산표가 없다: $BASE"
  [ -n "$TARGET_YEAR" ] || fail "--target-year 가 없다(기저 환산표를 줬으면 대상 연도가 필요하다)"
  if [ -n "$DIFFICULTY" ] && [ ! -f "$DIFFICULTY" ]; then
    fail "난이도 보정 파일이 없다: $DIFFICULTY"
  fi
  [ -n "$DIFFICULTY" ] || log "· ⚠ 난이도 보정 미제공 — 전년도 환산을 그대로 쓴다(산출에 caveat 표기됨)"
fi

if [ "$MODE" != "dry-run" ]; then
  [ -n "$DATA_DIR" ] || fail "--data-dir(또는 JANUS_DATA_DIR)가 없다"
  [ -d "$DATA_DIR" ] || fail "데이터 디렉토리가 없다: $DATA_DIR"
  if [ -z "${JANUS_ALLOWED_HOSTS:-}" ]; then
    log "· ⚠ JANUS_ALLOWED_HOSTS 미설정 — A6 미러 감지가 런타임 no-op 으로 나간다"
  else
    log "· 허용 호스트: ${JANUS_ALLOWED_HOSTS}"
  fi
  [ -n "${JANUS_CANONICAL_ORIGIN:-}" ] || log "· ⚠ JANUS_CANONICAL_ORIGIN 미설정 — 미러에서 안내만 하고 이동하지 않는다"
fi

for f in tier_build.py tier_verify.py measure.py check_clean_build.py gachaejeom_convert.py tiers.config.json; do
  [ -f "$HERE/$f" ] || fail "파이프라인 구성요소가 없다: ops/placement/$f"
done
log "· 구성요소 6종 확인"
end_step

# ══ 1) 환산표 ══════════════════════════════════════════════════════════════
step "가채점 환산표 (P2)"
if [ -n "$BASE" ]; then
  TABLE="$WORK/gachaejeom_table.json"
  CONV_ARGS=(--base "$BASE" --target-year "$TARGET_YEAR" --out "$TABLE")
  [ "$MODE" = "silchaejeom" ] && CONV_ARGS+=(--mode silchaejeom) || CONV_ARGS+=(--mode gachaejeom)
  [ -n "$DIFFICULTY" ] && CONV_ARGS+=(--difficulty "$DIFFICULTY")
  python3 "$HERE/gachaejeom_convert.py" "${CONV_ARGS[@]}" 2>&1 | tee -a "$LOG" \
    || fail "환산표 생성 실패 — 위 사유를 보고 입력을 고쳐라"
else
  log "· 기저 환산표 미제공(--base 없음) — 이 회차는 환산표를 만들지 않는다."
  log "  마스터가 이미 환산을 반영하고 있다는 전제다. 아니라면 --base 로 다시 돌려라."
fi
end_step

# ══ 2) 마스터 빌드 ═════════════════════════════════════════════════════════
step "마스터 빌드 (데이터트랙)"
if [ -n "$MASTER_CMD" ]; then
  log "· 실행: $MASTER_CMD"
  ( eval "$MASTER_CMD" ) 2>&1 | tee -a "$LOG" || fail "마스터 빌드 명령이 실패했다"
  [ -f "$MASTER" ] || fail "마스터 빌드 후에도 파일이 없다: $MASTER"
  SENT2=$( { grep -o 'JANUS-TIER' "$MASTER" || true; } | wc -l | tr -d ' ')
  [ "$SENT2" -gt 0 ] || fail "마스터 빌드 결과에 센티넬이 0건이다(빌드 전엔 ${SENT}건이었다)"
  log "· 재빌드 후 센티넬 ${SENT2}건"
else
  log "· --master-cmd 미지정 — 기존 마스터를 그대로 쓴다."
  log "  ⚠ 마스터 생성(gen_jeongmil.cjs · build_janus_edition_v2.py)은 배치표 독립 트랙 몫이다."
  log "    이 스크립트는 마스터를 '만들지' 않고 '검사하고 배포한다'."
  if [ -n "$TABLE" ] && [ "$MASTER" -ot "$TABLE" ]; then
    fail "마스터가 환산표보다 오래됐다 — 오늘 만든 환산표가 마스터에 반영되지 않았다.
     마스터: $(date -r "$MASTER" '+%F %T')
     환산표: $(date -r "$TABLE" '+%F %T')
     마스터를 환산표로 다시 만든 뒤(--master-cmd) 재실행하라."
  fi
  [ -n "$TABLE" ] && log "· 마스터가 환산표보다 최신 — 반영된 것으로 본다"
fi
end_step

# ══ 3) 티어 빌드 ═══════════════════════════════════════════════════════════
step "티어 빌드 — 4종"
python3 "$HERE/tier_build.py" --src "$MASTER" --all --out "$OUT" 2>&1 | tee -a "$LOG" \
  || fail "티어 빌드 실패"
end_step

# ══ 4) 티어 검증 ═══════════════════════════════════════════════════════════
step "티어 검증 — 4종 전부"
VERIFY_FAIL=0
for t in free member paid consultant; do
  if [ -d "$OUT/$t" ]; then
    if python3 "$HERE/tier_verify.py" "$OUT/$t" --tier "$t" >>"$LOG" 2>&1; then
      log "· ✅ $t"
    else
      log "· ❌ $t — 검증 실패(로그 참조)"
      VERIFY_FAIL=1
    fi
  else
    log "· ⚠ $t 산출 없음"
  fi
done
[ "$VERIFY_FAIL" -eq 0 ] || fail "티어 검증 실패 — 배포 금지. 로그에서 ❌ 줄을 보라: $LOG"
end_step

# ══ 5) 청정 검증 ═══════════════════════════════════════════════════════════
step "청정 검증 (V3 — 고속 유래 마커 0건)"
HUB="$DATA_DIR/placement-hub"
if [ -f "$HUB/manifest.json" ]; then
  python3 "$HERE/check_clean_build.py" "$HUB" 2>&1 | tee -a "$LOG" || fail "청정 검증 실패 — 반출 불가"
else
  log "· manifest.json 없음($HUB) — 청정 검증 건너뜀"
  [ "$MODE" = "dry-run" ] || log "  ⚠ 실운영에서 이 줄이 보이면 허브가 준비되지 않은 것이다"
fi
end_step

# ══ 6) 배포 ════════════════════════════════════════════════════════════════
step "배포 — 무료판을 허브로"
if [ "$SKIP_DEPLOY" -eq 1 ]; then
  log "· 배포 생략(--skip-deploy 또는 dry-run)"
else
  [ -d "$HUB" ] || fail "허브 디렉토리가 없다: $HUB"
  [ -f "$HUB/manifest.json" ] || fail "manifest.json 이 없다 — 허용목록 없이 배포하지 않는다"
  COPIED=0
  for f in "$OUT/free"/*; do
    [ -f "$f" ] || continue
    bn="$(basename "$f")"
    # 허용목록 밖 파일은 서빙되지 않는다. 사이드카는 예외(고정 파일명).
    if [ "$bn" != "janus-build.json" ] && ! grep -q "\"$bn\"" "$HUB/manifest.json"; then
      fail "manifest 에 없는 파일을 배포하려 한다: $bn
     허용목록 등재는 사람의 판단이다(tier·audience 가 O77 게이트를 좌우한다).
     manifest.json 에 항목을 추가한 뒤 재실행하라."
    fi
    cp "$f" "$HUB/$bn"
    log "· 복사: $bn"
    COPIED=$((COPIED + 1))
  done
  [ "$COPIED" -gt 0 ] || fail "복사한 파일이 0건이다"
fi
end_step

# ══ 7) 사이드카 ════════════════════════════════════════════════════════════
step "사이드카 — janus-build.json 동반 확인 (A4)"
if [ -f "$OUT/free/janus-build.json" ]; then
  log "· 산출: $(cat "$OUT/free/janus-build.json")"
  if [ "$SKIP_DEPLOY" -eq 0 ]; then
    [ -f "$HUB/janus-build.json" ] || fail "허브에 사이드카가 없다 — HTML 만 올리면 배포 감지 배너가 계속 뜬다"
    log "· 허브 사이드카 확인"
  fi
else
  fail "무료판에 janus-build.json 이 없다 — A4 배포 감지가 동작하지 않는다"
fi
end_step

# ══ 8) 실측 ════════════════════════════════════════════════════════════════
step "실측 — 허브 목록에서 보이는가"
if [ "$SKIP_PROBE" -eq 1 ] || [ "$SKIP_DEPLOY" -eq 1 ]; then
  log "· 생략(배포하지 않았으므로 확인할 것이 없다)"
else
  RESP="$(curl -fsS --max-time 10 "$API/placement-hub/list" 2>>"$LOG" || true)"
  if [ -z "$RESP" ]; then
    log "· ⚠ 허브 목록 응답 없음($API) — API 가 떠 있는지 확인하라"
    log "  파일은 배포됐다. 이 단계 실패가 배포를 되돌리지는 않는다."
  else
    printf '%s' "$RESP" > "$WORK/list.json"
    AVAIL=$(python3 - "$WORK/list.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
rows = d.get('data') or d.get('tables') or []
if isinstance(rows, dict):
    rows = rows.get('tables', [])
print(sum(1 for r in rows if r.get('available')))
PY
) || AVAIL=0
    log "· available=true 인 표: ${AVAIL}건"
    [ "$AVAIL" -gt 0 ] || log "· ⚠ available 이 0건이다 — manifest·파일명·티어 게이트를 확인하라"
  fi
fi
end_step

# ══ 9) 결산 ════════════════════════════════════════════════════════════════
TOTAL=$(( $(date +%s) - START_ALL ))
log ""
log "════════════════════════════════════════════"
log "단계별 소요"
i=0
while [ $i -lt ${#STEP_NAMES[@]} ]; do
  printf '  %2d) %-42s %4d초\n' "$((i+1))" "${STEP_NAMES[$i]}" "${STEP_SECS[$i]}" | tee -a "$LOG"
  i=$((i+1))
done
log "  ────"
log "  총 ${TOTAL}초 ($((TOTAL/60))분 $((TOTAL%60))초) · 예산 ${BUDGET_SEC}초"
log "  로그: $LOG"

if [ "$TOTAL" -gt "$BUDGET_SEC" ]; then
  log ""
  log "⚠ 예산 초과 — 수능 당일 창(30분)을 넘겼다."
  if [ "$MODE" = "dry-run" ]; then
    log "  드라이런에서 초과하면 실전에서는 더 걸린다. 실패로 처리한다."
    exit 1
  fi
  log "  실행 자체는 끝났다. 다음 회차 전에 병목 단계를 줄여라."
fi

log ""
log "✅ 완주 — mode=$MODE"
