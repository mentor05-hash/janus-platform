#!/usr/bin/env bash
# 전체 ops E2E 스모크 러너 — CI/로컬 공통. 각 스크립트를 순차 실행, 통과/실패 집계.
# 사용: API 서버가 떠 있는 상태에서  bash ops/run-all-e2e.sh
# 요구: curl, jq. base 시드 계정(dev-password!). API 는 API 환경변수로 오버라이드.
# ⚠ 스위트는 짧은 시간에 로그인 수십 회 → 로그인 rate limit(10/분)에 걸린다.
#   E2E 대상 API 는 RATE_LIMIT_DISABLED=true 로 기동할 것(배포에선 절대 설정 금지).
set -uo pipefail

API="${API:-http://localhost:3000/api/v1}"
HEALTH="${API}/health"   # 전역 prefix(/api/v1) 하위 — GET /api/v1/health
DIR="$(cd "$(dirname "$0")" && pwd)"

# 1) API 헬스 대기(최대 60초) — 부팅·마이그레이션 워밍 대응.
echo "▶ API 헬스 대기: $HEALTH"
for i in $(seq 1 60); do
  if curl -sf "$HEALTH" >/dev/null 2>&1; then echo "  ✓ API 준비됨(${i}s)"; break; fi
  [ "$i" = 60 ] && { echo "  ✗ API 헬스 타임아웃"; exit 1; }
  sleep 1
done

# 1-1) 전제 검증 — 로그인 IP 상한이 켜져 있으면 스위트는 중간부터 전부 무너진다.
#      상한은 10회/분인데 스위트는 25회를 쓴다. 앞의 몇 개만 통과하고 나머지가
#      "로그인 실패"로 죽는 탓에, 원인이 계정 문제로 보이는 게 이 실패의 함정이다.
#
#      ⚠ 429 를 내는 곳이 둘이다. 헷갈리면 이 검사가 거짓 경보를 낸다:
#        (1) RateLimitGuard — IP·경로 기준 10회/분. RATE_LIMIT_DISABLED=true 로 꺼진다.
#        (2) AuthService 계정 잠금 — loginId 기준 실패 5회면 15분 차단. **꺼지지 않는다**
#            (브루트포스 방어라 꺼져선 안 된다).
#      그래서 탐침은 반드시 **실제 시드 계정 + 올바른 비밀번호**로 한다. 성공 로그인은
#      (2)의 실패 카운트를 리셋하므로 (1)만 순수하게 측정된다.
echo "▶ 전제 확인: 로그인 IP 상한 비활성"
PROBE_ID="${PROBE_ID:-student01}"
PROBE_PW="${PROBE_PW:-dev-password!}"
tripped=0; probe_skip=0; code=''
for _ in $(seq 1 12); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${API}/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"loginId\":\"${PROBE_ID}\",\"password\":\"${PROBE_PW}\"}" 2>/dev/null)
  if [ "$code" = "429" ]; then tripped=1; break; fi
  if [ "$code" != "200" ] && [ "$code" != "201" ]; then probe_skip=1; break; fi
done
if [ "$tripped" = 1 ]; then
  echo "  ✗ 로그인 IP 상한(10회/분)이 활성 상태입니다 — 이 스위트는 로그인 25회를 씁니다."
  echo "  → API 를 RATE_LIMIT_DISABLED=true 로 기동하세요(배포 환경에선 절대 금지)."
  exit 1
fi
if [ "$probe_skip" = 1 ]; then
  # 상한 문제가 아니라 시드/계정 문제다. 여기서 단정하지 않고 각 스크립트가 보고하게 둔다.
  echo "  · 탐침 계정(${PROBE_ID}) 로그인 불가(code=${code}) — 전제 확인 건너뜀. 시드를 확인하세요."
else
  echo "  ✓ 비활성 확인 — 진행"
fi

# 2) 스모크 스크립트 목록(순서 무관·독립).
SCRIPTS=(
  journey-e2e.sh
  score-ocr-e2e.sh
  consult-report-views-e2e.sh
  qna-community-e2e.sh
  qna-league-e2e.sh
  score-input-e2e.sh
  diagnostic-e2e.sh
  clinic-e2e.sh
  search-e2e.sh
  learning-flow-e2e.sh
)

pass=0; fail=0; failed=()
for s in "${SCRIPTS[@]}"; do
  echo ""
  echo "════════ ▶ $s ════════"
  if API="$API" bash "$DIR/$s"; then
    echo "──────── ✓ $s PASS ────────"; pass=$((pass+1))
  else
    echo "──────── ✗ $s FAIL ────────"; fail=$((fail+1)); failed+=("$s")
  fi
done

echo ""
echo "════════ E2E 요약: ${pass} PASS · ${fail} FAIL (총 ${#SCRIPTS[@]}) ════════"
if [ "$fail" -ne 0 ]; then
  printf '  실패: %s\n' "${failed[@]}"
  exit 1
fi
echo "  ✓ 전체 통과"
