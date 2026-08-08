#!/usr/bin/env bash
# Q3 커뮤니티 v1 E2E — 질문→AI 초안→답변(전원)→본인답변 차단→단일 채택→마감 후 차단→신고 숨김.
# 사용: (1) docker compose up 상태 (2) 마이그레이션 0054 적용 (3) bash ops/qna-community-e2e.sh
# 요구: curl, jq. base 시드 계정(dev-password!)만으로 동작 — 시뮬 시드 불필요.
# 계정 오버라이드 가능: OWNER/ANS_T/ANS_X/REP3 환경변수(기본 base 시드).
set -euo pipefail

API="${API:-http://localhost:3000/api/v1}"
PW="${PW:-dev-password!}"
# 공개 데모처럼 관리자 계열 비번을 분리한 환경(JANUS_DEMO_ADMIN_PW 로 시드)에서는 ADMIN_PW 를 준다.
# 미설정이면 PW 와 동일 — CI·로컬은 아무것도 바뀌지 않는다.
ADMIN_PW="${ADMIN_PW:-$PW}"
pw_for() { case "$1" in admin01|hq01|master01|hr01) printf '%s' "$ADMIN_PW";; *) printf '%s' "$PW";; esac; }
OWNER="${OWNER:-student01}"   # 질문 작성자·채택자(학생 필수 — accept 는 @Roles student)
ANS_T="${ANS_T:-teacher01}"   # 답변자(교사) — 채택 대상
ANS_X="${ANS_X:-guardian01}"  # 답변자(비교사) — '전원 답변' 증명 + 신고로 숨길 대상
REP_A="${REP_A:-admin01}"     # 신고자 3인(작성자 제외 distinct): OWNER, ANS_T, REP_A

login() { # $1=loginId → accessToken (실패 시 빈문자)
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"loginId\":\"$1\",\"password\":\"$(pw_for "$1")\"}" | jq -r '.data.accessToken // .accessToken // empty'
}
auth() { local t="$1"; shift; curl -s -H "Authorization: Bearer $t" "$@"; }

echo "▶ 0) 로그인 — OWNER=$OWNER ANS_T=$ANS_T ANS_X=$ANS_X REP_A=$REP_A"
TO=$(login "$OWNER"); TT=$(login "$ANS_T"); TX=$(login "$ANS_X"); TA=$(login "$REP_A")
fail=0
[ -n "$TO" ] || { echo "  ✗ $OWNER 로그인 실패"; fail=1; }
[ -n "$TT" ] || { echo "  ✗ $ANS_T 로그인 실패"; fail=1; }
[ -n "$TX" ] || { echo "  ✗ $ANS_X 로그인 실패"; fail=1; }
[ -n "$TA" ] || { echo "  ✗ $REP_A 로그인 실패"; fail=1; }
[ "$fail" = 0 ] || { echo "  → 없는 계정은 환경변수로 교체(예: REP_A=hr01). base 시드 계정 확인."; exit 1; }
echo "  ✓ 토큰 4개 확보"

echo "▶ 1) $OWNER 커뮤니티 질문 등록(무료)"
POST=$(auth "$TO" -X POST "$API/qna/community" -H 'Content-Type: application/json' \
  -d '{"subject":"수학","difficulty":"상","body":"합성함수 미분에서 왜 안쪽 도함수를 곱하나요?"}')
PID=$(echo "$POST" | jq -r '.data.id // .id // empty')
[ -n "$PID" ] || { echo "  ✗ 등록 실패: $POST"; exit 1; }
echo "  ✓ postId=$PID"

echo "▶ 2) AI 1차 초안 대기(비동기·mock 이면 없을 수 있음)"
DRAFT=""
for i in 1 2 3 4 5 6; do
  sleep 2
  DRAFT=$(auth "$TX" "$API/qna/community/$PID" | jq -r '.data.aiDraft // .aiDraft // empty')
  [ -n "$DRAFT" ] && break
done
[ -n "$DRAFT" ] && echo "  ✓ AI 초안: ${DRAFT:0:44}…" || echo "  ⚠ AI 초안 미생성(LLM mock/키 미설정 시 정상) — 계속"

