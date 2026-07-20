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
const snippet = (m: ReplyPreview) => (m?.kind === 'image' ? '📷 사진' : m?.kind === 'file' ? '📎 파일' : m?.kind === 'audio' ? '🎤 음성 메시지' : (m?.body ?? ''));

// ⑥ 자주 쓰는 문구(선생님) — 웹 ChatPanel 과 같은 로컬 키.
const PHRASE_KEY = 'janus_chat_phrases';
const PHRASE_DEFAULTS = ['안녕하세요! 오늘 상담 시작할게요 😊', '잠시만요, 확인해 볼게요.', '과제는 다음 시간까지 완료해 주세요!', '오늘 수업 여기까지! 수고했어요 👏'];
function loadPhrases(): string[] {
  try { const v = JSON.parse((typeof localStorage !== 'undefined' ? localStorage.getItem(PHRASE_KEY) : null) ?? 'null'); if (Array.isArray(v)) return v.filter((x) => typeof x === 'string').slice(0, 8); } catch { /* 무시 */ }
  return PHRASE_DEFAULTS;
}
function savePhrases(p: string[]) { try { if (typeof localStorage !== 'undefined') localStorage.setItem(PHRASE_KEY, JSON.stringify(p.slice(0, 8))); } catch { /* 무시 */ } }

