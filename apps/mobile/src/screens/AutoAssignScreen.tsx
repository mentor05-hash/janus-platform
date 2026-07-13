import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { R, useTheme, useUI, type Palette } from '../theme';

type Req = { id: string; consult_type: string; mode: string; status: string; assigned_booking_id: string | null; created_at: string };

const CTYPES: [string, string][] = [['담임', '🏫'], ['교과', '📐'], ['입시', '🎯'], ['심리', '💬']];
const MODES: [string, string][] = [['zoom', '줌 화상'], ['chat', '채팅'], ['offline', '오프라인']];
// prisma enum client 값 → 한글
const CT_KO: Record<string, string> = { homeroom: '담임', subject: '교과', admission: '입시', psych: '심리', 담임: '담임', 교과: '교과', 입시: '입시', 심리: '심리' };
const MODE_KO: Record<string, string> = { zoom: '줌 화상', chat: '채팅', hand: '필기', offline: '오프라인' };
const STATUS: Record<string, { label: string; color: string }> = {
  waiting: { label: '대기중', color: '#A97D24' },
  assigned: { label: '배정완료', color: '#1A7F37' },
  cancelled: { label: '취소됨', color: '#8B95A1' },
};

export function AutoAssignScreen({ onBack }: { onBack: () => void }) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => mk(C), [C]);
  const [consultType, setConsultType] = useState('교과');
  const [mode, setMode] = useState('zoom');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [reqs, setReqs] = useState<Req[] | null>(null);

  const load = useCallback(() => {
    api.get<Req[]>('/assignment/auto-request').then(setReqs).catch(() => setReqs([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function submit() {
    setBusy(true); setMsg('');
    try {
      await api.post('/assignment/auto-request', { consultType, mode });
      setMsg('신청했어요. 전임 선생님 근무시간에 자동 배정되면 알려드릴게요.');
      load();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : '신청 실패');
    } finally { setBusy(false); }
  }
  async function cancel(id: string) {
    try { await api.del(`/assignment/auto-request/${id}`); load(); } catch { /* noop */ }
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}><Text style={s.back}>‹ 마이</Text></TouchableOpacity>
      <Text style={s.h1}>자동배정 신청</Text>
      <Text style={s.sub}>시간을 정하지 않아도 돼요. 전임 선생님의 근무시간 빈 자리에 자동으로 배정됩니다.</Text>

      <Text style={s.label}>상담 종류</Text>
      <View style={s.chips}>
        {CTYPES.map(([v, ic]) => (
          <TouchableOpacity key={v} style={[s.chip, consultType === v && s.chipOn]} onPress={() => setConsultType(v)}>
            <Text style={[s.chipT, consultType === v && s.chipTOn]}>{ic} {v}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.label}>방식</Text>
      <View style={s.chips}>
        {MODES.map(([v, l]) => (
          <TouchableOpacity key={v} style={[s.chip, mode === v && s.chipOn]} onPress={() => setMode(v)}>
            <Text style={[s.chipT, mode === v && s.chipTOn]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={[s.submit, busy && { opacity: 0.6 }]} disabled={busy} onPress={submit}>
        <Text style={s.submitT}>{busy ? '신청 중…' : '자동배정 신청'}</Text>
      </TouchableOpacity>
      {msg ? <Text style={s.msg}>{msg}</Text> : null}

      <Text style={[s.label, { marginTop: 22 }]}>내 신청 현황</Text>
      {reqs === null ? <ActivityIndicator color={C.teal} style={{ marginTop: 12 }} />
        : reqs.length === 0 ? <Text style={s.empty}>아직 신청이 없어요.</Text>
        : reqs.map((r) => {
          const st = STATUS[r.status] ?? { label: r.status, color: C.caption };
          return (
            <View key={r.id} style={s.card}>
              <View style={s.row}>
                <Text style={s.cardT}>{CT_KO[r.consult_type] ?? r.consult_type} · {MODE_KO[r.mode] ?? r.mode}</Text>
                <View style={[s.badge, { backgroundColor: st.color }]}><Text style={s.badgeT}>{st.label}</Text></View>
              </View>
              {r.status === 'waiting' && (
                <TouchableOpacity onPress={() => cancel(r.id)} style={s.cancel}><Text style={s.cancelT}>신청 취소</Text></TouchableOpacity>
              )}
              {r.status === 'assigned' && <Text style={s.assignedNote}>예약이 확정됐어요. ‘내 예약’에서 확인하세요.</Text>}
            </View>
          );
        })}
    </ScrollView>
  );
}

const mk = (C: Palette) => StyleSheet.create({
  back: { color: C.teal, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  h1: { fontSize: 22, fontWeight: '800', color: C.ink },
  sub: { fontSize: 13, color: C.muted, marginTop: 4, marginBottom: 8, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: '700', color: C.ink, marginTop: 14, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.white },
  chipOn: { borderColor: C.teal, backgroundColor: C.teal },
  chipT: { fontSize: 13, fontWeight: '700', color: C.muted },
  chipTOn: { color: '#fff' },
  submit: { marginTop: 20, backgroundColor: C.teal, borderRadius: R.md, paddingVertical: 14, alignItems: 'center' },
  submitT: { color: '#fff', fontSize: 15, fontWeight: '800' },
  msg: { marginTop: 10, fontSize: 13, color: C.teal, fontWeight: '600' },
  empty: { fontSize: 13, color: C.caption, marginTop: 10 },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: R.card, padding: 14, marginTop: 10, backgroundColor: C.white },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardT: { fontSize: 14, fontWeight: '700', color: C.ink },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeT: { color: '#fff', fontSize: 11, fontWeight: '800' },
  cancel: { marginTop: 10, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: C.line },
  cancelT: { fontSize: 12, fontWeight: '700', color: C.muted },
  assignedNote: { marginTop: 8, fontSize: 12, color: C.muted },
});
