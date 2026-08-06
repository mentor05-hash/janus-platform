#!/usr/bin/env bash
# 야누스 데모 공개 링크 생성기 — 로컬 스택을 cloudflared quick tunnel 로 외부에 연다.
# 링크를 받은 사람은 /demo 에서 회원을 고르기만 하면 아이디·비번이 채워진 채 바로 로그인된다.
#
# 사용:  bash ops/demo-public-link.sh          (스택 기동 + 터널 3개 + 링크 출력)
#        bash ops/demo-public-link.sh --stop   (터널만 종료 — 공개 즉시 차단)
#
# 주의(§4): 공개 URL 이므로 저작권 데이터(JANUS_DATA_DIR_HOST)는 일부러 마운트하지 않는다.
#           배치표 허브는 '준비 중'으로 보인다. 붙이려면 위험을 알고 직접 ENV 를 넘길 것.
# 주의: quick tunnel 은 프로세스가 살아있는 동안만 유효하고, 재실행하면 주소가 바뀐다.
set -euo pipefail

cd "$(dirname "$0")/.."
RUN_DIR="${TMPDIR:-/tmp}/janus-demo-tunnels"
COMPOSE=(docker compose -f docker-compose.full.yml)
export COMPOSE_PROJECT_NAME=janus-platform

if [[ "${1:-}" == "--stop" ]]; then
  # 이 스크립트가 연 포트만 정확히 종료 — 다른 용도의 cloudflared 는 건드리지 않는다.
  for p in 8080 8090 3100; do pkill -f "cloudflared tunnel --url http://localhost:$p" 2>/dev/null || true; done
  echo "✓ 터널 종료 — 외부 접속이 끊겼습니다(로컬 스택은 그대로 실행 중)."
  exit 0
fi

command -v cloudflared >/dev/null || { echo "✗ cloudflared 없음:  brew install cloudflared"; exit 1; }
mkdir -p "$RUN_DIR"

# ── 1) 스택 기동 ────────────────────────────────────────────────
echo "▸ 스택 기동…"
"${COMPOSE[@]}" up -d >/dev/null
for _ in $(seq 1 40); do
  [[ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/v1/health)" == "200" ]] && break
  sleep 2
done
curl -fsS http://localhost:3000/api/v1/health >/dev/null || { echo "✗ API 가 뜨지 않음 — docker compose logs api"; exit 1; }

# ── 1-2) 프런트 최신화 ──────────────────────────────────────────
# 호스트에서 빌드해 컨테이너에 넣는다 — docker build 보다 훨씬 빠르고, 작업 중인 워킹트리가
# 그대로 반영된다. 이 반영은 컨테이너 수명 동안만 유효하므로(up --force-recreate 하면 이미지의
# 산출물로 돌아감) 소스를 이미지에 굳히려면 `docker compose -f docker-compose.full.yml build
# web mobile` 을 따로 돌린다. --no-build 로 이 단계를 건너뛸 수 있음.
if [[ "${1:-}" != "--no-build" ]]; then
  echo "▸ 웹·모바일 빌드 후 컨테이너에 반영…"
  VITE_DEMO_MODE=true npm run build --workspace apps/web >/dev/null
  docker exec janus-platform-web-1 sh -c 'rm -rf /usr/share/nginx/html/*'
  docker cp apps/web/dist/. janus-platform-web-1:/usr/share/nginx/html/
  EXPO_PUBLIC_DEMO_MODE=true npm run export:web --workspace apps/mobile >/dev/null
  docker exec janus-platform-mobile-1 sh -c 'rm -rf /usr/share/nginx/html/*'
  docker cp apps/mobile/dist/. janus-platform-mobile-1:/usr/share/nginx/html/
fi

# ── 2) 터널 3개(웹·모바일·룸) ───────────────────────────────────
start_tunnel() {  # $1=포트 $2=로그이름 → 주소를 stdout 으로
  local port="$1" name="$2" log="$RUN_DIR/$2.log"
  pgrep -f "cloudflared tunnel --url http://localhost:$port" >/dev/null && pkill -f "cloudflared tunnel --url http://localhost:$port"
  : > "$log"
  nohup cloudflared tunnel --url "http://localhost:$port" >"$log" 2>&1 &
  for _ in $(seq 1 30); do
    local url; url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" | head -1)"
    [[ -n "$url" ]] && { echo "$url"; return 0; }
    sleep 1
  done
  echo "✗ $name 터널 주소를 못 받음 — $log 확인" >&2; return 1
}
echo "▸ 터널 개통…"
WEB_URL="$(start_tunnel 8080 web)"
MOBILE_URL="$(start_tunnel 8090 mobile)"
ROOMS_URL="$(start_tunnel 3100 rooms)"

# ── 3) 룸 공개 주소 반영 ────────────────────────────────────────
# 상담룸(채팅·보드·음성)은 브라우저가 직접 룸 서비스에 붙는다. 외부에서 localhost:3100 은
# 닿지 않으므로 API 가 발급하는 접속 주소를 룸 터널로 덮어쓴다(web 컨테이너는 건드리지 않음).
echo "▸ 상담룸 공개 주소 반영…"
ROOMS_PUBLIC_URL="$ROOMS_URL" "${COMPOSE[@]}" up -d api >/dev/null
for _ in $(seq 1 30); do
  [[ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/v1/health)" == "200" ]] && break
  sleep 2
done

# ── 4) 출력 ─────────────────────────────────────────────────────
cat <<EOF

================  야누스 공개 데모 링크  ================

● 이 주소 하나만 보내면 됩니다 — 회원 목록에서 고르면 바로 로그인
  $WEB_URL/demo

● 야누스 메인(랜딩)      $WEB_URL/
  평범한 로그인 화면       $WEB_URL/login
  모바일(학생·학부모)      $MOBILE_URL/

● 회원별 바로가기(누르면 로그인 화면을 안 거치고 진입)
EOF
# 관리자 콘솔 계정(admin01·hq01·master01·hr01)은 제외 — 데모 빌드가 이 계정들의
# 원터치/딥링크 진입을 막으므로 링크를 뿌려봐야 안 열린다(apps/web/src/auth/demoAccounts.ts).
for id in student01 paidall teacher01 guardian01; do
  printf '  %-11s %s/login?u=%s&p=dev-password%%21\n' "$id" "$WEB_URL" "$id"
done
cat <<EOF

● 모바일도 같은 방식(학생·학부모)
  student01   $MOBILE_URL/?u=student01&p=dev-password%21
  guardian01  $MOBILE_URL/?u=guardian01&p=dev-password%21

  전 계정 공통 비밀번호: dev-password!

● 끄기:  bash ops/demo-public-link.sh --stop      (스택까지 내리려면 ${COMPOSE[*]} down)
  터널 로그: $RUN_DIR
  주소는 이 터널 프로세스가 살아있는 동안만 유효합니다(재실행 시 변경).
EOF
