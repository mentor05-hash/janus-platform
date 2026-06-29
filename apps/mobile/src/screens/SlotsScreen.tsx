import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError, Quote, Slot, Teacher } from '../api';

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
    <ScrollView style={styles.wrap}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.back}>← 선생님 목록</Text>
      </TouchableOpacity>
      <Text style={styles.h}>{teacher.name} · 예약</Text>
      <Text style={styles.label}>날짜 (YYYY-MM-DD)</Text>
      <TextInput style={styles.input} value={date} onChangeText={setDate} autoCapitalize="none" />
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.label}>가용 시간 (30분, zoom)</Text>
      <View style={styles.slotWrap}>
        {avail.map((s) => (
          <TouchableOpacity key={s.index} style={[styles.slot, start === s.index && styles.slotSel]} onPress={() => pick(s.index)}>
            <Text style={[styles.slotText, start === s.index && styles.slotTextSel]}>{s.time}</Text>
          </TouchableOpacity>
        ))}
        {avail.length === 0 && <Text style={styles.sub}>가용 시간이 없습니다.</Text>}
      </View>

      {quote && (
        <View style={styles.quote}>
          <Text style={styles.quoteText}>
            {quote.minutes}분 · {quote.credits.toLocaleString()}크레딧 · {quote.valid ? '예약 가능' : '불가'}
          </Text>
          <TouchableOpacity style={[styles.btn, !quote.valid && styles.btnDisabled]} onPress={book} disabled={!quote.valid}>
            <Text style={styles.btnText}>예약하기</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16 },
  back: { color: '#0E5C7C', marginBottom: 8 },
  h: { fontSize: 18, fontWeight: '700', color: '#0E5C7C' },
  label: { color: '#5b6b73', fontSize: 13, marginTop: 14, marginBottom: 4 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e8eb', borderRadius: 8, padding: 10 },
  slotWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#0E5C7C', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  slotSel: { backgroundColor: '#0E5C7C' },
  slotText: { color: '#0E5C7C', fontWeight: '600' },
  slotTextSel: { color: '#fff' },
  quote: { marginTop: 20, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e3e8eb', padding: 16 },
  quoteText: { fontWeight: '700', marginBottom: 12 },
  btn: { backgroundColor: '#0E5C7C', borderRadius: 8, padding: 14, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '700' },
  sub: { color: '#5b6b73', fontSize: 13 },
  error: { color: '#d23b3b', marginTop: 8 },
});