echo "▶ 3) 목록(미답변 필터)에 노출"
CNT=$(auth "$TX" "$API/qna/community?filter=unanswered" | jq '[(.data // .)[] | select(.id=="'"$PID"'")] | length')
[ "$CNT" = "1" ] && echo "  ✓ 미답변 목록 노출" || echo "  ⚠ 미답변 목록 없음(count=$CNT)"

echo "▶ 4) $ANS_T(교사) 답변"
A1=$(auth "$TT" -X POST "$API/qna/community/$PID/answers" -H 'Content-Type: application/json' \
  -d '{"body":"연쇄법칙 때문이에요. 바깥함수 미분 후 안쪽함수의 도함수를 곱합니다."}')
AID=$(echo "$A1" | jq -r '.data.id // .id // empty')
[ -n "$AID" ] || { echo "  ✗ 답변 실패: $A1"; exit 1; }
echo "  ✓ answerId=$AID aiSimilar=$(echo "$A1" | jq -r '.data.aiSimilar // .aiSimilar')"

echo "▶ 5) $ANS_X(비교사) 답변 — '전원 답변' 증명"
A2=$(auth "$TX" -X POST "$API/qna/community/$PID/answers" -H 'Content-Type: application/json' \
  -d '{"body":"저도 예전에 헷갈렸는데 예시로 직접 풀어보니 이해됐어요."}')
AID2=$(echo "$A2" | jq -r '.data.id // .id // empty')
[ -n "$AID2" ] && echo "  ✓ 비교사 답변 등록(answerId=$AID2)" || { echo "  ✗ 실패: $A2"; exit 1; }

echo "▶ 6) $OWNER 본인 질문 답변 시도 → 403 차단"
SC=$(auth "$TO" -o /dev/null -w '%{http_code}' -X POST "$API/qna/community/$PID/answers" \
  -H 'Content-Type: application/json' -d '{"body":"내 질문에 답변"}')
[ "$SC" = "403" ] && echo "  ✓ 403" || echo "  ⚠ 예상 403, 실제 $SC"

echo "▶ 7) $OWNER 단일 채택($AID) → resolved"
AC=$(auth "$TO" -X PATCH "$API/qna/community/answers/$AID/accept" -H 'Content-Type: application/json' -d '{}')
[ "$(echo "$AC" | jq -r '.data.accepted // .accepted')" = "true" ] && echo "  ✓ 채택 완료" || { echo "  ✗ 채택 실패: $AC"; exit 1; }

echo "▶ 8) 마감 후 재답변 시도 → 403 차단"
SC=$(auth "$TT" -o /dev/null -w '%{http_code}' -X POST "$API/qna/community/$PID/answers" \
  -H 'Content-Type: application/json' -d '{"body":"뒤늦은 답변"}')
[ "$SC" = "403" ] && echo "  ✓ 403(이미 마감)" || echo "  ⚠ 예상 403, 실제 $SC"

echo "▶ 9) 신고 3인(${OWNER}, ${ANS_T}, ${REP_A}) → ${ANS_X} 답변 자동 숨김"
for t in "$TO" "$TT" "$TA"; do
  auth "$t" -X POST "$API/qna/report" -H 'Content-Type: application/json' \
    -d "{\"targetType\":\"answer\",\"targetId\":\"$AID2\"}" >/dev/null || true
done
HID=$(auth "$TX" "$API/qna/community/$PID" | jq '[.data.answers[]? // .answers[]? | select(.id=="'"$AID2"'")] | length')
[ "$HID" = "0" ] && echo "  ✓ 신고 3건 → 상세에서 숨김" || echo "  ⚠ 아직 노출(count=$HID)"

echo "▶ 10) 중복 신고($OWNER) → 409"
SC=$(auth "$TO" -o /dev/null -w '%{http_code}' -X POST "$API/qna/report" \
  -H 'Content-Type: application/json' -d "{\"targetType\":\"answer\",\"targetId\":\"$AID2\"}")
[ "$SC" = "409" ] && echo "  ✓ 409 중복 차단" || echo "  ⚠ 예상 409, 실제 $SC"

echo "▶ 11) $ANS_T 커뮤니티 실적"
auth "$TT" "$API/qna/community/stats" | jq -c '.data // .'
echo "✅ 커뮤니티 E2E 완료"
