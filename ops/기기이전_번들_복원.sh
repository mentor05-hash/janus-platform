#!/usr/bin/env bash
# 기기이전 번들 복원 — 【신 기기(맥북프로)에서 실행】.
# 전제: janus-platform 은 이미 clone·checkout 됨(이 스크립트가 그 안에 있음).
#       번들(~/janus-migrate)이 AirDrop/rsync 로 도착해 있음.
# git 코드/문서는 clone 으로 복원되므로, 여기선 git '밖' 자산만 되돌린다.
#
# 사용:  bash ops/기기이전_번들_복원.sh
# 환경변수:
#   JANUS_HOME=~/janus   IN=~/janus-migrate   CPN=janus-platform
#   COMPOSE="docker compose -f docker-compose.full.yml"
set -uo pipefail

JANUS_HOME="${JANUS_HOME:-$HOME/janus}"
IN="${IN:-$HOME/janus-migrate}"
CPN="${CPN:-janus-platform}"
COMPOSE="${COMPOSE:-docker compose -f docker-compose.full.yml}"
export COMPOSE_PROJECT_NAME="$CPN"
PLAT="$(cd "$(dirname "$0")/.." && pwd)"

[ -d "$IN" ] || { echo "✗ 번들 폴더 없음: $IN (AirDrop 수신 위치 확인)"; exit 1; }
echo "▶ 복원 시작 — IN=$IN  JANUS_HOME=$JANUS_HOME  CPN=$CPN"

# ── 1) 저작권 데이터 먼저 복원(마운트 경로 확보) ──
for base in 20_data janus-data; do
  if [ -f "$IN/${base}.tgz" ]; then
    mkdir -p "$JANUS_HOME"
    tar xzf "$IN/${base}.tgz" -C "$JANUS_HOME" && echo "  ✓ $JANUS_HOME/$base 복원"
  fi
done

# ── 2) override.yml / .env 복원(없으면 override 생성 안내) ──
for f in .env .env.local docker-compose.override.yml; do
  [ -f "$IN/$f" ] && cp "$IN/$f" "$PLAT/" && echo "  ✓ $f 배치"
done
if [ ! -f "$PLAT/docker-compose.override.yml" ] && [ -d "$JANUS_HOME/20_data" ]; then
  cat > "$PLAT/docker-compose.override.yml" <<YAML
services:
  api:
    environment:
      JANUS_DATA_DIR: /data/janus
    volumes:
      - $JANUS_HOME/20_data:/data/janus:ro
YAML
  echo "  ✓ docker-compose.override.yml 생성(JANUS_DATA_DIR 마운트)"
fi

# ── 3) postgres 먼저 기동 → DB 복원(덤프 있으면) ──
if [ -f "$IN/db.sql" ]; then
  echo "▶ postgres 기동 후 DB 복원…"
  $COMPOSE up -d postgres
  for i in $(seq 1 20); do $COMPOSE exec -T postgres pg_isready -U janus >/dev/null 2>&1 && break; sleep 1; done
  $COMPOSE exec -T postgres psql -U janus -d janus < "$IN/db.sql" && echo "  ✓ DB 복원 완료"
else
  echo "  · db.sql 없음 — 신규 스키마+재시드 경로(런북 B-1 경로1)"
fi

# ── 4) 전체 스택 기동(마이그레이션 자동 적용) ──
echo "▶ 전체 스택 기동(빌드)…"
if [ -f "$PLAT/docker-compose.override.yml" ]; then
  $COMPOSE -f docker-compose.override.yml up -d --build
else
  $COMPOSE up -d --build
fi

# ── 5) 볼륨 복원(스택 up 으로 볼륨 생성된 뒤) ──
for v in "${CPN}_storage" "${CPN}_rooms_storage"; do
  if [ -f "$IN/${v}.tgz" ]; then
    docker volume inspect "$v" >/dev/null 2>&1 || docker volume create "$v" >/dev/null
    docker run --rm -v "$v":/d -v "$IN":/b alpine sh -c "cd /d && tar xzf /b/${v}.tgz" && echo "  ✓ 볼륨 $v 복원"
  fi
done

# ── 6) 터널 자격(수동 — 시크릿) ──
if [ -f "$IN/cloudflared.tgz" ]; then
  echo "  · 터널 자격 발견 — 수동 복원 권장:  tar xzf $IN/cloudflared.tgz -C \$HOME  후  cloudflared tunnel run <이름>"
fi

echo ""
echo "▶ 헬스체크"
sleep 3
curl -s http://localhost:3000/api/v1/health || echo "(api 기동 대기 — 잠시 후 재확인)"
echo ""
echo "  허브: curl -s http://localhost:3000/api/v1/placement-hub/list"
echo "  화면: open http://localhost:8080"
echo ""
echo "✅ 복원 흐름 완료. 검증 통과 후 구 기기 스택 down(‼ down -v 금지) + 번들 삭제(PII)."
