#!/usr/bin/env bash
# W4 Phase 0 출구 게이트 — 통합 여정 E2E:
#   성적 1회 입력 → 배치표(janus_score) 자동 반영 → 격차 리포트 → 커리큘럼 카드 → 상담 예약
# 한 학생 계정(student01)으로 전 구간 통과 + 전환 계측(C3) 적재까지 확인.
# 요구: curl, jq. base 시드 계정(dev-password!). API 는 API 환경변수로 오버라이드.
set -euo pipefail
API="${API:-http://localhost:3000/api/v1}"
PW="${PW:-dev-password!}"
login() { curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' -d "{\"loginId\":\"$1\",\"password\":\"$PW\"}" | jq -r '.data.accessToken // .accessToken // empty'; }
auth() { local t="$1"; shift; curl -s -H "Authorization: Bearer $t" "$@"; }

for i in $(seq 1 40); do curl -sf "$API/health" >/dev/null 2>&1 && break; sleep 1; done

echo "▶ 0) 로그인(student01·teacher01)"
S1=$(login student01); [ -n "$S1" ] || { echo "  ✗ 학생 로그인 실패"; exit 1; }
T1=$(login teacher01); [ -n "$T1" ] || { echo "  ✗ 선생님 로그인 실패"; exit 1; }
TID=$(auth "$T1" "$API/teachers/me/profile" | jq -r '(.data // .) | .id // empty')
[ -n "$TID" ] || { echo "  ✗ 선생님 프로필 조회 실패"; exit 1; }
echo "  ✓ teacherId=${TID:0:8}…"

# 멱등 재실행: janus_score 는 period 내림차순 최신 1건 — 회차마다 유니크한 period 로 저장(Z prefix 로 기존 시드보다 상위).
TS=$(date +%y%m%d%H%M%S)

echo "▶ 1) 성적 1회 입력(표준점수 모드)"
SAVE=$(auth "$S1" -X POST "$API/scores/me" -H 'Content-Type: application/json' -d '{
  "period":"Z'${TS}'A-여정표점","mode":"std","gye":"이과",
  "items":[
    {"subject":"국어","score":128,"subSubject":"언어와매체"},
    {"subject":"수학","score":132,"subSubject":"미적분"},
    {"subject":"탐구1","score":63,"subSubject":"물리학Ⅰ"},
    {"subject":"탐구2","score":62,"subSubject":"지구과학Ⅰ"},
    {"subject":"영어","grade":"2"},
    {"subject":"한국사","grade":"2"}
  ]}')
[ "$(echo "$SAVE" | jq -r '.data.linkable // .linkable')" = "true" ] || { echo "  ✗ linkable=false"; exit 1; }
echo "  ✓ 저장·배치표 연동 가능"

echo "▶ 2) 배치표 자동 반영(janus_score)"
JS=$(auth "$S1" "$API/scores/janus-score")
OK=$(echo "$JS" | jq -r '(.data // .) | (.mode=="std" and .kor==128 and .mat==132 and .gye=="이과")')
[ "$OK" = "true" ] || { echo "  ✗ janus_score 불일치: $(echo "$JS" | jq -c '(.data // .)')"; exit 1; }
echo "  ✓ $(echo "$JS" | jq -c '(.data // .) | {gye,mode,kor,mat,tam1,tam2}')"

echo "▶ 3) 배치표 점수 적용(전국누백 자동 계산 — 생성기 적용 흐름의 API 동형)"
auth "$S1" -X POST "$API/scores/me" -H 'Content-Type: application/json' -d '{
  "period":"Z'${TS}'B-여정누백","mode":"nb","gye":"이과","nb":2.8,
  "items":[{"subject":"영어","grade":"2"},{"subject":"한국사","grade":"2"}]}' >/dev/null
NB=$(auth "$S1" "$API/scores/janus-score" | jq -r '(.data // .) | .nb')
[ "$NB" = "2.8" ] || { echo "  ✗ nb 미반영($NB)"; exit 1; }
echo "  ✓ janus_score.nb=$NB"

echo "▶ 4) 격차 리포트(정시·목표컷)"
GAP=$(auth "$S1" -X POST "$API/scores/gap-report" -H 'Content-Type: application/json' -d '{"mode":"jeongsi","univ":"한빛대","dept":"산업공학","cutNb":3.0}')
BAND=$(echo "$GAP" | jq -r '(.data // .) | .gap.band // empty')
[ -n "$BAND" ] || { echo "  ✗ 격차 리포트 생성 실패: $(echo "$GAP" | head -c 200)"; exit 1; }
echo "  ✓ band=$BAND delta=$(echo "$GAP" | jq -r '(.data // .) | .gap.delta') 처방=$(echo "$GAP" | jq -r '(.data // .) | .prescription | length')건"

echo "▶ 5) 수준진단 응시(커리큘럼 처방의 입력)"
DSTART=$(auth "$S1" -X POST "$API/diagnostics/start" -H 'Content-Type: application/json' -d '{}')
AID=$(echo "$DSTART" | jq -r '.data.attemptId // .attemptId // empty')
[ -n "$AID" ] || { echo "  ✗ 진단 시작 실패"; exit 1; }
DANS=$(echo "$DSTART" | jq -c '{answers: [(.data.questions // .questions)[] | {questionId: .id, chosen: 0}]}')
auth "$S1" -X POST "$API/diagnostics/$AID/submit" -H 'Content-Type: application/json' -d "$DANS" >/dev/null
echo "  ✓ 진단 제출(attempt=${AID:0:8}…)"

