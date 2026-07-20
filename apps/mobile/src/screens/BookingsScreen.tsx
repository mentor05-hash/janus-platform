import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError, Booking, Note, Teacher } from '../api';
import { R, SP, useTheme, useUI, type Palette } from '../theme';
import { useWebBack } from '../webBack';
import { RescheduleScreen } from './RescheduleScreen';
import { SessionChatScreen } from './SessionChatScreen';
import { SessionWhiteboardScreen } from './SessionWhiteboardScreen';

const slotLen = (b: Booking) => (b.start && b.end ? Math.max(1, Math.round((new Date(b.end).getTime() - new Date(b.start).getTime()) / 600000)) : 3);

const KST = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '-';
const makeStatus = (C: Palette): Record<string, { label: string; bg: string; fg: string }> => ({
  new: { label: '대기', bg: C.newBg, fg: C.newC },
  confirmed: { label: '예약됨', bg: C.confirmedBg, fg: C.confirmed },
  done: { label: '완료', bg: C.doneBg, fg: C.done },
  cancelled: { label: '취소', bg: C.mutedChipBg, fg: C.mutedChip },
  rejected: { label: '거절', bg: C.dangerBg, fg: C.danger },
  noshow: { label: '노쇼', bg: C.dangerBg, fg: C.danger },
});

