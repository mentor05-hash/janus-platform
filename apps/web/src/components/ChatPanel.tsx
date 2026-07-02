import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { api } from '../api/client';
import { AuthImage } from './AuthImage';
import { mineOf } from '../utils/chat';

type Msg = { id: string; senderId: string | null; mine?: boolean; kind: string; body: string | null; imageFileId: string | null; createdAt: string };
const KST = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

/** 예약 기반 실시간 채팅. myId 로 좌/우 정렬(브로드캐스트 메시지엔 mine 미포함). */
export function ChatPanel({ bookingId, myId, title, onClose }: { bookingId: string; myId: string; title?: string; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'connecting' | 'ready' | 'off'>('connecting');
  const sockRef = useRef<Socket | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem('itall_access') ?? '';
    const s = io(window.location.origin, { path: '/api/v1/socket.io', auth: { token }, transports: ['websocket'] });
    sockRef.current = s;
    s.on('connect', () => {
      s.emit('chat:join', { bookingId }, (r: { ok: boolean; access?: { chat: boolean }; messages?: Msg[] }) => {
        if (!r?.access?.chat) { setStatus('off'); return; }
        setMsgs((r.messages ?? []).map((m) => ({ ...m, mine: mineOf(m, myId) })));
        setStatus('ready');
      });
    });
    s.on('chat:message', (m: Msg) => setMsgs((p) => [...p, { ...m, mine: mineOf(m, myId) }]));
    return () => { s.disconnect(); };
  }, [bookingId, myId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  function send() {
    const body = text.trim();
    if (!body) return;
    sockRef.current?.emit('chat:send', { bookingId, body });
    setText('');
  }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f || !f.type.startsWith('image/')) return;
    const form = new FormData(); form.append('file', f, f.name);
    const r = await api.upload<{ id: string }>('/files', form);
    sockRef.current?.emit('chat:send', { bookingId, imageFileId: r.id });
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 950, background: 'rgba(8,16,20,0.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label={title ?? '상담 채팅'} onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 460, height: '80vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ fontSize: 15 }}>💬 {title ?? '상담 채팅'}</b>
          <button onClick={onClose} aria-label="닫기" style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surface-2,#f6f8fa)' }}>
          {status === 'off' ? <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', marginTop: 20 }}>채팅이 비활성화되어 있어요.</p>
            : status === 'connecting' ? <p style={{ color: 'var(--caption)', fontSize: 13, textAlign: 'center' }}>연결 중…</p>
            : msgs.length === 0 ? <p style={{ color: 'var(--caption)', fontSize: 13, textAlign: 'center', marginTop: 20 }}>첫 메시지를 보내보세요.</p>
            : msgs.map((m) => (
              <div key={m.id} style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
                <div style={{ background: m.mine ? 'var(--teal)' : 'var(--surface)', color: m.mine ? '#fff' : 'var(--ink)', border: m.mine ? 'none' : '1px solid var(--line)', borderRadius: 12, padding: m.kind === 'image' ? 6 : '8px 12px', fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {m.kind === 'image' && m.imageFileId ? <AuthImage fileId={m.imageFileId} size={160} /> : m.body}
                </div>
                <div style={{ fontSize: 10, color: 'var(--caption)', textAlign: m.mine ? 'right' : 'left', marginTop: 2 }}>{KST(m.createdAt)}</div>
              </div>
            ))}
          <div ref={endRef} />
        </div>
        {status !== 'off' && (
          <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid var(--line)', alignItems: 'center' }}>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
            <button onClick={() => fileRef.current?.click()} title="이미지" aria-label="이미지 첨부" style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }}>📷</button>
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="메시지 입력…" aria-label="메시지 입력" />
            <button className="btn sm" onClick={send} disabled={!text.trim()}>전송</button>
          </div>
        )}
      </div>
    </div>
  );
}