echo "▶ 5-1) 커리큘럼 카드(진단 약점 + 성적 → 주간 플랜)"
CUR=$(auth "$S1" "$API/curriculum/me")
NITEMS=$(echo "$CUR" | jq -r '(.data // .) | (.items // []) | length')
HASD=$(echo "$CUR" | jq -r '(.data // .) | .hasDiagnostic')
[ "$HASD" = "true" ] && [ "$NITEMS" -gt 0 ] || { echo "  ✗ 커리큘럼 비어 있음(hasDiagnostic=$HASD items=$NITEMS)"; exit 1; }
echo "  ✓ 커리큘럼 항목 ${NITEMS}개 · headline=$(echo "$CUR" | jq -r '(.data // .) | .headline' | head -c 60)"

echo "▶ 6) 상담 예약 준비 — 선생님 근무시간 등록 + 학생 크레딧 충전"
ALLDAY='[{"start":"09:00","end":"18:00"}]'
auth "$T1" -X PUT "$API/teachers/$TID/work-schedule" -H 'Content-Type: application/json' \
  -d "{\"recurringTemplate\":{\"0\":$ALLDAY,\"1\":$ALLDAY,\"2\":$ALLDAY,\"3\":$ALLDAY,\"4\":$ALLDAY,\"5\":$ALLDAY,\"6\":$ALLDAY}}" >/dev/null
auth "$S1" -X POST "$API/payments/charge" -H 'Content-Type: application/json' -d '{"amount":100000,"method":"card"}' >/dev/null
BAL=$(auth "$S1" "$API/credits/account" | jq -r '(.data // .) | .total')
echo "  ✓ 근무시간 등록 · 크레딧 잔액=$BAL"

echo "▶ 7) 슬롯 조회 → 견적 → 예약 생성"
DATE=$(date -d '+1 day' +%F 2>/dev/null || date -v+1d +%F)
SLOTS=$(auth "$S1" "$API/teachers/$TID/slots?date=$DATE")
START=$(echo "$SLOTS" | jq -r '(.data // .) | (if type=="object" then (.slots // []) else . end) | map(select(.status=="avail")) | .[0].index // empty')
[ -n "$START" ] || { echo "  ✗ 가용 슬롯 없음($DATE): $(echo "$SLOTS" | head -c 200)"; exit 1; }
END=$((START + 2)) # 30분(10분×3)
QUOTE=$(auth "$S1" -X POST "$API/bookings/quote" -H 'Content-Type: application/json' \
  -d "{\"teacherId\":\"$TID\",\"date\":\"$DATE\",\"mode\":\"chat\",\"consultType\":\"교과\",\"slotStart\":$START,\"slotEnd\":$END}")
echo "  견적=$(echo "$QUOTE" | jq -c '(.data // .) | {credits,minutes}' 2>/dev/null || echo "$QUOTE" | head -c 160)"
BOOK=$(auth "$S1" -X POST "$API/bookings" -H 'Content-Type: application/json' \
  -d "{\"teacherId\":\"$TID\",\"date\":\"$DATE\",\"consultType\":\"교과\",\"subType\":\"수학\",\"mode\":\"chat\",\"slotStart\":$START,\"slotEnd\":$END,\"content\":\"여정 E2E — 격차 리포트 기반 상담 요청\"}")
BID=$(echo "$BOOK" | jq -r '(.data // .) | .id // empty')
BSTATUS=$(echo "$BOOK" | jq -r '(.data // .) | .status // empty')
[ -n "$BID" ] || { echo "  ✗ 예약 생성 실패: $(echo "$BOOK" | head -c 300)"; exit 1; }
echo "  ✓ 예약 생성 id=${BID:0:8}… status=$BSTATUS"

echo "▶ 8) 전환 계측(C3) — 배치표→상담 CTA 이벤트 적재"
EV=$(curl -s -X POST "$API/funnel/event" -H 'Content-Type: application/json' \
  -d '{"page":"baechi","event":"cta","cta":"consult-reserve","sessionId":"journey-e2e"}')
echo "$EV" | jq -e '(.data // .) | (.ok // .id // .accepted // true)' >/dev/null || { echo "  ✗ 계측 적재 실패: $(echo "$EV" | head -c 200)"; exit 1; }
echo "  ✓ 적재=$(echo "$EV" | jq -c '(.data // .)' | head -c 100)"

echo "▶ 9) 학생 예약 목록에서 확인(여정 종착)"
LIST=$(auth "$S1" "$API/bookings")
FOUND=$(echo "$LIST" | jq -r --arg id "$BID" '(.data // .) | map(select(.id==$id)) | length')
[ "$FOUND" = "1" ] || { echo "  ✗ 예약 목록에서 미확인"; exit 1; }
echo "  ✓ 예약 목록 확인"

echo "✅ 통합 여정 E2E 통과: 성적 입력 → 배치표 → 격차 리포트 → 커리큘럼 → 상담 예약(+계측)"
