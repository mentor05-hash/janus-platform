import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { R, useTheme, type Palette } from '../theme';
import { useWebBack } from '../webBack';
import { useSessionPhase, canInteract, sessionNotice, phaseOf, type SessionInfo } from '../session';

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
const snippet = (m: ReplyPreview) => (m?.kind === 'image' ? '📷 사진' : m?.kind === 'file' ? '📎 파일' : (m?.body ?? ''));
function Body({ body, mine, C }: { body: string; mine: boolean; C: Palette }) {
  return <Text style={[st.bt, mine && { color: '#fff' }]}>{body.split(/(https?:\/\/[^\s]+)/g).map((p, i) => /^https?:\/\//.test(p)
    ? <Text key={i} onPress={() => Linking.openURL(p).catch(() => {})} style={{ textDecorationLine: 'underline', color: mine ? '#CDEAFD' : C.teal }}>{p}</Text>
    : <Text key={i}>{p}</Text>)}</Text>;
}
const st = StyleSheet.create({ bt: { fontSize: 14, lineHeight: 20 } });

/** 룸 서비스 기반 채팅(모바일 이관 경로). 기존 ChatScreen 과 동일 UX 핵심. */
export function RoomChatScreen({ title, onClose, embedded, session: rs }: { bookingId: string; myId: string; title: string; onClose: () => void; embedded?: boolean; session: RoomSession }) {
  const { C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'connecting' | 'ready' | 'off'>('connecting');
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [reply, setReply] = useState<Msg | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [live, setLive] = useState<SessionInfo>(rs.session);
  const sockRef = useRef<Socket | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const typingOffRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerTypingOffRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myPid = rs.participantId;
  useWebBack(!embedded, onClose);

  useEffect(() => {
    const s = io(rs.url, { path: '/api/rt/v1/socket.io', auth: { token: rs.token }, transports: ['websocket'] });
    sockRef.current = s;
    s.on('connect', () => s.emit('join', {}, (r: { ok: boolean; messages?: Msg[]; session?: SessionInfo }) => {
      if (!r?.ok) { setStatus('off'); return; }
      setMsgs(r.messages ?? []); if (r.session) setLive(r.session); setStatus('ready');
    }));
    s.on('chat:message', (m: Msg) => { setMsgs((p) => (p.some((x) => x.id === m.id) ? p : [...p, m])); if (!m.mine) s.emit('chat:read'); });
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

  useEffect(() => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50); }, [msgs, peerTyping]);
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
    sockRef.current?.emit('chat:send', { body, replyToId: reply?.id });
    sockRef.current?.emit('chat:typing', { typing: false });
    setText(''); setReply(null);
  }
  function react(messageId: string, emoji: string) { if (!canInteract(phaseOf(live))) return; sockRef.current?.emit('chat:react', { messageId, emoji }); setMenuFor(null); }

  return (
    <View style={embedded ? styles.embWrap : styles.overlay}>
      <View style={[styles.sheet, embedded && styles.embSheet]}>
        <View style={styles.head}>
          <Text style={styles.headT}>💬 {title} <Text style={{ fontSize: 11, color: peerOnline ? C.teal : C.caption }}>● {peerOnline ? '접속 중' : '오프라인'}</Text></Text>
          {!embedded && <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Text style={styles.close}>✕</Text></TouchableOpacity>}
        </View>
        <ScrollView ref={scrollRef} style={styles.body} contentContainerStyle={{ padding: 14, gap: 4 }}>
          {status === 'off' ? <Text style={styles.hint}>채팅 세션이 종료되었어요.</Text>
            : status === 'connecting' ? <ActivityIndicator color={C.teal} style={{ marginTop: 16 }} />
            : msgs.length === 0 ? <Text style={styles.hint}>첫 메시지를 보내보세요.</Text>
            : msgs.map((m, idx) => {
              const showDay = idx === 0 || dayKey(m.createdAt) !== dayKey(msgs[idx - 1].createdAt);
              const rx = m.reactions ?? {}; const rxKeys = Object.keys(rx).filter((k) => (rx[k] ?? []).length > 0);
              return (
                <View key={m.id}>
                  {showDay && <View style={styles.dayWrap}><Text style={styles.dayT}>{dayLabel(m.createdAt)}</Text></View>}
                  <View style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '82%', marginTop: 4 }}>
                    {m.replyTo && <View style={styles.quote}><Text numberOfLines={1} style={styles.quoteT}>↩ {m.replyTo.senderId === myPid ? '나' : '상대'}: {snippet(m.replyTo)}</Text></View>}
                    <TouchableOpacity activeOpacity={0.85} onLongPress={() => rw && setMenuFor((f) => (f === m.id ? null : m.id))} delayLongPress={280}>
                      <View style={[styles.bubble, m.mine ? styles.mine : styles.theirs]}><Body body={m.body ?? ''} mine={m.mine} C={C} /></View>
                    </TouchableOpacity>
                    {rxKeys.length > 0 && (
                      <View style={[styles.rxRow, { justifyContent: m.mine ? 'flex-end' : 'flex-start' }]}>
                        {rxKeys.map((e) => { const mineR = (rx[e] ?? []).includes(myPid); return (
                          <TouchableOpacity key={e} onPress={() => react(m.id, e)} style={[styles.rxChip, mineR && { borderColor: C.teal, backgroundColor: C.lineSoft }]}><Text style={{ fontSize: 11, color: C.ink }}>{e} {(rx[e] ?? []).length}</Text></TouchableOpacity>
                        ); })}
                      </View>
                    )}
                    {menuFor === m.id && (
                      <View style={styles.menu}>
                        <TouchableOpacity onPress={() => { setReply(m); setMenuFor(null); }} style={styles.menuBtn}><Text style={{ fontSize: 13, color: C.ink }}>↩ 답장</Text></TouchableOpacity>
                        {REACTIONS.map((e) => <TouchableOpacity key={e} onPress={() => react(m.id, e)} style={styles.menuEmoji}><Text style={{ fontSize: 17 }}>{e}</Text></TouchableOpacity>)}
                      </View>
                    )}
                    <Text style={[styles.time, { textAlign: m.mine ? 'right' : 'left' }]}>{m.mine && m.readAt ? '읽음 · ' : ''}{KST(m.createdAt)}</Text>
                  </View>
                </View>
              );
            })}
          {peerTyping && <Text style={[styles.hint, { textAlign: 'left', marginTop: 2, fontStyle: 'italic' }]}>입력 중…</Text>}
        </ScrollView>
        {reply && rw && (
          <View style={styles.replyBar}>
            <Text style={{ color: C.teal, fontWeight: '800', fontSize: 12 }}>↩ 답장</Text>
            <Text numberOfLines={1} style={{ flex: 1, color: C.muted, fontSize: 12 }}>{reply.senderId === myPid ? '나' : '상대'}: {snippet({ id: reply.id, senderId: reply.senderId, kind: reply.kind, body: reply.body })}</Text>
            <TouchableOpacity onPress={() => setReply(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Text style={{ color: C.muted, fontSize: 14 }}>✕</Text></TouchableOpacity>
          </View>
        )}
        {status !== 'off' && !rw && <View style={[styles.notice, phase === 'closed' && { backgroundColor: C.lineSoft }]}><Text style={styles.noticeT}>{phase === 'closed' ? '🔒 ' : '⏳ '}{notice}</Text></View>}
        {status !== 'off' && rw && (
          <View style={styles.inputRow}>
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
  rxRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 },
  rxChip: { borderWidth: 1, borderColor: C.line, backgroundColor: C.white, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  menu: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 3, alignSelf: 'flex-start' },
  menuBtn: { paddingHorizontal: 6, paddingVertical: 2, borderRightWidth: 1, borderRightColor: C.line },
  menuEmoji: { paddingHorizontal: 3, paddingVertical: 1 },
  time: { fontSize: 10, color: C.caption, marginTop: 2 },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 7, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.lineSoft },
  notice: { paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.lineSoft, alignItems: 'center' },
  noticeT: { fontSize: 12.5, color: C.muted, textAlign: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderTopWidth: 1, borderTopColor: C.line },
  input: { flex: 1, backgroundColor: C.lineSoft, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: C.ink },
  sendBtn: { backgroundColor: C.teal, borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 9 },
  sendT: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
