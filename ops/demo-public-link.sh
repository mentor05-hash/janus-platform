#!/usr/bin/env bash
# 야누스 데모 공개 운영 스크립트 — 스택을 띄우고 프런트를 최신화한 뒤 공개 주소를 안내한다.
#
# 공개 경로는 **Cloudflare 명명된 터널(ianuspath.com)**이 기본이다(2026-08-08 전환).
#   https://demo.ianuspath.com        :8080 웹   ← /demo 가 체험 입구
#   https://demo-m.ianuspath.com      :8090 모바일
#   https://demo-rooms.ianuspath.com  :3100 룸  (= .env 의 ROOMS_PUBLIC_URL)
# 터널은 launchd(com.janus.cloudflared)가 로그인 시 자동 기동한다. 경로는 ~/.cloudflared/config.yml.
#
# ⚠ 서브도메인은 **한 단계만** 쓴다(demo-m, demo-rooms). Cloudflare 무료 인증서의 와일드카드가
#   *.ianuspath.com 한 단계까지라 m.demo.ianuspath.com 같은 2단계는 TLS 가 끊긴다(실측 2026-08-08).
#
# 사용:
#   bash ops/demo-public-link.sh                 스택 기동 + 프런트 최신화 + 공개 상태 출력
#   bash ops/demo-public-link.sh --no-build      프런트 빌드 건너뛰기
#   bash ops/demo-public-link.sh --quick-tunnel  (예외) cloudflared 임시 터널 3개 추가 개통
#   bash ops/demo-public-link.sh --stop-quick    임시 터널만 종료(고정 주소는 유지)
#
# ⚠ --quick-tunnel 은 ROOMS_PUBLIC_URL 을 임시 주소로 덮어써 api 를 재기동한다 →
#   고정 룸 주소가 깨진다. 원복하려면 이 스크립트를 옵션 없이 다시 실행할 것.
#   명명된 터널을 못 쓰는 자리에서만 쓰는 예외 경로다.
#
# 데이터: 배치표 허브는 docker-compose.hub.yml 로 20_data/placement-hub 하위만 읽기전용 마운트
#   (CLAUDE.md §4 — raw·internal·dist_restricted 는 컨테이너에 넣지 않는다).
set -euo pipefail

cd "$(dirname "$0")/.."
RUN_DIR="${TMPDIR:-/tmp}/janus-demo-tunnels"
COMPOSE=(docker compose -f docker-compose.full.yml -f docker-compose.hub.yml)
FIXED_WEB="https://demo.ianuspath.com"
FIXED_MOBILE="https://demo-m.ianuspath.com"
export COMPOSE_PROJECT_NAME=janus-platform

MODE="${1:-}"

if [[ "$MODE" == "--stop-quick" ]]; then
  # 이 스크립트가 연 포트만 정확히 종료 — 다른 용도의 cloudflared 는 건드리지 않는다.
  for p in 8080 8090 3100; do pkill -f "cloudflared tunnel --url http://localhost:$p" 2>/dev/null || true; done
  echo "✓ 임시 터널 종료. 고정 주소($FIXED_WEB)는 그대로입니다."
  echo "  룸 주소를 고정값으로 되돌리려면: bash ops/demo-public-link.sh"
  exit 0
fi

