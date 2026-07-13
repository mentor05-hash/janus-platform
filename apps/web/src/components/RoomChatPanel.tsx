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
const snippet = (m: ReplyPreview) => (m?.kind === 'image' ? '📷 사진' : m?.kind === 'file' ? '📎 파일' : (m?.body ?? ''));

/** 룸 서비스 기반 채팅 패널(이관 경로). 기존 ChatPanel 과 동일 UX의 핵심(답장·반응·읽음·입력중·접속표시). */
export function RoomChatPanel({ session: rs, title, onClose }: { bookingId: string; myId: string; title?: string; onClose: () => void; session: RoomSession }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'connecting' | 'ready' | 'off'>('connecting');
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [reply, setReply] = useState<Msg | null>(null);
  const [reactFor, setReactFor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [live, setLive] = useState<SessionInfo>(rs.session);
  const sockRef = useRef<Socket | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const typingOffRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerTypingOffRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myPid = rs.participantId;

  useEffect(() => {
    const s = io(rs.url, { path: '/api/rt/v1/socket.io', auth: { token: rs.token }, transports: ['websocket'] });
    sockRef.current = s;
    s.on('connect', () => {
      s.emit('join', {}, (r: { ok: boolean; messages?: Msg[]; session?: SessionInfo }) => {
        if (!r?.ok) { setStatus('off'); return; }
        setMsgs(r.messages ?? []); if (r.session) setLive(r.session); setStatus('ready');
      });
    });
    s.on('chat:message', (m: Msg) => {
      setMsgs((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]));
      if (!m.mine) s.emit('chat:read');
    });
    s.on('chat:reaction', ({ messageId, reactions }: { messageId: string; reactions: Reactions }) => setMsgs((p) => p.map((m) => (m.id === messageId ? { ...m, reactions } : m))));
    s.on('chat:read', ({ readerId, at }: { readerId: string; at: string }) => setMsgs((p) => p.map((m) => (m.senderId !== readerId && !m.readAt ? { ...m, readAt: at } : m))));
    s.on('chat:typing', ({ participantId, typing }: { participantId: string; typing: boolean }) => {
      if (participantId === myPid) return;
      setPeerTyping(typing);
      if (peerTypingOffRef.current) clearTimeout(peerTypingOffRef.current);
      if (typing) peerTypingOffRef.current = setTimeout(() => setPeerTyping(false), 3500);
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
    sockRef.current?.emit('chat:send', { body, replyToId: reply?.id }, () => { /* 서버 broadcast 로 반영 */ });
    sockRef.current?.emit('chat:typing', { typing: false });
    setText(''); setReply(null);
  }
  function react(messageId: string, emoji: string) { if (!canInteract(phaseOf(live))) return; sockRef.current?.emit('chat:react', { messageId, emoji }); setReactFor(null); }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 950, background: 'rgba(8,16,20,0.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label={title ?? '상담 채팅'} onClick={(e) => e.stopPropagation()} className="card" style={{ position: 'relative', width: '100%', maxWidth: 460, height: '80vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ fontSize: 15 }}>💬 {title ?? '상담 채팅'}
            <span title={peerOnline ? '상대 접속 중' : '상대 오프라인'} style={{ marginLeft: 8, fontSize: 10, color: peerOnline ? 'var(--chip-done,#2A8A5F)' : 'var(--caption)' }}>● {peerOnline ? '접속 중' : '오프라인'}</span>
          </b>
          <button onClick={onClose} aria-label="닫기" style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--surface-2,#f4f7fb)' }}>
          {status === 'off' ? <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', marginTop: 20 }}>채팅 세션이 종료되었어요.</p>
            : status === 'connecting' ? <p style={{ color: 'var(--caption)', fontSize: 13, textAlign: 'center' }}>연결 중…</p>
            : msgs.length === 0 ? <p style={{ color: 'var(--caption)', fontSize: 13, textAlign: 'center', marginTop: 20 }}>첫 메시지를 보내보세요.</p>
            : msgs.map((m, idx) => {
              const showDay = idx === 0 || dayKey(m.createdAt) !== dayKey(msgs[idx - 1].createdAt);
              const rx = m.reactions ?? {}; const rxKeys = Object.keys(rx).filter((k) => (rx[k] ?? []).length > 0);
              return (
                <div key={m.id}>
                  {showDay && <div style={{ textAlign: 'center', margin: '10px 0 6px' }}><span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--line-soft,#e4eaf1)', borderRadius: 999, padding: '3px 10px' }}>{dayLabel(m.createdAt)}</span></div>}
                  <div onMouseEnter={() => setHover(m.id)} onMouseLeave={() => setHover((h) => (h === m.id ? null : h))} style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '82%', marginLeft: m.mine ? 'auto' : 0, marginTop: 4, position: 'relative' }}>
                    {m.replyTo && <div style={{ fontSize: 11, color: 'var(--muted)', borderLeft: '3px solid var(--teal)', padding: '2px 8px', background: 'var(--line-soft,#eef2f7)', borderRadius: 6, marginBottom: 3, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>↩ {m.replyTo.senderId === myPid ? '나' : '상대'}: {snippet(m.replyTo)}</div>}
                    <div style={{ background: m.mine ? 'var(--teal)' : 'var(--surface)', color: m.mine ? '#fff' : 'var(--ink)', border: m.mine ? 'none' : '1px solid var(--line)', borderRadius: 12, padding: '8px 12px', fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {linkify(m.body ?? '', m.mine)}
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
                    {hover === m.id && rw && (
                      <div style={{ position: 'absolute', top: -12, [m.mine ? 'left' : 'right']: -6, display: 'flex', gap: 2, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 999, padding: 2, boxShadow: '0 2px 8px rgba(0,0,0,.08)' } as React.CSSProperties}>
                        <button title="답장" onClick={() => { setReply(m); setReactFor(null); }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, padding: '2px 5px' }}>↩</button>
                        <button title="반응" onClick={() => setReactFor((f) => (f === m.id ? null : m.id))} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, padding: '2px 5px' }}>😊</button>
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
          {peerTyping && <div style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', padding: '2px 4px' }}>입력 중…</div>}
          <div ref={endRef} />
        </div>
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
        {status !== 'off' && rw && (
          <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid var(--line)', alignItems: 'center' }}>
            <input className="input" value={text} onChange={(e) => onType(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder={reply ? '답장 입력…' : '메시지 입력…'} aria-label="메시지 입력" />
            <button className="btn sm" onClick={send} disabled={!text.trim()}>전송</button>
          </div>
        )}
      </div>
    </div>
  );
}
