# realtime-rooms — 화이트라벨 실시간 룸 서비스

채팅 · 화이트보드 · 음성(WebRTC 시그널링)을 **하나의 룸**으로 묶어 제공하는 **독립 서비스**입니다.
예약/멘토링 같은 특정 도메인에 묶이지 않고, **어떤 호스트 앱이든** 룸을 만들고 참가자 토큰을 받아 붙일 수 있습니다.

## 왜 독립인가
- 자체 데이터 저장(`rooms` 스키마 — 실서비스는 전용 DB). 호스트 DB를 읽지 않음.
- 자체 인증: 서버-투-서버 **API 키**(프로비저닝) + 참가자별 **룸 토큰**(소켓 접속).
- 시간창·기능 플래그는 **룸 생성 시 주입** → 도메인 규칙(예: 예약 시작 5분 전~종료 5분 후)은 호스트가 계산해 넘김.
- socket.io + Redis 어댑터로 수평 확장.

## 통합 흐름 (호스트 앱 관점)
```
[호스트 백엔드] --(1) POST /rooms (API 키)--> [realtime-rooms] --> { roomId, participants:[{participantId, token}] }
[호스트 프론트] --(2) 소켓 접속 (룸 토큰) --> [realtime-rooms]  (채팅/필기/음성)
```

### 1) 룸 생성 (서버-투-서버)
```http
POST /api/rt/v1/rooms
x-api-key: <ROOMS_API_KEY>
{
  "externalRef": "booking-123",              // 호스트 참조(상관관계용, 선택)
  "features": { "chat": true, "whiteboard": true, "voice": true },
  "opensAt": "2026-07-04T09:55:00Z",         // 둘 다 있으면 시간창 제한(강제 종료). 생략 시 무제한.
  "closesAt": "2026-07-04T10:35:00Z",
  "tokenTtlSec": 43200,
  "participants": [
    { "extUserId": "student-1", "displayName": "학생" },
    { "extUserId": "teacher-1", "displayName": "선생님" }
  ]
}
→ 200 { roomId, features, opensAt, closesAt, participants:[{ participantId, extUserId, token }] }
```
호스트는 각 참가자에게 자신의 `token`을 전달합니다.

### 2) 소켓 접속 (참가자)
```js
const s = io(ROOMS_URL, { path: '/api/rt/v1/socket.io', auth: { token } });
s.emit('join', {}, (r) => { /* r.features, r.session, r.messages */ });
```
> 토큰이 룸·참가자를 고정하므로 클라이언트는 roomId를 보낼 필요가 없습니다(서버가 토큰 값만 신뢰).

## 소켓 이벤트
| 이벤트 | 방향 | 설명 |
|---|---|---|
| `join` | C→S(ack) | 입장. `{ features, session, messages }` 반환 + 읽음 처리 |
| `chat:send` | C→S(ack) | `{ body?, fileUrl?, kind?, replyToId? }` → 방에 `chat:message` |
| `chat:react` | C→S(ack) | `{ messageId, emoji }` → 방에 `chat:reaction` |
| `chat:typing` / `chat:read` | C↔S | 입력중 / 읽음 |
| `wb:join` | C→S(ack) | `{ strokes, backgroundUrl, session }` |
| `wb:stroke` / `wb:stroke:partial` / `wb:image` / `wb:clear` / `wb:save` | C↔S | 필기 중계·스냅샷 저장 |
| `call:join` / `call:signal` / `call:leave` | C↔S | WebRTC offer/answer/ICE 중계 |

## 게이팅(서버 강제)
- **시간창**: `opensAt`~`closesAt` 밖의 쓰기(chat/wb/call)는 `{ ok:false, closed:true }`로 거부. `join`은 허용 → **종료 후 기록 열람 가능**. (`opensAt`/`closesAt` 미지정 = 무제한)
- **기능 플래그**: `features.{chat|whiteboard|voice}=false` 면 해당 기능 거부.

## REST
| 메서드 | 경로 | 인증 | 용도 |
|---|---|---|---|
| GET | `/api/rt/v1/health` | 공개 | 헬스체크 |
| POST | `/api/rt/v1/rooms` | API 키 | 룸 생성 + 토큰 발급 |
| GET | `/api/rt/v1/rooms/:id?viewer=<pid>` | API 키 | 룸 메타 + 기록(종료 후 열람) |
| POST | `/api/rt/v1/rooms/:id/tokens` | API 키 | 참가자 토큰 재발급 |

## 환경변수
| 키 | 기본 | 설명 |
|---|---|---|
| `PORT` | 3100 | 서버 포트 |
| `ROOMS_DATABASE_URL` | — | PostgreSQL(전용 DB 권장). 로컬은 `rooms` 스키마 격리 |
| `ROOMS_JWT_SECRET` | dev값 | 룸 토큰 서명 시크릿 |
| `ROOMS_API_KEY` | dev값 | 프로비저닝 API 키(서버-투-서버) |
| `REDIS_URL` / `WS_REDIS_ADAPTER` | — / 0 | 다중 인스턴스 확장 시 |

## 로컬 실행
```bash
ROOMS_DATABASE_URL=postgresql://itall:itall_local_pw@localhost:5432/itall node scripts/apply-migrations.mjs
ROOMS_DATABASE_URL=... ROOMS_JWT_SECRET=... ROOMS_API_KEY=... PORT=3100 node dist/main.js
# 또는: docker compose -f docker-compose.full.yml up -d realtime-rooms  (→ :3100)
```

## 아직 안 된 것(다음 단계)
- **임베드 클라이언트 SDK/위젯**: 웹의 `ChatPanel`/`WhiteboardPanel` 로직을 `roomUrl + token` 파라미터로 패키징(현재 멘토링 앱에 인라인).
- **호스트 어댑터**: 멘토링 API의 `realtime` 모듈을 이 서비스 호출로 대체(현재는 공존).
- **첨부 스토리지**: 현재 `fileUrl`은 호스트 제공 URL. 자체 업로드/스토리지는 미포함.
- **관리/과금**: 테넌트·요금·사용량 집계.
