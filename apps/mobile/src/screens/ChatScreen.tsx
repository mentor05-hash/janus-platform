import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { api } from '../api';
import { R, useTheme, type Palette } from '../theme';
import { useWebBack } from '../webBack';
import { useVoiceCall } from '../voiceCall';
import { useSessionPhase, canInteract, sessionNotice, phaseOf, type SessionInfo } from '../session';

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
const mineOf = (m: Msg, myId: string) => (typeof m.mine === 'boolean' ? m.mine : m.senderId === myId);
function dayKey(iso: string) { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
function dayLabel(iso: string) {
  const d = new Date(iso); const t = new Date(); const y = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1);
  if (dayKey(iso) === dayKey(t.toISOString())) return '오늘';
  if (dayKey(iso) === dayKey(y.toISOString())) return '어제';
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. (${WD[d.getDay()]})`;
}
const snippet = (m: ReplyPreview) => (m?.kind === 'image' ? '📷 사진' : m?.kind === 'file' ? '📎 파일' : (m?.body ?? ''));

/** 인증 이미지 렌더(채팅 버블용). */
function ChatImage({ fileId }: { fileId: string }) {
  const { C } = useTheme();
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => { let live = true; api.fileBlobUrl(fileId).then((u) => { if (live) setUri(u); }).catch(() => {}); return () => { live = false; }; }, [fileId]);
  if (!uri) return <View style={{ width: 150, height: 110, borderRadius: 8, backgroundColor: C.lineSoft }} />;
  return <Image source={{ uri }} style={{ width: 150, height: 110, borderRadius: 8, resizeMode: 'cover' }} />;
}

/** 본문 텍스트를 URL 링크와 함께 렌더. */
function BodyText({ body, mine, C }: { body: string; mine: boolean; C: Palette }) {
  const parts = body.split(/(https?:\/\/[^\s]+)/g);
  return (
    <Text style={[styles0.bubbleT, mine && { color: '#fff' }]}>
      {parts.map((p, i) => /^https?:\/\//.test(p)
        ? <Text key={i} onPress={() => Linking.openURL(p).catch(() => {})} style={{ textDecorationLine: 'underline', color: mine ? '#CDEAFD' : C.teal }}>{p}</Text>
        : <Text key={i}>{p}</Text>)}
    </Text>
  );
}
const styles0 = StyleSheet.create({ bubbleT: { fontSize: 14, lineHeight: 20 } });

/** 예약 기반 실시간 채팅(모바일). 답장·이모지 반응·낙관적 전송·날짜 구분·링크·읽음·타이핑. */
export function ChatScreen({ bookingId, myId, title, onClose, embedded }: { bookingId: string; myId: string; title: string; onClose: () => void; embedded?: boolean }) {
  const { C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'connecting' | 'ready' | 'off'>('connecting');
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [reply, setReply] = useState<Msg | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [unseen, setUnseen] = useState(0);
  const sockRef = useRef<Socket | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const typingOffRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerTypingOffRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const atBottomRef = useRef(true);
  const tmpN = useRef(0);
  const call = useVoiceCall(() => sockRef.current, bookingId);
  useWebBack(!embedded, onClose);

  useEffect(() => {
    const token = (typeof localStorage !== 'undefined' ? localStorage.getItem('mp_access') : '') ?? '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const s = io(origin, { path: '/api/v1/socket.io', auth: { token }, transports: ['websocket'] });
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
      setMsgs((p) => {
        if (p.some((x) => x.id === m.id)) return p;
        let base = p;
        if (mineOf(m, myId)) {
          const i = base.findIndex((x) => x.pending && x.id.startsWith('tmp-') && x.body === m.body && x.kind === m.kind);
          if (i >= 0) base = base.filter((_, k) => k !== i);
        }
        return [...base, { ...m, mine: mineOf(m, myId) }];
      });
      if (!mineOf(m, myId)) { s.emit('chat:read', { bookingId }); if (!atBottomRef.current) setUnseen((u) => u + 1); }
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

  useEffect(() => { if (atBottomRef.current) { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50); setUnseen(0); } }, [msgs, peerTyping]);
  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const near = contentSize.height - contentOffset.y - layoutMeasurement.height < 60;
    atBottomRef.current = near; if (near) setUnseen(0);
  }
  function jumpBottom() { atBottomRef.current = true; setUnseen(0); scrollRef.current?.scrollToEnd({ animated: true }); }

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
  function react(messageId: string, emoji: string) { if (!canInteract(phaseOf(session))) return; sockRef.current?.emit('chat:react', { bookingId, messageId, emoji }); setMenuFor(null); }

  async function sendImage(blob: Blob, name: string) {
    try { const r = await api.uploadWeb(blob as unknown as File, name); sockRef.current?.emit('chat:send', { bookingId, imageFileId: r.id }); } catch { /* noop */ }
  }
  function pickImage() {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
    input.onchange = async () => { const f = input.files?.[0]; if (f && f.type.startsWith('image/')) await sendImage(f, f.name); };
    input.click();
  }
  function pickDoc() {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input'); input.type = 'file';
    input.onchange = async () => { const f = input.files?.[0]; if (!f) return; try { const r = await api.uploadWeb(f as unknown as File, f.name); sockRef.current?.emit('chat:send', { bookingId, fileId: r.id, fileName: f.name }); } catch { /* noop */ } };
    input.click();
  }
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
      const shot = mk('📸 촬영(무음)', '#2F6FB3'); shot.onclick = async () => { const cw = v.videoWidth || 1280, ch = v.videoHeight || 720; const c = document.createElement('canvas'); c.width = cw; c.height = ch; c.getContext('2d')!.drawImage(v, 0, 0, cw, ch); const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.85)); closeCamera(); await sendImage(blob, 'shot.jpg'); };
      bar.append(cancel, shot); ov.append(v, bar); document.body.appendChild(ov);
    } catch { /* 권한 거부 */ }
  }
  function closeCamera() { camStreamRef.current?.getTracks().forEach((t) => t.stop()); camStreamRef.current = null; if (typeof document !== 'undefined') document.getElementById('chat-cam-ov')?.remove(); }
  useEffect(() => () => closeCamera(), []);
  const phase = useSessionPhase(session);
  const rw = canInteract(phase); // 지금 쓰기(메시지·반응·답장·음성) 가능 여부
  const notice = sessionNotice(phase, session);
  // 세션 창이 닫히면(강제 종료) 진행 중 음성통화도 자동 종료.
  useEffect(() => { if (!rw && call.inCall) call.hangup(); }, [rw, call.inCall]); // eslint-disable-line react-hooks/exhaustive-deps

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
              : rw ? <TouchableOpacity onPress={call.start}><Text style={{ fontSize: 18 }}>📞</Text></TouchableOpacity> : null)}
            {!embedded && <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Text style={styles.close}>✕</Text></TouchableOpacity>}
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <ScrollView ref={scrollRef} style={styles.body} contentContainerStyle={{ padding: 14, gap: 4 }} onScroll={onScroll} scrollEventThrottle={80}>
            {status === 'off' ? <Text style={styles.hint}>채팅이 비활성화되어 있어요.</Text>
              : status === 'connecting' ? <ActivityIndicator color={C.teal} style={{ marginTop: 16 }} />
              : msgs.length === 0 ? <Text style={styles.hint}>첫 메시지를 보내보세요.</Text>
              : msgs.map((m, idx) => {
                const showDay = idx === 0 || dayKey(m.createdAt) !== dayKey(msgs[idx - 1].createdAt);
                const rx = m.reactions ?? {};
                const rxKeys = Object.keys(rx).filter((k) => (rx[k] ?? []).length > 0);
                return (
                  <View key={m.id}>
                    {showDay && <View style={styles.dayWrap}><Text style={styles.dayT}>{dayLabel(m.createdAt)}</Text></View>}
                    <View style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '82%', marginTop: 4 }}>
                      {m.replyTo && (
                        <View style={styles.quote}><Text numberOfLines={1} style={styles.quoteT}>↩ {m.replyTo.senderId === myId ? '나' : '상대'}: {snippet(m.replyTo)}</Text></View>
                      )}
                      <TouchableOpacity activeOpacity={0.85} onLongPress={() => rw && !m.pending && !m.failed && setMenuFor((f) => (f === m.id ? null : m.id))} delayLongPress={280}>
                        <View style={[styles.bubble, m.mine ? styles.mine : styles.theirs, m.kind === 'image' && { padding: 5 }, m.pending && { opacity: 0.6 }]}>
                          {m.kind === 'image' && m.imageFileId ? <ChatImage fileId={m.imageFileId} />
                            : m.kind === 'file' && m.imageFileId ? (
                              <TouchableOpacity onPress={() => api.downloadWeb(m.imageFileId!, m.body ?? '첨부파일')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={{ fontSize: 18 }}>📎</Text>
                                <Text style={[styles.bubbleT, m.mine && { color: '#fff' }, { textDecorationLine: 'underline' }]}>{m.body ?? '첨부파일'}</Text>
                              </TouchableOpacity>
                            ) : <BodyText body={m.body ?? ''} mine={!!m.mine} C={C} />}
                        </View>
                      </TouchableOpacity>
                      {rxKeys.length > 0 && (
                        <View style={[styles.rxRow, { justifyContent: m.mine ? 'flex-end' : 'flex-start' }]}>
                          {rxKeys.map((e) => { const mineR = (rx[e] ?? []).includes(myId); return (
                            <TouchableOpacity key={e} onPress={() => react(m.id, e)} style={[styles.rxChip, mineR && { borderColor: C.teal, backgroundColor: C.lineSoft }]}>
                              <Text style={{ fontSize: 11, color: C.ink }}>{e} {(rx[e] ?? []).length}</Text>
                            </TouchableOpacity>
                          ); })}
                        </View>
                      )}
                      {menuFor === m.id && (
                        <View style={styles.menu}>
                          <TouchableOpacity onPress={() => { setReply(m); setMenuFor(null); }} style={styles.menuBtn}><Text style={{ fontSize: 13, color: C.ink }}>↩ 답장</Text></TouchableOpacity>
                          {REACTIONS.map((e) => <TouchableOpacity key={e} onPress={() => react(m.id, e)} style={styles.menuEmoji}><Text style={{ fontSize: 17 }}>{e}</Text></TouchableOpacity>)}
                        </View>
                      )}
                      <Text style={[styles.time, { textAlign: m.mine ? 'right' : 'left' }]}>
                        {m.failed
                          ? <Text onPress={() => retry(m)} style={{ color: '#E5484D' }}>⚠ 전송 실패 · 재시도</Text>
                          : m.pending ? '전송 중…'
                          : `${m.mine && m.readAt ? '읽음 · ' : ''}${KST(m.createdAt)}`}
                      </Text>
                    </View>
                  </View>
                );
              })}
            {peerTyping && <Text style={[styles.hint, { textAlign: 'left', marginTop: 2, fontStyle: 'italic' }]}>입력 중…</Text>}
          </ScrollView>
          {unseen > 0 && (
            <TouchableOpacity onPress={jumpBottom} style={styles.pill}><Text style={styles.pillT}>새 메시지 {unseen} ↓</Text></TouchableOpacity>
          )}
        </View>
        {reply && rw && (
          <View style={styles.replyBar}>
            <Text style={{ color: C.teal, fontWeight: '800', fontSize: 12 }}>↩ 답장</Text>
            <Text numberOfLines={1} style={{ flex: 1, color: C.muted, fontSize: 12 }}>{reply.senderId === myId ? '나' : '상대'}: {snippet({ id: reply.id, senderId: reply.senderId, kind: reply.kind, body: reply.body })}</Text>
            <TouchableOpacity onPress={() => setReply(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Text style={{ color: C.muted, fontSize: 14 }}>✕</Text></TouchableOpacity>
          </View>
        )}
        {status !== 'off' && !rw && (
          <View style={[styles.notice, phase === 'closed' && { backgroundColor: C.lineSoft }]}>
            <Text style={styles.noticeT}>{phase === 'closed' ? '🔒 ' : '⏳ '}{notice}</Text>
          </View>
        )}
        {status !== 'off' && rw && (
          <View style={styles.inputRow}>
            <TouchableOpacity onPress={pickImage} style={styles.imgBtn}><Text style={{ fontSize: 20 }}>🖼</Text></TouchableOpacity>
            <TouchableOpacity onPress={openCamera} style={styles.imgBtn}><Text style={{ fontSize: 20 }}>📷</Text></TouchableOpacity>
            <TouchableOpacity onPress={pickDoc} style={styles.imgBtn}><Text style={{ fontSize: 20 }}>📎</Text></TouchableOpacity>
            <TextInput style={styles.input} value={text} onChangeText={onType} placeholder={reply ? '답장 입력…' : '메시지 입력…'} placeholderTextColor={C.caption} onSubmitEditing={send} returnKeyType="send" />
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
  dayWrap: { alignItems: 'center', marginVertical: 6 },
  dayT: { fontSize: 11, color: C.muted, backgroundColor: C.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },
  quote: { borderLeftWidth: 3, borderLeftColor: C.teal, backgroundColor: C.line, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 3, maxWidth: 240 },
  quoteT: { fontSize: 11, color: C.muted },
  bubble: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  mine: { backgroundColor: C.teal },
  theirs: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  bubbleT: { fontSize: 14, color: C.ink, lineHeight: 20 },
  rxRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 },
  rxChip: { borderWidth: 1, borderColor: C.line, backgroundColor: C.white, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  menu: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 3, alignSelf: 'flex-start' },
  menuBtn: { paddingHorizontal: 6, paddingVertical: 2, borderRightWidth: 1, borderRightColor: C.line },
  menuEmoji: { paddingHorizontal: 3, paddingVertical: 1 },
  time: { fontSize: 10, color: C.caption, marginTop: 2 },
  pill: { position: 'absolute', bottom: 10, alignSelf: 'center', backgroundColor: C.teal, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  pillT: { color: '#fff', fontWeight: '800', fontSize: 12 },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 7, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.lineSoft },
  notice: { paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.lineSoft, alignItems: 'center' },
  noticeT: { fontSize: 12.5, color: C.muted, textAlign: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderTopWidth: 1, borderTopColor: C.line },
  imgBtn: { padding: 4 },
  input: { flex: 1, backgroundColor: C.lineSoft, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: C.ink },
  sendBtn: { backgroundColor: C.teal, borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 9 },
  sendT: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
