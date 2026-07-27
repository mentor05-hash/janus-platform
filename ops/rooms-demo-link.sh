#!/usr/bin/env bash
# 내부 툴(채팅·화이트보드) 점검용 데모 링크 생성기.
# 룸 서비스(:3100)에 룸 2개(채팅/화이트보드)를 프로비저닝하고, 참가자 토큰으로
# 웹 클라이언트(/room)의 바로열기 링크를 출력한다. 로그인·예약 없이 접속 가능.
#
# 사용:  bash ops/rooms-demo-link.sh
# 전제:  로컬 스택 기동 상태(web :8080, realtime-rooms :3100). python3 필요(맥 기본 포함).
set -euo pipefail

ROOMS="${ROOMS_URL:-http://localhost:3100}"   # 브라우저가 접속할 룸 서비스 공개 URL
WEB="${WEB_URL:-http://localhost:8080}"       # 웹앱(관문)
KEY="${ROOMS_API_KEY:-dev-rooms-api-key}"     # 서버-투-서버 프로비저닝 키(로컬 기본값)

# 룸 서비스 헬스 먼저 확인
if ! curl -fsS "$ROOMS/api/rt/v1/health" >/dev/null 2>&1; then
  echo "✗ 룸 서비스에 연결 불가: $ROOMS  — 스택이 떠있는지 확인하세요(docker compose ps realtime-rooms)"; exit 1
fi

mkroom() {  # $1=externalRef $2=features(json) $3=mode  → JSON 응답
  curl -fsS -X POST "$ROOMS/api/rt/v1/rooms" \
    -H "content-type: application/json" -H "x-api-key: $KEY" \
    -d "{\"externalRef\":\"$1\",\"features\":$2,\"mode\":\"$3\",\"participants\":[
          {\"extUserId\":\"demo-teacher\",\"displayName\":\"선생님\",\"role\":\"teacher\"},
          {\"extUserId\":\"demo-student\",\"displayName\":\"학생\",\"role\":\"student\"}]}"
}

CHAT_JSON="$(mkroom demo-chat  '{"chat":true,"whiteboard":false,"voice":false}' session)"
WB_JSON="$(mkroom   demo-board '{"chat":true,"whiteboard":true,"voice":false}'  session)"

# python3 로 토큰 추출 + URL 조립(선생님/학생 각각).
python3 - "$WEB" "$ROOMS" "$CHAT_JSON" "$WB_JSON" <<'PY'
import json, sys, urllib.parse as u
web, rooms, chat, wb = sys.argv[1], sys.argv[2], json.loads(sys.argv[3]), json.loads(sys.argv[4])
def link(kind, title, tok):
    q = u.urlencode({'url': rooms, 'token': tok, 'kind': kind, 'title': title})
    return f"{web}/room?{q}"
def by(room, role): return next(p for p in room['participants'] if p['token'] and (role in (p.get('displayName') or '')))
print("\n================  내부 툴 점검 링크  ================\n")
print("● 채팅(Chat)  — 두 탭/두 창으로 각각 열면 실시간 대화 확인")
print("  선생님:", link('chat','데모 채팅', by(chat,'선생님')['token']))
print("  학생  :", link('chat','데모 채팅', by(chat,'학생')['token']))
print("\n● 화이트보드(Whiteboard) — 한쪽에서 그리면 다른쪽에 실시간 반영")
print("  선생님:", link('whiteboard','데모 화이트보드', by(wb,'선생님')['token']))
print("  학생  :", link('whiteboard','데모 화이트보드', by(wb,'학생')['token']))
print("\n(토큰 기본 만료 12시간. 다시 필요하면 스크립트 재실행.)")
print("====================================================\n")
PY