function ReviewBox({ id }: { id: string }) {
  const { C } = useTheme();
  const ui = useUI();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [r, setR] = useState({ ratingAttitude: 5, ratingContent: 5, ratingSkill: 5, ratingAgain: 5, text: '' });
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const items: [keyof typeof r, string][] = [['ratingAttitude', '태도'], ['ratingContent', '내용'], ['ratingSkill', '실력'], ['ratingAgain', '재신청']];
  async function submit() {
    setErr('');
    try { await api.post(`/bookings/${id}/review`, r); setDone(true); }
    catch (e) { setErr(e instanceof ApiError ? e.message : '후기 등록 실패'); }
  }
  if (done) return <Text style={{ color: C.done, fontSize: 13, marginTop: 8, fontWeight: '600' }}>후기가 등록되었습니다. 감사합니다!</Text>;
  return (
    <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line, borderStyle: 'dashed' }}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: C.ink, marginBottom: 6 }}>상담 후기 작성</Text>
      {items.map(([k, label]) => (
        <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Text style={{ width: 52, fontSize: 13, color: C.muted }}>{label}</Text>
          {[1, 2, 3, 4, 5].map((n) => (
            <TouchableOpacity key={n} onPress={() => setR((p) => ({ ...p, [k]: n }))}>
              <Text style={{ fontSize: 20, color: n <= (r[k] as number) ? '#CF9A3A' : C.line }}>★</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
      <TextInput style={[ui.input, { height: 60, textAlignVertical: 'top', marginTop: 6 }]} multiline placeholder="후기(선택)" placeholderTextColor={C.caption} value={r.text} onChangeText={(t) => setR((p) => ({ ...p, text: t }))} />
      {err ? <Text style={ui.error}>{err}</Text> : null}
      <TouchableOpacity style={[ui.btn, { marginTop: 8 }]} onPress={submit}><Text style={ui.btnText}>후기 등록</Text></TouchableOpacity>
    </View>
  );
}

function Detail({ id, status }: { id: string; status: string }) {
  const { C } = useTheme();
  const ui = useUI();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [b, setB] = useState<Booking | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  useEffect(() => {
    api.get<Booking>(`/bookings/${id}`).then(setB).catch(() => {});
    api.get<Note>(`/bookings/${id}/note`).then(setNote).catch(() => setNote(null));
  }, [id]);
  const isWeb = typeof document !== 'undefined';
  const final = note && note.saveState === 'final';
  return (
    <View style={styles.detail}>
      {b?.content ? (
        <>
          <Text style={styles.dLabel}>내가 보낸 상담 내용</Text>
          <Text style={styles.dText}>{b.content}</Text>
        </>
      ) : null}
      {(b?.attachments?.length ?? 0) > 0 && (
        <>
          <Text style={styles.dLabel}>첨부 문제</Text>
          {b!.attachments!.map((a) => (
            <TouchableOpacity key={a.id} onPress={() => isWeb && api.downloadWeb(a.id, a.name).catch(() => {})}>
              <Text style={styles.dLink}>📄 {a.name}{isWeb ? ' · 다운로드' : ''}</Text>
            </TouchableOpacity>
          ))}
        </>
      )}
      <Text style={styles.dLabel}>상담 기록</Text>
      {final ? (
        <View style={{ gap: 4 }}>
          {note!.coreSummary ? <Text style={styles.dText}><Text style={styles.b}>핵심 요약 </Text>{note!.coreSummary}</Text> : null}
          {note!.homework ? <Text style={styles.dText}><Text style={styles.b}>숙제 </Text>{note!.homework}</Text> : null}
          {note!.futureDir ? <Text style={styles.dText}><Text style={styles.b}>향후 방향 </Text>{note!.futureDir}</Text> : null}
        </View>
      ) : (
        <Text style={styles.dMuted}>아직 공개된 상담 기록이 없어요(완료 후 열람).</Text>
      )}
      {status === 'done' && <ReviewBox id={id} />}
    </View>
  );
}

export function BookingsScreen({ myId }: { myId?: string }) {
  const { C } = useTheme();
  const ui = useUI();
  const styles = useMemo(() => makeStyles(C), [C]);
  const STATUS = makeStatus(C);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [teachers, setTeachers] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<'upcoming' | 'done'>('upcoming');
  const [reschedule, setReschedule] = useState<Booking | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatOn, setChatOn] = useState(false);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [wbId, setWbId] = useState<string | null>(null);
  const [wbOn, setWbOn] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  useWebBack(reschedule !== null, () => setReschedule(null));

  function load() {
    api.get<{ data?: Booking[] } | Booking[]>('/bookings?role=student')
      .then((r) => setBookings(Array.isArray(r) ? r : (r.data ?? [])))
      .catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
    loadUnread();
  }
  function loadUnread() {
    api.get<Record<string, number>>('/chat/unread').then(setUnread).catch(() => {});
  }
  useEffect(() => {
    load();
    api.get<{ data?: Teacher[] } | Teacher[]>('/teachers').then((r) => {
      const list = Array.isArray(r) ? r : (r.data ?? []);
      setTeachers(Object.fromEntries(list.map((t) => [t.id, t.name])));
    }).catch(() => {});
    api.get<{ chat: boolean; whiteboard: boolean }>('/realtime/features').then((f) => { setChatOn(!!f.chat); setWbOn(!!f.whiteboard); }).catch(() => {});
  }, []);

  async function respond(id: string, action: 'accept' | 'reject') {
    setBusy(id); setError(''); setMsg('');
    try {
      await api.patch(`/bookings/${id}/reverse-respond`, { action });
      setMsg(action === 'accept' ? '역상담을 수락했습니다. 예약이 확정됐어요.' : '역상담을 거절했습니다.');
      load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '처리 실패'); }
    finally { setBusy(null); }
  }

  async function cancel(id: string) {
    setBusy(id); setError(''); setMsg('');
    try {
      await api.patch(`/bookings/${id}/cancel`, {});
      setMsg('예약을 취소했습니다. 크레딧은 환원됩니다.');
      load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '취소 실패'); }
    finally { setBusy(null); }
  }

  async function reportNoshow(id: string) {
    setBusy(id); setError(''); setMsg('');
    try {
      await api.post('/reports', { targetType: 'booking', targetId: id, reason: '미진행(노쇼) 신고 — 상담이 실제로 진행되지 않았습니다.' });
      setMsg('미진행 신고가 접수되었습니다. 관리자가 확인합니다.');
    } catch (e) { setError(e instanceof ApiError ? e.message : '신고 실패'); }
    finally { setBusy(null); }
  }
  function confirmNoshow(id: string) {
    Alert.alert('미진행 신고', '이 상담이 실제로 진행되지 않았나요? 관리자에게 신고됩니다.', [
      { text: '취소', style: 'cancel' },
      { text: '신고', style: 'destructive', onPress: () => reportNoshow(id) },
    ]);
  }

  const all = bookings ?? [];
  const incoming = all.filter((b) => b.direction === 'reverse' && b.status === 'new');
  const mine = all.filter((b) => !(b.direction === 'reverse' && b.status === 'new'));
  const UPCOMING = new Set(['new', 'confirmed']);
  const shown = mine.filter((b) => (tab === 'upcoming' ? UPCOMING.has(b.status) : !UPCOMING.has(b.status)));
  const tName = (id: string) => teachers[id] ?? '선생님';

  if (reschedule) return (
    <RescheduleScreen bookingId={reschedule.id} teacherId={reschedule.teacherId} teacherName={tName(reschedule.teacherId)} duration={slotLen(reschedule)}
      onBack={() => setReschedule(null)} onDone={() => { setReschedule(null); setMsg('시간이 변경되었습니다. 선생님 재확인 후 확정됩니다.'); load(); }} />
  );

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={ui.h}>내 예약·상담</Text>
      {msg ? <Text style={styles.ok}>{msg}</Text> : null}
      {error ? <Text style={ui.error}>{error}</Text> : null}

      {incoming.length > 0 && (
        <>
          <Text style={styles.sec}>받은 역상담 제안 ({incoming.length})</Text>
          {incoming.map((b) => (
            <View key={b.id} style={[ui.card, styles.prop]}>
              <Text style={styles.propT}>{tName(b.teacherId)} 선생님의 역상담 제안</Text>
              <Text style={styles.sub}>{KST(b.start)} · {b.consultType ?? ''} · {b.mode}</Text>
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.rej} disabled={busy === b.id} onPress={() => respond(b.id, 'reject')}><Text style={styles.rejT}>거절</Text></TouchableOpacity>
                <TouchableOpacity style={styles.acc} disabled={busy === b.id} onPress={() => respond(b.id, 'accept')}><Text style={styles.accT}>수락</Text></TouchableOpacity>
              </View>
            </View>
          ))}
        </>
      )}

      <Text style={styles.sec}>예약 현황 · 상담내역</Text>
      <View style={styles.tabs}>
        {([['upcoming', `예정 ${mine.filter((b) => UPCOMING.has(b.status)).length}`], ['done', '완료·지난내역']] as const).map(([k, l]) => (
          <TouchableOpacity key={k} style={[styles.tab, tab === k && styles.tabOn]} onPress={() => setTab(k)}>
            <Text style={[styles.tabT, tab === k && styles.tabTOn]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {bookings === null ? <ActivityIndicator color={C.teal} /> : shown.length === 0 ? (
        <View style={[ui.card, { paddingVertical: 18 }]}><Text style={ui.sub}>{tab === 'upcoming' ? '예정된 예약이 없어요.' : '완료·지난 내역이 없어요.'}</Text></View>
      ) : (
        shown.map((b) => {
          const st = STATUS[b.status] ?? { label: b.status, bg: C.mutedChipBg, fg: C.mutedChip };
          const isToday = !!b.start && new Date(b.start).toDateString() === new Date().toDateString() && ['new', 'confirmed'].includes(b.status);
          return (
            <View key={b.id} style={[ui.card, { marginBottom: 8 }, isToday && { borderWidth: 2, borderColor: C.teal, backgroundColor: C.teal50 }]}>
              <TouchableOpacity onPress={() => setOpen(open === b.id ? null : b.id)} activeOpacity={0.7}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{isToday ? '📅 오늘 · ' : ''}{tName(b.teacherId)}{b.direction === 'reverse' ? ' · 역상담' : ''}</Text>
                    <Text style={styles.sub}>{KST(b.start)} · {b.consultType ?? ''} · {b.mode} · {b.chargedCredits.toLocaleString()}크레딧</Text>
                  </View>
                  <View style={[styles.chip, { backgroundColor: st.bg }]}><Text style={[styles.chipT, { color: st.fg }]}>{st.label}</Text></View>
                </View>
                <Text style={styles.more}>{open === b.id ? '접기 ▲' : '상담 상세 ▼'}</Text>
              </TouchableOpacity>
              {open === b.id && <Detail id={b.id} status={b.status} />}
              {b.mode === 'zoom' && b.meetingUrl && b.status !== 'new' && (
                <TouchableOpacity style={styles.zoomBtn} onPress={() => Linking.openURL(b.meetingUrl!)}>
                  <Text style={styles.zoomT}>🎥 줌 상담 입장</Text>
                </TouchableOpacity>
              )}
              {chatOn && myId && b.status !== 'new' && (
                <TouchableOpacity style={styles.chatBtn} onPress={() => setChatId(b.id)}>
                  <Text style={styles.chatT}>💬 상담 채팅</Text>
                  {(unread[b.id] ?? 0) > 0 && <View style={styles.badge}><Text style={styles.badgeT}>{unread[b.id] > 99 ? '99+' : unread[b.id]}</Text></View>}
                </TouchableOpacity>
              )}
              {wbOn && b.status !== 'new' && (
                <TouchableOpacity style={styles.chatBtn} onPress={() => setWbId(b.id)}>
                  <Text style={styles.chatT}>🖊 공유 화이트보드</Text>
                </TouchableOpacity>
              )}
              {UPCOMING.has(b.status) && (
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.changeBtn} disabled={busy === b.id} onPress={() => setReschedule(b)}>
                    <Text style={styles.changeT}>시간 변경</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelBtn2} disabled={busy === b.id} onPress={() => cancel(b.id)}>
                    <Text style={styles.cancelT}>{busy === b.id ? '취소 중…' : '예약 취소'}</Text>
                  </TouchableOpacity>
                </View>
              )}
              {b.status === 'done' && (
                <TouchableOpacity style={styles.reportBtn} disabled={busy === b.id} onPress={() => confirmNoshow(b.id)}>
                  <Text style={styles.reportT}>미진행(노쇼) 신고</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })
      )}
      {chatId && myId && <SessionChatScreen bookingId={chatId} myId={myId} title="상담 채팅" onClose={() => { setChatId(null); loadUnread(); }} />}
      {wbId && <SessionWhiteboardScreen bookingId={wbId} title="공유 화이트보드" onClose={() => setWbId(null)} />}
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  sec: { fontSize: 13, fontWeight: '800', color: C.ink, marginTop: SP.lg, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 15, fontWeight: '700', color: C.ink },
  sub: { fontSize: 12, color: C.muted, marginTop: 3 },
  chip: { borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4 },
  chipT: { fontSize: 12, fontWeight: '700' },
  more: { color: C.teal, fontSize: 12, fontWeight: '600', marginTop: 8 },
  prop: { borderColor: C.teal, marginBottom: 8 },
  propT: { fontSize: 15, fontWeight: '700', color: C.ink },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 10, justifyContent: 'flex-end' },
  rej: { borderWidth: 1, borderColor: C.line, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 18 },
  rejT: { color: C.muted, fontWeight: '700', fontSize: 14 },
  acc: { backgroundColor: C.teal, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 22 },
  accT: { color: '#fff', fontWeight: '800', fontSize: 14 },
  detail: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line, gap: 4 },
  dLabel: { fontSize: 12, color: C.muted, marginTop: 6 },
  dText: { fontSize: 14, color: C.ink, lineHeight: 20 },
  dMuted: { fontSize: 13, color: C.muted },
  dLink: { fontSize: 13, color: C.teal, paddingVertical: 2 },
  b: { fontWeight: '800' },
  ok: { color: C.done, fontSize: 13, marginTop: 6, fontWeight: '600' },
  tabs: { flexDirection: 'row', backgroundColor: C.lineSoft, borderRadius: 10, padding: 3, marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabOn: { backgroundColor: C.white },
  tabT: { fontSize: 13, fontWeight: '600', color: C.muted },
  tabTOn: { color: C.teal, fontWeight: '800' },
  cancelBtn: { marginTop: 10, borderWidth: 1, borderColor: C.dangerBorder, borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
  cancelT: { color: C.danger, fontWeight: '700', fontSize: 13 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  changeBtn: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
  changeT: { color: C.muted, fontWeight: '700', fontSize: 13 },
  cancelBtn2: { flex: 1, borderWidth: 1, borderColor: C.dangerBorder, borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
  reportBtn: { marginTop: 10, borderWidth: 1, borderColor: C.dangerBorder, borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
  reportT: { color: C.danger, fontWeight: '700', fontSize: 13 },
  chatBtn: { marginTop: 10, borderWidth: 1, borderColor: C.teal, borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
  chatT: { color: C.teal, fontWeight: '800', fontSize: 13 },
  zoomBtn: { marginTop: 10, backgroundColor: C.teal, borderRadius: 9, paddingVertical: 11, alignItems: 'center' },
  zoomT: { color: '#fff', fontWeight: '800', fontSize: 13 },
  badge: { position: 'absolute', top: 4, right: 10, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#E5484D', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeT: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
