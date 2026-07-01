import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError, Slot } from '../api';
import { C, R, SP, ui } from '../theme';

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const SLOT_BG: Record<Slot['status'], string> = { avail: '#CDEBDD', booked: '#D6E4FB', rest: '#E9EDF0', off: '#F4F6F8', blocked: '#FAD9D9' };

export function RescheduleScreen({ bookingId, teacherId, teacherName, duration, onBack, onDone }: {
  bookingId: string; teacherId: string; teacherName: string; duration: number; onBack: () => void; onDone: () => void;
}) {
  const [date, setDate] = useState(today());
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [selStart, setSelStart] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const dates = useMemo(() => {
    const base = new Date();
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      return { iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, md: `${d.getMonth() + 1}/${d.getDate()}`, wd: WD[d.getDay()] };
    });
  }, []);
  const availSet = useMemo(() => new Set((slots ?? []).filter((s) => s.status === 'avail').map((s) => s.index)), [slots]);

  useEffect(() => {
    setSlots(null); setSelStart(null); setError('');
    api.get<Slot[]>(`/teachers/${teacherId}/slots?date=${date}`).then(setSlots).catch((e) => setError(e instanceof ApiError ? e.message : '슬롯 조회 실패'));
  }, [teacherId, date]);

  // 시작 슬롯 선택 시, duration 개 연속 avail 이어야 유효
  const selEnd = selStart !== null ? selStart + duration - 1 : null;
  const selValid = selStart !== null && Array.from({ length: duration }, (_, k) => selStart + k).every((i) => availSet.has(i));

  const byHour = useMemo(() => {
    const m = new Map<number, Slot[]>();
    for (const s of slots ?? []) { const h = Math.floor((s.index * 10) / 60); if (!m.has(h)) m.set(h, []); m.get(h)!.push(s); }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [slots]);

  async function submit() {
    if (selStart === null || !selValid) return;
    setBusy(true); setError('');
    try {
      await api.patch(`/bookings/${bookingId}/reschedule`, { date, slotStart: selStart, slotEnd: selStart + duration });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? (e.status === 409 ? '선택한 시간은 예약할 수 없어요. 다른 시간을 골라주세요.' : e.message) : '시간 변경 실패');
    } finally { setBusy(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 90 }}>
        <TouchableOpacity onPress={onBack}><Text style={styles.back}>‹ 예약</Text></TouchableOpacity>
        <Text style={ui.h}>시간 변경</Text>
        <Text style={styles.sub}>{teacherName} 선생님 · {duration * 10}분 (같은 길이로 이동)</Text>

        <Text style={styles.lbl}>날짜</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
          {dates.map((d) => (
            <TouchableOpacity key={d.iso} style={[styles.dateChip, d.iso === date && styles.dateOn]} onPress={() => setDate(d.iso)}>
              <Text style={[styles.dateWd, d.iso === date && { color: C.white }]}>{d.wd}</Text>
              <Text style={[styles.dateMd, d.iso === date && { color: C.white }]}>{d.md}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.lbl}>시작 시간 (가능 시간만)</Text>
        {slots === null ? <Text style={ui.sub}>불러오는 중…</Text> : slots.length === 0 ? <Text style={ui.sub}>이 날짜엔 근무 시간이 없어요.</Text> : (
          byHour.map(([h, cells]) => (
            <View key={h} style={styles.hourRow}>
              <Text style={styles.hourL}>{h}시</Text>
              <View style={styles.cells}>
                {cells.map((s) => {
                  const inSel = selStart !== null && selEnd !== null && s.index >= selStart && s.index <= selEnd && selValid;
                  return (
                    <TouchableOpacity key={s.index} disabled={s.status !== 'avail'} onPress={() => setSelStart(s.index)}
                      style={[styles.cell, { backgroundColor: inSel ? C.teal : SLOT_BG[s.status] }]}>
                      <Text style={[styles.cellT, inSel && { color: C.white }]}>{s.time}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))
        )}
        {selStart !== null && !selValid && <Text style={styles.warn}>이 시작 시간부터 {duration * 10}분 연속으로 비어있지 않아요. 다른 시간을 골라주세요.</Text>}
        {error ? <Text style={ui.error}>{error}</Text> : null}
      </ScrollView>
      <View style={styles.dock}>
        <TouchableOpacity style={[ui.btn, (!selValid || busy) && { opacity: 0.5 }]} disabled={!selValid || busy} onPress={submit}>
          <Text style={ui.btnText}>{busy ? '변경 중…' : '이 시간으로 변경'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { color: C.teal, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  sub: { color: C.muted, fontSize: 13, marginBottom: 8 },
  lbl: { fontSize: 11, fontWeight: '800', color: C.caption, marginTop: 14, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  dateChip: { minWidth: 52, alignItems: 'center', backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingVertical: 7, paddingHorizontal: 10 },
  dateOn: { backgroundColor: C.teal, borderColor: C.teal },
  dateWd: { fontSize: 11, fontWeight: '700', color: C.muted },
  dateMd: { fontSize: 14, fontWeight: '800', color: C.ink, marginTop: 1 },
  hourRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  hourL: { width: 28, fontSize: 11, color: C.muted, textAlign: 'right' },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, flex: 1 },
  cell: { width: 50, paddingVertical: 5, borderRadius: 7, alignItems: 'center' },
  cellT: { fontSize: 11, color: C.ink, fontWeight: '600' },
  warn: { fontSize: 12, color: '#92600a', backgroundColor: '#FEF6E7', borderRadius: 8, padding: 9, marginTop: 8 },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.line, padding: SP.lg },
});
