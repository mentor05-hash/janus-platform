import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError, Quote, Slot, Teacher } from '../api';
import { C, R, SP, ui } from '../theme';

const today = () => new Date().toISOString().slice(0, 10);
const DURATION = 3; // 30분 (10분 슬롯 3칸)
const WD = ['일', '월', '화', '수', '목', '금', '토'];

// 슬롯 상태별 표시(학생 관점). avail 만 신청 가능, 나머지는 안내용.
const SLOT_UI: Record<Slot['status'], { label: string; bg: string; fg: string; bd: string }> = {
  avail: { label: '가능', bg: '#E3F4EA', fg: '#15803D', bd: '#B7E0C6' },
  booked: { label: '예약', bg: '#EAF0FC', fg: '#2563EB', bd: '#C7D8F6' },
  rest: { label: '휴게', bg: '#EEF1F3', fg: '#8B9BA3', bd: '#E0E5E8' },
  off: { label: '근무외', bg: '#F4F6F8', fg: '#B6C0C6', bd: '#EAEEF0' },
  blocked: { label: '차단', bg: '#FBE7E7', fg: '#C92A2A', bd: '#F1C9C9' },
};

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

  // 날짜 스트립(오늘부터 14일) — 선생님 근무일이 아닌 날은 빈 표로 안내됨.
  const dateOptions = useMemo(() => {
    const base = new Date();
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { iso, md: `${d.getMonth() + 1}/${d.getDate()}`, wd: WD[d.getDay()], dow: d.getDay() };
    });
  }, []);

  // 시간대(시)별 그룹 — 컴팩트 표
  const byHour = useMemo(() => {
    const m = new Map<number, Slot[]>();
    for (const s of slots) {
      const h = Math.floor((s.index * 10) / 60);
      if (!m.has(h)) m.set(h, []);
      m.get(h)!.push(s);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [slots]);

  // 30분(3칸) 연속 가능해야 시작 가능 — 학생이 '진짜 신청 가능'한 시작점만 활성화
  const availSet = useMemo(() => new Set(slots.filter((s) => s.status === 'avail').map((s) => s.index)), [slots]);
  const canStart = (idx: number) => availSet.has(idx) && availSet.has(idx + 1) && availSet.has(idx + 2);
  const selectedTime = start !== null ? slots.find((s) => s.index === start)?.time ?? '' : '';

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}><Text style={styles.back}>‹ 선생님 목록</Text></TouchableOpacity>
      <View style={styles.head}>
        <Text style={ui.h}>상담 신청</Text>
        <Text style={ui.sub}>{teacher.name}{selectedTime ? ` · ${selectedTime}` : ''}</Text>
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

      {/* 날짜 선택 */}
      <Text style={styles.sec}>날짜</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        {dateOptions.map((d) => {
          const on = d.iso === date;
          const we = d.dow === 0 || d.dow === 6;
          return (
            <TouchableOpacity key={d.iso} style={[styles.dateChip, on && styles.dateChipOn]} onPress={() => setDate(d.iso)}>
              <Text style={[styles.dateWd, on && styles.dateOnT, we && !on && { color: d.dow === 0 ? '#DC2626' : '#2563EB' }]}>{d.wd}</Text>
              <Text style={[styles.dateMd, on && styles.dateOnT]}>{d.md}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* 시간 — 시간대별 컴팩트 표(선생님 근무·체류 반영) */}
      <Text style={styles.sec}>시간 (30분 단위 · 가능 시간만 선택)</Text>
      {slots.length === 0 ? (
        <Text style={ui.sub}>이 날짜에는 선생님 근무 시간이 없어요. 다른 날짜를 선택해 주세요.</Text>
      ) : (
        <>
          <View style={{ gap: 4 }}>
            {byHour.map(([h, cells]) => (
              <View key={h} style={styles.hourRow}>
                <Text style={styles.hourLabel}>{h}시</Text>
                <View style={styles.hourCells}>
                  {cells.map((s) => {
                    const inRange = start !== null && s.index >= start && s.index < start + DURATION;
                    const startable = canStart(s.index);
                    const u = SLOT_UI[s.status];
                    return (
                      <TouchableOpacity
                        key={s.index}
                        activeOpacity={startable ? 0.6 : 1}
                        disabled={!startable}
                        onPress={() => setStart(s.index)}
                        style={[
                          styles.cell,
                          { backgroundColor: u.bg, borderColor: u.bd },
                          inRange && styles.cellSel,
                          s.status === 'avail' && !startable && { opacity: 0.45 },
                        ]}
                      >
                        <Text style={[styles.cellT, { color: inRange ? '#fff' : u.fg }]}>{s.time}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
          {/* 범례 */}
          <View style={styles.legend}>
            {(['avail', 'booked', 'rest', 'off'] as Slot['status'][]).map((k) => (
              <View key={k} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: SLOT_UI[k].bg, borderColor: SLOT_UI[k].bd }]} />
                <Text style={styles.legendT}>{SLOT_UI[k].label}</Text>
              </View>
            ))}
          </View>
          {avail.length === 0 && <Text style={[ui.sub, { marginTop: 6 }]}>이 날은 신청 가능한 빈 시간이 없어요.</Text>}
        </>
      )}

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
  dateChip: { minWidth: 52, alignItems: 'center', backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingVertical: 8, paddingHorizontal: 10 },
  dateChipOn: { backgroundColor: C.teal, borderColor: C.teal },
  dateWd: { fontSize: 11, fontWeight: '700', color: C.muted },
  dateMd: { fontSize: 14, fontWeight: '800', color: C.ink, marginTop: 2 },
  dateOnT: { color: '#fff' },
  hourRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hourLabel: { width: 30, fontSize: 11, color: C.muted, textAlign: 'right', fontWeight: '600' },
  hourCells: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, flex: 1 },
  cell: { width: 46, paddingVertical: 6, borderRadius: 7, borderWidth: 1, alignItems: 'center' },
  cellSel: { backgroundColor: C.teal, borderColor: C.teal },
  cellT: { fontSize: 11, fontWeight: '700' },
  legend: { flexDirection: 'row', gap: 14, marginTop: 10, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 12, height: 12, borderRadius: 3, borderWidth: 1 },
  legendT: { fontSize: 11, color: C.muted },
  warn: { borderWidth: 1, borderRadius: 10, padding: 12, marginTop: SP.lg },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 14, marginTop: SP.lg, marginBottom: SP.md },
});