/** 음성 메시지 재생 버블(웹 런타임 — HTMLAudio 사용). */
function AudioBubble({ fileId, mine, C }: { fileId: string; mine: boolean; C: Palette }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => { audioRef.current?.pause(); }, []);
  async function toggle() {
    if (playing) { audioRef.current?.pause(); setPlaying(false); return; }
    try {
      if (!audioRef.current) {
        const url = await api.fileBlobUrl(fileId);
        const a = new Audio(url); a.onended = () => setPlaying(false); audioRef.current = a;
      }
      await audioRef.current.play(); setPlaying(true);
    } catch { /* 재생 실패 무시 */ }
  }
  return (
    <TouchableOpacity onPress={toggle} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 }}>
      <Text style={{ fontSize: 18 }}>{playing ? '⏸' : '▶️'}</Text>
      <Text style={{ fontSize: 13, color: mine ? '#fff' : C.ink }}>음성 메시지</Text>
    </TouchableOpacity>
  );
}

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
  const [myRole, setMyRole] = useState<string>(''); // ⑥ 자주 쓰는 문구 노출용(선생님만)
  const [view, setView] = useState<'chat' | 'media'>('chat'); // ⑦ 모아보기
  const [phrases, setPhrases] = useState<string[]>(loadPhrases);
  const [phraseEdit, setPhraseEdit] = useState(false);
  const [recOn, setRecOn] = useState(false); // ④ 음성 메시지
  const recRef = useRef<MediaRecorder | null>(null);
  const recStreamRef = useRef<MediaStream | null>(null);
  const recTypingRef = useRef<ReturnType<typeof setInterval> | null>(null); // 녹음 중 상대 표시 keep-alive
  const [peerVoice, setPeerVoice] = useState(false); // 상대가 음성 녹음 중
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
    s.on('chat:typing', ({ userId, typing, mode }: { userId: string; typing: boolean; mode?: string }) => {
      if (userId === myId) return;
      setPeerTyping(typing);
      setPeerVoice(typing && mode === 'voice');
      if (peerTypingOffRef.current) clearTimeout(peerTypingOffRef.current);
      if (typing) peerTypingOffRef.current = setTimeout(() => { setPeerTyping(false); setPeerVoice(false); }, 3500);
    });
    // ③ 삭제(회수) 통지 — 묘비로 교체
    s.on('chat:deleted', ({ messageId }: { messageId: string }) => {
      setMsgs((p) => p.map((mm) => (mm.id === messageId ? { ...mm, kind: 'deleted', body: null, imageFileId: null, reactions: {}, replyTo: null, replyToId: null } : mm)));
    });
    return () => { s.disconnect(); };
  }, [bookingId, myId]);
  useEffect(() => { api.me().then((me) => setMyRole(me.role)).catch(() => {}); }, []);

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
  // ③ 삭제(회수) — 본인 발신만(웹 런타임 confirm)
  function delMsg(m: Msg) {
    if (!m.mine || !canInteract(phaseOf(session))) return;
    const go = typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm('이 메시지를 삭제할까요? 상대 화면에서도 사라져요.') : true;
    if (!go) return;
    sockRef.current?.emit('chat:delete', { bookingId, messageId: m.id });
    setMenuFor(null);
  }
  // ④ 음성 메시지 — MediaRecorder(웹 런타임) → 업로드 → kind='audio'
  async function toggleRec() {
    if (recOn) { recRef.current?.stop(); return; }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof MediaRecorder === 'undefined') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recStreamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined;
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunks.push(ev.data); };
      rec.onstop = async () => {
        recStreamRef.current?.getTracks().forEach((t) => t.stop()); recStreamRef.current = null;
        setRecOn(false); recRef.current = null;
        if (recTypingRef.current) { clearInterval(recTypingRef.current); recTypingRef.current = null; }
        sockRef.current?.emit('chat:typing', { bookingId, typing: false });
        const blob = new Blob(chunks, { type: mime ?? 'audio/webm' });
        if (blob.size < 800) return;
        try {
          const r = await api.uploadWeb(blob, 'voice.webm');
          sockRef.current?.emit('chat:send', { bookingId, audioFileId: r.id, fileName: '음성 메시지' });
        } catch { /* 전송 실패 무시 */ }
      };
      rec.start(); recRef.current = rec; setRecOn(true);
      // 상대 화면에 "🎤 녹음 중…" 표시 — 표시 타임아웃(3.5s)보다 짧게 주기 재전송
      sockRef.current?.emit('chat:typing', { bookingId, typing: true, mode: 'voice' });
      recTypingRef.current = setInterval(() => sockRef.current?.emit('chat:typing', { bookingId, typing: true, mode: 'voice' }), 2000);
    } catch { /* 권한 거부 */ }
  }
  useEffect(() => () => { recRef.current?.stop(); recStreamRef.current?.getTracks().forEach((t) => t.stop()); if (recTypingRef.current) clearInterval(recTypingRef.current); }, []);
  // ⑥ 자주 쓰는 문구 관리(웹 prompt)
  function addPhrase() {
    if (typeof window === 'undefined' || typeof window.prompt !== 'function') return;
    const v = window.prompt('자주 쓰는 문구를 입력하세요 (최대 8개)');
    const t = v?.trim(); if (!t) return;
    setPhrases((p) => { const n = [...p.filter((x) => x !== t), t].slice(-8); savePhrases(n); return n; });
  }
  function removePhrase(t: string) { setPhrases((p) => { const n = p.filter((x) => x !== t); savePhrases(n); return n; }); }
  const mediaMsgs = msgs.filter((m) => (m.kind === 'image' || m.kind === 'file' || m.kind === 'audio') && m.imageFileId);

  async function sendImage(blob: Blob, name: string) {
    try { const r = await api.uploadWeb(blob as unknown as File, name); sockRef.current?.emit('chat:send', { bookingId, imageFileId: r.id }); } catch { /* noop */ }
  }
  // ① 사진 다중 선택 전송 — 선택 순서대로 각 1건씩
  function pickImage() {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
    input.onchange = async () => {
      const fs = Array.from(input.files ?? []).filter((f) => f.type.startsWith('image/'));
      for (const f of fs) await sendImage(f, f.name);
    };
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
            {status === 'ready' && (
              <TouchableOpacity onPress={() => setView((v) => (v === 'media' ? 'chat' : 'media'))} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Text style={{ fontSize: 16, opacity: view === 'media' ? 1 : 0.6 }}>🗂</Text>
              </TouchableOpacity>
            )}
            {status === 'ready' && call.supported && (call.inCall
              ? <>
                  <TouchableOpacity onPress={call.toggleMute}><Text style={{ fontSize: 18 }}>{call.muted ? '🔇' : '🎙'}</Text></TouchableOpacity>
                  <TouchableOpacity onPress={call.hangup}><Text style={{ color: '#E5484D', fontWeight: '800', fontSize: 13 }}>종료</Text></TouchableOpacity>
                </>
              : rw ? <TouchableOpacity onPress={call.start}><Text style={{ fontSize: 18 }}>📞</Text></TouchableOpacity> : null)}
            {!embedded && <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Text style={styles.close}>✕</Text></TouchableOpacity>}
          </View>
        </View>
        {view === 'media' && (
          <ScrollView style={styles.body} contentContainerStyle={{ padding: 14 }}>
            {mediaMsgs.length === 0 ? <Text style={styles.hint}>주고받은 사진·파일이 없어요.</Text> : (
              <>
                {mediaMsgs.some((m) => m.kind === 'image') && (
                  <>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: C.muted, marginBottom: 8 }}>📷 사진</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                      {mediaMsgs.filter((m) => m.kind === 'image').map((m) => <ChatImage key={m.id} fileId={m.imageFileId!} />)}
                    </View>
                  </>
                )}
                {mediaMsgs.some((m) => m.kind !== 'image') && (
                  <>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: C.muted, marginBottom: 8 }}>📎 파일·음성</Text>
                    <View style={{ gap: 6 }}>
                      {mediaMsgs.filter((m) => m.kind !== 'image').map((m) => (
                        <TouchableOpacity key={m.id} onPress={() => api.downloadWeb(m.imageFileId!, m.body ?? '첨부파일')}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.white, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}>
                          <Text>{m.kind === 'audio' ? '🎤' : '📎'}</Text>
                          <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: C.ink }}>{m.body ?? '첨부파일'}</Text>
                          <Text style={{ fontSize: 11, color: C.caption }}>{dayLabel(m.createdAt)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
              </>
            )}
          </ScrollView>
        )}
        {view === 'chat' && (
        <View style={{ flex: 1 }}>
          <ScrollView ref={scrollRef} style={styles.body} contentContainerStyle={{ padding: 14, gap: 4 }} onScroll={onScroll} scrollEventThrottle={80}>
            {status === 'off' ? <Text style={styles.hint}>채팅이 비활성화되어 있어요.</Text>
              : status === 'connecting' ? <ActivityIndicator color={C.teal} style={{ marginTop: 16 }} />
              : msgs.length === 0 ? <Text style={styles.hint}>첫 메시지를 보내보세요.</Text>
              : msgs.map((m, idx) => {
                const showDay = idx === 0 || dayKey(m.createdAt) !== dayKey(msgs[idx - 1].createdAt);
                const rx = m.reactions ?? {};
                const rxKeys = Object.keys(rx).filter((k) => (rx[k] ?? []).length > 0);
                // ⑤ 시스템 메시지 — 중앙 회색 칩
                if (m.kind === 'system') {
                  return (
                    <View key={m.id}>
                      {showDay && <View style={styles.dayWrap}><Text style={styles.dayT}>{dayLabel(m.createdAt)}</Text></View>}
                      <View style={{ alignItems: 'center', marginVertical: 6 }}>
                        <Text style={{ fontSize: 11.5, color: C.muted, backgroundColor: C.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, overflow: 'hidden', textAlign: 'center' }}>{m.body}</Text>
                      </View>
                    </View>
                  );
                }
                return (
                  <View key={m.id}>
                    {showDay && <View style={styles.dayWrap}><Text style={styles.dayT}>{dayLabel(m.createdAt)}</Text></View>}
                    <View style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '82%', marginTop: 4 }}>
                      {m.replyTo && (
                        <View style={styles.quote}><Text numberOfLines={1} style={styles.quoteT}>↩ {m.replyTo.senderId === myId ? '나' : '상대'}: {snippet(m.replyTo)}</Text></View>
                      )}
                      <TouchableOpacity activeOpacity={0.85} onLongPress={() => rw && !m.pending && !m.failed && setMenuFor((f) => (f === m.id ? null : m.id))} delayLongPress={280}>
                        <View style={[styles.bubble, m.kind === 'deleted' ? { backgroundColor: C.lineSoft, borderWidth: 1, borderColor: C.line } : m.mine ? styles.mine : styles.theirs, m.kind === 'image' && { padding: 5 }, m.pending && { opacity: 0.6 }]}>
                          {m.kind === 'deleted' ? <Text style={{ fontSize: 12.5, fontStyle: 'italic', color: C.muted }}>🚫 삭제된 메시지예요</Text>
                            : m.kind === 'image' && m.imageFileId ? <ChatImage fileId={m.imageFileId} />
                            : m.kind === 'audio' && m.imageFileId ? <AudioBubble fileId={m.imageFileId} mine={!!m.mine} C={C} />
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
                      {menuFor === m.id && m.kind !== 'deleted' && (
                        <View style={styles.menu}>
                          <TouchableOpacity onPress={() => { setReply(m); setMenuFor(null); }} style={styles.menuBtn}><Text style={{ fontSize: 13, color: C.ink }}>↩ 답장</Text></TouchableOpacity>
                          {REACTIONS.map((e) => <TouchableOpacity key={e} onPress={() => react(m.id, e)} style={styles.menuEmoji}><Text style={{ fontSize: 17 }}>{e}</Text></TouchableOpacity>)}
                          {m.mine && <TouchableOpacity onPress={() => delMsg(m)} style={styles.menuBtn}><Text style={{ fontSize: 13, color: '#E5484D' }}>🗑 삭제</Text></TouchableOpacity>}
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
            {peerTyping && <Text style={[styles.hint, { textAlign: 'left', marginTop: 2, fontStyle: 'italic' }]}>{peerVoice ? '🎤 음성 메시지 녹음 중…' : '입력 중…'}</Text>}
          </ScrollView>
          {unseen > 0 && (
            <TouchableOpacity onPress={jumpBottom} style={styles.pill}><Text style={styles.pillT}>새 메시지 {unseen} ↓</Text></TouchableOpacity>
          )}
        </View>
        )}
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
        {status !== 'off' && rw && view === 'chat' && (
          <>
            {/* ⑥ 자주 쓰는 문구(선생님) */}
            {myRole === 'teacher' && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 10, paddingTop: 8, alignItems: 'center' }}>
                {phrases.map((p) => (
                  <TouchableOpacity key={p} onPress={() => (phraseEdit ? removePhrase(p) : setText(p))}
                    style={{ borderWidth: 1, borderColor: phraseEdit ? '#E5484D' : C.line, backgroundColor: C.white, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, maxWidth: 190 }}>
                    <Text numberOfLines={1} style={{ fontSize: 11.5, color: phraseEdit ? '#E5484D' : C.ink }}>{phraseEdit ? `✕ ${p}` : p}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={addPhrase} style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: C.line, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 12, color: C.muted }}>＋</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setPhraseEdit((v) => !v)}>
                  <Text style={{ fontSize: 11, color: phraseEdit ? C.teal : C.caption }}>{phraseEdit ? '완료' : '관리'}</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.inputRow}>
              <TouchableOpacity onPress={pickImage} style={styles.imgBtn}><Text style={{ fontSize: 20 }}>🖼</Text></TouchableOpacity>
              <TouchableOpacity onPress={openCamera} style={styles.imgBtn}><Text style={{ fontSize: 20 }}>📷</Text></TouchableOpacity>
              <TouchableOpacity onPress={pickDoc} style={styles.imgBtn}><Text style={{ fontSize: 20 }}>📎</Text></TouchableOpacity>
              <TouchableOpacity onPress={toggleRec} style={[styles.imgBtn, recOn && { backgroundColor: '#E5484D', borderRadius: 999, paddingHorizontal: 8 }]}>
                <Text style={recOn ? { fontSize: 13, color: '#fff', fontWeight: '800' } : { fontSize: 20 }}>{recOn ? '⏺ 전송' : '🎤'}</Text>
              </TouchableOpacity>
              <TextInput style={styles.input} value={text} onChangeText={onType} placeholder={recOn ? '녹음 중…' : reply ? '답장 입력…' : '메시지 입력…'} placeholderTextColor={C.caption} onSubmitEditing={send} returnKeyType="send" />
              <TouchableOpacity onPress={send} disabled={!text.trim()} style={[styles.sendBtn, !text.trim() && { opacity: 0.5 }]}><Text style={styles.sendT}>전송</Text></TouchableOpacity>
            </View>
          </>
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
