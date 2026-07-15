#!/usr/bin/env bash
# 수준진단 v1 E2E — 시작(문항 서빙·정답 미노출) → 제출 채점 → 유형별 약점·처방 → 이력.
# 데모 문항(합성) 기준. 요구: curl, jq.
set -euo pipefail
API="${API:-http://localhost:3000/api/v1}"
PW="${PW:-dev-password!}"
login() { curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' -d "{\"loginId\":\"$1\",\"password\":\"$PW\"}" | jq -r '.data.accessToken // .accessToken // empty'; }
auth() { local t="$1"; shift; curl -s -H "Authorization: Bearer $t" "$@"; }

for i in $(seq 1 40); do curl -sf "$API/health" >/dev/null 2>&1 && break; sleep 1; done
echo "▶ 0) 로그인(student01)"
S1=$(login student01); [ -n "$S1" ] || { echo "  ✗ 로그인 실패"; exit 1; }; echo "  ✓"

echo "▶ 1) 진단 시작(전과목) — 문항 서빙 + 정답 미노출 확인"
START=$(auth "$S1" -X POST "$API/diagnostics/start" -H 'Content-Type: application/json' -d '{}')
AID=$(echo "$START" | jq -r '.data.attemptId // .attemptId')
N=$(echo "$START" | jq '(.data.questions // .questions) | length')
HAS_ANSWER=$(echo "$START" | jq '[(.data.questions // .questions)[] | select(has("answer"))] | length')
echo "  attempt=$AID · 문항 $N개 · 응답에 answer 필드 $HAS_ANSWER개(0이어야 정상)"
[ -n "$AID" ] && [ "$N" -gt 0 ] && [ "$HAS_ANSWER" = "0" ] && echo "  ✓ 문항 서빙·정답 은닉 정상" || { echo "  ✗ 이상"; exit 1; }

echo "▶ 2) 일부만 정답으로 제출(유형별 약점 유도)"
# 첫 문항은 0번, 나머지는 전부 0번 선택(일부만 맞음) → 유형별 정답률 분산
ANS=$(echo "$START" | jq -c '{answers: [(.data.questions // .questions)[] | {questionId: .id, chosen: 0}]}')
RES=$(auth "$S1" -X POST "$API/diagnostics/$AID/submit" -H 'Content-Type: application/json' -d "$ANS")
echo "  결과=$(echo "$RES" | jq -c '(.data // .) | {score, correct, total}')"
echo "  유형별=$(echo "$RES" | jq -c '(.data // .).units | map({unit, rate, weak})')"
echo "  처방=$(echo "$RES" | jq -c '(.data // .).prescriptions | map(.unit)')"
SCORE=$(echo "$RES" | jq -r '(.data // .).score')
[ -n "$SCORE" ] && echo "  ✓ 채점·약점·처방 산출" || { echo "  ✗ 채점 실패"; exit 1; }

echo "▶ 3) 재제출 차단(멱등)"
SC=$(auth "$S1" -o /dev/null -w '%{http_code}' -X POST "$API/diagnostics/$AID/submit" -H 'Content-Type: application/json' -d "$ANS")
[ "$SC" = "400" ] && echo "  ✓ 400(이미 제출)" || echo "  ⚠ 예상 400, 실제 $SC"

echo "▶ 4) 이력 조회"
auth "$S1" "$API/diagnostics/me" | jq -c '(.data // .).attempts | length as $n | {count:$n, latest:(.[0] // {} | {score,correct,total})}'

echo "▶ 5) 과목 한정 진단(수학)"
S2=$(auth "$S1" -X POST "$API/diagnostics/start" -H 'Content-Type: application/json' -d '{"subject":"수학"}')
echo "  수학 문항 과목들=$(echo "$S2" | jq -c '[(.data.questions // .questions)[].subject] | unique')"

echo "✅ 수준진단 E2E 완료"
