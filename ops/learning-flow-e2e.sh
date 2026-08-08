#!/usr/bin/env bash
# 학습 흐름 통합 E2E — 진단→플랜, 강좌(교사 등록·학생 수강·진도), 관리자 통계.
# 요구: curl, jq. base 시드 계정.
set -euo pipefail
API="${API:-http://localhost:3000/api/v1}"
PW="${PW:-dev-password!}"
# 공개 데모처럼 관리자 계열 비번을 분리한 환경(JANUS_DEMO_ADMIN_PW 로 시드)에서는 ADMIN_PW 를 준다.
# 미설정이면 PW 와 동일 — CI·로컬은 아무것도 바뀌지 않는다.
ADMIN_PW="${ADMIN_PW:-$PW}"
pw_for() { case "$1" in admin01|hq01|master01|hr01) printf '%s' "$ADMIN_PW";; *) printf '%s' "$PW";; esac; }
login() { curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' -d "{\"loginId\":\"$1\",\"password\":\"$(pw_for "$1")\"}" | jq -r '.data.accessToken // .accessToken // empty'; }
auth() { local t="$1"; shift; curl -s -H "Authorization: Bearer $t" "$@"; }

for i in $(seq 1 40); do curl -sf "$API/health" >/dev/null 2>&1 && break; sleep 1; done
echo "▶ 0) 로그인(student01·teacher01·admin01)"
S1=$(login student01); T1=$(login teacher01); AD=$(login admin01)
for v in S1 T1 AD; do [ -n "${!v}" ] || { echo "  ✗ $v 로그인 실패"; exit 1; }; done; echo "  ✓"

echo "▶ 1) 진단 시작→제출→플랜 확인"
ST=$(auth "$S1" -X POST "$API/diagnostics/start" -H 'Content-Type: application/json' -d '{}')
AID=$(echo "$ST" | jq -r '.data.attemptId // .attemptId')
ANS=$(echo "$ST" | jq -c '{answers: [(.data.questions // .questions)[] | {questionId: .id, chosen: 0}]}')
RES=$(auth "$S1" -X POST "$API/diagnostics/$AID/submit" -H 'Content-Type: application/json' -d "$ANS")
echo "  진단 결과=$(echo "$RES" | jq -c '(.data // .) | {score, weak:(.units|map(select(.weak))|length)}')"
echo "▶ 1b) 약점 클리닉(약점 유형 재출제)"
CL=$(auth "$S1" -X POST "$API/diagnostics/clinic" -H 'Content-Type: application/json' -d "{\"attemptId\":\"$AID\"}")
echo "  클리닉 문항 수=$(echo "$CL" | jq '(.data.questions // .questions) | length')"
echo "▶ 1c) 학습 플랜"
PLAN=$(auth "$S1" "$API/curriculum/me")
echo "  플랜=$(echo "$PLAN" | jq -c '(.data // .) | {headline, items:(.items|length)}')"

echo "▶ 2) teacher01 강좌 등록"
LEC=$(auth "$T1" -X POST "$API/lectures" -H 'Content-Type: application/json' -d '{"subject":"수학","unit":"미적분","title":"E2E 강좌 — 미적분 핵심","summary":"테스트 강좌","level":"기본","minutes":60}')
LID=$(echo "$LEC" | jq -r '.data.id // .id')
[ -n "$LID" ] && echo "  ✓ lectureId=$LID" || { echo "  ✗ 강좌 등록 실패"; exit 1; }
echo "  내 강좌=$(auth "$T1" "$API/lectures/mine" | jq -c '(.data // .) | map({title,enrolled})[0:2]')"

echo "▶ 3) student01 수강신청→진도"
auth "$S1" -X POST "$API/lectures/$LID/enroll" -H 'Content-Type: application/json' -d '{}' >/dev/null
auth "$S1" -X PATCH "$API/lectures/$LID/progress" -H 'Content-Type: application/json' -d '{"progress":50}' >/dev/null
DET=$(auth "$S1" "$API/lectures/$LID")
echo "  상세=$(echo "$DET" | jq -c '(.data // .) | {enrolled, progress}')"
[ "$(echo "$DET" | jq -r '(.data // .).progress')" = "50" ] && echo "  ✓ 진도 50% 저장" || echo "  ⚠ 진도 불일치"
echo "  내 수강=$(auth "$S1" "$API/lectures/me" | jq -c '(.data // .) | length')개"

echo "▶ 4) 강좌 검색(제목 키워드)"
echo "  검색결과=$(auth "$S1" "$API/lectures?q=미적분" | jq -c '(.data // .) | map(.title)')"

echo "▶ 5) 관리자 통계"
auth "$AD" "$API/admin/stats/overview" | jq -c '.data // .'

echo "✅ 학습 흐름 통합 E2E 완료"
