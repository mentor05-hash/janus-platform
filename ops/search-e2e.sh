#!/usr/bin/env bash
# 전역 통합검색 E2E — GET /search?q= 로 강좌·자료·커뮤니티·선생님 통합 조회.
# 데모 콘텐츠(0058 강좌·0062 커뮤니티·시드 선생님) 기준. 요구: curl, jq.
set -euo pipefail
API="${API:-http://localhost:3000/api/v1}"
PW="${PW:-dev-password!}"
login() { curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' -d "{\"loginId\":\"$1\",\"password\":\"$PW\"}" | jq -r '.data.accessToken // .accessToken // empty'; }
auth() { local t="$1"; shift; curl -s -H "Authorization: Bearer $t" "$@"; }
enc() { jq -rn --arg s "$1" '$s|@uri'; }

for i in $(seq 1 40); do curl -sf "$API/health" >/dev/null 2>&1 && break; sleep 1; done
echo "▶ 0) 로그인(student01)"
S1=$(login student01); [ -n "$S1" ] || { echo "  ✗ 로그인 실패"; exit 1; }; echo "  ✓"
fail=0

echo "▶ 1) '미적분' 검색 — 강좌 그룹 히트"
R=$(auth "$S1" "$API/search?q=$(enc 미적분)")
TOTAL=$(echo "$R" | jq -r '(.data // .).total')
LEC=$(echo "$R" | jq -r '((.data // .).groups.lecture // []) | length')
echo "  total=$TOTAL · 강좌 $LEC건"
[ "$TOTAL" -ge 1 ] && [ "$LEC" -ge 1 ] && echo "  ✓ 강좌 검색 동작" || { echo "  ✗ 강좌 히트 없음"; fail=1; }

echo "▶ 2) 강좌 히트 href 실경로 검증"
LHREF=$(echo "$R" | jq -r '((.data // .).groups.lecture // [])[0].href // ""')
echo "  href=$LHREF"
[ "$LHREF" = "/student/lectures" ] && echo "  ✓ 강좌 href 정상" || { echo "  ✗ 강좌 href 이상"; fail=1; }

echo "▶ 3) '영어' 검색 — 다중 그룹(강좌/커뮤니티 등)"
R2=$(auth "$S1" "$API/search?q=$(enc 영어)")
GRPS=$(echo "$R2" | jq -r '(.data // .).groups | keys | join(",")')
echo "  그룹=[$GRPS]"
[ -n "$GRPS" ] && echo "  ✓ 그룹 반환" || { echo "  ✗ 그룹 없음"; fail=1; }

echo "▶ 4) 선생님 검색 href = /student/search(회귀 방지)"
# 선생님 이름/과목 매칭이 없을 수 있으니 존재 시에만 href 검증.
THREF=$(echo "$R2" | jq -r '((.data // .).groups.teacher // [])[0].href // "none"')
if [ "$THREF" = "none" ]; then echo "  · 선생님 히트 없음(스킵)"; else
  echo "  href=$THREF"
  [ "$THREF" = "/student/search" ] && echo "  ✓ 선생님 href 실경로" || { echo "  ✗ 선생님 href 미존재 경로!"; fail=1; }
fi

echo "▶ 5) 빈 검색어 → total 0(가드)"
R3=$(auth "$S1" "$API/search?q=$(enc '   ')")
T3=$(echo "$R3" | jq -r '(.data // .).total')
echo "  total=$T3"
[ "$T3" = "0" ] && echo "  ✓ 빈 검색 가드" || { echo "  ✗ 빈 검색 가드 실패"; fail=1; }

echo ""
[ "$fail" = 0 ] && echo "✅ 통합검색 E2E 전체 통과" || { echo "❌ 통합검색 E2E 실패"; exit 1; }
