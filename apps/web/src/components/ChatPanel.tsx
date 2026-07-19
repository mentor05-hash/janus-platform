// ⚠ 쌍둥이 구현: RoomChatPanel.tsx 와 UI·입력 로직이 병행 유지된다(Session*Panel 이 VITE_REALTIME_ROOMS 로 택1).
//   말풍선 정렬·IME(isComposing)·통화 UI 등 공통 수정은 **반드시 두 파일에 동일 반영**할 것.
//   (전례: 정렬·IME 수정이 룸 쪽에만 들어가 예약 경로에서 재발 — O79 회귀. 근본 해소는 공용 컴포넌트 추출 백로그)
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { api } from '../api/client';
import { AuthImage } from './AuthImage';
import { mineOf } from '../utils/chat';
import { useSessionPhase, canInteract, sessionNotice, phaseOf, type SessionInfo } from '../utils/session';

type Reactions = Record<string, string[]>;
type ReplyPreview = { id: string; senderId: string | null; kind: string; body: string | null } | null;
type Msg = {
  id: string; senderId: string | null; mine?: boolean; kind: string; body: string | null;
  imageFileId: string | null; createdAt: string; readAt?: string | null;
  reactions?: Reactions; replyToId?: string | null; replyTo?: ReplyPreview;
  pending?: boolean; failed?: boolean;
};
const REACTIONS = ['👍', '❤️', '😂', '😮', '✅', '🙏'];
const KST = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
const WD = ['일', '월', '화', '수', '목', '금', '토'];
function dayKey(iso: string) { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
function dayLabel(iso: string) {
  const d = new Date(iso); const t = new Date(); const y = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1);
  if (dayKey(iso) === dayKey(t.toISOString())) return '오늘';
  if (dayKey(iso) === dayKey(y.toISOString())) return '어제';
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. (${WD[d.getDay()]})`;
}
/** 본문의 URL 을 클릭 가능한 링크로. */
function linkify(text: string, mine: boolean): ReactNode {
  return text.split(/(https?:\/\/[^\s]+)/g).map((p, i) =>
    /^https?:\/\//.test(p)
      ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" style={{ color: mine ? '#CDEAFD' : 'var(--teal)', textDecoration: 'underline', wordBreak: 'break-all' }}>{p}</a>
      : <span key={i}>{p}</span>);
}

/** 예약 기반 실시간 채팅. 답장·이모지 반응·낙관적 전송·날짜 구분·링크·읽음·타이핑. */
export function ChatPanel({ bookingId, myId, title, onClose }: { bookingId: string; myId: string; title?: string; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'connecting' | 'ready' | 'off'>('connecting');
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [reply, setReply] = useState<Msg | null>(null);
  const [reactFor, setReactFor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [unseen, setUnseen] = useState(0);
  const sockRef = useRef<Socket | null>(null);
  const [modWarn, setModWarn] = useState(''); // C1 직거래 감지 경고(서버 발신)
  const fileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [camOn, setCamOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const typingOffRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerTypingOffRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tmpN = useRef(0);

  useEffect(() => {
    const token = localStorage.getItem('mp_access') ?? '';
    const s = io(window.location.origin, { path: '/api/v1/socket.io', auth: { token }, transports: ['websocket'] });
    sockRef.current = s;
    s.on('connect', () => {
      s.emit('chat:join', { bookingId }, (r: { ok: boolean; access?: { chat: boolean }; messages?: Msg[]; session?: SessionInfo }) => {
        if (!r?.access?.chat) { setStatus('off'); return; }
        setMsgs((r.messages ?? []).map((m) => ({ ...m, mine: mineOf(m, myId) })));
        setSession(r.session ?? null);
        setStatus('ready');
      });
    });
    s.on('chat:message', (m: Msg) => {
    s.on('chat:moderation', ({ warning }: { warning: string }) => { setModWarn(warning); setTimeout(() => setModWarn(''), 10_000); });
      setMsgs((p) => {
        if (p.some((x) => x.id === m.id)) return p; // 중복 방지
        let base = p;
        if (mineOf(m, myId)) { // 내 낙관적 임시 메시지를 실제 메시지로 교체
          const i = base.findIndex((x) => x.pending && x.id.startsWith('tmp-') && x.body === m.body && x.kind === m.kind);
          if (i >= 0) base = base.filter((_, k) => k !== i);
        }
        return [...base, { ...m, mine: mineOf(m, myId) }];
      });
      if (!mineOf(m, myId)) {
        s.emit('chat:read', { bookingId });
        if (!atBottomRef.current) setUnseen((u) => u + 1);
      }
    });
    s.on('chat:read', ({ readerId, at }: { readerId: string; at: string }) => {
      setMsgs((p) => p.map((mm) => (mm.senderId !== readerId && !mm.readAt ? { ...mm, readAt: at } : mm)));
    });
    s.on('chat:reaction', ({ messageId, reactions }: { messageId: string; reactions: Reactions }) => {
      setMsgs((p) => p.map((mm) => (mm.id === messageId ? { ...mm, reactions } : mm)));
    });
    s.on('chat:typing', ({ userId, typing }: { userId: string; typing: boolean }) => {
      if (userId === myId) return;
      setPeerTyping(typing);
      if (peerTypingOffRef.current) clearTimeout(peerTypingOffRef.current);
      if (typing) peerTypingOffRef.current = setTimeout(() => setPeerTyping(false), 3500);
    });
    return () => { s.disconnect(); };
  }, [bookingId, myId]);

  // 하단에 있으면 새 메시지에 자동 스크롤(위로 올라가 있으면 알림 배지만)
  useEffect(() => {
    if (atBottomRef.current) { endRef.current?.scrollIntoView({ behavior: 'smooth' }); setUnseen(0); }
  }, [msgs, peerTyping]);
  function onScroll() {
    const el = scrollRef.current; if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    atBottomRef.current = near; if (near) setUnseen(0);
  }
  function jumpBottom() { atBottomRef.current = true; setUnseen(0); endRef.current?.scrollIntoView({ behavior: 'smooth' }); }

  function onType(v: string) {
    setText(v);
    sockRef.current?.emit('chat:typing', { bookingId, typing: true });
    if (typingOffRef.current) clearTimeout(typingOffRef.current);
    typingOffRef.current = setTimeout(() => sockRef.current?.emit('chat:typing', { bookingId, typing: false }), 1500);
  }
  function sendBody(body: string, replyToId: string | null, replyTo: ReplyPreview) {
    const id = 'tmp-' + (++tmpN.current);
    const tmp: Msg = { id, senderId: myId, mine: true, kind: 'text', body, imageFileId: null, createdAt: new Date().toISOString(), reactions: {}, replyToId, replyTo, pending: true };
    atBottomRef.current = true;
    setMsgs((p) => [...p, tmp]);
    sockRef.current?.emit('chat:send', { bookingId, body, replyToId: replyToId ?? undefined }, (r: { ok: boolean }) => {
      if (!r?.ok) setMsgs((p) => p.map((m) => (m.id === id ? { ...m, pending: false, failed: true } : m)));
    });
    sockRef.current?.emit('chat:typing', { bookingId, typing: false });
  }
  function send() {
    const body = text.trim(); if (!body || !canInteract(phaseOf(session))) return;
    sendBody(body, reply?.id ?? null, reply ? { id: reply.id, senderId: reply.senderId, kind: reply.kind, body: (reply.body ?? '').slice(0, 80) } : null);
    setText(''); setReply(null);
  }
  function retry(m: Msg) { setMsgs((p) => p.filter((x) => x.id !== m.id)); sendBody(m.body ?? '', m.replyToId ?? null, m.replyTo ?? null); }
  function react(messageId: string, emoji: string) { if (!canInteract(phaseOf(session))) return; sockRef.current?.emit('chat:react', { bookingId, messageId, emoji }); setReactFor(null); }

  async function sendImage(blob: Blob, name: string) {
    const form = new FormData(); form.append('file', blob, name);
    const r = await api.upload<{ id: string }>('/files', form);
    sockRef.current?.emit('chat:send', { bookingId, imageFileId: r.id });
  }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) { const f = e.target.files?.[0]; e.target.value = ''; if (!f || !f.type.startsWith('image/')) return; await sendImage(f, f.name); }
  async function onDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    const form = new FormData(); form.append('file', f, f.name);
    const r = await api.upload<{ id: string }>('/files', form);
    sockRef.current?.emit('chat:send', { bookingId, fileId: r.id, fileName: f.name });
  }
  async function openCamera() {
    try { const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); camStreamRef.current = stream; setCamOn(true); setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play(); } }, 30); }
    catch { alert('카메라를 사용할 수 없어요. 권한을 확인해 주세요.'); }
  }
  function closeCamera() { camStreamRef.current?.getTracks().forEach((t) => t.stop()); camStreamRef.current = null; setCamOn(false); }
  async function capture() {
    const v = videoRef.current; if (!v) return;
    const cw = v.videoWidth || 1280, ch = v.videoHeight || 720;
    const c = document.createElement('canvas'); c.width = cw; c.height = ch; c.getContext('2d')!.drawImage(v, 0, 0, cw, ch);
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.85)); closeCamera(); await sendImage(blob, 'shot.jpg');
  }
  useEffect(() => () => closeCamera(), []);

  const snippet = (m: ReplyPreview) => m?.kind === 'image' ? '📷 사진' : m?.kind === 'file' ? '📎 파일' : (m?.body ?? '');
  const phase = useSessionPhase(session);
  const rw = canInteract(phase); // 지금 쓰기(메시지·반응·답장) 가능 여부
  const notice = sessionNotice(phase, session);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 950, background: 'rgba(8,16,20,0.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label={title ?? '상담 채팅'} onClick={(e) => e.stopPropagation()} className="card" style={{ position: 'relative', width: '100%', maxWidth: 460, height: '80vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ fontSize: 15 }}>💬 {title ?? '상담 채팅'}</b>
          <button onClick={onClose} aria-label="닫기" style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>
        <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--surface-2,#f4f7fb)', position: 'relative' }}>
          {status === 'off' ? <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', marginTop: 20 }}>채팅이 비활성화되어 있어요.</p>
            : status === 'connecting' ? <p style={{ color: 'var(--caption)', fontSize: 13, textAlign: 'center' }}>연결 중…</p>
            : msgs.length === 0 ? <p style={{ color: 'var(--caption)', fontSize: 13, textAlign: 'center', marginTop: 20 }}>첫 메시지를 보내보세요.</p>
            : msgs.map((m, idx) => {
              const showDay = idx === 0 || dayKey(m.createdAt) !== dayKey(msgs[idx - 1].createdAt);
              const rx = m.reactions ?? {};
              const rxKeys = Object.keys(rx).filter((k) => (rx[k] ?? []).length > 0);
              return (
                // 메시지 래퍼는 flex 컬럼 — 내 글은 오른쪽·상대는 왼쪽 정렬, 말풍선은 내용 크기(shrink-to-fit)
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: m.mine ? 'flex-end' : 'flex-start' }}>
                  {showDay && <div style={{ alignSelf: 'stretch', textAlign: 'center', margin: '10px 0 6px' }}><span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--line-soft,#e4eaf1)', borderRadius: 999, padding: '3px 10px' }}>{dayLabel(m.createdAt)}</span></div>}
                  <div onMouseEnter={() => setHover(m.id)} onMouseLeave={() => { setHover((h) => (h === m.id ? null : h)); }} style={{ maxWidth: '82%', marginTop: 4, position: 'relative' }}>
                    {/* 답장 인용 */}
                    {m.replyTo && <div style={{ fontSize: 11, color: 'var(--muted)', borderLeft: '3px solid var(--teal)', padding: '2px 8px', background: 'var(--line-soft,#eef2f7)', borderRadius: 6, marginBottom: 3, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>↩ {m.replyTo.senderId === myId ? '나' : '상대'}: {snippet(m.replyTo)}</div>}
                    <div style={{ background: m.mine ? 'var(--teal)' : 'var(--surface)', color: m.mine ? '#fff' : 'var(--ink)', border: m.mine ? 'none' : '1px solid var(--line)', borderRadius: 12, padding: m.kind === 'image' ? 6 : '8px 12px', fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word', opacity: m.pending ? 0.6 : 1 }}>
                      {m.kind === 'image' && m.imageFileId ? <AuthImage fileId={m.imageFileId} size={160} />
                        : m.kind === 'file' && m.imageFileId ? (
                          <button onClick={() => api.downloadFile(m.imageFileId!, m.body ?? '첨부파일')} style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', font: 'inherit', padding: 0, textAlign: 'left' }}>
                            <span style={{ fontSize: 20 }}>📎</span><span style={{ textDecoration: 'underline', wordBreak: 'break-all' }}>{m.body ?? '첨부파일'}</span>
                          </button>
                        ) : linkify(m.body ?? '', !!m.mine)}
                    </div>
                    {/* 반응 칩 */}
                    {rxKeys.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3, justifyContent: m.mine ? 'flex-end' : 'flex-start' }}>
                        {rxKeys.map((e) => { const mineR = (rx[e] ?? []).includes(myId); return (
                          <button key={e} onClick={() => react(m.id, e)} style={{ fontSize: 11, border: `1px solid ${mineR ? 'var(--teal)' : 'var(--line)'}`, background: mineR ? 'var(--teal-50,#E8F0F9)' : 'var(--surface)', color: 'var(--ink)', borderRadius: 999, padding: '1px 7px', cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}>{e} {(rx[e] ?? []).length}</button>
                        ); })}
                      </div>
                    )}
                    {/* 시각·읽음 */}
                    <div style={{ fontSize: 10, color: 'var(--caption)', textAlign: m.mine ? 'right' : 'left', marginTop: 2 }}>
                      {m.failed ? <button onClick={() => retry(m)} style={{ color: 'var(--danger,#c25a43)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, padding: 0 }}>⚠ 전송 실패 · 재시도</button>
                        : m.pending ? '전송 중…'
                        : <>{m.mine && m.readAt && <span style={{ color: 'var(--teal)', marginRight: 4 }}>읽음</span>}{KST(m.createdAt)}</>}
                    </div>
                    {/* 호버 액션(답장·반응) */}
                    {hover === m.id && !m.pending && !m.failed && rw && (
                      <div style={{ position: 'absolute', top: -12, [m.mine ? 'left' : 'right']: -6, display: 'flex', gap: 2, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 999, padding: 2, boxShadow: '0 2px 8px rgba(0,0,0,.08)' } as React.CSSProperties}>
                        <button title="답장" onClick={() => { setReply(m); setReactFor(null); }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, padding: '2px 5px' }}>↩</button>
                        <button title="반응" onClick={() => setReactFor((f) => (f === m.id ? null : m.id))} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, padding: '2px 5px' }}>😊</button>
                      </div>
                    )}
                    {/* 반응 팔레트 */}
                    {reactFor === m.id && (
                      <div style={{ position: 'absolute', top: 8, [m.mine ? 'left' : 'right']: -4, display: 'flex', gap: 2, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 999, padding: '3px 5px', boxShadow: '0 3px 10px rgba(0,0,0,.12)', zIndex: 5 } as React.CSSProperties}>
                        {REACTIONS.map((e) => <button key={e} onClick={() => react(m.id, e)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, padding: '1px 3px' }}>{e}</button>)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          {peerTyping && <div style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', padding: '2px 4px' }}>입력 중…</div>}
          <div ref={endRef} />
          {unseen > 0 && <button onClick={jumpBottom} style={{ position: 'sticky', bottom: 6, alignSelf: 'center', fontSize: 12, fontWeight: 700, color: '#fff', background: 'var(--teal)', border: 'none', borderRadius: 999, padding: '5px 12px', cursor: 'pointer', boxShadow: '0 3px 10px rgba(0,0,0,.18)' }}>새 메시지 {unseen} ↓</button>}
        </div>
        {reply && rw && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderTop: '1px solid var(--line)', background: 'var(--line-soft,#eef2f7)', fontSize: 12 }}>
            <span style={{ color: 'var(--teal)', fontWeight: 700 }}>↩ 답장</span>
            <span style={{ flex: 1, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reply.senderId === myId ? '나' : '상대'}: {snippet({ id: reply.id, senderId: reply.senderId, kind: reply.kind, body: reply.body })}</span>
            <button onClick={() => setReply(null)} aria-label="답장 취소" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>✕</button>
          </div>
        )}
        {status !== 'off' && !rw && (
          <div style={{ padding: '11px 14px', borderTop: '1px solid var(--line)', background: phase === 'closed' ? 'var(--line-soft,#eef2f7)' : 'var(--teal-50,#E8F0F9)', color: 'var(--muted)', fontSize: 12.5, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span>{phase === 'closed' ? '🔒' : '⏳'}</span><span>{notice}</span>
          </div>
        )}
        {status !== 'off' && rw && (
          <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid var(--line)', alignItems: 'center' }}>
            {modWarn && <div style={{ margin: "6px 12px", padding: "8px 12px", borderRadius: 8, background: "#FEF3CD", border: "1px solid #F5D889", color: "#8a6d1a", fontSize: 12.5 }}>⚠️ {modWarn}</div>}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
            <button onClick={() => fileRef.current?.click()} title="이미지 첨부" aria-label="이미지 첨부" style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }}>🖼</button>
            <button onClick={openCamera} title="사진 촬영(무음)" aria-label="사진 촬영" style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }}>📷</button>
            <input ref={docRef} type="file" hidden onChange={onDoc} />
            <button onClick={() => docRef.current?.click()} title="파일 첨부(PDF·문서)" aria-label="파일 첨부" style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }}>📎</button>
            <input className="input" value={text} onChange={(e) => onType(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send(); }} placeholder={reply ? '답장 입력…' : '메시지 입력…'} aria-label="메시지 입력" />
            <button className="btn sm" onClick={send} disabled={!text.trim()}>전송</button>
          </div>
        )}
        {camOn && (
          <div style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
            <video ref={videoRef} playsInline muted style={{ flex: 1, width: '100%', objectFit: 'contain', minHeight: 0 }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', padding: 14, background: '#000' }}>
              <button className="btn ghost sm" onClick={closeCamera}>취소</button>
              <button className="btn sm" onClick={capture}>📸 촬영(무음)</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
