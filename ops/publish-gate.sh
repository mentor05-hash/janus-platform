#!/usr/bin/env bash
# 무료판 공개 게이트 — 정적 산출물을 공개하기 **전에** 반드시 통과해야 하는 기계 검사.
#   사용: ./ops/publish-gate.sh <공개할_디렉터리>
#   예)  ./ops/publish-gate.sh public-dist
#
# 왜 스크립트인가: 점검표(docs/20_exec/무료판_배포_전_점검표_v1_2026-07-26.md)의
#   §1-1(회원 이상 데이터 물리 부재)·§2(면책)·§3(워터마크)는 사람이 매번 눈으로 확인하면
#   반드시 한 번은 빠뜨린다. 기계가 막을 수 있는 항목은 기계가 막는다.
#   통과하지 못하면 종료코드 1 — 배포 스크립트·CI 가 여기서 멈춘다.
#
# 한계(정직하게): 이 게이트는 **문자열 수준** 검사다. 데이터가 난독화·인코딩되어 들어가면
#   잡지 못한다. 점검표의 사람 판정(§3-3 워터마크 제거 난이도, §5-1 네트워크 탭 등)을 대체하지 않는다.
set -uo pipefail
DIR="${1:-}"
[ -n "$DIR" ] || { echo "usage: $0 <공개할_디렉터리>"; exit 1; }
[ -d "$DIR" ] || { echo "✖ 디렉터리 없음: $DIR"; exit 1; }

FAIL=0
ok()   { echo "  ✓ $1"; }
bad()  { echo "  ✖ $1"; FAIL=1; }
warn() { echo "  ⚠ $1"; }

HTML_COUNT=$(find "$DIR" -type f -name '*.html' | wc -l | tr -d ' ')
echo "[gate] 대상: $DIR (HTML ${HTML_COUNT}개)"
[ "$HTML_COUNT" -gt 0 ] || { echo "✖ HTML 산출물이 없습니다 — 공개할 것이 없음"; exit 1; }

# ── 1. 구 브랜드 잔재 (잇올) ─────────────────────────────────────────
# 공개 순간 구 브랜드가 노출되면 브랜드 전환 자체가 무의미해진다.
if grep -rlq "잇올" "$DIR" 2>/dev/null; then
  bad "구 브랜드 '잇올' 이 산출물에 남아 있습니다: $(grep -rl '잇올' "$DIR" | head -3 | tr '\n' ' ')"
else
  ok "구 브랜드 잔재 없음"
fi

# ── 2. 회원 이상 티어 데이터 물리 부재 (점검표 §1-1) ────────────────
# '가려두기'(display:none·JS 분기)는 뷰소스로 열람되므로 통과가 아니다 → 문자열 자체가 없어야 한다.
LEAK_KEYS=(
  "gbias"            # 보정 계수 — 원본 컷 역산 가능
  "relTier"          # 상대 티어 배지(회원 이상)
  "원본컷" "원본_컷"
  "실측컷" "실측_컷"
  "member_only" "paid_only" "consultant_only"
)
LEAKED=""
for k in "${LEAK_KEYS[@]}"; do
  if grep -rlq -- "$k" "$DIR" 2>/dev/null; then LEAKED="$LEAKED $k"; fi
done
if [ -n "$LEAKED" ]; then
  bad "회원 이상 데이터 키가 무료판에 존재합니다 →$LEAKED"
  echo "     (CSS·JS 로 숨기는 것으로는 통과할 수 없습니다 — 산출 단계에서 제외해야 합니다)"
else
  ok "회원 이상 데이터 키 물리 부재"
fi

# 티어 빌드 산출물이 섞여 들어왔는지
if find "$DIR" -type d \( -name member -o -name paid -o -name consultant \) | grep -q .; then
  bad "회원 이상 티어 디렉터리가 공개 대상에 포함됐습니다"
else
  ok "티어 디렉터리 혼입 없음"
fi

# ── 3. 예측 면책 고지 — 전 화면 (점검표 §2-1) ───────────────────────
MISSING_DISC=""
while IFS= read -r f; do
  grep -q "면책\|보장하지 않\|참고용" "$f" 2>/dev/null || MISSING_DISC="$MISSING_DISC $(basename "$f")"
done < <(find "$DIR" -type f -name '*.html')
if [ -n "$MISSING_DISC" ]; then
  bad "면책 고지가 없는 화면:$MISSING_DISC"
else
  ok "면책 고지 전 화면 존재"
fi

# ── 4. 워터마크·재배포 금지 (점검표 §3) ─────────────────────────────
MISSING_WM=""
while IFS= read -r f; do
  grep -q "워터마크\|watermark\|재배포" "$f" 2>/dev/null || MISSING_WM="$MISSING_WM $(basename "$f")"
done < <(find "$DIR" -type f -name '*.html')
if [ -n "$MISSING_WM" ]; then
  bad "워터마크·재배포 금지 표기가 없는 화면:$MISSING_WM"
else
  ok "워터마크·재배포 금지 표기 존재"
fi

# ── 5. 무료 노출 수 상한 (점검표 §1-2 · N24) ────────────────────────
# 정책 단일 소스와 대조. 산출물이 정책을 어겼는지는 생성기가 보장하지만, 정책 파일 자체의
# 안전선 이탈을 여기서 한 번 더 막는다(누군가 config 를 올려놓고 잊는 것을 방지).
POLICY="tier-policy.config.json"
if [ -f "$POLICY" ]; then
  N=$(node -e "process.stdout.write(String(require('./$POLICY').freeExposure.perBandItems))" 2>/dev/null || echo "")
  MASK=$(node -e "process.stdout.write(String(require('./$POLICY').freeExposure.maskNumbers))" 2>/dev/null || echo "")
  if [ -n "$N" ] && [ "$N" -le 5 ] 2>/dev/null; then ok "무료 노출 수 정책 $N 개/구간 (안전선 5 이내)"
  else bad "무료 노출 수 정책이 안전선(5)을 넘거나 읽을 수 없습니다: '$N'"; fi
  [ "$MASK" = "true" ] && ok "원본 수치 마스킹 켜짐" || bad "원본 수치 마스킹이 꺼져 있습니다 — 법률 회신 근거가 필요합니다"
else
  bad "$POLICY 을 찾을 수 없습니다(repo 루트에서 실행하세요)"
fi

# ── 6. 시크릿·내부 자산 혼입 ────────────────────────────────────────
if grep -rlqE "sk-ant-[a-zA-Z0-9]|JWT_SECRET|postgres(ql)?://[^:@]+:[^@]+@" "$DIR" 2>/dev/null; then
  bad "시크릿으로 보이는 문자열이 공개 대상에 있습니다"
else
  ok "시크릿 혼입 없음"
fi
if find "$DIR" -name '.env*' -o -name '*.sql' -o -name '*.sql.gz' | grep -q .; then
  bad "환경파일·DB 덤프가 공개 대상에 포함됐습니다"
else
  ok "환경파일·덤프 없음"
fi

echo ""
if [ "$FAIL" -ne 0 ]; then
  echo "✖ 공개 게이트 실패 — 배포를 중단합니다."
  echo "  점검표: docs/20_exec/무료판_배포_전_점검표_v1_2026-07-26.md"
  exit 1
fi
echo "✓ 공개 게이트 통과(기계 검사분). 사람 판정 항목은 점검표에서 별도로 기록하세요."
