import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError, Booking, Note, Teacher } from '../api';
import { C, R, SP, ui } from '../theme';

const KST = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '-';
const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  new: { label: '대기', bg: C.newBg, fg: C.newC },
  confirmed: { label: '예약됨', bg: C.confirmedBg, fg: C.confirmed },
  done: { label: '완료', bg: C.doneBg, fg: C.done },
  cancelled: { label: '취소', bg: C.mutedChipBg, fg: C.mutedChip },
  rejected: { label: '거절', bg: C.dangerBg, fg: C.danger },
  noshow: { label: '노쇼', bg: C.dangerBg, fg: C.danger },
};

function ReviewBox({ id }: { id: string }) {
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
              <Text style={{ fontSize: 20, color: n <= (r[k] as number) ? '#F5A623' : C.line }}>★</Text>
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

export function BookingsScreen() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [teachers, setTeachers] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  function load() {
    api.get<{ data?: Booking[] } | Booking[]>('/bookings?role=student')
      .then((r) => setBookings(Array.isArray(r) ? r : (r.data ?? [])))
      .catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }
  useEffect(() => {
    load();
    api.get<{ data?: Teacher[] } | Teacher[]>('/teachers').then((r) => {
      const list = Array.isArray(r) ? r : (r.data ?? []);
      setTeachers(Object.fromEntries(list.map((t) => [t.id, t.name])));
    }).catch(() => {});
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

  const all = bookings ?? [];
  const incoming = all.filter((b) => b.direction === 'reverse' && b.status === 'new');
  const mine = all.filter((b) => !(b.direction === 'reverse' && b.status === 'new'));
  const tName = (id: string) => teachers[id] ?? '선생님';

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
      {bookings === null ? <ActivityIndicator color={C.teal} /> : mine.length === 0 ? (
        <View style={[ui.card, { paddingVertical: 18 }]}><Text style={ui.sub}>예약 내역이 없어요.</Text></View>
      ) : (
        mine.map((b) => {
          const st = STATUS[b.status] ?? { label: b.status, bg: C.mutedChipBg, fg: C.mutedChip };
          return (
            <View key={b.id} style={[ui.card, { marginBottom: 8 }]}>
              <TouchableOpacity onPress={() => setOpen(open === b.id ? null : b.id)} activeOpacity={0.7}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{tName(b.teacherId)}{b.direction === 'reverse' ? ' · 역상담' : ''}</Text>
                    <Text style={styles.sub}>{KST(b.start)} · {b.consultType ?? ''} · {b.mode} · {b.chargedCredits.toLocaleString()}크레딧</Text>
                  </View>
                  <View style={[styles.chip, { backgroundColor: st.bg }]}><Text style={[styles.chipT, { color: st.fg }]}>{st.label}</Text></View>
                </View>
                <Text style={styles.more}>{open === b.id ? '접기 ▲' : '상담 상세 ▼'}</Text>
              </TouchableOpacity>
              {open === b.id && <Detail id={b.id} status={b.status} />}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
});
