#!/usr/bin/env bash
# Q3 커뮤니티 v1 E2E — 질문→AI 초안→답변(전원)→본인답변 차단→단일 채택→마감 후 차단→신고 숨김.
# 사용: (1) docker compose up 상태 (2) 마이그레이션 0054 적용 (3) bash ops/qna-community-e2e.sh
# 요구: curl, jq. 데모 계정(dev-password!) 시드 전제.
set -euo pipefail

API="${API:-http://localhost:3000/api/v1}"
PW="${PW:-dev-password!}"

login() { # $1=loginId → accessToken
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"loginId\":\"$1\",\"password\":\"$PW\"}" | jq -r '.data.accessToken // .accessToken'
}
auth() { local t="$1"; shift; curl -s -H "Authorization: Bearer $t" "$@"; }

echo "▶ 0) 로그인(student01·student02·teacher01, +신고용 teacher02·student03)"
S1=$(login student01); S2=$(login student02); T1=$(login teacher01)
T2=$(login teacher02); S3=$(login student03)
for v in S1 S2 T1 T2 S3; do [ "${!v}" != "null" ] && [ -n "${!v}" ] || { echo "✗ $v 로그인 실패"; exit 1; }; done
echo "  ✓ 토큰 확보"

echo "▶ 1) student01 커뮤니티 질문 등록(무료)"
POST=$(auth "$S1" -X POST "$API/qna/community" -H 'Content-Type: application/json' \
  -d '{"subject":"수학","difficulty":"상","body":"합성함수 미분에서 왜 안쪽 도함수를 곱하나요?"}')
PID=$(echo "$POST" | jq -r '.data.id // .id')
echo "  postId=$PID"; [ "$PID" != "null" ] || { echo "✗ 등록 실패: $POST"; exit 1; }

echo "▶ 2) AI 1차 초안 대기(비동기)…"
DRAFT=null
for i in 1 2 3 4 5 6; do
  sleep 2
  DRAFT=$(auth "$S2" "$API/qna/community/$PID" | jq -r '.data.aiDraft // .aiDraft')
  [ "$DRAFT" != "null" ] && [ -n "$DRAFT" ] && break
done
if [ "$DRAFT" != "null" ] && [ -n "$DRAFT" ]; then echo "  ✓ AI 초안 생성됨: ${DRAFT:0:40}…"; else echo "  ⚠ AI 초안 미생성(LLM mock/키 미설정 시 정상) — 계속"; fi

echo "▶ 3) 목록 조회(미답변 필터)"
CNT=$(auth "$S2" "$API/qna/community?filter=unanswered" | jq '[.[] | select(.id=="'"$PID"'")] | length')
[ "$CNT" = "1" ] && echo "  ✓ 미답변 목록에 노출" || echo "  ⚠ 미답변 목록에 없음(count=$CNT)"

echo "▶ 4) teacher01 답변(전원 답변)"
A1=$(auth "$T1" -X POST "$API/qna/community/$PID/answers" -H 'Content-Type: application/json' \
  -d '{"body":"연쇄법칙 때문이에요. 바깥함수 미분 후 안쪽함수의 도함수를 곱합니다."}')
AID=$(echo "$A1" | jq -r '.data.id // .id')
echo "  answerId=$AID · aiSimilar=$(echo "$A1" | jq -r '.data.aiSimilar // .aiSimilar')"
[ "$AID" != "null" ] || { echo "✗ 답변 실패: $A1"; exit 1; }

echo "▶ 5) student02 답변(학생도 답변 가능)"
A2=$(auth "$S2" -X POST "$API/qna/community/$PID/answers" -H 'Content-Type: application/json' \
  -d '{"body":"저도 헷갈렸는데 예시로 풀어보면 이해돼요."}')
AID2=$(echo "$A2" | jq -r '.data.id // .id')
[ "$AID2" != "null" ] && echo "  ✓ 학생 답변 등록" || { echo "✗ 학생 답변 실패: $A2"; exit 1; }

echo "▶ 6) student01(작성자) 본인 질문 답변 시도 → 차단(403)"
SC=$(auth "$S1" -o /dev/null -w '%{http_code}' -X POST "$API/qna/community/$PID/answers" \
  -H 'Content-Type: application/json' -d '{"body":"내 질문에 답변"}')
[ "$SC" = "403" ] && echo "  ✓ 403 차단" || echo "  ⚠ 예상 403, 실제 $SC"

echo "▶ 7) student01 단일 채택 → resolved"
AC=$(auth "$S1" -X PATCH "$API/qna/community/answers/$AID/accept" -H 'Content-Type: application/json' -d '{}')
[ "$(echo "$AC" | jq -r '.data.accepted // .accepted')" = "true" ] && echo "  ✓ 채택 완료" || { echo "✗ 채택 실패: $AC"; exit 1; }

echo "▶ 8) 마감 후 재답변 시도 → 차단(403)"
SC=$(auth "$T2" -o /dev/null -w '%{http_code}' -X POST "$API/qna/community/$PID/answers" \
  -H 'Content-Type: application/json' -d '{"body":"뒤늦은 답변"}')
[ "$SC" = "403" ] && echo "  ✓ 403 차단(이미 마감)" || echo "  ⚠ 예상 403, 실제 $SC"

echo "▶ 9) 신고 누적 3건 → 답변 자동 숨김"
for t in S1 T1 S3; do
  # 채택 안 된 학생 답변(AID2)을 3인이 신고
  auth "${!t}" -X POST "$API/qna/report" -H 'Content-Type: application/json' \
    -d "{\"targetType\":\"answer\",\"targetId\":\"$AID2\"}" >/dev/null || true
done
HIDDEN=$(auth "$S2" "$API/qna/community/$PID" | jq '[.data.answers[]? // .answers[]? | select(.id=="'"$AID2"'")] | length')
[ "$HIDDEN" = "0" ] && echo "  ✓ 신고 3건 → 상세에서 숨김" || echo "  ⚠ 아직 노출(count=$HIDDEN) — 신고자 중복 여부 확인"

echo "▶ 10) 중복 신고 → 409"
SC=$(auth "$S1" -o /dev/null -w '%{http_code}' -X POST "$API/qna/report" \
  -H 'Content-Type: application/json' -d "{\"targetType\":\"answer\",\"targetId\":\"$AID2\"}")
[ "$SC" = "409" ] && echo "  ✓ 409 중복 차단" || echo "  ⚠ 예상 409, 실제 $SC"

echo "▶ 11) teacher01 커뮤니티 실적"
auth "$T1" "$API/qna/community/stats" | jq -c '.data // .'
echo "✅ 커뮤니티 E2E 완료"
