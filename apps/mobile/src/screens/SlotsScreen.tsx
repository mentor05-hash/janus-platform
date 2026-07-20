import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError, Attachment, Quote, Slot, Teacher } from '../api';
import { R, SP, useTheme, useUI, type Palette } from '../theme';

const today = () => new Date().toISOString().slice(0, 10);
const DURATION = 3; // 기본 30분 (10분 슬롯 3칸)
const MIN_LEN = 1; // 최소 10분
const FORCE_WINDOW = 4; // 이전 상담 종료 후 40분(=4칸) 이내면 시작 강제
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const minToTime = (idx: number) => `${String(Math.floor((idx * 10) / 60)).padStart(2, '0')}:${String((idx * 10) % 60).padStart(2, '0')}`;

// 슬롯 상태별 표시(학생 관점). avail 만 신청 가능, 나머지는 안내용.
const SLOT_UI: Record<Slot['status'], { label: string; bg: string; fg: string; bd: string }> = {
  avail: { label: '가능', bg: '#E7F3ED', fg: '#2A8A5F', bd: '#BFE0D0' },
  booked: { label: '예약', bg: '#E8F0F9', fg: '#2F6FB3', bd: '#C4D8EE' },
  rest: { label: '휴게', bg: '#EEF1F3', fg: '#8695A8', bd: '#E0E5E8' },
  off: { label: '근무외', bg: '#F0F4FA', fg: '#B6C0C6', bd: '#E8EDF5' },
  blocked: { label: '차단', bg: '#F9E8E4', fg: '#C25A43', bd: '#EFC7BD' },
};

const SUBJECTS = ['국어', '수학', '영어', '탐구'];
const MODES = [
  { mode: 'chat', label: '실시간 채팅', sub: '바로 대화', price: '10분 3,000' },
  { mode: 'zoom', label: '줌 화상', sub: '얼굴 보며', price: '10분 6,667' },
  { mode: 'hand', label: '필기 공유', sub: '같은 화면', price: '10분 6,000' },
  { mode: 'offline', label: '오프라인', sub: '센터 대면', price: '점유료 가산' },
];

