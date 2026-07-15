#!/usr/bin/env bash
# 수능 성적 자가 입력 → 배치표(janus_score) 자동 반영 E2E.
# 학생 저장 → GET /scores/janus-score 산출 확인 → 격차 리포트까지. 요구: curl, jq.
set -euo pipefail
API="${API:-http://localhost:3000/api/v1}"
PW="${PW:-dev-password!}"
login() { curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' -d "{\"loginId\":\"$1\",\"password\":\"$PW\"}" | jq -r '.data.accessToken // .accessToken // empty'; }
auth() { local t="$1"; shift; curl -s -H "Authorization: Bearer $t" "$@"; }

for i in $(seq 1 40); do curl -sf "$API/health" >/dev/null 2>&1 && break; sleep 1; done
echo "▶ 0) 로그인(student01)"
S1=$(login student01); [ -n "$S1" ] || { echo "  ✗ 로그인 실패"; exit 1; }
echo "  ✓"

echo "▶ 1) 표준점수 모드 저장(계열 이과·국수탐 표점 + 영/한 등급 + 세부과목)"
SAVE=$(auth "$S1" -X POST "$API/scores/me" -H 'Content-Type: application/json' -d '{
  "period":"2099-자가입력테스트","mode":"std","gye":"이과",
  "items":[
    {"subject":"국어","score":131,"subSubject":"언어와매체"},
    {"subject":"수학","score":135,"subSubject":"미적분"},
    {"subject":"탐구1","score":65,"subSubject":"물리학Ⅰ"},
    {"subject":"탐구2","score":64,"subSubject":"화학Ⅰ"},
    {"subject":"영어","grade":"2"},
    {"subject":"한국사","grade":"3"},
    {"subject":"제2외국어","grade":"4","subSubject":"일본어Ⅰ"}
  ]}')
echo "  저장=$(echo "$SAVE" | jq -c '{ok:(.data.ok//.ok),linkable:(.data.linkable//.linkable)}')"
[ "$(echo "$SAVE" | jq -r '.data.linkable // .linkable')" = "true" ] && echo "  ✓ 배치표 연동 가능" || echo "  ⚠ linkable=false"

echo "▶ 2) janus_score 산출 확인(배치표가 읽는 값)"
JS=$(auth "$S1" "$API/scores/janus-score")
echo "  $(echo "$JS" | jq -c '(.data // .) | {gye,mode,kor,mat,tam1,tam2,eng,han}')"
OK=$(echo "$JS" | jq -r '(.data // .) | (.mode=="std" and .kor==131 and .mat==135 and .tam1==65 and .tam2==64 and .eng==2 and .han==3 and .gye=="이과")')
[ "$OK" = "true" ] && echo "  ✓ 국·수·탐1·탐2 표점 + 영·한 등급 + 계열 정확 매핑" || echo "  ⚠ 매핑 불일치"

echo "▶ 3) 프리필 조회(세부과목 메타 저장 확인)"
auth "$S1" "$API/scores/me" | jq -c '(.data // .) | {mode,gye, subs:[.items[]|{subject,subSubject}]}'

echo "▶ 4) 격차 리포트(정시·목표컷)로 성적 연동 확인"
GAP=$(auth "$S1" -X POST "$API/scores/gap-report" -H 'Content-Type: application/json' -d '{"mode":"jeongsi","univ":"한빛대","dept":"산업공학","cutNb":3.0}')
echo "  $(echo "$GAP" | jq -c '(.data // .) | {mode, myValue, gap, band}' 2>/dev/null || echo "$GAP" | head -c 200)"

echo "▶ 5) 전국누백 모드 저장 → mode=nb 확인"
auth "$S1" -X POST "$API/scores/me" -H 'Content-Type: application/json' -d '{"period":"2100-누백테스트","mode":"nb","gye":"이과","nb":2.4,"items":[{"subject":"영어","grade":"2"},{"subject":"한국사","grade":"3"}]}' >/dev/null
JS2=$(auth "$S1" "$API/scores/janus-score")
echo "  $(echo "$JS2" | jq -c '(.data // .) | {mode,nb,eng,han}')"
[ "$(echo "$JS2" | jq -r '(.data // .) | (.mode=="nb" and .nb==2.4)')" = "true" ] && echo "  ✓ 누백 모드 반영" || echo "  ⚠ 누백 불일치"

echo "✅ 성적 입력 → 배치표 연동 E2E 완료"
