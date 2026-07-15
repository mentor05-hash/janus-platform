#!/usr/bin/env bash
# 합성 데모 허브 셋업 — 【맥북(신 기기)에서 repo 루트에서 실행】.
# 저작권 실데이터 없이 배치표 허브를 실동작(available:true)시킨다.
#   ① docker-compose.override.yml 생성(JANUS_DATA_DIR 마운트, 이미 있으면 보존)
#   ② gen_demo_hub.py 로 합성 HTML + targets.json 생성(실파일은 절대 안 덮음)
#   ③ api 재기동 → list·targets·무료파일 검증
# 실데이터 도착 시: 같은 파일명으로 덮어쓰면 됨(이 스크립트가 만든 합성물엔 DEMO 마커가 있어 교체 안전).
#
# 사용:  bash ops/placement/setup-demo-hub.sh
# 환경변수:  JANUS_HOME=~/janus  CPN=itall-mentoring
set -uo pipefail

JANUS_HOME="${JANUS_HOME:-$HOME/janus}"
DATA_DIR="${JANUS_DATA_DIR_HOST:-$JANUS_HOME/20_data}"
CPN="${CPN:-itall-mentoring}"
COMPOSE="docker compose -f docker-compose.full.yml"
export COMPOSE_PROJECT_NAME="$CPN"
PLAT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PLAT"

[ -d "$DATA_DIR/placement-hub" ] || { echo "✗ $DATA_DIR/placement-hub 없음 — 20_data 위치 확인"; exit 1; }

echo "▶ ① override 확인/생성 (JANUS_DATA_DIR 마운트)"
OVR="$PLAT/docker-compose.override.yml"
if [ -f "$OVR" ] && grep -q "JANUS_DATA_DIR" "$OVR"; then
  echo "  · 기존 override 보존: $OVR"
else
  cat > "$OVR" <<YAML
services:
  api:
    environment:
      JANUS_DATA_DIR: /data/janus
    volumes:
      - $DATA_DIR:/data/janus:ro
YAML
  echo "  ✓ 생성: $OVR (→ $DATA_DIR 마운트)"
fi

echo "▶ ② 합성 데이터 생성"
python3 "$PLAT/ops/placement/gen_demo_hub.py" "$DATA_DIR" || { echo "✗ 생성 실패"; exit 1; }

echo "▶ ③ api 재기동(override 적용)"
$COMPOSE -f docker-compose.override.yml up -d api
echo "  · api 헬스 대기…"
for i in $(seq 1 30); do
  curl -sf http://localhost:3000/api/v1/health >/dev/null 2>&1 && break || sleep 1
done

echo "▶ 검증"
echo -n "  list: "; curl -s http://localhost:3000/api/v1/placement-hub/list | head -c 400; echo
echo -n "  free file(gap-report) HTTP: "
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:3000/api/v1/placement-hub/file/gap-report"

# targets 는 로그인(회원+) 필요 — student01 로 토큰 받아 확인
TOK=$(curl -s -X POST http://localhost:3000/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"loginId":"student01","password":"dev-password!"}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('data',{}).get('accessToken',''))" 2>/dev/null)
if [ -n "$TOK" ]; then
  echo -n "  targets(jeongsi): "; curl -s -H "Authorization: Bearer $TOK" "http://localhost:3000/api/v1/placement-hub/targets?mode=jeongsi" | head -c 300; echo
  echo -n "  targets(susi):    "; curl -s -H "Authorization: Bearer $TOK" "http://localhost:3000/api/v1/placement-hub/targets?mode=susi" | head -c 300; echo
else
  echo "  · student01 토큰 실패 — targets 는 웹에서 확인"
fi

echo ""
echo "✅ 데모 허브 준비 완료."
echo "   웹: open http://localhost:8080/placement/hub   (격차: /placement/gap)"
echo "   ⚠ 각 표에 '데모(합성) 데이터' 배너 표시 — 실데이터 아님. 공개 터널로 노출 금지(C6)."
