// SDK 스모크 — 실행 중인 룸 서비스(:3100) 대상. 루트에서 실행 권장(socket.io-client 해석).
//   node packages/rooms-client/test/smoke.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createRoomClient } = require('../dist/index.js');

const BASE = process.env.ROOMS_BASE || 'http://localhost:3100';
const API = process.env.ROOMS_API_KEY || 'dev-rooms-api-key';
const R = []; const ok = (n, c, d = '') => { R.push(c); console.log(`${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const onceConnected = (c) => c.connected ? Promise.resolve() : new Promise((res) => c.on('connect', res));

const provision = async (opts) => (await (await fetch(BASE + '/api/rt/v1/rooms', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': API },
  body: JSON.stringify({ participants: [{ displayName: '학생' }, { displayName: '선생님' }], ...opts }),
})).json());

const room = await provision({});
ok('프로비저닝', !!room.roomId && room.participants?.length === 2);
const [pa, pb] = room.participants;
const A = createRoomClient({ url: BASE, token: pa.token });
const B = createRoomClient({ url: BASE, token: pb.token });
const bMsgs = [], bReact = [], aPresence = [];
B.on('message', (m) => bMsgs.push(m));
B.on('reaction', (e) => bReact.push(e));
A.on('presence', (e) => aPresence.push(e));

await Promise.all([onceConnected(A), onceConnected(B)]);
ok('연결', A.connected && B.connected);
const jA = await A.join(); await B.join();
ok('join(): features·session', jA.ok && jA.features?.chat === true && jA.session?.restricted === false);
await wait(150);
ok('presence 이벤트', aPresence.some((e) => e.online.length === 2));

const m1 = await A.sendMessage({ body: 'SDK 채팅 https://ex.io' });
await wait(150);
ok('sendMessage → 상대 message 이벤트', m1.ok && bMsgs.some((m) => m.id === m1.id && m.mine === false));
const m2 = await B.sendMessage({ body: '답장', replyToId: m1.id });
await wait(120);
ok('답장 인용', bMsgs.find((m) => m.id === m2.id)?.replyTo?.id === m1.id);
await B.react(m1.id, '👍'); await wait(120);
ok('react → reaction 이벤트', bReact.some((e) => e.messageId === m1.id && e.reactions['👍']?.length === 1));
const page = await A.loadHistory({ limit: 1 });
ok('loadHistory 페이지네이션', page.ok && page.messages.length === 1 && page.hasMore === true && !!page.nextCursor);

// 화이트보드
let gotStroke = false; B.on('wbStroke', () => { gotStroke = true; });
await A.wbJoin(); await B.wbJoin();
await A.wbStroke({ points: [{ x: 1, y: 1 }], color: '#000', width: 3 }, 's1');
await wait(150);
ok('wbStroke 중계', gotStroke);

// 음성 + 첨부
ok('callJoin', (await A.callJoin()).ok);
const up = await A.uploadFile(new Blob(['sdk file'], { type: 'text/plain' }), 'a.txt');
ok('uploadFile → fileUrl', !!up.id && up.fileUrl.includes('/api/rt/v1/files/'));
const dl = await fetch(A.fileUrl(up.fileUrl)); // fileUrl 헬퍼는 절대 URL+토큰
ok('fileUrl 다운로드', dl.status === 200 && (await dl.text()) === 'sdk file');

A.disconnect(); B.disconnect();
const pass = R.filter(Boolean).length;
console.log(`\n==== rooms-client SDK 스모크 ${pass}/${R.length} PASS ====`);
process.exit(pass === R.length ? 0 : 1);
