import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { api } from '../api';
import { R, useTheme, type Palette } from '../theme';
import { useWebBack } from '../webBack';
import { useVoiceCall } from '../voiceCall';

type Msg = { id: string; senderId: string | null; mine?: boolean; kind: string; body: string | null; imageFileId: string | null; createdAt: string; readAt?: string | null };
const KST = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
// 서버가 계산한 mine 을 신뢰(수신자별). 없을 때만 클라이언트 myId 로 폴백.
const mineOf = (m: Msg, myId: string) => (typeof m.mine === 'boolean' ? m.mine : m.senderId === myId);

/** 인증 이미지 렌더(채팅 버블용). */
function ChatImage({ fileId }: { fileId: string }) {
  const { C } = useTheme();
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => { let live = true; api.fileBlobUrl(fileId).then((u) => { if (live) setUri(u); }).catch(() => {}); return () => { live = false; }; }, [fileId]);
  if (!uri) return <View style={{ width: 150, height: 110, borderRadius: 8, backgroundColor: C.lineSoft }} />;
  return <Image source={{ uri }} style={{ width: 150, height: 110, borderRadius: 8, resizeMode: 'cover' }} />;
}

/** 예약 기반 실시간 채팅(모바일). myId 로 좌/우 정렬. */
export function ChatScreen({ bookingId, myId, title, onClose, embedded }: { bookingId: string; myId: string; title: string; onClose: () => void; embedded?: boolean }) {
  const { C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'connecting' | 'ready' | 'off'>('connecting');
  const [peerTyping, setPeerTyping] = useState(false);
  const sockRef = useRef<Socket | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const typingOffRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerTypingOffRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const call = useVoiceCall(() => sockRef.current, bookingId);
  useWebBack(!embedded, onClose); // 임베드(통합 화면)면 back은 호스트가 처리

  useEffect(() => {
    const token = (typeof localStorage !== 'undefined' ? localStorage.getItem('itall_access') : '') ?? '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const s = io(origin, { path: '/api/v1/socket.io', auth: { token }, transports: ['websocket'] });
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
      if (!mineOf(m, myId)) s.emit('chat:read', { bookingId });
    });
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

  useEffect(() => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50); }, [msgs, peerTyping]);

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
    try { const r = await api.uploadWeb(blob as unknown as File, name); sockRef.current?.emit('chat:send', { bookingId, imageFileId: r.id }); } catch { /* noop */ }
  }
  function pickImage() {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async () => { const f = input.files?.[0]; if (f && f.type.startsWith('image/')) await sendImage(f, f.name); };
    input.click();
  }
  function pickDoc() {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async () => {
      const f = input.files?.[0]; if (!f) return;
      try { const r = await api.uploadWeb(f as unknown as File, f.name); sockRef.current?.emit('chat:send', { bookingId, fileId: r.id, fileName: f.name }); } catch { /* noop */ }
    };
    input.click();
  }
  /** 무소음 카메라 촬영 — getUserMedia 로 body 레벨 DOM 오버레이(네이티브 셔터음 없음). */
  async function openCamera() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof document === 'undefined') return;
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      camStreamRef.current = st;
      const ov = document.createElement('div'); ov.id = 'chat-cam-ov';
      ov.style.cssText = 'position:fixed;inset:0;background:#000;display:flex;flex-direction:column;z-index:9999;';
      const v = document.createElement('video'); v.playsInline = true; v.muted = true;
      v.style.cssText = 'flex:1;width:100%;object-fit:contain;min-height:0;'; v.srcObject = st; void v.play();
      const bar = document.createElement('div'); bar.style.cssText = 'display:flex;gap:12px;justify-content:center;padding:16px;background:#000;';
      const mk = (t: string, bg: string) => { const b = document.createElement('button'); b.textContent = t; b.style.cssText = `padding:11px 20px;border-radius:10px;border:none;font-weight:800;font-size:15px;color:#fff;background:${bg};`; return b; };
      const cancel = mk('취소', '#3a4a52'); cancel.onclick = () => closeCamera();
      const shot = mk('📸 촬영(무음)', '#0E5C7C'); shot.onclick = async () => { const cw = v.videoWidth || 1280, ch = v.videoHeight || 720; const c = document.createElement('canvas'); c.width = cw; c.height = ch; c.getContext('2d')!.drawImage(v, 0, 0, cw, ch); const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.85)); closeCamera(); await sendImage(blob, 'shot.jpg'); };
      bar.append(cancel, shot); ov.append(v, bar); document.body.appendChild(ov);
    } catch { /* 권한 거부 */ }
  }
  function closeCamera() { camStreamRef.current?.getTracks().forEach((t) => t.stop()); camStreamRef.current = null; if (typeof document !== 'undefined') document.getElementById('chat-cam-ov')?.remove(); }
  useEffect(() => () => closeCamera(), []);

  return (
    <View style={embedded ? styles.embWrap : styles.overlay}>
      <View style={[styles.sheet, embedded && styles.embSheet]}>
        <View style={styles.head}>
          <Text style={styles.headT}>💬 {title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {status === 'ready' && call.supported && (call.inCall
              ? <>
                  <TouchableOpacity onPress={call.toggleMute}><Text style={{ fontSize: 18 }}>{call.muted ? '🔇' : '🎙'}</Text></TouchableOpacity>
                  <TouchableOpacity onPress={call.hangup}><Text style={{ color: '#E5484D', fontWeight: '800', fontSize: 13 }}>종료</Text></TouchableOpacity>
                </>
              : <TouchableOpacity onPress={call.start}><Text style={{ fontSize: 18 }}>📞</Text></TouchableOpacity>)}
            {!embedded && <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Text style={styles.close}>✕</Text></TouchableOpacity>}
          </View>
        </View>
        <ScrollView ref={scrollRef} style={styles.body} contentContainerStyle={{ padding: 14, gap: 8 }}>
          {status === 'off' ? <Text style={styles.hint}>채팅이 비활성화되어 있어요.</Text>
            : status === 'connecting' ? <ActivityIndicator color={C.teal} style={{ marginTop: 16 }} />
            : msgs.length === 0 ? <Text style={styles.hint}>첫 메시지를 보내보세요.</Text>
            : msgs.map((m) => (
              <View key={m.id} style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                <View style={[styles.bubble, m.mine ? styles.mine : styles.theirs, m.kind === 'image' && { padding: 5 }]}>
                  {m.kind === 'image' && m.imageFileId ? <ChatImage fileId={m.imageFileId} />
                    : m.kind === 'file' && m.imageFileId ? (
                      <TouchableOpacity onPress={() => api.downloadWeb(m.imageFileId!, m.body ?? '첨부파일')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 18 }}>📎</Text>
                        <Text style={[styles.bubbleT, m.mine && { color: '#fff' }, { textDecorationLine: 'underline' }]}>{m.body ?? '첨부파일'}</Text>
                      </TouchableOpacity>
                    ) : <Text style={[styles.bubbleT, m.mine && { color: '#fff' }]}>{m.body}</Text>}
                </View>
                <Text style={[styles.time, { textAlign: m.mine ? 'right' : 'left' }]}>{m.mine && m.readAt ? '읽음 · ' : ''}{KST(m.createdAt)}</Text>
              </View>
            ))}
          {peerTyping && <Text style={[styles.hint, { textAlign: 'left', marginTop: 2, fontStyle: 'italic' }]}>입력 중…</Text>}
        </ScrollView>
        {status !== 'off' && (
          <View style={styles.inputRow}>
            <TouchableOpacity onPress={pickImage} style={styles.imgBtn}><Text style={{ fontSize: 20 }}>🖼</Text></TouchableOpacity>
            <TouchableOpacity onPress={openCamera} style={styles.imgBtn}><Text style={{ fontSize: 20 }}>📷</Text></TouchableOpacity>
            <TouchableOpacity onPress={pickDoc} style={styles.imgBtn}><Text style={{ fontSize: 20 }}>📎</Text></TouchableOpacity>
            <TextInput style={styles.input} value={text} onChangeText={onType} placeholder="메시지 입력…" placeholderTextColor={C.caption} onSubmitEditing={send} returnKeyType="send" />
            <TouchableOpacity onPress={send} disabled={!text.trim()} style={[styles.sendBtn, !text.trim() && { opacity: 0.5 }]}><Text style={styles.sendT}>전송</Text></TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(8,16,20,0.5)', justifyContent: 'center', alignItems: 'center', padding: 12, zIndex: 100 },
  embWrap: { flex: 1, backgroundColor: C.bg },
  sheet: { width: '100%', maxWidth: 460, height: '86%', backgroundColor: C.bg, borderRadius: 14, overflow: 'hidden' },
  embSheet: { maxWidth: 100000, height: '100%', borderRadius: 0 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  headT: { fontSize: 15, fontWeight: '800', color: C.ink },
  close: { fontSize: 18, color: C.muted },
  body: { flex: 1, backgroundColor: C.lineSoft },
  hint: { color: C.caption, fontSize: 13, textAlign: 'center', marginTop: 20 },
  bubble: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  mine: { backgroundColor: C.teal },
  theirs: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  bubbleT: { fontSize: 14, color: C.ink, lineHeight: 20 },
  time: { fontSize: 10, color: C.caption, marginTop: 2 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderTopWidth: 1, borderTopColor: C.line },
  imgBtn: { padding: 4 },
  input: { flex: 1, backgroundColor: C.lineSoft, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: C.ink },
  sendBtn: { backgroundColor: C.teal, borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 9 },
  sendT: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
