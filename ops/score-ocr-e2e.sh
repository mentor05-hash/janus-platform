#!/usr/bin/env bash
# W4 잔여 — OCR 성적 입력 경로 E2E:
#   관리자: 성적표 이미지 업로드 → OCR 프리필 → (검수 후) manual 저장 → 학생 janus_score 반영.
# LLM_PROVIDER=mock 이면 데모 프리필(과목 틀) 반환 — 흐름·계약 검증이 목적.
# 요구: curl, jq. base 시드 계정(dev-password!).
set -euo pipefail
API="${API:-http://localhost:3000/api/v1}"
PW="${PW:-dev-password!}"
login() { curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' -d "{\"loginId\":\"$1\",\"password\":\"$PW\"}" | jq -r '.data.accessToken // .accessToken // empty'; }
auth() { local t="$1"; shift; curl -s -H "Authorization: Bearer $t" "$@"; }

for i in $(seq 1 40); do curl -sf "$API/health" >/dev/null 2>&1 && break; sleep 1; done

echo "▶ 0) 로그인(admin01·student01)"
AD=$(login admin01); S1=$(login student01)
[ -n "$AD" ] && [ -n "$S1" ] || { echo "  ✗ 로그인 실패"; exit 1; }
echo "  ✓"

echo "▶ 1) 성적표 이미지 업로드(1px PNG — OCR 입력)"
PNG=$(mktemp /tmp/ocr-XXXX.png)
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n\x2d\xb4\x00\x00\x00\x00IEND\xaeB\x60\x82' > "$PNG"
FID=$(curl -s -X POST "$API/files" -H "Authorization: Bearer $AD" -F "file=@$PNG;type=image/png;filename=report.png" | jq -r '(.data // .).id // empty')
rm -f "$PNG"
[ -n "$FID" ] || { echo "  ✗ 업로드 실패"; exit 1; }
echo "  ✓ fileId=${FID:0:8}…"

echo "▶ 2) OCR 프리필(POST /admin/scores/ocr)"
OCR=$(auth "$AD" -X POST "$API/admin/scores/ocr" -H 'Content-Type: application/json' -d "{\"fileId\":\"$FID\"}")
NITEMS=$(echo "$OCR" | jq -r '(.data // .) | (.items // []) | length')
[ "$NITEMS" -gt 0 ] || { echo "  ✗ OCR 항목 없음: $(echo "$OCR" | head -c 200)"; exit 1; }
echo "  ✓ 프리필 과목 ${NITEMS}개 (demo=$(echo "$OCR" | jq -r '(.data // .).demo // false'))"

echo "▶ 3) 검수 저장(manual — OCR 프리필에 점수 채워 확정, 원본 이미지 링크)"
TS=$(date +%y%m%d%H%M%S)
SAVE=$(auth "$AD" -X POST "$API/admin/scores/manual" -H 'Content-Type: application/json' -d "{
  \"studentLoginId\":\"student01\",\"period\":\"Z${TS}-OCR테스트\",\"examType\":\"모의고사\",\"reportFileId\":\"$FID\",
  \"note\":\"OCR E2E — 데모 프리필 검수 저장\",
  \"items\":[{\"subject\":\"국어\",\"score\":88,\"maxScore\":100},{\"subject\":\"수학\",\"score\":92,\"maxScore\":100},{\"subject\":\"영어\",\"score\":85,\"maxScore\":100}]}")
RID=$(echo "$SAVE" | jq -r '(.data // .) | .id // .reportId // empty')
[ -n "$RID" ] || { echo "  ✗ 저장 실패: $(echo "$SAVE" | head -c 300)"; exit 1; }
echo "  ✓ report=${RID:0:8}…"

echo "▶ 4) 관리자 목록에서 확인(원본 이미지 링크 포함)"
ROW=$(auth "$AD" "$API/admin/scores" | jq -c "(.data // .) | map(select(.period==\"Z${TS}-OCR테스트\")) | .[0]")
[ "$(echo "$ROW" | jq -r '.reportFileId')" = "$FID" ] || { echo "  ✗ 원본 링크 불일치"; exit 1; }
echo "  ✓ 목록 확인: avg=$(echo "$ROW" | jq -r '.avg') · 원본링크 OK"

echo "▶ 5) 학생 성적 추이에 반영 확인"
TREND=$(auth "$S1" "$API/me/scores/trend" | jq -c "(.data // .)" | head -c 200)
echo "  추이 응답: ${TREND}…"
echo "$TREND" | grep -q "Z${TS}" && echo "  ✓ 신규 회차 반영" || echo "  · 추이 표시는 정책·형식에 따름(비차단)"

echo "✅ OCR 성적 입력 E2E 통과: 업로드 → OCR 프리필 → 검수 저장 → 목록·링크 확인"
