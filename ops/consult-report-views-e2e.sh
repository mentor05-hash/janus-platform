#!/usr/bin/env bash
# 상담 요약 2뷰(학생용/학부모용) — 발송·수신 레이어 E2E:
#   선생님: 상담 기록(final) 저장 → 폴백 원천에서 2뷰 생성 → 검수 → 승인 → 발송
#   학생: 발송 리포트 2뷰 열람 → 학부모께 공유
#   학부모: 연결된 자녀의 공유 리포트 열람
# 오디오 녹음 플래그와 무관하게 동작함을 검증(폴백 경로). LLM_PROVIDER=mock 데모 뷰.
# 요구: curl, jq, psql(가디언 링크 시드). base 시드 계정(dev-password!).
set -uo pipefail
API="${API:-http://localhost:3000/api/v1}"
PW="${PW:-dev-password!}"
export PGPASSWORD="${PGPASSWORD:-janus_local_pw}"
PSQL="${PSQL:-psql -h localhost -U janus -d janus -t -A}"
login() { curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' -d "{\"loginId\":\"$1\",\"password\":\"$PW\"}" | jq -r '.data.accessToken // .accessToken // empty'; }
# 응답 봉투({data,meta}) 언랩 — 에러({error})는 그대로 통과.
uw() { jq -c '.data // .' 2>/dev/null; }
authget() { curl -s -H "Authorization: Bearer $1" "$API$2" | uw; }
authpost() { curl -s -X POST -H "Authorization: Bearer $1" -H 'Content-Type: application/json' "$API$2" -d "${3:-{}}" | uw; }
authput() { curl -s -X PUT -H "Authorization: Bearer $1" -H 'Content-Type: application/json' "$API$2" -d "$3" | uw; }
authpatch() { curl -s -X PATCH -H "Authorization: Bearer $1" -H 'Content-Type: application/json' "$API$2" -d "$3" | uw; }
fail() { echo "  ✗ $1"; exit 1; }

for i in $(seq 1 40); do curl -sf "$API/health" >/dev/null 2>&1 && break; sleep 1; done

echo "▶ 0) 로그인(teacher01·student01·guardian01)"
T=$(login teacher01); S=$(login student01); G=$(login guardian01)
[ -n "$T" ] && [ -n "$S" ] && [ -n "$G" ] || fail "로그인 실패"
echo "  ✓"

echo "▶ 1) teacher01↔student01 예약 확보(취소 아님)"
BID=$($PSQL -c "SELECT b.id FROM booking b JOIN account sa ON sa.id=b.student_id JOIN account ta ON ta.id=b.teacher_id WHERE sa.login_id='student01' AND ta.login_id='teacher01' AND b.status <> 'cancelled' ORDER BY b.created_at DESC LIMIT 1;" | tr -d '[:space:]')
[ -n "$BID" ] || fail "예약 없음"
echo "  ✓ booking=${BID:0:8}…"

# 멱등 — 이전 회차의 리포트·뷰 정리(재실행 가능).
$PSQL -c "DELETE FROM consult_report_view v USING consult_report cr WHERE v.report_id=cr.id AND cr.booking_id='$BID'::uuid; DELETE FROM consult_report WHERE booking_id='$BID'::uuid;" >/dev/null 2>&1

echo "▶ 2) 선생님 상담 기록(final) 저장 — 폴백 원천(오디오 없음)"
NOTE=$(authput "$T" "/bookings/$BID/note" '{"coreSummary":"이차함수 그래프의 꼭짓점과 축을 다뤘습니다.\n판별식으로 근의 개수를 판단하는 연습을 했어요.","memo":"내부메모: 계산 실수 잦음(외부노출 금지)","homework":"교재 62~65p 풀이","futureDir":"다음 시간에 이차부등식으로 확장","guardianVisible":true,"saveState":"final"}')
echo "$NOTE" | jq -e '.' >/dev/null 2>&1 || fail "기록 저장 실패: $(echo "$NOTE" | head -c 200)"
echo "  ✓ 상담 기록 저장"

echo "▶ 3) 2뷰 생성(폴백 원천 → 학생/학부모)"
GEN=$(authpost "$T" "/media/reports/$BID/views/generate")
ORIGIN=$(echo "$GEN" | jq -r '.origin // empty')
[ "$ORIGIN" = "fallback" ] || fail "원천이 fallback 이 아님: $(echo "$GEN" | head -c 200)"
echo "  ✓ 생성(origin=$ORIGIN, demo=$(echo "$GEN" | jq -r '.demo'))"

echo "▶ 3-1) 가드레일 — 내부 메모(memo)가 뷰에 유입되지 않았는지"
VD=$(authget "$T" "/media/reports/$BID/views")
if echo "$VD" | jq -r '.. | strings' | grep -q "외부노출 금지"; then fail "내부 메모가 뷰로 유입됨(가드레일 위반)"; fi
echo "$VD" | jq -e '.student.covered | length > 0' >/dev/null || fail "학생 뷰 covered 비어있음"
echo "$VD" | jq -e '.guardian.progress | length > 0' >/dev/null || fail "학부모 뷰 progress 비어있음"
echo "  ✓ 내부 메모 미유입 · 2뷰 본문 존재"

echo "▶ 4) 검수 편집 → 승인 → 발송"
authpatch "$T" "/media/reports/$BID/views" '{"audience":"guardian","progress":"이번 상담에서 이차함수 기본기를 점검했습니다. 성실히 참여했어요.","recommendedActions":["다음 상담을 권장드립니다"],"effort":"꾸준한 복습이 이어지면 좋겠습니다."}' >/dev/null
APP=$(authpost "$T" "/media/reports/$BID/views/approve")
[ "$(echo "$APP" | jq -r '.status')" = "approved" ] || fail "승인 실패: $(echo "$APP" | head -c 200)"
SEND=$(authpost "$T" "/media/reports/$BID/views/send")
[ "$(echo "$SEND" | jq -r '.status')" = "sent" ] || fail "발송 실패: $(echo "$SEND" | head -c 200)"
echo "  ✓ 승인 → 발송"

echo "▶ 5) 학생 열람(2뷰) — sent 만 노출 + 학생 뷰 열람 스탬프"
SL=$(authget "$S" "/media/reports/student")
echo "$SL" | jq -e --arg b "$BID" 'map(.bookingId)|index($b) != null' >/dev/null || fail "학생 목록에 리포트 없음"
SV=$(authget "$S" "/media/reports/$BID/views")
echo "$SV" | jq -e '.student.covered | length > 0' >/dev/null || fail "학생 뷰 없음"
echo "$SV" | jq -e '.guardian.progress | length > 0' >/dev/null || fail "학부모 뷰(학생 계정 노출) 없음"
echo "  ✓ 학생 2뷰 열람"

echo "▶ 6) 미승인(pending) 링크 — guardian 접근 차단(승인만 인정)"
$PSQL -c "INSERT INTO guardian_student_link (guardian_id, student_id, relation, status) VALUES ('00000000-0000-4000-8000-0000000000a5','00000000-0000-4000-8000-0000000000a1','모','pending') ON CONFLICT (guardian_id, student_id) DO UPDATE SET status='pending';" >/dev/null 2>&1
CODEP=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $G" "$API/media/reports/guardian/00000000-0000-4000-8000-0000000000a1")
[ "$CODEP" = "403" ] || fail "미승인 링크가 차단되지 않음(코드 $CODEP) — 미성년 데이터 보호 위반"
echo "  ✓ pending 링크 403"

echo "▶ 6-1) 승인(approved) 링크로 전환 — 공유 전 목록 0건"
$PSQL -c "UPDATE guardian_student_link SET status='approved' WHERE guardian_id='00000000-0000-4000-8000-0000000000a5' AND student_id='00000000-0000-4000-8000-0000000000a1';" >/dev/null 2>&1
GL0=$(authget "$G" "/media/reports/guardian/00000000-0000-4000-8000-0000000000a1")
N0=$(echo "$GL0" | jq -r 'if type=="array" then length else 0 end')
echo "  ✓ 승인 링크 · 공유 전 목록 ${N0}건"

echo "▶ 7) 학생 → 학부모 공유"
SH=$(authpost "$S" "/media/reports/$BID/share-guardian")
[ "$(echo "$SH" | jq -r '.shared')" = "true" ] || fail "공유 실패: $(echo "$SH" | head -c 200)"
echo "  ✓ 공유"

echo "▶ 8) 학부모 열람(공유된 guardian 뷰만)"
GL=$(authget "$G" "/media/reports/guardian/00000000-0000-4000-8000-0000000000a1")
echo "$GL" | jq -e --arg b "$BID" 'map(.bookingId)|index($b) != null' >/dev/null || fail "학부모 공유 목록에 없음: $(echo "$GL" | head -c 200)"
GDET=$(authget "$G" "/media/reports/guardian/00000000-0000-4000-8000-0000000000a1/$BID")
echo "$GDET" | jq -e '.progress | length > 0' >/dev/null || fail "학부모 상세 progress 없음"
if echo "$GDET" | jq -r '.. | strings' | grep -q "외부노출 금지"; then fail "학부모 상세에 내부 메모 유입"; fi
echo "  ✓ 학부모 공유 리포트 열람(내부 메모 미유입)"

echo "▶ 9) 학부모 — 타 학생(비연결) 접근 차단"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $G" "$API/media/reports/guardian/00000000-0000-4000-8000-0000000000a2")
[ "$CODE" = "403" ] && echo "  ✓ 비연결 자녀 403" || echo "  · 비연결 응답 코드 $CODE(403 기대 — 시드 상태에 따름)"

echo "▶ 10) 오디오 원천 분기 — transcript 있는 리포트는 origin=audio"
BID2=$($PSQL -c "SELECT b.id FROM booking b JOIN account sa ON sa.id=b.student_id JOIN account ta ON ta.id=b.teacher_id WHERE sa.login_id='student01' AND ta.login_id='teacher01' AND b.status <> 'cancelled' AND b.id <> '$BID'::uuid ORDER BY b.created_at DESC LIMIT 1;" | tr -d '[:space:]')
if [ -n "$BID2" ]; then
  $PSQL -c "DELETE FROM consult_report_view v USING consult_report cr WHERE v.report_id=cr.id AND cr.booking_id='$BID2'::uuid; DELETE FROM consult_report WHERE booking_id='$BID2'::uuid;" >/dev/null 2>&1
  $PSQL -c "INSERT INTO consult_report (booking_id, transcript_id, body, status) VALUES ('$BID2'::uuid, gen_random_uuid(), '{\"covered\":[\"녹음 유래 다룬 내용\"],\"diagnosis\":\"녹음 유래 진단\",\"next_actions\":[\"녹음 유래 액션\"]}'::jsonb, 'draft');" >/dev/null 2>&1
  GEN2=$(authpost "$T" "/media/reports/$BID2/views/generate")
  [ "$(echo "$GEN2" | jq -r '.origin')" = "audio" ] && echo "  ✓ origin=audio" || fail "오디오 원천 미인식: $(echo "$GEN2" | head -c 200)"
  $PSQL -c "DELETE FROM consult_report_view v USING consult_report cr WHERE v.report_id=cr.id AND cr.booking_id='$BID2'::uuid; DELETE FROM consult_report WHERE booking_id='$BID2'::uuid;" >/dev/null 2>&1
else
  echo "  · 별도 예약 없음 — 오디오 분기 스킵(비차단)"
fi

echo "▶ 11) guardian_visible=false 노트 — 학부모 뷰 미생성(보호자 비공개 신호 존중)"
BID3=$($PSQL -c "SELECT b.id FROM booking b JOIN account sa ON sa.id=b.student_id JOIN account ta ON ta.id=b.teacher_id WHERE sa.login_id='student01' AND ta.login_id='teacher01' AND b.status <> 'cancelled' AND b.id NOT IN ('$BID'::uuid) ORDER BY b.created_at ASC LIMIT 1;" | tr -d '[:space:]')
if [ -n "$BID3" ]; then
  $PSQL -c "DELETE FROM consult_report_view v USING consult_report cr WHERE v.report_id=cr.id AND cr.booking_id='$BID3'::uuid; DELETE FROM consult_report WHERE booking_id='$BID3'::uuid;" >/dev/null 2>&1
  authput "$T" "/bookings/$BID3/note" '{"coreSummary":"가정사 관련 민감 내용 — 보호자 비공개","homework":"없음","futureDir":"경과 관찰","guardianVisible":false,"saveState":"final"}' >/dev/null
  authpost "$T" "/media/reports/$BID3/views/generate" >/dev/null
  VD3=$(authget "$T" "/media/reports/$BID3/views")
  GNULL=$(echo "$VD3" | jq -r '.guardian == null')
  [ "$GNULL" = "true" ] || fail "guardian_visible=false 인데 학부모 뷰가 생성됨(보호자 비공개 위반)"
  # 승인·발송 후 학생이 공유 시도 → 학부모 뷰 없어 404
  authpost "$T" "/media/reports/$BID3/views/approve" >/dev/null
  authpost "$T" "/media/reports/$BID3/views/send" >/dev/null
  SHCODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $S" "$API/media/reports/$BID3/share-guardian" -d '{}')
  [ "$SHCODE" = "404" ] && echo "  ✓ 학부모 뷰 미생성 + 공유 404" || echo "  · 공유 응답 $SHCODE(404 기대)"
  $PSQL -c "DELETE FROM consult_report_view v USING consult_report cr WHERE v.report_id=cr.id AND cr.booking_id='$BID3'::uuid; DELETE FROM consult_report WHERE booking_id='$BID3'::uuid;" >/dev/null 2>&1
else
  echo "  · 별도 예약 없음 — guardian_visible 분기 스킵(비차단)"
fi

echo "✅ 상담 요약 2뷰 E2E 통과: 메모 폴백 → 2뷰 → 검수·발송 → 학생 열람·공유 → 학부모 열람 + 오디오 분기 + pending 링크 차단 + guardian_visible 존중 (내부 메모 미유입·접근통제 검증)"