# ── 1) 스택 기동 ────────────────────────────────────────────────
echo "▸ 스택 기동…"
mkdir -p janus-data/placement-hub          # hub 오버레이가 겹쳐 붙을 마운트지점
"${COMPOSE[@]}" up -d >/dev/null
for _ in $(seq 1 40); do
  [[ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/v1/health)" == "200" ]] && break
  sleep 2
done
curl -fsS http://localhost:3000/api/v1/health >/dev/null || { echo "✗ API 가 뜨지 않음 — docker compose logs api"; exit 1; }

# ── 2) 프런트 최신화 ────────────────────────────────────────────
# 호스트에서 빌드해 컨테이너에 넣는다 — docker build 보다 훨씬 빠르고, 작업 중인 워킹트리가
# 그대로 반영된다. 이 반영은 컨테이너 수명 동안만 유효하므로(up --force-recreate 하면 이미지의
# 산출물로 돌아감) 소스를 이미지에 굳히려면 `"${COMPOSE[@]}" build web mobile` 을 따로 돌린다.
if [[ "$MODE" != "--no-build" ]]; then
  echo "▸ 웹·모바일 빌드 후 컨테이너에 반영…"
  VITE_DEMO_MODE=true npm run build --workspace apps/web >/dev/null
  docker exec janus-platform-web-1 sh -c 'rm -rf /usr/share/nginx/html/*'
  docker cp apps/web/dist/. janus-platform-web-1:/usr/share/nginx/html/
  EXPO_PUBLIC_DEMO_MODE=true npm run export:web --workspace apps/mobile >/dev/null
  docker exec janus-platform-mobile-1 sh -c 'rm -rf /usr/share/nginx/html/*'
  docker cp apps/mobile/dist/. janus-platform-mobile-1:/usr/share/nginx/html/
fi

# ── 3) 예외 경로 — 임시 터널 ────────────────────────────────────
if [[ "$MODE" == "--quick-tunnel" ]]; then
  command -v cloudflared >/dev/null || { echo "✗ cloudflared 없음:  brew install cloudflared"; exit 1; }
  mkdir -p "$RUN_DIR"
  start_tunnel() {  # $1=포트 $2=로그이름 → 주소를 stdout 으로
    local port="$1" name="$2" log="$RUN_DIR/$2.log"
    pkill -f "cloudflared tunnel --url http://localhost:$port" 2>/dev/null || true
    : > "$log"
    nohup cloudflared tunnel --url "http://localhost:$port" >"$log" 2>&1 &
    for _ in $(seq 1 30); do
      local url; url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" | head -1)"
      [[ -n "$url" ]] && { echo "$url"; return 0; }
      sleep 1
    done
    echo "✗ $name 터널 주소를 못 받음 — $log 확인" >&2; return 1
  }
  echo "▸ 임시 터널 개통…"
  Q_WEB="$(start_tunnel 8080 web)"; Q_MOBILE="$(start_tunnel 8090 mobile)"; Q_ROOMS="$(start_tunnel 3100 rooms)"
  echo "▸ 상담룸 주소를 임시 터널로 덮어쓰는 중(고정 룸 주소는 이때 깨집니다)…"
  ROOMS_PUBLIC_URL="$Q_ROOMS" "${COMPOSE[@]}" up -d api >/dev/null
  for _ in $(seq 1 30); do
    [[ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/v1/health)" == "200" ]] && break
    sleep 2
  done
  echo
  echo "● 임시 주소(프로세스가 사는 동안만·재실행 시 변경)"
  echo "  웹      $Q_WEB/demo"
  echo "  모바일   $Q_MOBILE/"
  echo "  끄기     bash ops/demo-public-link.sh --stop-quick"
fi

# ── 4) 공개 상태 출력 ───────────────────────────────────────────
echo
echo "================  야누스 공개 데모  ================"
echo
echo "● 이 주소 하나만 보내면 됩니다 — 회원 목록에서 고르면 바로 로그인"
echo "  $FIXED_WEB/demo"
echo
echo "● 야누스 메인(랜딩)   $FIXED_WEB/"
echo "  평범한 로그인 화면    $FIXED_WEB/login"
echo "  모바일(학생·학부모)   $FIXED_MOBILE/"
echo
echo "● 회원별 바로가기(누르면 로그인 화면을 안 거치고 진입)"
# 관리자 콘솔 계정(admin01·hq01·master01·hr01)은 제외 — 데모 빌드가 이 계정들의
# 원터치/딥링크 진입을 막으므로 링크를 뿌려봐야 안 열린다(apps/web/src/auth/demoAccounts.ts).
for id in student01 paidall teacher01 guardian01; do
  printf '  %-11s %s/login?u=%s&p=dev-password%%21\n' "$id" "$FIXED_WEB" "$id"
done
echo
echo "  위 체험 계정 공통 비밀번호: dev-password!"
# 값은 보통 셸이 아니라 루트 .env 에 있다 — 거기까지 봐야 거짓 경보가 안 난다.
if [ -z "${JANUS_DEMO_ADMIN_PW:-}" ] && [ -f .env ]; then
  JANUS_DEMO_ADMIN_PW="$(sed -n 's/^JANUS_DEMO_ADMIN_PW=//p' .env | head -1)"
fi
if [ -n "${JANUS_DEMO_ADMIN_PW:-}" ]; then
  echo "  관리자 계열(admin01·hq01·master01·hr01)은 분리 비번으로 시드됨 — 공통 비번으로 열리지 않는다."
else
  echo "  ⚠ 관리자 계열(admin01·hq01·master01·hr01)도 같은 공개 비번이다 — 공개 주소라면"
  echo "     JANUS_DEMO_ADMIN_PW 를 주고 재시드할 것(apps/api/src/config/demo-admin-accounts.ts)."
fi
echo
echo "● 터널 상태"
# 파이프로 바로 grep -q 하지 않는다 — 첫 매치에서 grep 이 끝나며 상대가 SIGPIPE 로 죽고,
# set -o pipefail 이 그걸 실패로 잡아 살아있는데도 죽은 것처럼 보고한다(과거 실측 버그).
if pgrep -f "cloudflared tunnel run janus-demo" >/dev/null; then
  echo "  ✓ cloudflared janus-demo 실행 중 (launchd: com.janus.cloudflared)"
  # 호스트마다 살아있음을 보여주는 경로가 다르다 — 룸 서비스는 `/` 에 라우트가 없어
  # 404 가 정상이므로 헬스 경로를 찔러야 오해가 없다.
  for probe in "demo.ianuspath.com|/demo" "demo-m.ianuspath.com|/" "demo-rooms.ianuspath.com|/api/rt/v1/health"; do
    h="${probe%%|*}"; path="${probe##*|}"
    printf '    %-26s %-22s %s\n' "$h" "$path" "$(curl -s -o /dev/null -m 15 -w '%{http_code}' "https://$h$path" || echo '---')"
  done
else
  echo "  ✗ 터널이 꺼져 있습니다 — 브랜드 주소가 응답하지 않습니다."
  echo "    launchctl load ~/Library/LaunchAgents/com.janus.cloudflared.plist"
fi
echo
echo "● 공개 중단:  launchctl unload ~/Library/LaunchAgents/com.janus.cloudflared.plist"
echo "  ⚠ 맥이 꺼지거나 잠들면 주소도 죽습니다. Docker 스택도 떠 있어야 합니다(없으면 502)."
