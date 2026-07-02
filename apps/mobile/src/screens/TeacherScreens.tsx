import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError, Booking } from '../api';
import { useTheme, type Palette } from '../theme';
import { ChatScreen } from './ChatScreen';
import { WhiteboardScreen } from './WhiteboardScreen';

// ── 공통 타입 ──
type Noti = { id: string; type?: string | null; title?: string; body?: string; payload?: Record<string, unknown>; read_at?: string | null; created_at: string };
const KST = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const unwrap = <T,>(r: { data?: T } | T): T => (Array.isArray(r) ? (r as T) : ((r as { data?: T }).data ?? (r as T)));

/** ① 인박스 — 유입(상담신청·질문·역상담·취소) 알림 + 미확인 채팅. 상담신청은 인라인 수락/거절. */
export function TeacherInbox() {
  const { C } = useTheme();
  const s = useMemo(() => mk(C), [C]);
  const [notis, setNotis] = useState<Noti[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<Noti[]>('/notifications').then((r) => setNotis(unwrap(r))).catch(() => {}),
      api.get<Record<string, number>>('/chat/unread').then(setUnread).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const bookingIdOf = (n: Noti) => (n.payload?.bookingId as string | undefined) ?? undefined;
  async function respond(n: Noti, action: 'accept' | 'reject') {
    const id = bookingIdOf(n); if (!id) return;
    setBusy(n.id); setMsg('');
    try {
      await api.patch(`/bookings/${id}/${action}`, {});
      setMsg(action === 'accept' ? '상담을 수락했어요.' : '상담을 거절했어요(크레딧 환원).');
      await api.patch(`/notifications/${n.id}/read`, {}).catch(() => {});
      load();
    } catch (e) { setMsg(e instanceof ApiError ? e.message : '처리 실패'); }
    finally { setBusy(null); }
  }

  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);
  const items = notis.filter((n) => !n.read_at).concat(notis.filter((n) => n.read_at)).slice(0, 60);

  if (loading) return <Center C={C} />;
  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={s.h1}>인박스</Text>
      <View style={s.summary}>
        <Sum label="미확인 알림" n={notis.filter((n) => !n.read_at).length} C={C} />
        <Sum label="새 메시지" n={totalUnread} C={C} accent />
      </View>
      {msg ? <Text style={s.msg}>{msg}</Text> : null}
      {items.length === 0 ? <Text style={s.empty}>새로운 유입이 없어요.</Text> : items.map((n) => {
        const isReq = n.type === 'booking_requested' && bookingIdOf(n);
        return (
          <View key={n.id} style={[s.card, !n.read_at && s.cardNew]}>
            <View style={s.row}>
              <Text style={s.title}>{n.title ?? '알림'}</Text>
              <Text style={s.time}>{KST(n.created_at)}</Text>
            </View>
            {n.body ? <Text style={s.body}>{n.body}</Text> : null}
            {isReq && (
              <View style={s.acts}>
                <TouchableOpacity disabled={busy === n.id} style={[s.btn, s.btnP]} onPress={() => respond(n, 'accept')}><Text style={s.btnPT}>수락</Text></TouchableOpacity>
                <TouchableOpacity disabled={busy === n.id} style={[s.btn, s.btnG]} onPress={() => respond(n, 'reject')}><Text style={s.btnGT}>거절</Text></TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

/** ② 상담 — 내 예약(진행 예정/오늘). 탭 → 채팅·화이트보드로 진행. */
export function TeacherSessions({ myId }: { myId: string }) {
  const { C } = useTheme();
  const s = useMemo(() => mk(C), [C]);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [tab, setTab] = useState<'upcoming' | 'done'>('upcoming');
  const [chatId, setChatId] = useState<string | null>(null);
  const [wbId, setWbId] = useState<string | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});

  const load = useCallback(() => {
    api.get<{ data?: Booking[] } | Booking[]>('/bookings?role=teacher').then((r) => setBookings(unwrap(r))).catch(() => setBookings([]));
    api.get<Record<string, number>>('/chat/unread').then(setUnread).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const UP = new Set(['new', 'confirmed']);
  const all = bookings ?? [];
  const shown = all.filter((b) => (tab === 'upcoming' ? UP.has(b.status) : b.status === 'done'));

  if (chatId) return <ChatScreen bookingId={chatId} myId={myId} title="상담 채팅" onClose={() => { setChatId(null); load(); }} />;
  if (wbId) return <WhiteboardScreen bookingId={wbId} title="공유 화이트보드" onClose={() => setWbId(null)} />;
  if (bookings === null) return <Center C={C} />;
  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={s.h1}>상담</Text>
      <View style={s.seg}>
        {(['upcoming', 'done'] as const).map((t) => (
          <TouchableOpacity key={t} style={[s.segItem, tab === t && s.segOn]} onPress={() => setTab(t)}><Text style={[s.segT, tab === t && s.segTOn]}>{t === 'upcoming' ? '진행 예정' : '완료'}</Text></TouchableOpacity>
        ))}
      </View>
      {shown.length === 0 ? <Text style={s.empty}>{tab === 'upcoming' ? '예정된 상담이 없어요.' : '완료된 상담이 없어요.'}</Text> : shown.map((b) => (
        <View key={b.id} style={s.card}>
          <View style={s.row}>
            <Text style={s.title}>{b.consultType ?? "상담"} · {modeLabel(b.mode)}</Text>
            <Text style={s.time}>{KST(b.start)}</Text>
          </View>
          <Text style={s.body}>{modeLabel(b.mode)} · {statusLabel(b.status)}</Text>
          {b.status === 'confirmed' && (
            <View style={s.acts}>
              <TouchableOpacity style={[s.btn, s.btnP]} onPress={() => setChatId(b.id)}>
                <Text style={s.btnPT}>💬 채팅{(unread[b.id] ?? 0) > 0 ? ` · ${unread[b.id]}` : ''}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.btnG]} onPress={() => setWbId(b.id)}><Text style={s.btnGT}>🖊 화이트보드</Text></TouchableOpacity>
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

/** ③ 기록 — 확정/완료 상담에 상담기록 작성·수정(draft/final). */
export function TeacherRecords() {
  const { C } = useTheme();
  const s = useMemo(() => mk(C), [C]);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [edit, setEdit] = useState<Booking | null>(null);

  const load = useCallback(() => {
    api.get<{ data?: Booking[] } | Booking[]>('/bookings?role=teacher').then((r) => setBookings(unwrap(r))).catch(() => setBookings([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (edit) return <NoteEditor booking={edit} onClose={() => { setEdit(null); load(); }} />;
  if (bookings === null) return <Center C={C} />;
  const targets = (bookings ?? []).filter((b) => ['confirmed', 'done'].includes(b.status));
  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={s.h1}>상담기록</Text>
      <Text style={s.sub}>확정·완료 상담의 기록을 작성·수정합니다. 완료 처리는 최종 저장(final)이 선행돼요.</Text>
      {targets.length === 0 ? <Text style={s.empty}>기록할 상담이 없어요.</Text> : targets.map((b) => (
        <TouchableOpacity key={b.id} style={s.card} onPress={() => setEdit(b)}>
          <View style={s.row}>
            <Text style={s.title}>{b.consultType ?? "상담"} · {modeLabel(b.mode)}</Text>
            <Text style={s.time}>{KST(b.start)}</Text>
          </View>
          <Text style={s.body}>{statusLabel(b.status)} · 기록 {b.status === 'done' ? '완료' : '작성/수정'} ›</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function NoteEditor({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { C } = useTheme();
  const s = useMemo(() => mk(C), [C]);
  const [f, setF] = useState({ coreSummary: '', homework: '', futureDir: '', memo: '' });
  const [guardianVisible, setGV] = useState(true);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    api.get<{ coreSummary?: string | null; homework?: string | null; futureDir?: string | null; memo?: string | null; guardianVisible?: boolean }>(`/bookings/${booking.id}/note`)
      .then((n) => { if (n) { setF({ coreSummary: n.coreSummary ?? '', homework: n.homework ?? '', futureDir: n.futureDir ?? '', memo: n.memo ?? '' }); if (typeof n.guardianVisible === 'boolean') setGV(n.guardianVisible); } })
      .catch(() => {});
  }, [booking.id]);

  async function save(saveState: 'draft' | 'final') {
    setBusy(true); setMsg('');
    try {
      await api.put(`/bookings/${booking.id}/note`, { ...f, guardianVisible, saveState });
      if (saveState === 'final' && booking.status === 'confirmed') {
        await api.patch(`/bookings/${booking.id}/complete`, {}).catch(() => {});
      }
      setMsg(saveState === 'final' ? '최종 저장했어요. 상담이 완료 처리됩니다.' : '임시저장했어요.');
      if (saveState === 'final') setTimeout(onClose, 700);
    } catch (e) { setMsg(e instanceof ApiError ? e.message : '저장 실패'); }
    finally { setBusy(false); }
  }

  const Field = ({ label, k, ph }: { label: string; k: keyof typeof f; ph: string }) => (
    <View style={s.field}>
      <Text style={s.fieldL}>{label}</Text>
      <TextInput style={s.input} value={f[k]} onChangeText={(v) => set(k, v)} placeholder={ph} placeholderTextColor={C.caption} multiline />
    </View>
  );
  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 16, gap: 10 }}>
      <TouchableOpacity onPress={onClose}><Text style={s.back}>‹ 상담기록</Text></TouchableOpacity>
      <Text style={s.h1}>기록 작성</Text>
      {Field({ label: '핵심요약 (공개)', k: 'coreSummary', ph: '예: 합성함수 미분 개념 재정리' })}
      {Field({ label: '숙제 (공개)', k: 'homework', ph: '예: 유형서 32–40번' })}
      {Field({ label: '향후 방향 (공개)', k: 'futureDir', ph: '예: 도함수 활용 심화' })}
      {Field({ label: '메모 (내부)', k: 'memo', ph: '내부 참고 메모' })}
      <TouchableOpacity style={s.toggle} onPress={() => setGV((v) => !v)}>
        <Text style={s.toggleT}>보호자 공개</Text>
        <View style={[s.sw, !guardianVisible && s.swOff]}><View style={[s.knob, !guardianVisible && s.knobOff]} /></View>
      </TouchableOpacity>
      {msg ? <Text style={s.msg}>{msg}</Text> : null}
      <View style={s.acts}>
        <TouchableOpacity disabled={busy} style={[s.btn, s.btnG]} onPress={() => save('draft')}><Text style={s.btnGT}>임시저장</Text></TouchableOpacity>
        <TouchableOpacity disabled={busy} style={[s.btn, s.btnP]} onPress={() => save('final')}><Text style={s.btnPT}>최종 저장 → 완료</Text></TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ── 보조 ──
function Center({ C }: { C: Palette }) { return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={C.teal} /></View>; }
function Sum({ label, n, C, accent }: { label: string; n: number; C: Palette; accent?: boolean }) {
  return <View style={{ flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12 }}>
    <Text style={{ fontSize: 11.5, color: C.muted }}>{label}</Text>
    <Text style={{ fontSize: 22, fontWeight: '800', color: accent ? C.teal : C.ink, marginTop: 2 }}>{n}</Text>
  </View>;
}
const modeLabel = (m: string) => ({ chat: '실시간 채팅', zoom: '줌 화상', hand: '필기 공유', offline: '오프라인 대면', board: '게시판' }[m] ?? m);
const statusLabel = (st: string) => ({ new: '신청됨', confirmed: '확정', done: '완료', cancelled: '취소', rejected: '거절', noshow: '노쇼' }[st] ?? st);

const mk = (C: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  h1: { fontSize: 22, fontWeight: '800', color: C.ink },
  sub: { fontSize: 13, color: C.muted, lineHeight: 19, marginTop: -2 },
  summary: { flexDirection: 'row', gap: 10 },
  card: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 13, gap: 6 },
  cardNew: { borderColor: C.teal100 ?? C.teal, backgroundColor: C.teal50 ?? C.white },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { fontSize: 14.5, fontWeight: '800', color: C.ink, flex: 1 },
  time: { fontSize: 11, color: C.caption },
  body: { fontSize: 13, color: C.muted, lineHeight: 18 },
  acts: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btn: { flex: 1, borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
  btnP: { backgroundColor: C.teal }, btnPT: { color: '#fff', fontWeight: '800', fontSize: 13 },
  btnG: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line }, btnGT: { color: C.teal, fontWeight: '800', fontSize: 13 },
  empty: { fontSize: 13.5, color: C.caption, textAlign: 'center', paddingVertical: 40 },
  msg: { fontSize: 13, color: C.teal, backgroundColor: C.teal50 ?? C.white, borderRadius: 8, padding: 10 },
  seg: { flexDirection: 'row', backgroundColor: C.lineSoft, borderRadius: 10, padding: 3 },
  segItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  segOn: { backgroundColor: C.white },
  segT: { fontSize: 13, fontWeight: '700', color: C.muted }, segTOn: { color: C.teal },
  field: { gap: 5 },
  fieldL: { fontSize: 12, fontWeight: '700', color: C.muted },
  input: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 9, padding: 11, fontSize: 14, color: C.ink, minHeight: 44 },
  toggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 9, padding: 12 },
  toggleT: { fontSize: 13.5, fontWeight: '700', color: C.ink },
  sw: { width: 42, height: 24, borderRadius: 999, backgroundColor: C.teal, justifyContent: 'center' },
  swOff: { backgroundColor: C.line },
  knob: { width: 18, height: 18, borderRadius: 999, backgroundColor: '#fff', alignSelf: 'flex-end', marginRight: 3 },
  knobOff: { alignSelf: 'flex-start', marginLeft: 3 },
  back: { fontSize: 14, color: C.teal, fontWeight: '700' },
});
