// ⚠ 쌍둥이 구현: ChatPanel.tsx 와 UI·입력 로직이 병행 유지된다(Session*Panel 이 VITE_REALTIME_ROOMS 로 택1).
//   말풍선 정렬·IME(isComposing)·통화 UI 등 공통 수정은 **반드시 두 파일에 동일 반영**할 것.
//   (전례: 정렬·IME 수정이 룸 쪽에만 들어가 예약 경로에서 재발 — O79 회귀. 근본 해소는 공용 컴포넌트 추출 백로그)
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useSessionPhase, canInteract, sessionNotice, phaseOf, type SessionInfo } from '../utils/session';

// 룸 서비스(apps/realtime-rooms) 프로토콜을 직접 사용 — 웹은 이미 socket.io-client 의존.
export type RoomSession = { url: string; token: string; participantId: string; features: { chat: boolean; whiteboard: boolean; voice: boolean }; session: SessionInfo };
type Reactions = Record<string, string[]>;
type ReplyPreview = { id: string; senderId: string | null; kind: string; body: string | null } | null;
type Msg = { id: string; senderId: string | null; mine: boolean; kind: string; body: string | null; fileUrl: string | null; createdAt: string; readAt?: string | null; reactions?: Reactions; replyToId?: string | null; replyTo?: ReplyPreview };

