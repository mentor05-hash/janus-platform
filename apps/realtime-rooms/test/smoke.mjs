// realtime-rooms 스모크 E2E — 실행 중인 서비스(기본 :3100) 대상.
//   node test/smoke.mjs   또는   npm run test:e2e --workspace apps/realtime-rooms
// socket.io-client 는 모노레포 루트 node_modules 에서 해석되므로 루트에서 실행 권장.
import { io } from 'socket.io-client';

const BASE = process.env.ROOMS_BASE || 'http://localhost:3100';
const API = process.env.ROOMS_API_KEY || 'dev-rooms-api-key';
const R = []; const ok = (n, c, d = '') => { R.push(c); console.log(`${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
const req = async (method, path, body, key = API) => {
  const h = { 'content-type': 'application/json' }; if (key) h['x-api-key'] = key;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* no body */ }
  return { status: r.status, body: j };
};
const conn = (token) => io(BASE, { path: '/api/rt/v1/socket.io', auth: { token }, transports: ['websocket'], forceNew: true });
const emit = (s, ev, p = {}) => new Promise((res) => s.emit(ev, p, res));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const parts = () => [{ extUserId: 'u1', displayName: '학생' }, { extUserId: 'u2', displayName: '선생님' }];
const mk = (opts) => req('POST', '/api/rt/v1/rooms', { participants: parts(), ...opts }).then((r) => r.body);

// 1) 헬스 + 인증 + 입력검증
{
  const h = await req('GET', '/api/rt/v1/health', null, null);
  ok('health: DB 연결 확인', h.body?.status === 'ok' && h.body?.checks?.db === 'up', JSON.stringify(h.body));
  ok('API 키 없으면 401', (await req('POST', '/api/rt/v1/rooms', {}, null)).status === 401);
  ok('참가자 없으면 400', (await req('POST', '/api/rt/v1/rooms', { participants: [] })).status === 400);
  ok('opensAt 만 있으면 400', (await req('POST', '/api/rt/v1/rooms', { participants: parts(), opensAt: new Date().toISOString() })).status === 400);
  const now = Date.now();
  ok('opensAt>=closesAt 이면 400', (await req('POST', '/api/rt/v1/rooms', { participants: parts(), opensAt: new Date(now + 1000).toISOString(), closesAt: new Date(now).toISOString() })).status === 400);
}

// 2) OPEN 룸 — 채팅/답장/반응 + presence + 화이트보드 + 음성
{
  const now = Date.now();
  const room = await mk({ externalRef: 'booking-xyz', opensAt: new Date(now - 60000).toISOString(), closesAt: new Date(now + 1800000).toISOString() });
  ok('룸 생성 + 참가자별 토큰', !!room.roomId && room.participants?.length === 2 && room.participants.every((p) => p.token));
  const [A, B] = room.participants;
  const sA = conn(A.token), sB = conn(B.token);
  const bMsgs = [], bReact = [], aPresence = [];
  sB.on('chat:message', (m) => bMsgs.push(m)); sB.on('chat:reaction', (r) => bReact.push(r));
  sA.on('presence', (p) => aPresence.push(p));
  await Promise.all([new Promise((r) => sA.on('connect', r)), new Promise((r) => sB.on('connect', r))]);
  const jA = await emit(sA, 'join'); await emit(sB, 'join');
  ok('join: features·session 반환', jA.ok && jA.session?.state === 'open' && jA.features?.chat === true);
  await wait(150);
  ok('presence: 두 참가자 온라인 통지', aPresence.some((p) => p.online?.includes(A.participantId) && p.online?.includes(B.participantId)), JSON.stringify(aPresence.at(-1)));
  const m1 = await emit(sA, 'chat:send', { body: '안녕하세요 룸 채팅 https://ex.io/x' });
  await wait(150);
  ok('chat:send + 상대 수신(mine=false)', m1.ok && bMsgs.some((m) => m.id === m1.id && m.mine === false));
  const m2 = await emit(sB, 'chat:send', { body: '네 답장', replyToId: m1.id }); await wait(120);
  ok('답장 인용 프리뷰', bMsgs.find((m) => m.id === m2.id)?.replyTo?.id === m1.id);
  const rr = await emit(sB, 'chat:react', { messageId: m1.id, emoji: '👍' }); await wait(120);
  ok('반응 토글 브로드캐스트', rr.ok && bReact.some((r) => r.messageId === m1.id && r.reactions['👍']?.length === 1));
  ok('본문 길이 초과 거부', (await emit(sA, 'chat:send', { body: 'x'.repeat(5000) })).ok === false);
  const wbA = conn(A.token); await new Promise((r) => wbA.on('connect', r)); const wj = await emit(wbA, 'wb:join');
  const wbB = conn(B.token); await new Promise((r) => wbB.on('connect', r)); await emit(wbB, 'wb:join');
  let gotStroke = false; wbB.on('wb:stroke', () => { gotStroke = true; });
  await emit(wbA, 'wb:stroke', { stroke: { points: [{ x: 1, y: 1 }], color: '#000', width: 3 }, sid: 's1' });
  await emit(wbA, 'wb:save', { strokes: [{ points: [{ x: 1, y: 1 }], color: '#000', width: 3 }] });
  await wait(150);
  ok('wb:join + wb:stroke 중계', wj.ok && gotStroke);
  ok('call:join + call:signal 허용', (await emit(sA, 'call:join')).ok && (await emit(sA, 'call:signal', { kind: 'offer', data: { sdp: 'x' } })).ok);
  // presence: 한 참가자의 모든 소켓이 끊겨야 오프라인
  const before = aPresence.length; sB.disconnect(); wbB.disconnect(); await wait(200);
  ok('presence: 참가자 오프라인 통지', aPresence.length > before && !aPresence.at(-1).online.includes(B.participantId));
  [sA, wbA].forEach((s) => s.disconnect());
}

// 3) 서버발 강제 종료 — closesAt 도달 시 session:closed 브로드캐스트
{
  const now = Date.now();
  const room = await mk({ opensAt: new Date(now - 1000).toISOString(), closesAt: new Date(now + 1500).toISOString() });
  const [A] = room.participants; const sA = conn(A.token);
  let closed = null; sA.on('session:closed', (e) => { closed = e; });
  await new Promise((r) => sA.on('connect', r)); await emit(sA, 'join');
  await wait(2200);
  ok('폐장 시각에 session:closed 수신', !!closed && closed.roomId === room.roomId, JSON.stringify(closed));
  ok('폐장 후 chat:send 차단', (await emit(sA, 'chat:send', { body: 'x' })).closed === true);
  sA.disconnect();
}

// 4) CLOSED(과거) — 차단 + 기록 열람
{
  const now = Date.now();
  const room = await mk({ opensAt: new Date(now - 7200000).toISOString(), closesAt: new Date(now - 3600000).toISOString() });
  const [A] = room.participants; const sA = conn(A.token); await new Promise((r) => sA.on('connect', r));
  const j = await emit(sA, 'join');
  ok('CLOSED: state=closed + 기록 열람 가능', j.session?.state === 'closed' && Array.isArray(j.messages));
  ok('CLOSED: 쓰기 차단', (await emit(sA, 'chat:send', { body: 'x' })).closed === true && (await emit(sA, 'wb:stroke', { stroke: {} })).closed === true);
  sA.disconnect();
}

// 5) 무제한 + 기능 off + 위조 토큰
{
  const un = await mk({}); const sU = conn(un.participants[0].token); await new Promise((r) => sU.on('connect', r));
  const ju = await emit(sU, 'join');
  ok('무제한: restricted=false + 채팅 허용', ju.session?.restricted === false && (await emit(sU, 'chat:send', { body: 'ok' })).ok); sU.disconnect();
  const vo = await mk({ features: { voice: false } }); const sV = conn(vo.participants[0].token); await new Promise((r) => sV.on('connect', r));
  const jv = await emit(sV, 'join');
  ok('기능 off: voice=false, call 거부, 채팅 허용', jv.features?.voice === false && (await emit(sV, 'call:join')).ok === false && (await emit(sV, 'chat:send', { body: 'ok' })).ok); sV.disconnect();
  const bad = conn('aaa.bbb.ccc'); await wait(400);
  ok('위조 토큰 거부', bad.disconnected); bad.disconnect();
}

// 7) 히스토리 커서 페이지네이션
{
  const room = await mk({}); const [A] = room.participants; const s = conn(A.token); await new Promise((r) => s.on('connect', r)); await emit(s, 'join');
  for (let i = 1; i <= 5; i++) await emit(s, 'chat:send', { body: `msg${i}` });
  const p1 = await emit(s, 'chat:history', { limit: 2 });
  const p2 = p1.nextCursor ? await emit(s, 'chat:history', { before: p1.nextCursor, limit: 2 }) : { messages: [] };
  const ids1 = new Set(p1.messages?.map((m) => m.id)), overlap = (p2.messages ?? []).some((m) => ids1.has(m.id));
  ok('페이지네이션: limit·hasMore·nextCursor', p1.ok && p1.messages.length === 2 && p1.hasMore === true && !!p1.nextCursor);
  ok('페이지네이션: 다음 페이지 비중복', p2.messages?.length === 2 && !overlap, `p2=${p2.messages?.map((m)=>m.body).join(',')}`);
  ok('페이지네이션: 오름차순 정렬', p1.messages[0].body === 'msg4' && p1.messages[1].body === 'msg5');
  s.disconnect();
}

// 8) Prometheus 메트릭
{
  const m = await fetch(BASE + '/api/rt/v1/metrics'); const txt = await m.text();
  ok('metrics: 커스텀 지표 노출', m.status === 200 && /rooms_created_total/.test(txt) && /rooms_messages_total/.test(txt) && /rooms_ws_connections/.test(txt));
}

// 9) 첨부 업/다운로드 (룸 토큰)
{
  const room = await mk({}); const A = room.participants[0];
  const other = await mk({}); const O = other.participants[0];
  const fd = new FormData(); fd.append('file', new Blob(['hello rooms'], { type: 'text/plain' }), 'note.txt');
  const up = await fetch(BASE + '/api/rt/v1/files', { method: 'POST', headers: { authorization: `Bearer ${A.token}` }, body: fd });
  const uj = await up.json();
  ok('파일 업로드: fileUrl 반환', up.status === 201 && !!uj.id && uj.fileUrl === `/api/rt/v1/files/${uj.id}`, JSON.stringify(uj));
  const dl = await fetch(`${BASE}${uj.fileUrl}?token=${encodeURIComponent(A.token)}`);
  ok('파일 다운로드: 내용 일치', dl.status === 200 && (await dl.text()) === 'hello rooms');
  const cross = await fetch(`${BASE}${uj.fileUrl}?token=${encodeURIComponent(O.token)}`);
  ok('파일: 다른 룸 토큰 접근 거부', cross.status === 404 || cross.status === 401, `status=${cross.status}`);
  const noAuth = await fetch(`${BASE}${uj.fileUrl}`);
  ok('파일: 토큰 없으면 거부', noAuth.status === 401);
}

// 10) 토큰 폐기(revocation)
{
  const room = await mk({}); const [A] = room.participants; const s = conn(A.token); await new Promise((r) => s.on('connect', r)); await emit(s, 'join');
  let revoked = false; s.on('session:revoked', () => { revoked = true; });
  const rv = await req('POST', `/api/rt/v1/rooms/${room.roomId}/revoke`);
  await wait(300);
  ok('폐기: session:revoked 통지 + epoch 증가', rv.body?.ok === true && rv.body?.tokenEpoch === 1 && revoked);
  ok('폐기: 기존 소켓 강제 해제', s.disconnected);
  const re = conn(A.token); await wait(400);
  ok('폐기: 기존 토큰 재접속 거부', re.disconnected, `disc=${re.disconnected}`); re.disconnect();
  const nt = await req('POST', `/api/rt/v1/rooms/${room.roomId}/tokens`, { participantId: A.participantId });
  const s2 = conn(nt.body.token); await new Promise((r) => s2.on('connect', r)); const j2 = await emit(s2, 'join');
  ok('폐기: 재발급 토큰으로 재접속 가능', j2.ok === true); s2.disconnect();
}

const pass = R.filter(Boolean).length;
console.log(`\n==== realtime-rooms 스모크 ${pass}/${R.length} PASS ====`);
process.exit(pass === R.length ? 0 : 1);
