import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError, Teacher } from '../api';
import { C, R, SP, ui } from '../theme';

type RvBooking = { id: string; teacherId: string; consultType: string | null; mode: string; start: string | null; status: string; direction: string };
const KST = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '-';

export function ReverseOptInScreen() {
  const [value, setValue] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [incoming, setIncoming] = useState<RvBooking[] | null>(null);
  const [teachers, setTeachers] = useState<Record<string, string>>({});
  const [respBusy, setRespBusy] = useState<string | null>(null);

  function loadIncoming() {
    api.get<{ data?: RvBooking[] } | RvBooking[]>('/bookings?role=student')
      .then((r) => {
        const list = Array.isArray(r) ? r : (r.data ?? []);
        setIncoming(list.filter((b) => b.direction === 'reverse' && b.status === 'new'));
      })
      .catch(() => setIncoming([]));
  }

  useEffect(() => {
    api.get<{ reverseSelf: boolean }>('/bookings/reverse/self').then((r) => setValue(r.reverseSelf)).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
    api.get<{ data?: Teacher[] } | Teacher[]>('/teachers').then((r) => {
      const list = Array.isArray(r) ? r : (r.data ?? []);
      setTeachers(Object.fromEntries(list.map((t) => [t.id, t.name])));
    }).catch(() => {});
    loadIncoming();
  }, []);

  async function toggle(next: boolean) {
    setBusy(true); setError(''); setMsg('');
    const prev = value; setValue(next);
    try {
      await api.patch('/bookings/reverse/self', { value: next });
      setMsg(next ? '역상담 받기를 신청했습니다.' : '역상담 받기 신청을 취소했습니다.');
    } catch (e) {
      setValue(prev ?? false);
      setError(e instanceof ApiError ? e.message : '변경 실패');
    } finally { setBusy(false); }
  }

  async function respond(id: string, action: 'accept' | 'reject') {
    setRespBusy(id); setError(''); setMsg('');
    try {
      await api.patch(`/bookings/${id}/reverse-respond`, { action });
      setMsg(action === 'accept' ? '역상담을 수락했습니다. 예약이 확정됐어요.' : '역상담을 거절했습니다.');
      loadIncoming();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '처리 실패');
    } finally { setRespBusy(null); }
  }

  const tName = (id: string) => teachers[id] ?? '선생님';

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={ui.h}>역상담</Text>

      {/* 받은 역상담 제안 */}
      <Text style={styles.sec}>받은 제안 {incoming && incoming.length > 0 ? `(${incoming.length})` : ''}</Text>
      {incoming === null ? (
        <ActivityIndicator color={C.teal} />
      ) : incoming.length === 0 ? (
        <View style={[ui.card, { paddingVertical: 18 }]}><Text style={ui.sub}>받은 역상담 제안이 없어요.</Text></View>
      ) : (
        incoming.map((b) => (
          <View key={b.id} style={[ui.card, styles.propCard]}>
            <Text style={styles.propTitle}>{tName(b.teacherId)} 선생님의 역상담 제안</Text>
            <Text style={styles.desc}>{KST(b.start)} · {b.consultType ?? ''} · {b.mode}</Text>
            <View style={styles.btnRow}>
              <TouchableOpacity style={[styles.rejBtn, respBusy === b.id && { opacity: 0.5 }]} disabled={respBusy === b.id} onPress={() => respond(b.id, 'reject')}>
                <Text style={styles.rejT}>거절</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.accBtn, respBusy === b.id && { opacity: 0.5 }]} disabled={respBusy === b.id} onPress={() => respond(b.id, 'accept')}>
                <Text style={styles.accT}>수락</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      {/* 역상담 받기 신청 */}
      <Text style={styles.sec}>역상담 받기</Text>
      <Text style={[ui.sub, { marginBottom: SP.md }]}>켜면 첫 상담 이후에도 선생님이 회원님에게 상담을 제안할 수 있어요.</Text>
      {value === null && !error ? (
        <ActivityIndicator color={C.teal} />
      ) : (
        <View style={[ui.card, styles.card]}>
          <View style={{ flex: 1, paddingRight: SP.md }}>
            <Text style={styles.title}>선생님 역상담 제안 받기</Text>
            <Text style={styles.desc}>{value ? '신청됨 — 선생님 목록에 노출됩니다.' : '꺼짐 — 첫 상담만 제안받습니다.'}</Text>
          </View>
          <Switch value={!!value} onValueChange={toggle} disabled={busy} trackColor={{ false: C.line, true: C.teal100 }} thumbColor={value ? C.teal : '#f4f3f4'} />
        </View>
      )}

      {msg ? <Text style={styles.ok}>{msg}</Text> : null}
      {error ? <Text style={ui.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sec: { fontSize: 13, fontWeight: '800', color: C.ink, marginTop: SP.lg, marginBottom: 8 },
  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  propCard: { borderColor: C.teal, marginBottom: 8 },
  propTitle: { fontSize: 15, fontWeight: '700', color: C.ink },
  title: { fontSize: 15, fontWeight: '700', color: C.ink },
  desc: { fontSize: 13, color: C.muted, marginTop: 4 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 10, justifyContent: 'flex-end' },
  rejBtn: { borderWidth: 1, borderColor: C.line, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 18 },
  rejT: { color: C.muted, fontWeight: '700', fontSize: 14 },
  accBtn: { backgroundColor: C.teal, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 22 },
  accT: { color: '#fff', fontWeight: '800', fontSize: 14 },
  ok: { color: C.done, fontSize: 13, marginTop: SP.md, fontWeight: '600' },
});