const REACTIONS = ['👍', '❤️', '😂', '😮', '✅', '🙏'];
const KST = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const dayKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function dayLabel(iso: string) {
  const d = new Date(iso), t = new Date(), y = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1);
  if (dayKey(iso) === dayKey(t.toISOString())) return '오늘';
  if (dayKey(iso) === dayKey(y.toISOString())) return '어제';
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. (${WD[d.getDay()]})`;
}
function linkify(text: string, mine: boolean): ReactNode {
  return text.split(/(https?:\/\/[^\s]+)/g).map((p, i) => /^https?:\/\//.test(p)
    ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" style={{ color: mine ? '#CDEAFD' : 'var(--teal)', textDecoration: 'underline', wordBreak: 'break-all' }}>{p}</a>
    : <span key={i}>{p}</span>);
}
const snippet = (m: ReplyPreview) => (m?.kind === 'image' ? '📷 사진' : m?.kind === 'file' ? '📎 파일' : m?.kind === 'audio' ? '🎤 음성 메시지' : (m?.body ?? ''));

// ⑥ 자주 쓰는 문구 — ChatPanel 과 같은 로컬 키 공유(선생님=룸 host).
const PHRASE_KEY = 'janus_chat_phrases';
const PHRASE_DEFAULTS = ['안녕하세요! 오늘 상담 시작할게요 😊', '잠시만요, 확인해 볼게요.', '과제는 다음 시간까지 완료해 주세요!', '오늘 수업 여기까지! 수고했어요 👏'];
function loadPhrases(): string[] {
  try { const v = JSON.parse(localStorage.getItem(PHRASE_KEY) ?? 'null'); if (Array.isArray(v)) return v.filter((x) => typeof x === 'string').slice(0, 8); } catch { /* 무시 */ }
  return PHRASE_DEFAULTS;
}
function savePhrases(p: string[]) { try { localStorage.setItem(PHRASE_KEY, JSON.stringify(p.slice(0, 8))); } catch { /* 무시 */ } }

/** 룸 서비스 기반 채팅 패널(이관 경로). 기존 ChatPanel 과 동일 UX의 핵심(답장·반응·읽음·입력중·접속표시·첨부·삭제·음성·모아보기). */
export function RoomChatPanel({ session: rs, title, onClose }: { bookingId: string; myId: string; title?: string; onClose: () => void; session: RoomSession }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'connecting' | 'ready' | 'off'>('connecting');
  const [connErr, setConnErr] = useState<string | null>(null); // 소켓 연결/인증 실패 사유(무한 "연결 중" 방지)
  const [modWarn, setModWarn] = useState(''); // C1 직거래 감지 경고(서버 발신)
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [reply, setReply] = useState<Msg | null>(null);
  const [reactFor, setReactFor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [live, setLive] = useState<SessionInfo>(rs.session);
  const [role, setRole] = useState<string>('viewer'); // join 응답의 서버 권위 역할(host=선생님)
  const [view, setView] = useState<'chat' | 'media'>('chat'); // ⑦ 모아보기
  const [phrases, setPhrases] = useState<string[]>(() => (typeof localStorage !== 'undefined' ? loadPhrases() : []));
  const [phraseEdit, setPhraseEdit] = useState(false);
  const [recOn, setRecOn] = useState(false); // ④ 음성 메시지
  const recRef = useRef<MediaRecorder | null>(null);
  const recStreamRef = useRef<MediaStream | null>(null);
  const recTypingRef = useRef<ReturnType<typeof setInterval> | null>(null); // 녹음 중 상대 표시 keep-alive
  const [peerVoice, setPeerVoice] = useState(false); // 상대가 음성 녹음 중
  const fileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const sockRef = useRef<Socket | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const typingOffRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerTypingOffRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myPid = rs.participantId;
  // 룸 파일은 룸 토큰으로 인증(가드가 ?token= 지원) — 이미지/오디오 src·다운로드에 사용.
  const fileSrc = (fileUrl: string) => `${rs.url}${fileUrl}?token=${encodeURIComponent(rs.token)}`;

  useEffect(() => {
    const s = io(rs.url, { path: '/api/rt/v1/socket.io', auth: { token: rs.token }, transports: ['websocket'] });
    sockRef.current = s;
    // 연결/인증 실패를 눈에 보이게 — 안 그러면 "연결 중"에서 무한 대기(원인: 룸 서버 미접속·토큰 오류).
    s.on('connect_error', (e) => setConnErr(`룸 서버(${rs.url}) 연결 실패: ${e?.message ?? '알 수 없음'}`));
    s.on('error', (e: { message?: string } | string) => setConnErr(typeof e === 'string' ? e : (e?.message ?? '룸 오류')));
    s.on('connect', () => {
      setConnErr(null);
      s.emit('join', {}, (r: { ok: boolean; error?: string; messages?: Msg[]; session?: SessionInfo; role?: string }) => {
        if (!r?.ok) { setStatus('off'); setConnErr(r?.error ?? '채팅에 입장할 수 없습니다.'); return; }
        setMsgs(r.messages ?? []); if (r.session) setLive(r.session); if (r.role) setRole(r.role); setStatus('ready');
      });
    });
    s.on('chat:message', (m: Msg) => {
      setMsgs((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]));
      if (!m.mine) s.emit('chat:read');
    });
    s.on('chat:reaction', ({ messageId, reactions }: { messageId: string; reactions: Reactions }) => setMsgs((p) => p.map((m) => (m.id === messageId ? { ...m, reactions } : m))));
    s.on('chat:read', ({ readerId, at }: { readerId: string; at: string }) => setMsgs((p) => p.map((m) => (m.senderId !== readerId && !m.readAt ? { ...m, readAt: at } : m))));
    s.on('chat:typing', ({ participantId, typing, mode }: { participantId: string; typing: boolean; mode?: string }) => {
      if (participantId === myPid) return;
      setPeerTyping(typing);
      setPeerVoice(typing && mode === 'voice');
      if (peerTypingOffRef.current) clearTimeout(peerTypingOffRef.current);
      if (typing) peerTypingOffRef.current = setTimeout(() => { setPeerTyping(false); setPeerVoice(false); }, 3500);
    });
    s.on('chat:deleted', ({ messageId }: { messageId: string }) => {
      setMsgs((p) => p.map((mm) => (mm.id === messageId ? { ...mm, kind: 'deleted', body: null, fileUrl: null, reactions: {}, replyTo: null, replyToId: null } : mm)));
    });
    s.on('chat:moderation', ({ warning }: { warning: string }) => { setModWarn(warning); setTimeout(() => setModWarn(''), 10_000); });
    // 유예 무료 한도(O95 동형) — 잔여 안내(소진 시 시스템 메시지는 서버가 브로드캐스트).
    s.on('chat:postfree', ({ used, limit }: { used: number; limit: number }) => {
      const left = Math.max(0, limit - used);
      setModWarn(left > 0 ? `상담 종료 후 무료 마무리 메시지 ${left}건 남았어요.` : '');
    });
    s.on('presence', ({ online }: { online: string[] }) => setPeerOnline(online.some((id) => id !== myPid)));
    s.on('session:closed', (e: { closesAt?: string }) => setLive((v) => ({ ...v, state: 'closed', closesAt: e.closesAt ?? v.closesAt })));
    s.on('session:revoked', () => setStatus('off'));
    return () => { s.disconnect(); };
  }, [rs.url, rs.token, myPid]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, peerTyping]);

  const phase = useSessionPhase(live);
  const rw = canInteract(phase);
  const notice = sessionNotice(phase, live);

  function onType(v: string) {
    setText(v);
    sockRef.current?.emit('chat:typing', { typing: true });
    if (typingOffRef.current) clearTimeout(typingOffRef.current);
    typingOffRef.current = setTimeout(() => sockRef.current?.emit('chat:typing', { typing: false }), 1500);
  }
  function send() {
    const body = text.trim(); if (!body || !canInteract(phaseOf(live))) return;
    sockRef.current?.emit('chat:send', { body, replyToId: reply?.id }, (r?: { ok?: boolean; postLimit?: boolean; error?: string }) => {
      // 유예 무료 한도 초과 등 서버 거부 — 사유를 보여주고 입력을 되살린다(작성 내용 보존).
      if (r && r.ok === false && r.error) { setModWarn(r.error); setText(body); }
    });
    sockRef.current?.emit('chat:typing', { typing: false });
    setText(''); setReply(null);
  }
  function react(messageId: string, emoji: string) { if (!canInteract(phaseOf(live))) return; sockRef.current?.emit('chat:react', { messageId, emoji }); setReactFor(null); }
  // ③ 삭제(회수) — 본인 발신만
  function delMsg(m: Msg) {
    if (!m.mine || !canInteract(phaseOf(live))) return;
    if (!confirm('이 메시지를 삭제할까요? 상대 화면에서도 사라져요.')) return;
    sockRef.current?.emit('chat:delete', { messageId: m.id });
    setHover(null); setReactFor(null);
  }
  // 룸 파일 업로드(룸 토큰 인증) → chat:send(fileUrl+kind)
  async function uploadRoom(blob: Blob, name: string): Promise<{ fileUrl: string } | null> {
    try {
      const form = new FormData(); form.append('file', blob, name);
      const res = await fetch(`${rs.url}/api/rt/v1/files`, { method: 'POST', headers: { Authorization: `Bearer ${rs.token}` }, body: form });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as { fileUrl: string };
    } catch (e) {
      const st = (e as Error).message;
      alert(`파일 업로드에 실패했어요.${st === '413' ? ' (파일이 너무 큽니다)' : /^\d+$/.test(st) ? ` (오류 ${st})` : ' (네트워크 오류)'}`);
      return null;
    }
  }
  // ①② 이미지(여러 장)·파일 첨부
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const fs = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'));
    e.target.value = '';
    for (const f of fs) { const up = await uploadRoom(f, f.name); if (up) sockRef.current?.emit('chat:send', { fileUrl: up.fileUrl, kind: 'image', body: f.name }); }
  }
  async function onDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    const up = await uploadRoom(f, f.name); if (up) sockRef.current?.emit('chat:send', { fileUrl: up.fileUrl, kind: 'file', body: f.name });
  }
  // ④ 음성 메시지
  async function toggleRec() {
    if (recOn) { recRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recStreamRef.current = stream;
      const mime = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined;
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunks.push(ev.data); };
      rec.onstop = async () => {
        recStreamRef.current?.getTracks().forEach((t) => t.stop()); recStreamRef.current = null;
        setRecOn(false); recRef.current = null;
        if (recTypingRef.current) { clearInterval(recTypingRef.current); recTypingRef.current = null; }
        sockRef.current?.emit('chat:typing', { typing: false });
        const blob = new Blob(chunks, { type: mime ?? 'audio/webm' });
        if (blob.size < 800) return;
        const up = await uploadRoom(blob, 'voice.webm');
        if (up) sockRef.current?.emit('chat:send', { fileUrl: up.fileUrl, kind: 'audio', body: '음성 메시지' });
      };
      rec.start(); recRef.current = rec; setRecOn(true);
      // 상대 화면에 "🎤 녹음 중…" 표시 — 표시 타임아웃(3.5s)보다 짧게 주기 재전송
      sockRef.current?.emit('chat:typing', { typing: true, mode: 'voice' });
      recTypingRef.current = setInterval(() => sockRef.current?.emit('chat:typing', { typing: true, mode: 'voice' }), 2000);
    } catch { alert('마이크를 사용할 수 없어요. 권한을 확인해 주세요.'); }
  }
  useEffect(() => () => { recRef.current?.stop(); recStreamRef.current?.getTracks().forEach((t) => t.stop()); if (recTypingRef.current) clearInterval(recTypingRef.current); }, []);
  // ⑥ 자주 쓰는 문구 관리
  function addPhrase() {
    const v = prompt('자주 쓰는 문구를 입력하세요 (최대 8개)');
    const t = v?.trim(); if (!t) return;
    setPhrases((p) => { const n = [...p.filter((x) => x !== t), t].slice(-8); savePhrases(n); return n; });
  }
  function removePhrase(t: string) { setPhrases((p) => { const n = p.filter((x) => x !== t); savePhrases(n); return n; }); }
  function downloadRoomFile(m: Msg) {
    if (!m.fileUrl) return;
    const a = document.createElement('a'); a.href = fileSrc(m.fileUrl); a.download = m.body ?? '첨부파일'; document.body.appendChild(a); a.click(); a.remove();
  }
  const mediaMsgs = msgs.filter((m) => (m.kind === 'image' || m.kind === 'file' || m.kind === 'audio') && m.fileUrl);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 950, background: 'rgba(8,16,20,0.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label={title ?? '상담 채팅'} onClick={(e) => e.stopPropagation()} className="card" style={{ position: 'relative', width: '100%', maxWidth: 460, height: '80vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ fontSize: 15 }}>💬 {title ?? '상담 채팅'}
            <span title={peerOnline ? '상대 접속 중' : '상대 오프라인'} style={{ marginLeft: 8, fontSize: 10, color: peerOnline ? 'var(--chip-done,#2A8A5F)' : 'var(--caption)' }}>● {peerOnline ? '접속 중' : '오프라인'}</span>
          </b>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setView((v) => (v === 'media' ? 'chat' : 'media'))} title="사진·파일 모아보기" aria-label="사진·파일 모아보기"
              style={{ border: view === 'media' ? '1px solid var(--teal)' : '1px solid var(--line)', background: view === 'media' ? 'var(--teal-50,#E8F0F9)' : 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer', padding: '3px 8px' }}>🗂</button>
            <button onClick={onClose} aria-label="닫기" style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
          </div>
        </div>
        {view === 'media' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 14, background: 'var(--surface-2,#f4f7fb)' }}>
            {mediaMsgs.length === 0 ? <p style={{ color: 'var(--caption)', fontSize: 13, textAlign: 'center', marginTop: 20 }}>주고받은 사진·파일이 없어요.</p> : (
              <>
                {mediaMsgs.some((m) => m.kind === 'image') && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', margin: '2px 0 8px' }}>📷 사진</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8, marginBottom: 16 }}>
                      {mediaMsgs.filter((m) => m.kind === 'image').map((m) => (
                        <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <img src={fileSrc(m.fileUrl!)} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
                          <span style={{ fontSize: 10, color: 'var(--caption)' }}>{dayLabel(m.createdAt)} {KST(m.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {mediaMsgs.some((m) => m.kind !== 'image') && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', margin: '2px 0 8px' }}>📎 파일·음성</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {mediaMsgs.filter((m) => m.kind !== 'image').map((m) => (
                        <button key={m.id} onClick={() => downloadRoomFile(m)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', textAlign: 'left', font: 'inherit', fontSize: 13 }}>
                          <span>{m.kind === 'audio' ? '🎤' : '📎'}</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.body ?? '첨부파일'}</span>
                          <span style={{ fontSize: 11, color: 'var(--caption)', whiteSpace: 'nowrap' }}>{dayLabel(m.createdAt)} {KST(m.createdAt)}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
        {view === 'chat' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--surface-2,#f4f7fb)' }}>
          {status === 'off' ? <p style={{ color: connErr ? '#a64b37' : 'var(--muted)', fontSize: 13, textAlign: 'center', marginTop: 20 }}>{connErr ?? '채팅 세션이 종료되었어요.'}</p>
            : status === 'connecting' ? <p style={{ color: connErr ? '#a64b37' : 'var(--caption)', fontSize: 13, textAlign: 'center', lineHeight: 1.6 }}>{connErr ? `⚠ ${connErr}` : '연결 중…'}</p>
            : msgs.length === 0 ? <p style={{ color: 'var(--caption)', fontSize: 13, textAlign: 'center', marginTop: 20 }}>첫 메시지를 보내보세요.</p>
            : msgs.map((m, idx) => {
              const showDay = idx === 0 || dayKey(m.createdAt) !== dayKey(msgs[idx - 1].createdAt);
              const rx = m.reactions ?? {}; const rxKeys = Object.keys(rx).filter((k) => (rx[k] ?? []).length > 0);
              // ⑤ 시스템 메시지 — 중앙 회색 칩
              if (m.kind === 'system') {
                return (
                  <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                    {showDay && <div style={{ textAlign: 'center', margin: '10px 0 6px' }}><span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--line-soft,#e4eaf1)', borderRadius: 999, padding: '3px 10px' }}>{dayLabel(m.createdAt)}</span></div>}
                    <div style={{ textAlign: 'center', margin: '6px 0' }}>
                      <span style={{ fontSize: 11.5, color: 'var(--muted)', background: 'var(--line-soft,#e9edf3)', border: '1px solid var(--line)', borderRadius: 999, padding: '4px 12px', display: 'inline-block' }}>{m.body}</span>
                    </div>
                  </div>
                );
              }
              return (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: m.mine ? 'flex-end' : 'flex-start' }}>
                  {showDay && <div style={{ alignSelf: 'stretch', textAlign: 'center', margin: '10px 0 6px' }}><span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--line-soft,#e4eaf1)', borderRadius: 999, padding: '3px 10px' }}>{dayLabel(m.createdAt)}</span></div>}
                  <div onMouseEnter={() => setHover(m.id)} onMouseLeave={() => setHover((h) => (h === m.id ? null : h))} style={{ maxWidth: '82%', marginTop: 4, position: 'relative' }}>
                    {m.replyTo && <div style={{ fontSize: 11, color: 'var(--muted)', borderLeft: '3px solid var(--teal)', padding: '2px 8px', background: 'var(--line-soft,#eef2f7)', borderRadius: 6, marginBottom: 3, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>↩ {m.replyTo.senderId === myPid ? '나' : '상대'}: {snippet(m.replyTo)}</div>}
                    <div style={{ background: m.kind === 'deleted' ? 'var(--line-soft,#eef2f7)' : m.mine ? 'var(--teal)' : 'var(--surface)', color: m.kind === 'deleted' ? 'var(--muted)' : m.mine ? '#fff' : 'var(--ink)', border: m.mine && m.kind !== 'deleted' ? 'none' : '1px solid var(--line)', borderRadius: 12, padding: m.kind === 'image' ? 6 : '8px 12px', fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {m.kind === 'deleted' ? <span style={{ fontStyle: 'italic', fontSize: 12.5 }}>🚫 삭제된 메시지예요</span>
                        : m.kind === 'image' && m.fileUrl ? <img src={fileSrc(m.fileUrl)} alt="" style={{ width: 160, height: 160, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                        : m.kind === 'audio' && m.fileUrl ? <audio controls src={fileSrc(m.fileUrl)} style={{ height: 34, maxWidth: 220 }} />
                        : m.kind === 'file' && m.fileUrl ? (
                          <button onClick={() => downloadRoomFile(m)} style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', font: 'inherit', padding: 0, textAlign: 'left' }}>
                            <span style={{ fontSize: 20 }}>📎</span><span style={{ textDecoration: 'underline', wordBreak: 'break-all' }}>{m.body ?? '첨부파일'}</span>
                          </button>
                        ) : linkify(m.body ?? '', m.mine)}
                    </div>
                    {rxKeys.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3, justifyContent: m.mine ? 'flex-end' : 'flex-start' }}>
                        {rxKeys.map((e) => { const mineR = (rx[e] ?? []).includes(myPid); return (
                          <button key={e} onClick={() => react(m.id, e)} style={{ fontSize: 11, border: `1px solid ${mineR ? 'var(--teal)' : 'var(--line)'}`, background: mineR ? 'var(--teal-50,#E8F0F9)' : 'var(--surface)', color: 'var(--ink)', borderRadius: 999, padding: '1px 7px', cursor: 'pointer' }}>{e} {(rx[e] ?? []).length}</button>
                        ); })}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: 'var(--caption)', textAlign: m.mine ? 'right' : 'left', marginTop: 2 }}>
                      {m.mine && m.readAt && <span style={{ color: 'var(--teal)', marginRight: 4 }}>읽음</span>}{KST(m.createdAt)}
                    </div>
                    {hover === m.id && rw && m.kind !== 'deleted' && (
                      <div style={{ position: 'absolute', top: -12, [m.mine ? 'left' : 'right']: -6, display: 'flex', gap: 2, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 999, padding: 2, boxShadow: '0 2px 8px rgba(0,0,0,.08)' } as React.CSSProperties}>
                        <button title="답장" onClick={() => { setReply(m); setReactFor(null); }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, padding: '2px 5px' }}>↩</button>
                        <button title="반응" onClick={() => setReactFor((f) => (f === m.id ? null : m.id))} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, padding: '2px 5px' }}>😊</button>
                        {m.mine && <button title="삭제(회수)" onClick={() => delMsg(m)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, padding: '2px 5px' }}>🗑</button>}
                      </div>
                    )}
                    {reactFor === m.id && rw && (
                      <div style={{ position: 'absolute', top: 8, [m.mine ? 'left' : 'right']: -4, display: 'flex', gap: 2, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 999, padding: '3px 5px', boxShadow: '0 3px 10px rgba(0,0,0,.12)', zIndex: 5 } as React.CSSProperties}>
                        {REACTIONS.map((e) => <button key={e} onClick={() => react(m.id, e)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, padding: '1px 3px' }}>{e}</button>)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          {peerTyping && <div style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', padding: '2px 4px' }}>{peerVoice ? '🎤 음성 메시지 녹음 중…' : '입력 중…'}</div>}
          <div ref={endRef} />
        </div>
        )}
        {reply && rw && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderTop: '1px solid var(--line)', background: 'var(--line-soft,#eef2f7)', fontSize: 12 }}>
            <span style={{ color: 'var(--teal)', fontWeight: 700 }}>↩ 답장</span>
            <span style={{ flex: 1, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reply.senderId === myPid ? '나' : '상대'}: {snippet({ id: reply.id, senderId: reply.senderId, kind: reply.kind, body: reply.body })}</span>
            <button onClick={() => setReply(null)} aria-label="답장 취소" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>✕</button>
          </div>
        )}
        {status !== 'off' && !rw && (
          <div style={{ padding: '11px 14px', borderTop: '1px solid var(--line)', background: phase === 'closed' ? 'var(--line-soft,#eef2f7)' : 'var(--teal-50,#E8F0F9)', color: 'var(--muted)', fontSize: 12.5, textAlign: 'center' }}>{phase === 'closed' ? '🔒 ' : '⏳ '}{notice}</div>
        )}
        {status !== 'off' && rw && view === 'chat' && (
          <>
            {/* ⑥ 자주 쓰는 문구(host=선생님) */}
            {role === 'host' && (
              <div style={{ display: 'flex', gap: 6, padding: '8px 10px 0', flexWrap: 'wrap', alignItems: 'center' }}>
                {phrases.map((p) => (
                  <button key={p} onClick={() => (phraseEdit ? removePhrase(p) : setText(p))} title={phraseEdit ? '삭제' : '입력창에 채우기'}
                    style={{ fontSize: 11.5, border: `1px solid ${phraseEdit ? 'var(--danger,#dc2626)' : 'var(--line)'}`, background: 'var(--surface)', color: phraseEdit ? 'var(--danger,#dc2626)' : 'var(--ink)', borderRadius: 999, padding: '3px 10px', cursor: 'pointer', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {phraseEdit ? `✕ ${p}` : p}
                  </button>
                ))}
                <button onClick={addPhrase} title="문구 추가" style={{ fontSize: 12, border: '1px dashed var(--line)', background: 'none', color: 'var(--muted)', borderRadius: 999, padding: '3px 9px', cursor: 'pointer' }}>＋</button>
                <button onClick={() => setPhraseEdit((v) => !v)} title="문구 관리" style={{ fontSize: 11, border: 'none', background: 'none', color: phraseEdit ? 'var(--teal)' : 'var(--caption)', cursor: 'pointer' }}>{phraseEdit ? '완료' : '관리'}</button>
              </div>
            )}
            {modWarn && <div style={{ margin: '6px 12px 0', padding: '8px 12px', borderRadius: 8, background: '#FEF3CD', border: '1px solid #F5D889', color: '#8a6d1a', fontSize: 12.5 }}>⚠️ {modWarn}</div>}
            <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid var(--line)', alignItems: 'center' }}>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFile} />
              <button onClick={() => fileRef.current?.click()} title="이미지 첨부(여러 장 가능)" aria-label="이미지 첨부" style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }}>🖼</button>
              <input ref={docRef} type="file" hidden onChange={onDoc} />
              <button onClick={() => docRef.current?.click()} title="파일 첨부(PDF·문서)" aria-label="파일 첨부" style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }}>📎</button>
              <button onClick={toggleRec} title={recOn ? '녹음 중지·전송' : '음성 메시지'} aria-label="음성 메시지"
                style={{ border: 'none', background: recOn ? 'var(--danger,#dc2626)' : 'none', borderRadius: 999, fontSize: recOn ? 13 : 20, fontWeight: recOn ? 700 : 400, cursor: 'pointer', padding: recOn ? '6px 12px' : 0, color: '#fff', whiteSpace: 'nowrap', flex: 'none' }}>
                {recOn ? '⏺ 전송' : '🎤'}
              </button>
              <input className="input" value={text} onChange={(e) => onType(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send(); }} placeholder={recOn ? '녹음 중… 버튼을 다시 누르면 전송돼요' : reply ? '답장 입력…' : '메시지 입력…'} aria-label="메시지 입력" />
              <button className="btn sm" onClick={send} disabled={!text.trim()}>전송</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
