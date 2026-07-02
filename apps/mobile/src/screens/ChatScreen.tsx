import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { api } from '../api';
import { R, useTheme, type Palette } from '../theme';
import { useWebBack } from '../webBack';

type Msg = { id: string; senderId: string | null; mine?: boolean; kind: string; body: string | null; imageFileId: string | null; createdAt: string };
const KST = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

/** 인증 이미지 렌더(채팅 버블용). */
function ChatImage({ fileId }: { fileId: string }) {
  const { C } = useTheme();
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => { let live = true; api.fileBlobUrl(fileId).then((u) => { if (live) setUri(u); }).catch(() => {}); return () => { live = false; }; }, [fileId]);
  if (!uri) return <View style={{ width: 150, height: 110, borderRadius: 8, backgroundColor: C.lineSoft }} />;
  return <Image source={{ uri }} style={{ width: 150, height: 110, borderRadius: 8, resizeMode: 'cover' }} />;
}

/** 예약 기반 실시간 채팅(모바일). myId 로 좌/우 정렬. */
export function ChatScreen({ bookingId, myId, title, onClose }: { bookingId: string; myId: string; title: string; onClose: () => void }) {
  const { C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'connecting' | 'ready' | 'off'>('connecting');
  const sockRef = useRef<Socket | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  useWebBack(true, onClose);

  useEffect(() => {
    const token = (typeof localStorage !== 'undefined' ? localStorage.getItem('itall_access') : '') ?? '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const s = io(origin, { path: '/api/v1/socket.io', auth: { token }, transports: ['websocket'] });
    sockRef.current = s;
    s.on('connect', () => {
      s.emit('chat:join', { bookingId }, (r: { ok: boolean; access?: { chat: boolean }; messages?: Msg[] }) => {
        if (!r?.access?.chat) { setStatus('off'); return; }
        setMsgs((r.messages ?? []).map((m) => ({ ...m, mine: m.senderId === myId })));
        setStatus('ready');
      });
    });
    s.on('chat:message', (m: Msg) => setMsgs((p) => [...p, { ...m, mine: m.senderId === myId }]));
    return () => { s.disconnect(); };
  }, [bookingId, myId]);

  useEffect(() => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50); }, [msgs]);

  function send() {
    const body = text.trim();
    if (!body) return;
    sockRef.current?.emit('chat:send', { bookingId, body });
    setText('');
  }
  function pickImage() {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f || !f.type.startsWith('image/')) return;
      try { const r = await api.uploadWeb(f, f.name); sockRef.current?.emit('chat:send', { bookingId, imageFileId: r.id }); } catch { /* noop */ }
    };
    input.click();
  }

  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Text style={styles.headT}>💬 {title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Text style={styles.close}>✕</Text></TouchableOpacity>
        </View>
        <ScrollView ref={scrollRef} style={styles.body} contentContainerStyle={{ padding: 14, gap: 8 }}>
          {status === 'off' ? <Text style={styles.hint}>채팅이 비활성화되어 있어요.</Text>
            : status === 'connecting' ? <ActivityIndicator color={C.teal} style={{ marginTop: 16 }} />
            : msgs.length === 0 ? <Text style={styles.hint}>첫 메시지를 보내보세요.</Text>
            : msgs.map((m) => (
              <View key={m.id} style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                <View style={[styles.bubble, m.mine ? styles.mine : styles.theirs, m.kind === 'image' && { padding: 5 }]}>
                  {m.kind === 'image' && m.imageFileId ? <ChatImage fileId={m.imageFileId} /> : <Text style={[styles.bubbleT, m.mine && { color: '#fff' }]}>{m.body}</Text>}
                </View>
                <Text style={[styles.time, { textAlign: m.mine ? 'right' : 'left' }]}>{KST(m.createdAt)}</Text>
              </View>
            ))}
        </ScrollView>
        {status !== 'off' && (
          <View style={styles.inputRow}>
            <TouchableOpacity onPress={pickImage} style={styles.imgBtn}><Text style={{ fontSize: 20 }}>📷</Text></TouchableOpacity>
            <TextInput style={styles.input} value={text} onChangeText={setText} placeholder="메시지 입력…" placeholderTextColor={C.caption} onSubmitEditing={send} returnKeyType="send" />
            <TouchableOpacity onPress={send} disabled={!text.trim()} style={[styles.sendBtn, !text.trim() && { opacity: 0.5 }]}><Text style={styles.sendT}>전송</Text></TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(8,16,20,0.5)', justifyContent: 'center', alignItems: 'center', padding: 12, zIndex: 100 },
  sheet: { width: '100%', maxWidth: 460, height: '86%', backgroundColor: C.bg, borderRadius: 14, overflow: 'hidden' },
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
