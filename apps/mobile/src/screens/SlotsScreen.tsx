import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError, Quote, Slot, Teacher } from '../api';
import { C, R, SP, ui } from '../theme';

const today = () => new Date().toISOString().slice(0, 10);
const DURATION = 3; // 30분 (10분 슬롯 3칸)

export function SlotsScreen({ teacher, onBack }: { teacher: Teacher; onBack: () => void }) {
  const [date, setDate] = useState(today());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [start, setStart] = useState<number | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setStart(null);
    setQuote(null);
    api
      .get<Slot[]>(`/teachers/${teacher.id}/slots?date=${date}`)
      .then(setSlots)
      .catch((e) => setError(e instanceof ApiError ? e.message : '슬롯 조회 실패'));
  }, [teacher.id, date]);

  async function pick(index: number) {
    setStart(index);
    setError('');
    try {
      setQuote(
        await api.post<Quote>('/bookings/quote', {
          teacherId: teacher.id,
          date,
          mode: 'zoom',
          slotStart: index,
          slotEnd: index + DURATION,
        }),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '견적 실패');
    }
  }

  async function book() {
    if (start === null) return;
    try {
      await api.post('/bookings', {
        teacherId: teacher.id,
        date,
        consultType: '교과',
        mode: 'zoom',
        slotStart: start,
        slotEnd: start + DURATION,
      });
      Alert.alert('예약 완료', '상담이 예약되었습니다.');
      onBack();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : '예약 실패';
      Alert.alert(e instanceof ApiError && e.status === 402 ? '크레딧 부족' : '예약 실패', msg);
    }
  }

  const avail = slots.filter((s) => s.status === 'avail');

  return (
    <ScrollView style={ui.screen}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.back}>← 선생님 목록</Text>
      </TouchableOpacity>
      <Text style={ui.h}>{teacher.name} · 예약</Text>
      <Text style={ui.label}>날짜 (YYYY-MM-DD)</Text>
      <TextInput style={ui.input} value={date} onChangeText={setDate} autoCapitalize="none" />
      {error ? <Text style={ui.error}>{error}</Text> : null}

      <Text style={ui.label}>가용 시간 (30분, zoom)</Text>
      <View style={styles.slotWrap}>
        {avail.map((s) => {
          const sel = start === s.index;
          return (
            <TouchableOpacity key={s.index} style={[styles.slot, sel && styles.slotSel]} onPress={() => pick(s.index)}>
              <Text style={[styles.slotText, sel && styles.slotTextSel]}>{s.time}</Text>
            </TouchableOpacity>
          );
        })}
        {avail.length === 0 && <Text style={ui.sub}>가용 시간이 없습니다.</Text>}
      </View>

      {quote && (
        <View style={[ui.card, styles.quote]}>
          <Text style={styles.quoteText}>
            {quote.minutes}분 · {quote.credits.toLocaleString()}크레딧 ·{' '}
            <Text style={{ color: quote.valid ? C.done : C.danger }}>{quote.valid ? '예약 가능' : '불가'}</Text>
          </Text>
          <TouchableOpacity style={[ui.btn, !quote.valid && ui.btnDisabled]} onPress={book} disabled={!quote.valid}>
            <Text style={ui.btnText}>예약하기</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  back: { color: C.teal, marginBottom: SP.sm, fontWeight: '600' },
  slotWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm, marginTop: 4 },
  slot: {
    backgroundColor: C.teal50, borderWidth: 1, borderColor: C.teal100,
    borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 9,
  },
  slotSel: { backgroundColor: C.teal, borderColor: C.teal },
  slotText: { color: C.teal, fontWeight: '700', fontSize: 13 },
  slotTextSel: { color: C.white },
  quote: { marginTop: SP.xl },
  quoteText: { fontWeight: '700', fontSize: 15, color: C.ink, marginBottom: SP.md },
});
