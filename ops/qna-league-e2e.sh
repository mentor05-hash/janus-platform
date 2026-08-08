#!/usr/bin/env bash
# Q3 리그 v1 E2E — 정책 설정(admin) → 커뮤니티 답변·채택으로 3부→2부→1부 승급 확인.
# 요구: curl, jq. base 시드 계정. ⚠ student01 하루 커뮤니티 3건 제한 → 이 스크립트는 하루 1회.
set -euo pipefail
API="${API:-http://localhost:3000/api/v1}"
PW="${PW:-dev-password!}"
# 공개 데모처럼 관리자 계열 비번을 분리한 환경(JANUS_DEMO_ADMIN_PW 로 시드)에서는 ADMIN_PW 를 준다.
# 미설정이면 PW 와 동일 — CI·로컬은 아무것도 바뀌지 않는다.
ADMIN_PW="${ADMIN_PW:-$PW}"
pw_for() { case "$1" in admin01|hq01|master01|hr01) printf '%s' "$ADMIN_PW";; *) printf '%s' "$PW";; esac; }
login() { curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' -d "{\"loginId\":\"$1\",\"password\":\"$(pw_for "$1")\"}" | jq -r '.data.accessToken // .accessToken // empty'; }
auth() { local t="$1"; shift; curl -s -H "Authorization: Bearer $t" "$@"; }

echo "▶ api 헬스 대기(재빌드 직후 워밍업)…"
for i in $(seq 1 40); do curl -sf "$API/health" >/dev/null 2>&1 && { echo "  ✓ ready"; break; }; sleep 1; done

echo "▶ 0) 로그인(student01·teacher01·admin01)"
S1=$(login student01); T1=$(login teacher01); AD=$(login admin01)
for v in S1 T1 AD; do [ -n "${!v}" ] || { echo "  ✗ $v 로그인 실패"; exit 1; }; done
echo "  ✓ 토큰 확보"

echo "▶ 1) admin 승급 정책 관대 설정(2부: 답변2·채택1·률1 / 1부: 답변3·채택2·률50)"
POL=$(auth "$AD" -X PUT "$API/qna/league/policy" -H 'Content-Type: application/json' \
  -d '{"promote2":{"minAuthored":2,"minAccepted":1,"minRate":1},"promote1":{"minAuthored":3,"minAccepted":2,"minRate":50}}')
echo "  정책=$(echo "$POL" | jq -c '.data // .')"

echo "▶ 2) teacher01 초기 리그"
auth "$T1" "$API/qna/league/me" | jq -c '.data // .'

echo "▶ 3) 질문 3건 + teacher01 답변 3건 (하루 3건 한도 대비 — 회차별 신규 학생 가입)"
QTS=$(date +%s)
SQPW='E2e-league-9!'  # 가입 비밀번호 정책(§10 — 숫자 포함) 충족용
CID=$(auth "$AD" "$API/auth/refresh-context" 2>/dev/null | jq -r '.centerId // empty')
# admin 센터로 가입해야 승인 가능 — 센터 id 는 시드 고정값 폴백.
[ -n "$CID" ] || CID='00000000-0000-4000-8000-0000000000c1'
NEWID=$(curl -s -X POST "$API/auth/signup" -H 'Content-Type: application/json' \
  -d "{\"loginId\":\"e2elg${QTS}\",\"password\":\"$SQPW\",\"name\":\"리그E2E학생\",\"role\":\"student\",\"centerId\":\"$CID\"}" | jq -r '.data.id // .id // empty')
[ -n "$NEWID" ] || { echo "  ✗ 신규 학생 가입 실패"; exit 1; }
auth "$AD" -X POST "$API/hr/students/$NEWID/approve" >/dev/null
SQ=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' -d "{\"loginId\":\"e2elg${QTS}\",\"password\":\"$SQPW\"}" | jq -r '.data.accessToken // .accessToken // empty')
[ -n "$SQ" ] || { echo "  ✗ 신규 학생 승인/로그인 실패"; exit 1; }
PIDS=(); AIDS=()
for i in 1 2 3; do
  PID=$(auth "$SQ" -X POST "$API/qna/community" -H 'Content-Type: application/json' -d "{\"subject\":\"수학\",\"body\":\"리그테스트 질문 $i — 미적분 개념 질문입니다.\"}" | jq -r '.data.id // .id // empty')
  [ -n "$PID" ] || { echo "  ✗ 질문$i 실패(하루 3건 제한 초과?)"; exit 1; }
  AID=$(auth "$T1" -X POST "$API/qna/community/$PID/answers" -H 'Content-Type: application/json' -d "{\"body\":\"답변 $i — 연쇄법칙으로 풉니다.\"}" | jq -r '.data.id // .id // empty')
  PIDS+=("$PID"); AIDS+=("$AID")
  echo "  Q$i=$PID A$i=$AID"
done

echo "▶ 4) 첫 채택 → teacher01 2부 승급 기대"
R=$(auth "$SQ" -X PATCH "$API/qna/community/answers/${AIDS[0]}/accept" -H 'Content-Type: application/json' -d '{}')
echo "  accept=$(echo "$R" | jq -c '{league:(.data.authorLeague // .authorLeague), promoted:(.data.promoted // .promoted)}')"
auth "$T1" "$API/qna/league/me" | jq -c '{tier:(.data.tier//.tier),label:(.data.label//.label),accepted:(.data.accepted//.accepted)}'

echo "▶ 5) 둘째 채택 → teacher01 1부 승급 기대(답변3·채택2·률67)"
auth "$SQ" -X PATCH "$API/qna/community/answers/${AIDS[1]}/accept" -H 'Content-Type: application/json' -d '{}' >/dev/null
ME=$(auth "$T1" "$API/qna/league/me")
echo "  me=$(echo "$ME" | jq -c '{tier:(.data.tier//.tier),label:(.data.label//.label),authored:(.data.authored//.authored),accepted:(.data.accepted//.accepted),acceptRate:(.data.acceptRate//.acceptRate),next:(.data.next//.next)}')"
TIER=$(echo "$ME" | jq -r '.data.tier // .tier')
[ "$TIER" = "1" ] && echo "  ✓ 1부 승급 확인" || echo "  ⚠ 기대 1부, 실제 tier=$TIER"

echo "▶ 5.5) 알림 확인(teacher01 — 채택·승급 알림)"
NT=$(auth "$T1" "$API/notifications")
echo "  타입=$(echo "$NT" | jq -c '[(.data // .)[] | .type] | unique')"
echo "$NT" | jq -e '[(.data // .)[] | select(.type=="qna_community_accepted")] | length > 0' >/dev/null && echo "  ✓ 채택 알림 있음" || echo "  ⚠ 채택 알림 없음(비동기 지연 가능)"
echo "$NT" | jq -e '[(.data // .)[] | select(.type=="qna_league_promoted")] | length > 0' >/dev/null && echo "  ✓ 승급 알림 있음" || echo "  ⚠ 승급 알림 없음(비동기 지연 가능)"

echo "▶ 6) 리더보드(상위 등급)"
auth "$S1" "$API/qna/league/leaderboard" | jq -c '(.data // .) | map({name,label,accepted,acceptRate})'

echo "▶ 7) 정책 기본값 원복(테스트 값 잔존 방지)"
auth "$AD" -X PUT "$API/qna/league/policy" -H 'Content-Type: application/json' \
  -d '{"promote2":{"minAuthored":5,"minAccepted":3,"minRate":50},"promote1":{"minAuthored":15,"minAccepted":10,"minRate":70}}' >/dev/null \
  && echo "  ✓ 기본 정책 복원(2부: 답변5·채택3·률50 / 1부: 답변15·채택10·률70)"

echo "✅ 리그 E2E 완료"
