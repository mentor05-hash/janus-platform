import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError, Slot, Teacher } from '../api';
import { R, SP, useTheme, useUI, type Palette } from '../theme';

type Result = {
  matched: boolean;
  teacherId: string;
  date: string;
  slotStart: number;
  slotEnd: number;
  minutes: number;
  mode: string;
  consultType: string;
  subType: string | null;
};

const CTYPES: [string, string][] = [['담임', '🏫'], ['교과', '📐'], ['입시', '🎯'], ['심리', '💬']];
const SUBJECTS = ['국어', '수학', '영어', '탐구'];
const MODES: [string, string][] = [['online', '온라인'], ['offline', '오프라인'], ['any', '상관없음']];
const KST = (d: string) => new Date(d + 'T00:00:00+09:00').toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short' });

export function AutomatchScreen({ onBack, onBooked }: { onBack: () => void; onBooked: () => void }) {
  const { C } = useTheme();
  const ui = useUI();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [consultType, setConsultType] = useState('교과');
  const [subject, setSubject] = useState('수학');
  const [mode, setMode] = useState('any');
  const [phase, setPhase] = useState<'form' | 'loading' | 'result'>('form');
  const [res, setRes] = useState<Result | null>(null);
  const [teacherName, setTeacherName] = useState('선생님');
  const [startTime, setStartTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const subType = consultType === '교과' ? subject : undefined;

  async function go() {
    setPhase('loading'); setError('');
    try {
      const r = await api.post<Result>('/match/auto', { consultType, subType, mode });
      setRes(r);
      // 선생님 이름 + 시작 시각 표시용 조회
      api.get<{ data?: Teacher[] } | Teacher[]>('/teachers').then((t) => {
        const list = Array.isArray(t) ? t : (t.data ?? []);
        setTeacherName(list.find((x) => x.id === r.teacherId)?.name ?? '선생님');
      }).catch(() => {});
      api.get<Slot[]>(`/teachers/${r.teacherId}/slots?date=${r.date}`).then((slots) => {
        setStartTime(slots.find((s) => s.index === r.slotStart)?.time ?? '');
      }).catch(() => {});
      setPhase('result');
    } catch (e) {
      setError(e instanceof ApiError ? (e.status === 409 ? '7일 내 이용 가능한 자리를 찾지 못했어요. 조건을 바꿔보세요.' : e.message) : '매칭 실패');
      setPhase('form');
    }
  }

  async function confirm() {
    if (!res) return;
    setBusy(true); setError('');
    try {
      await api.post('/bookings', {
        teacherId: res.teacherId, date: res.date, consultType: res.consultType,
        subType: res.subType ?? undefined, mode: res.mode, slotStart: res.slotStart, slotEnd: res.slotEnd,
        content: '자동 매칭으로 신청한 30분 상담입니다.',
      });
      onBooked();
    } catch (e) {
      setError(e instanceof ApiError ? (e.status === 402 ? '크레딧이 부족합니다.' : e.message) : '예약 실패');
    } finally { setBusy(false); }
  }

  function reset() { setPhase('form'); setRes(null); setError(''); }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}><Text style={styles.back}>‹ 마이</Text></TouchableOpacity>
      <Text style={ui.h}>30분 자동 매칭 ⚡</Text>

      {phase === 'loading' && (
        <View style={{ alignItems: 'center', paddingTop: 60 }}>
          <ActivityIndicator size="large" color={C.teal} />
          <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink, marginTop: 16 }}>적당한 시간을 찾는 중…</Text>
          <Text style={styles.sub}>{consultType}{subType ? ` · ${subType}` : ''} · {MODES.find((m) => m[0] === mode)?.[1]}</Text>
        </View>
      )}

      {phase === 'result' && res && (
        <View>
          <Text style={{ fontSize: 15, fontWeight: '800', color: C.done }}>✓ 자리를 찾았어요</Text>
          <Text style={[styles.sub, { marginBottom: 12 }]}>7일 내 가장 빠른 30분</Text>
          <View style={ui.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{KST(res.date)} {startTime}</Text>
              <View style={styles.badge}><Text style={styles.badgeT}>{res.mode === 'offline' ? '오프라인' : '줌'}</Text></View>
            </View>
            <Text style={[styles.sub, { marginTop: 8 }]}>{teacherName} 선생님 · {res.consultType}{res.subType ? ` · ${res.subType}` : ''} · {res.minutes}분</Text>
            <View style={styles.hint}><Text style={styles.hintT}>⚡ 앞뒤 10분 상담정리 버퍼까지 확보된 시간이에요.</Text></View>
          </View>
          {error ? <Text style={ui.error}>{error}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <TouchableOpacity style={styles.lineBtn} onPress={reset}><Text style={styles.lineT}>🔄 다른 시간</Text></TouchableOpacity>
            <TouchableOpacity style={[ui.btn, { flex: 1.4 }]} disabled={busy} onPress={confirm}><Text style={ui.btnText}>{busy ? '확정 중…' : '이 시간으로 확정'}</Text></TouchableOpacity>
          </View>
        </View>
      )}

      {phase === 'form' && (
        <View>
          <Text style={styles.sub}>유형·방식만 고르면 7일 내 가장 빠른 30분을 잡아드려요.</Text>
          <Text style={styles.label}>상담 유형</Text>
          <View style={styles.grid}>
            {CTYPES.map(([t, ic]) => (
              <TouchableOpacity key={t} style={[styles.opt, consultType === t && styles.optOn]} onPress={() => setConsultType(t)}>
                <Text style={{ fontSize: 18 }}>{ic}</Text><Text style={[styles.optT, consultType === t && { color: C.teal }]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {consultType === '교과' && (
            <>
              <Text style={styles.label}>과목</Text>
              <View style={styles.grid}>
                {SUBJECTS.map((s) => (
                  <TouchableOpacity key={s} style={[styles.opt, subject === s && styles.optOn]} onPress={() => setSubject(s)}><Text style={[styles.optT, subject === s && { color: C.teal }]}>{s}</Text></TouchableOpacity>
                ))}
              </View>
            </>
          )}
          <Text style={styles.label}>진행 방식</Text>
          <View style={styles.grid}>
            {MODES.map(([v, l]) => (
              <TouchableOpacity key={v} style={[styles.opt, mode === v && styles.optOn]} onPress={() => setMode(v)}><Text style={[styles.optT, mode === v && { color: C.teal }]}>{l}</Text></TouchableOpacity>
            ))}
          </View>
          {error ? <Text style={ui.error}>{error}</Text> : null}
          <TouchableOpacity style={[ui.btn, { marginTop: 20 }]} onPress={go}><Text style={ui.btnText}>⚡ 자동 매칭하기</Text></TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  back: { color: C.teal, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  sub: { color: C.muted, fontSize: 13, marginTop: 4 },
  label: { fontSize: 12, fontWeight: '800', color: C.caption, marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opt: { minWidth: 72, flexGrow: 1, alignItems: 'center', borderWidth: 1.5, borderColor: C.line, borderRadius: R.card, paddingVertical: 12, backgroundColor: C.white },
  optOn: { borderColor: C.teal, backgroundColor: C.teal50 },
  optT: { fontSize: 13, fontWeight: '700', color: C.muted, marginTop: 3 },
  badge: { backgroundColor: C.newBg, borderRadius: R.sm, paddingHorizontal: 9, paddingVertical: 3 },
  badgeT: { color: C.newC, fontSize: 12, fontWeight: '700' },
  hint: { backgroundColor: C.teal50, borderRadius: 10, padding: 10, marginTop: 11 },
  hintT: { fontSize: 12, color: C.teal, lineHeight: 17 },
  lineBtn: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 11, paddingVertical: 14, alignItems: 'center' },
  lineT: { color: C.muted, fontWeight: '700', fontSize: 14 },
});
