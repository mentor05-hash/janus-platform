# @mentoring/rooms-client

실시간 룸 서비스(`apps/realtime-rooms`)용 **프레임워크 무관 클라이언트 SDK**.
socket.io를 래핑해 채팅·화이트보드·음성 API와 타입 이벤트를 제공합니다. React/RN/바닐라 어디서든 사용.

## 사용
```ts
import { createRoomClient } from '@mentoring/rooms-client';

// token 은 호스트 백엔드가 룸 프로비저닝(POST /rooms) 후 참가자에게 전달.
const client = createRoomClient({ url: 'https://rt.example.com', token });

client.on('message', (m) => render(m));
client.on('presence', ({ online }) => setOnline(online));
client.on('sessionClosed', () => setReadOnly(true));   // 시간창 종료(강제)
client.on('sessionRevoked', () => leave());            // 토큰 폐기

const { features, session, messages } = await client.join();
await client.sendMessage({ body: '안녕하세요', replyToId });
await client.react(messageId, '👍');
const older = await client.loadHistory({ before: nextCursor, limit: 30 }); // 무한 스크롤

// 화이트보드
await client.wbJoin();
await client.wbStroke(stroke, sid);
client.on('wbStroke', ({ stroke }) => draw(stroke));

// 음성(WebRTC 시그널만 중계 — PeerConnection 은 앱에서)
await client.callJoin();
await client.callSignal('offer', offer);
client.on('callSignal', ({ from, kind, data }) => handle(kind, data));

// 첨부
const { fileUrl } = await client.uploadFile(blob, 'note.pdf');
await client.sendMessage({ kind: 'file', fileUrl, body: 'note.pdf' });
const src = client.fileUrl(fileUrl); // <img src> / 다운로드용 절대 URL(토큰 포함)
```

## API 요약
- **수명주기**: `connect()` / `disconnect()` / `connected` / `join()`
- **채팅**: `sendMessage` · `react` · `setTyping` · `markRead` · `loadHistory`
- **화이트보드**: `wbJoin` · `wbStroke` · `wbStrokePartial` · `wbImage` · `wbClear` · `wbSave`
- **음성**: `callJoin` · `callSignal` · `callLeave`
- **첨부**: `uploadFile` · `fileUrl`
- **이벤트**(`on`/`off`): `connect` · `disconnect` · `error` · `message` · `reaction` · `read` · `typing` · `presence` · `sessionClosed` · `sessionRevoked` · `wbStroke` · `wbStrokePartial` · `wbImage` · `wbClear` · `callSignal` · `callPeerJoin` · `callPeerLeave`

재연결은 socket.io 가 자동 처리(끊기면 재접속 후 `join()` 재호출 권장).

## 빌드/테스트
```bash
npm run build --workspace packages/rooms-client   # tsc → dist
node packages/rooms-client/test/smoke.mjs          # 실행 중인 :3100 대상 스모크
```
