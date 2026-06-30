import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError, Quote, Slot, Teacher } from '../api';
import { C, R, SP, ui } from '../theme';

const today = () => new Date().toISOString().slice(0, 10);
const DURATION = 3; // 30분 (10분 슬롯 3칸)

const SUBJECTS = ['국어', '수학', '영어', '탐구'];
const UPLOADS = [
  { icon: '✏️', label: '직접입력' },
  { icon: '🖼️', label: '그림' },
  { icon: '📄', label: 'PDF' },
  { icon: '🎬', label: '동영상' },
];
const MODES = [
  { mode: 'board', label: '게시판', sub: '질문·답변', price: '건당 4,000~8,000' },
  { mode: 'chat', label: '실시간 채팅', sub: '바로 대화', price: '10분 3,000' },
  { mode: 'zoom', label: '줌 화상', sub: '얼굴 보며', price: '10분 6,667' },
  { mode: 'hand', label: '필기 공유', sub: '같은 화면', price: '10분 6,000' },
];

export function SlotsScreen({ teacher, onBack }: { teacher: Teacher; onBack: () => void }) {
  const [date, setDate] = useState(today());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [start, setStart] = useState<number | null>(null);
  const [subject, setSubject] = useState('수학');
  const [content, setContent] = useState('');
  const [mode, setMode] = useState('zoom');
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

  // 슬롯·방식 선택 시 재견적
  useEffect(() => {
    if (start === null) return;
    setError('');
    api
      .post<Quote>('/bookings/quote', { teacherId: teacher.id, date, mode, slotStart: start, slotEnd: start + DURATION })
      .then(setQuote)
      .catch((e) => { setQuote(null); setError(e instanceof ApiError ? e.message : '견적 실패'); });
  }, [start, mode, teacher.id, date]);

  async function book() {
    if (start === null) return;
    try {
      await api.post('/bookings', { teacherId: teacher.id, date, consultType: '교과', subType: subject, mode, slotStart: start, slotEnd: start + DURATION, content });
      Alert.alert('예약 완료', '상담이 신청되었습니다.');
      onBack();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : '예약 실패';
      Alert.alert(e instanceof ApiError && e.status === 402 ? '크레딧 부족' : '예약 실패', msg);
    }
  }

  const avail = slots.filter((s) => s.status === 'avail');
  const modeLabel = MODES.find((m) => m.mode === mode)?.label ?? mode;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}><Text style={styles.back}>‹ 선생님 목록</Text></TouchableOpacity>
      <View style={styles.head}>
        <Text style={ui.h}>상담 신청</Text>
        <Text style={ui.sub}>{teacher.name}{start !== null ? ` · ${avail.find((s) => s.index === start)?.time ?? ''}` : ''}</Text>
      </View>

      {/* 과목 */}
      <Text style={styles.sec}>과목</Text>
      <View style={styles.row}>
        {SUBJECTS.map((s) => (
          <TouchableOpacity key={s} style={[styles.pill, subject === s && styles.pillOn]} onPress={() => setSubject(s)}>
            <Text style={[styles.pillT, subject === s && styles.pillTOn]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 상담 내용 */}
      <Text style={styles.sec}>상담 내용</Text>
      <TextInput style={[ui.input, { height: 84, textAlignVertical: 'top' }]} multiline value={content} onChangeText={setContent} placeholder="예: 미적분 30번, 합성함수 미분에서 풀이가 막혀요." placeholderTextColor={C.caption} />

      {/* 문제 업로드 */}
      <Text style={styles.sec}>문제 업로드</Text>
      <View style={styles.row}>
        {UPLOADS.map((u) => (
          <View key={u.label} style={styles.upload}>
            <Text style={{ fontSize: 20 }}>{u.icon}</Text>
            <Text style={styles.uploadT}>{u.label}</Text>
          </View>
        ))}
      </View>

      {/* 진행 방식 */}
      <Text style={styles.sec}>진행 방식</Text>
      <View style={styles.modeGrid}>
        {MODES.map((m) => {
          const on = mode === m.mode;
          return (
            <TouchableOpacity key={m.mode} style={[styles.modeCard, on && styles.modeOn]} onPress={() => setMode(m.mode)} activeOpacity={0.8}>
              <Text style={styles.modeLabel}>{m.label}</Text>
              <Text style={styles.modeSub}>{m.sub}</Text>
              <Text style={[styles.modePrice, on && { color: C.teal }]}>{m.price}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 시간 선택 */}
      <Text style={styles.sec}>시간 ({date})</Text>
      <View style={styles.slotWrap}>
        {avail.map((s) => {
          const sel = start === s.index;
          return (
            <TouchableOpacity key={s.index} style={[styles.slot, sel && styles.slotSel]} onPress={() => setStart(s.index)}>
              <Text style={[styles.slotText, sel && styles.slotTextSel]}>{s.time}</Text>
            </TouchableOpacity>
          );
        })}
        {avail.length === 0 && <Text style={ui.sub}>가용 시간이 없습니다.</Text>}
      </View>

      {error ? <Text style={ui.error}>{error}</Text> : null}

      {/* 요금 / 예약 */}
      {quote && (
        <>
          {!quote.valid && (
            <View style={[styles.warn, { backgroundColor: '#fff9ed', borderColor: '#f0dcae' }]}>
              <Text style={{ color: '#92600a', fontWeight: '700', fontSize: 13 }}>⚠ {quote.message || '이 시간대는 이용할 수 없어요.'}</Text>
            </View>
          )}
          <View style={styles.payRow}>
            <Text style={{ color: C.ink, fontWeight: '700', fontSize: 14 }}>{modeLabel} · {quote.minutes}분 차감 예정</Text>
            <Text style={{ color: C.teal, fontWeight: '800', fontSize: 16 }}>{quote.credits.toLocaleString()} 크레딧</Text>
          </View>
          <TouchableOpacity style={[ui.btn, !quote.valid && ui.btnDisabled]} onPress={book} disabled={!quote.valid}>
            <Text style={ui.btnText}>예약하기</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  back: { color: C.teal, marginBottom: SP.sm, fontWeight: '700', fontSize: 15 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: SP.sm },
  sec: { fontSize: 13, fontWeight: '800', color: C.ink, marginTop: SP.lg, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: { flex: 1, minWidth: 64, alignItems: 'center', backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingVertical: 11 },
  pillOn: { backgroundColor: C.teal, borderColor: C.teal },
  pillT: { color: C.muted, fontWeight: '700', fontSize: 14 },
  pillTOn: { color: '#fff' },
  upload: { flex: 1, alignItems: 'center', gap: 4, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingVertical: 12 },
  uploadT: { fontSize: 12, color: C.muted, fontWeight: '600' },
  modeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modeCard: { width: '48%', backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 14 },
  modeOn: { borderColor: C.teal, borderWidth: 2, backgroundColor: C.teal50 },
  modeLabel: { fontSize: 14, fontWeight: '800', color: C.ink },
  modeSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  modePrice: { fontSize: 12, fontWeight: '700', color: C.muted, marginTop: 8 },
  slotWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm, marginTop: 2 },
  slot: { backgroundColor: C.teal50, borderWidth: 1, borderColor: C.teal100, borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 9 },
  slotSel: { backgroundColor: C.teal, borderColor: C.teal },
  slotText: { color: C.teal, fontWeight: '700', fontSize: 13 },
  slotTextSel: { color: C.white },
  warn: { borderWidth: 1, borderRadius: 10, padding: 12, marginTop: SP.lg },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 14, marginTop: SP.lg, marginBottom: SP.md },
});