export function SlotsScreen({ teacher, onBack, initialMode, consultType, initialSubType }: { teacher: Teacher; onBack: () => void; initialMode?: string; consultType?: string; initialSubType?: string }) {
  const { C } = useTheme();
  const ui = useUI();
  const styles = useMemo(() => makeStyles(C), [C]);
  // 검색에서 고른 상담 종류(없으면 교과). 이 종류가 예약·견적·기본시간에 실제로 반영된다.
  const ctype = consultType || '교과';
  // 종류별 기본 상담시간(분) → 슬롯 칸 수. 정책(GET /bookings/duration/policy) 로드 전 기본 30분.
  const [defaultSlots, setDefaultSlots] = useState(DURATION);
  useEffect(() => {
    api
      .get<Record<string, number>>('/bookings/duration/policy')
      .then((pol) => { const min = pol?.[ctype]; if (min && min > 0) setDefaultSlots(Math.max(MIN_LEN, Math.round(min / 10))); })
      .catch(() => { /* 정책 없으면 기본 30분 */ });
  }, [ctype]);
  const [faved, setFaved] = useState(false);
  useEffect(() => {
    api.get<{ fit: string[] }>('/me/teacher-lists').then((r) => setFaved((r.fit ?? []).includes(teacher.id))).catch(() => { /* 찜 목록 조회 실패 */ });
  }, [teacher.id]);
  async function toggleFav() {
    try {
      if (faved) { await api.del(`/me/teacher-lists/${teacher.id}`); Alert.alert('찜 해제', '내 선생님(찜)에서 제거했어요.'); }
      else { await api.post('/me/teacher-lists', { teacherId: teacher.id, listKind: 'fit' }); Alert.alert('찜', '내 선생님(찜)에 추가했어요.'); }
      setFaved(!faved);
    } catch (e) { Alert.alert('실패', e instanceof ApiError ? e.message : '오류'); }
  }
  // 선생님이 제공하는 방식만 노출(방식 먼저 선택 흐름). 비어 있으면 전체.
  const modeList = teacher.modes?.length ? MODES.filter((m) => teacher.modes!.includes(m.mode)) : MODES;
  const modeVals = modeList.map((m) => m.mode);
  const [date, setDate] = useState(today());
  const [slots, setSlots] = useState<Slot[]>([]);
  // 선택 범위: selStart..selEnd(둘 다 포함, 10분 인덱스). null = 미선택
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);
  const [notice, setNotice] = useState(''); // 강제 시작 안내
  const [subject, setSubject] = useState(initialSubType && SUBJECTS.includes(initialSubType) ? initialSubType : '수학');
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState(initialMode && modeVals.includes(initialMode) ? initialMode : modeVals.includes('zoom') ? 'zoom' : modeVals[0]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');

  function resetSel() {
    setSelStart(null);
    setSelEnd(null);
    setNotice('');
    setQuote(null);
  }

  /** 슬롯 최신화(다른 학생 예약 반영). */
  function loadSlots() {
    api
      .get<Slot[]>(`/teachers/${teacher.id}/slots?date=${date}`)
      .then(setSlots)
      .catch((e) => setError(e instanceof ApiError ? e.message : '슬롯 조회 실패'));
  }
  useEffect(() => {
    resetSel();
    loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacher.id, date]);

  // 범위·방식 선택 시 재견적
  useEffect(() => {
    if (selStart === null || selEnd === null) return;
    setError('');
    api
      .post<Quote>('/bookings/quote', { teacherId: teacher.id, date, mode, consultType: ctype, slotStart: selStart, slotEnd: selEnd + 1 })
      .then(setQuote)
      .catch((e) => { setQuote(null); setError(e instanceof ApiError ? e.message : '견적 실패'); });
  }, [selStart, selEnd, mode, teacher.id, date, ctype]);

  // 문제 파일 첨부(웹: 브라우저 파일창 → /files 업로드 → id 연결)
  function pickFiles() {
    if (typeof document === 'undefined') {
      Alert.alert('안내', '파일 첨부는 웹에서 지원됩니다. (앱은 추후 지원)');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,application/pdf,video/*';
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      if (!files.length) return;
      setUploading(true);
      try {
        for (const f of files) {
          const r = await api.uploadWeb(f, f.name);
          setAttachments((prev) => [...prev, { id: r.id, name: r.filename, type: r.contentType }]);
        }
      } catch (e) {
        Alert.alert('업로드 실패', e instanceof ApiError ? e.message : '오류가 발생했어요.');
      } finally {
        setUploading(false);
      }
    };
    input.click();
  }

  async function book() {
    if (selStart === null || selEnd === null) return;
    try {
      await api.post('/bookings', { teacherId: teacher.id, date, consultType: ctype, subType: subject, mode, slotStart: selStart, slotEnd: selEnd + 1, content, attachments });
      Alert.alert('예약 완료', '상담이 신청되었습니다.');
      onBack();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && /줌.*초과/.test(e.message)) {
        Alert.alert('줌 상담실 만석', '지금은 줌 상담실이 가득 찼어요. 채팅·필기·오프라인 등 다른 방식을 선택해 주세요.');
        return;
      }
      if (e instanceof ApiError && e.status === 409) {
        // 다른 학생이 먼저 예약함 등 슬롯 충돌 → 선택 해제 + 슬롯 새로고침.
        Alert.alert('예약할 수 없어요', e.message);
        resetSel();
        loadSlots();
        return;
      }
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

  const availSet = useMemo(() => new Set(slots.filter((s) => s.status === 'avail').map((s) => s.index)), [slots]);
  const statusAt = (idx: number) => slots.find((s) => s.index === idx)?.status;
  const selectedTime = selStart !== null ? minToTime(selStart) : '';
  const selLen = selStart !== null && selEnd !== null ? selEnd - selStart + 1 : 0;

  // 가용 런(연속 avail 구간)의 시작 인덱스
  const runStartOf = (idx: number) => {
    let i = idx;
    while (availSet.has(i - 1)) i -= 1;
    return i;
  };
  // 런이 '이전 상담 직후'(booked → rest(휴게10분) → avail)인지
  const afterBooking = (runStart: number) => statusAt(runStart - 1) === 'rest' && statusAt(runStart - 2) === 'booked';
  // 제한규칙: 이전 상담 종료 후 40분 이내 시작은 무조건 '종료+10분'(런 시작)으로 강제
  const forcedStartFor = (idx: number) => {
    const rs = runStartOf(idx);
    if (afterBooking(rs) && idx - rs < FORCE_WINDOW) return rs;
    return idx;
  };
  // 새 선택: 시작점(강제 적용) + 기본 30분(가용 한도 내 클램프)
  function selectNew(idx: number) {
    if (!availSet.has(idx)) return;
    const fs = forcedStartFor(idx);
    let end = fs;
    while (end - fs + 1 < defaultSlots && availSet.has(end + 1)) end += 1;
    setSelStart(fs);
    setSelEnd(end);
    setNotice(fs !== idx ? `이전 상담 직후라 이 시간대는 ${minToTime(fs)} 시작만 가능해요(휴게 10분).` : afterBooking(fs) ? `이전 상담 직후 시간대 — ${minToTime(fs)} 시작 고정(휴게 10분).` : '');
  }
  function onTapCell(idx: number) {
    if (statusAt(idx) !== 'avail') return; // 가능 칸만
    if (selStart === null || selEnd === null) return selectNew(idx);
    // 현재 선택의 '시작' 칸 → 앞에서 축소(시작 +10). 단, 강제규칙이 지배하면 불가
    if (idx === selStart && selEnd > selStart) {
      const ns = selStart + 1;
      if (forcedStartFor(ns) !== ns) { setNotice(`이 시간대는 ${minToTime(selStart)} 시작만 가능해 앞부분을 줄일 수 없어요.`); return; }
      setSelStart(ns); return;
    }
    // 현재 선택의 '마지막' 칸 → 뒤에서 축소(끝 −10)
    if (idx === selEnd && selEnd > selStart) { setSelEnd(selEnd - 1); return; }
    // 그 외 가능 칸 → 새 선택
    return selectNew(idx);
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}><Text style={styles.back}>‹ 선생님 목록</Text></TouchableOpacity>
      <View style={styles.head}>
        <Text style={ui.h}>상담 신청</Text>
        <Text style={ui.sub}>{teacher.name} · {ctype}{selectedTime ? ` · ${selectedTime}` : ''}</Text>
      </View>

      {/* 선생님 액션: 찜·차단·신고 */}
      <View style={styles.actRow}>
        <TouchableOpacity style={styles.actBtn} onPress={() => void toggleFav()}>
          <Text style={[styles.actT, faved && { color: '#CF9A3A' }]}>{faved ? '★ 찜됨' : '☆ 찜'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actBtn} onPress={async () => { try { await api.post('/teacher-blocks', { teacherId: teacher.id }); Alert.alert('차단', '차단했어요.'); } catch (e) { Alert.alert('실패', e instanceof ApiError ? e.message : '오류'); } }}>
          <Text style={styles.actT}>🚫 차단</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actBtn} onPress={() => { const reason = typeof prompt !== 'undefined' ? prompt('신고 사유') : '부적절'; if (reason) api.post('/reports', { targetType: 'teacher', targetId: teacher.id, reason }).then(() => Alert.alert('신고', '접수되었습니다.')).catch((e) => Alert.alert('실패', e instanceof ApiError ? e.message : '오류')); }}>
          <Text style={styles.actT}>🚩 신고</Text>
        </TouchableOpacity>
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
      <TouchableOpacity style={styles.attachBtn} onPress={pickFiles} disabled={uploading} activeOpacity={0.7}>
        {uploading ? <ActivityIndicator color={C.teal} /> : <Text style={styles.attachIcon}>📎</Text>}
        <Text style={styles.attachT}>{uploading ? '업로드 중…' : '파일 첨부 (사진 · PDF · 동영상)'}</Text>
      </TouchableOpacity>
      {attachments.map((a) => (
        <View key={a.id} style={styles.attRow}>
          <Text style={styles.attName} numberOfLines={1}>📄 {a.name}</Text>
          <TouchableOpacity onPress={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.attDel}>삭제</Text>
          </TouchableOpacity>
        </View>
      ))}
      {attachments.length > 0 && <Text style={styles.attHint}>첨부한 문제는 담당 선생님이 상담 화면에서 열어볼 수 있어요.</Text>}

      {/* 진행 방식 (이 선생님이 제공하는 방식만) */}
      <Text style={styles.sec}>진행 방식</Text>
      <View style={styles.modeGrid}>
        {modeList.map((m) => {
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
      {mode === 'offline' && <Text style={styles.modeNote}>🏫 오프라인은 가능한 선생님·센터·시간이 제한돼요. 센터 상담실 점유료가 가산됩니다.</Text>}
      {mode === 'zoom' && <Text style={styles.modeNoteZoom}>🎥 줌은 센터 상담실 동시 이용 한도가 있어, 예약 시점에 자리가 없으면 다른 방식을 선택해야 할 수 있어요.</Text>}
      <Text style={styles.modeNoteBoard}>📋 게시판(문항·일반) 질문은 Q&A 탭에서 건당 신청해요.</Text>

      {/* 날짜 선택 */}
      <Text style={styles.sec}>날짜</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        {dateOptions.map((d) => {
          const on = d.iso === date;
          const we = d.dow === 0 || d.dow === 6;
          return (
            <TouchableOpacity key={d.iso} style={[styles.dateChip, on && styles.dateChipOn]} onPress={() => setDate(d.iso)}>
              <Text style={[styles.dateWd, on && styles.dateOnT, we && !on && { color: d.dow === 0 ? '#D06B52' : '#2F6FB3' }]}>{d.wd}</Text>
              <Text style={[styles.dateMd, on && styles.dateOnT]}>{d.md}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* 시간 — 시간대별 컴팩트 표(선생님 근무·체류 반영) */}
      <Text style={styles.sec}>시간 (가능 시간만 · {ctype} 기본 {defaultSlots * 10}분)</Text>
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
                    const inRange = selStart !== null && selEnd !== null && s.index >= selStart && s.index <= selEnd;
                    const isStart = s.index === selStart;
                    const isEnd = s.index === selEnd;
                    const edge = inRange && selLen > 1 && (isStart || isEnd);
                    const u = SLOT_UI[s.status];
                    const clickable = s.status === 'avail';
                    return (
                      <TouchableOpacity
                        key={s.index}
                        activeOpacity={clickable ? 0.6 : 1}
                        disabled={!clickable}
                        onPress={() => onTapCell(s.index)}
                        style={[
                          styles.cell,
                          { backgroundColor: u.bg, borderColor: u.bd },
                          inRange && styles.cellSel,
                          edge && styles.cellEdge,
                        ]}
                      >
                        <Text style={[styles.cellT, { color: inRange ? '#fff' : u.fg }]}>{s.time}</Text>
                        {edge && <Text style={styles.edgeMark}>{isStart ? '↤' : '↦'}</Text>}
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

          {notice ? (
            <View style={styles.notice}><Text style={styles.noticeT}>ⓘ {notice}</Text></View>
          ) : null}

          {/* 선택 요약(시간·크레딧 함께) + 시간 ± 조정 + 초기화 */}
          {selStart !== null && selEnd !== null ? (
            <View style={styles.selBar}>
              <View style={styles.selTop}>
                <Text style={styles.selTime}>{minToTime(selStart)} ~ {minToTime(selEnd + 1)} · {selLen * 10}분</Text>
                <Text style={styles.selCredit}>{quote ? `${quote.credits.toLocaleString()} 크레딧` : '계산 중…'}</Text>
              </View>
              <View style={styles.selBottom}>
                <View style={styles.stepRow}>
                  <TouchableOpacity style={[styles.stepBtn, selLen <= MIN_LEN && styles.stepOff]} disabled={selLen <= MIN_LEN} onPress={() => selEnd !== null && setSelEnd(selEnd - 1)}>
                    <Text style={styles.stepT}>−10분</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.stepBtn, !availSet.has(selEnd + 1) && styles.stepOff]} disabled={!availSet.has(selEnd + 1)} onPress={() => selEnd !== null && setSelEnd(selEnd + 1)}>
                    <Text style={styles.stepT}>＋10분</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={resetSel} style={styles.resetBtn}><Text style={styles.resetT}>초기화</Text></TouchableOpacity>
              </View>
              <Text style={styles.selHint}>시간을 늘리거나 줄이면 크레딧도 함께 바뀝니다(끝 칸 탭으로도 조정).</Text>
            </View>
          ) : (
            <Text style={[ui.sub, { marginTop: 8 }]}>가능(초록) 시간을 누르면 {ctype} 기본 {defaultSlots * 10}분이 선택돼요.</Text>
          )}
          {avail.length === 0 && <Text style={[ui.sub, { marginTop: 6 }]}>이 날은 신청 가능한 빈 시간이 없어요.</Text>}
        </>
      )}

      {error ? <Text style={ui.error}>{error}</Text> : null}

      {/* 요금 / 예약 */}
      {quote && (
        <>
          {!quote.valid && (
            <View style={[styles.warn, { backgroundColor: '#fff9ed', borderColor: '#eddcb8' }]}>
              <Text style={{ color: '#A97D24', fontWeight: '700', fontSize: 13 }}>⚠ {quote.message || '이 시간대는 이용할 수 없어요.'}</Text>
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

const makeStyles = (C: Palette) => StyleSheet.create({
  back: { color: C.teal, marginBottom: SP.sm, fontWeight: '700', fontSize: 15 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: SP.sm },
  actRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actBtn: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  actT: { fontSize: 12, color: C.muted, fontWeight: '700' },
  sec: { fontSize: 13, fontWeight: '800', color: C.ink, marginTop: SP.lg, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: { flex: 1, minWidth: 64, alignItems: 'center', backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingVertical: 11 },
  pillOn: { backgroundColor: C.teal, borderColor: C.teal },
  pillT: { color: C.muted, fontWeight: '700', fontSize: 14 },
  pillTOn: { color: '#fff' },
  attachBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.white, borderWidth: 1, borderStyle: 'dashed', borderColor: C.inputBorder, borderRadius: R.md, paddingVertical: 14 },
  attachIcon: { fontSize: 18 },
  attachT: { fontSize: 14, color: C.muted, fontWeight: '700' },
  attRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.teal50, borderRadius: R.md, paddingVertical: 10, paddingHorizontal: 12, marginTop: 8 },
  attName: { flex: 1, color: C.ink, fontSize: 13, fontWeight: '600', marginRight: 10 },
  attDel: { color: C.danger, fontSize: 13, fontWeight: '700' },
  attHint: { color: C.muted, fontSize: 11, marginTop: 6 },
  modeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modeCard: { width: '48%', backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 14 },
  modeOn: { borderColor: C.teal, borderWidth: 2, backgroundColor: C.teal50 },
  modeLabel: { fontSize: 14, fontWeight: '800', color: C.ink },
  modeSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  modePrice: { fontSize: 12, fontWeight: '700', color: C.muted, marginTop: 8 },
  modeNote: { fontSize: 12, color: C.muted, backgroundColor: C.lineSoft, borderRadius: 8, padding: 9, marginTop: 8, lineHeight: 17 },
  modeNoteZoom: { fontSize: 12, color: C.confirmed, backgroundColor: C.confirmedBg, borderRadius: 8, padding: 9, marginTop: 8, lineHeight: 17 },
  modeNoteBoard: { fontSize: 12, color: C.teal, backgroundColor: C.teal50, borderRadius: 8, padding: 9, marginTop: 8, lineHeight: 17 },
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
  cellEdge: { borderColor: '#fff', borderWidth: 2 },
  cellT: { fontSize: 11, fontWeight: '700' },
  edgeMark: { color: '#fff', fontSize: 9, marginTop: -1, fontWeight: '800' },
  notice: { marginTop: 8, backgroundColor: '#FAF1E2', borderColor: '#EDDCB8', borderWidth: 1, borderRadius: 9, padding: 9 },
  noticeT: { color: '#A97D24', fontSize: 12, fontWeight: '600', lineHeight: 17 },
  selBar: { marginTop: 10, backgroundColor: C.teal50, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  selTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  selTime: { color: C.ink, fontWeight: '800', fontSize: 14 },
  selCredit: { color: C.teal, fontWeight: '800', fontSize: 15 },
  selBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  stepRow: { flexDirection: 'row', gap: 8 },
  stepBtn: { borderWidth: 1, borderColor: C.teal, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: C.white },
  stepOff: { borderColor: C.line, opacity: 0.45 },
  stepT: { color: C.teal, fontWeight: '800', fontSize: 13 },
  selHint: { color: C.muted, fontSize: 11, marginTop: 8 },
  resetBtn: { borderWidth: 1, borderColor: C.teal, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  resetT: { color: C.teal, fontWeight: '700', fontSize: 12 },
  legend: { flexDirection: 'row', gap: 14, marginTop: 10, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 12, height: 12, borderRadius: 3, borderWidth: 1 },
  legendT: { fontSize: 11, color: C.muted },
  warn: { borderWidth: 1, borderRadius: 10, padding: 12, marginTop: SP.lg },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 14, marginTop: SP.lg, marginBottom: SP.md },
});
