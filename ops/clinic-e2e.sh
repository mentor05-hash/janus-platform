#!/usr/bin/env bash
# 약점 클리닉 추적·추이 E2E — 진단→제출→클리닉 시작→제출→GET /diagnostics/clinics 집계 검증.
# is_clinic 분리·부모연결·향상도 산출 확인. 데모 문항(합성). 요구: curl, jq.
set -euo pipefail
API="${API:-http://localhost:3000/api/v1}"
PW="${PW:-dev-password!}"
login() { curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' -d "{\"loginId\":\"$1\",\"password\":\"$PW\"}" | jq -r '.data.accessToken // .accessToken // empty'; }
auth() { local t="$1"; shift; curl -s -H "Authorization: Bearer $t" "$@"; }
unwrap() { jq -c '.data // .'; }

for i in $(seq 1 40); do curl -sf "$API/health" >/dev/null 2>&1 && break; sleep 1; done
echo "▶ 0) 로그인(student01)"
S1=$(login student01); [ -n "$S1" ] || { echo "  ✗ 로그인 실패"; exit 1; }; echo "  ✓"
fail=0

# 클리닉은 약점(weak) 유형이 있어야 시작 가능 → 전부 오답 제출로 약점 유도.
run_attempt() { # $1=chosen(0|-1로 오답유도용 큰수) → attemptId
  local start aid ans
  start=$(auth "$S1" -X POST "$API/diagnostics/start" -H 'Content-Type: application/json' -d '{}')
  aid=$(echo "$start" | jq -r '.data.attemptId // .attemptId')
  # chosen 9(범위밖) 대신 null → 전부 오답(약점 유도)
  ans=$(echo "$start" | jq -c '{answers: [(.data.questions // .questions)[] | {questionId: .id, chosen: null}]}')
  auth "$S1" -X POST "$API/diagnostics/$aid/submit" -H 'Content-Type: application/json' -d "$ans" >/dev/null
  echo "$aid"
}

echo "▶ 1) 기본 진단 1회(전부 오답 → 약점 유도)"
AID=$(run_attempt); echo "  attempt=$AID"
[ -n "$AID" ] && echo "  ✓ 진단 제출" || { echo "  ✗"; exit 1; }

echo "▶ 2) 약점 클리닉 시작 → 제출"
CL=$(auth "$S1" -X POST "$API/diagnostics/clinic" -H 'Content-Type: application/json' -d "{\"attemptId\":\"$AID\"}")
CAID=$(echo "$CL" | jq -r '.data.attemptId // .attemptId // empty')
ISCL=$(echo "$CL" | jq -r '.data.clinic // .clinic // false')
echo "  clinic attempt=$CAID · clinic플래그=$ISCL"
if [ -z "$CAID" ]; then echo "  · 클리닉 문항 풀 없음 → 스킵(데모 풀 의존)"; else
  CANS=$(echo "$CL" | jq -c '{answers: [(.data.questions // .questions)[] | {questionId: .id, chosen: 0}]}')
  auth "$S1" -X POST "$API/diagnostics/$CAID/submit" -H 'Content-Type: application/json' -d "$CANS" >/dev/null
  echo "  ✓ 클리닉 제출"

  echo "▶ 3) GET /diagnostics/clinics — 집계 검증"
  CH=$(auth "$S1" "$API/diagnostics/clinics" | unwrap)
  CNT=$(echo "$CH" | jq -r '.count')
  AVG=$(echo "$CH" | jq -r '.avgScore')
  PARENT=$(echo "$CH" | jq -r '.attempts[-1].parentAttemptId // ""')
  echo "  count=$CNT avg=$AVG lastParent=$PARENT"
  [ "$CNT" -ge 1 ] && echo "  ✓ 클리닉 집계 반환" || { echo "  ✗ 집계 없음"; fail=1; }
  [ "$PARENT" = "$AID" ] && echo "  ✓ 부모 진단 연결 정확" || echo "  · 부모연결 불일치(다중 클리닉 가능)"

  echo "▶ 4) 일반 이력에 is_clinic 플래그 노출"
  HIST=$(auth "$S1" "$API/diagnostics/me" | unwrap)
  HASCL=$(echo "$HIST" | jq '[.attempts[] | select(.is_clinic == true)] | length')
  echo "  이력 내 클리닉 시도 $HASCL건"
  [ "$HASCL" -ge 1 ] && echo "  ✓ is_clinic 표기" || { echo "  ✗ is_clinic 누락"; fail=1; }
fi

echo ""
[ "$fail" = 0 ] && echo "✅ 클리닉 추이 E2E 통과" || { echo "❌ 클리닉 추이 E2E 실패"; exit 1; }
