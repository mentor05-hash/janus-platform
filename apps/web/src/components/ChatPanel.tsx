import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { api } from '../api/client';
import { AuthImage } from './AuthImage';
import { mineOf } from '../utils/chat';

type Msg = { id: string; senderId: string | null; mine?: boolean; kind: string; body: string | null; imageFileId: string | null; createdAt: string; readAt?: string | null };
const KST = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

/** 예약 기반 실시간 채팅. myId 로 좌/우 정렬(브로드캐스트 메시지엔 mine 미포함). */
export function ChatPanel({ bookingId, myId, title, onClose }: { bookingId: string; myId: string; title?: string; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'connecting' | 'ready' | 'off'>('connecting');
  const [peerTyping, setPeerTyping] = useState(false);
  const sockRef = useRef<Socket | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [camOn, setCamOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const typingOffRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerTypingOffRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    s.on('chat:message', (m: Msg) => {
      setMsgs((p) => [...p, { ...m, mine: mineOf(m, myId) }]);
      if (!mineOf(m, myId)) s.emit('chat:read', { bookingId }); // 열람 중이면 즉시 읽음
    });
    // 상대가 내 메시지를 읽음 → 내 메시지에 읽음 표시
    s.on('chat:read', ({ readerId, at }: { readerId: string; at: string }) => {
      setMsgs((p) => p.map((m) => (m.senderId !== readerId && !m.readAt ? { ...m, readAt: at } : m)));
    });
    s.on('chat:typing', ({ userId, typing }: { userId: string; typing: boolean }) => {
      if (userId === myId) return;
      setPeerTyping(typing);
      if (peerTypingOffRef.current) clearTimeout(peerTypingOffRef.current);
      if (typing) peerTypingOffRef.current = setTimeout(() => setPeerTyping(false), 3500);
    });
    return () => { s.disconnect(); };
  }, [bookingId, myId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, peerTyping]);

  function onType(v: string) {
    setText(v);
    sockRef.current?.emit('chat:typing', { bookingId, typing: true });
    if (typingOffRef.current) clearTimeout(typingOffRef.current);
    typingOffRef.current = setTimeout(() => sockRef.current?.emit('chat:typing', { bookingId, typing: false }), 1500);
  }
  function send() {
    const body = text.trim();
    if (!body) return;
    sockRef.current?.emit('chat:send', { bookingId, body });
    sockRef.current?.emit('chat:typing', { bookingId, typing: false });
    setText('');
  }
  async function sendImage(blob: Blob, name: string) {
    const form = new FormData(); form.append('file', blob, name);
    const r = await api.upload<{ id: string }>('/files', form);
    sockRef.current?.emit('chat:send', { bookingId, imageFileId: r.id });
  }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f || !f.type.startsWith('image/')) return;
    await sendImage(f, f.name);
  }
  async function openCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      camStreamRef.current = stream; setCamOn(true);
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play(); } }, 30);
    } catch { alert('카메라를 사용할 수 없어요. 권한을 확인해 주세요.'); }
  }
  function closeCamera() { camStreamRef.current?.getTracks().forEach((t) => t.stop()); camStreamRef.current = null; setCamOn(false); }
  async function capture() {
    const v = videoRef.current; if (!v) return;
    const cw = v.videoWidth || 1280, ch = v.videoHeight || 720;
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    c.getContext('2d')!.drawImage(v, 0, 0, cw, ch); // getUserMedia 캡처 = 무소음
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.85));
    closeCamera();
    await sendImage(blob, 'shot.jpg');
  }
  useEffect(() => () => closeCamera(), []);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 950, background: 'rgba(8,16,20,0.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label={title ?? '상담 채팅'} onClick={(e) => e.stopPropagation()} className="card" style={{ position: 'relative', width: '100%', maxWidth: 460, height: '80vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
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
                <div style={{ fontSize: 10, color: 'var(--caption)', textAlign: m.mine ? 'right' : 'left', marginTop: 2 }}>
                  {m.mine && m.readAt && <span style={{ color: 'var(--teal)', marginRight: 4 }}>읽음</span>}{KST(m.createdAt)}
                </div>
              </div>
            ))}
          {peerTyping && <div style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', padding: '2px 4px' }}>입력 중…</div>}
          <div ref={endRef} />
        </div>
        {status !== 'off' && (
          <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid var(--line)', alignItems: 'center' }}>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
            <button onClick={() => fileRef.current?.click()} title="이미지 첨부" aria-label="이미지 첨부" style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }}>🖼</button>
            <button onClick={openCamera} title="사진 촬영(무음)" aria-label="사진 촬영" style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }}>📷</button>
            <input className="input" value={text} onChange={(e) => onType(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="메시지 입력…" aria-label="메시지 입력" />
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
