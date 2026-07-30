import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { showAlert } from '../lib/alertHost';
import { R, SP, useTheme, useUI, type Palette } from '../theme';

/**
 * 근무·슬롯(선생님) — 모바일.
 *
 * **왜 P0 였나**: 학생의 모든 예약은 여기서 연 슬롯을 소비한다. 웹에만 있어서 모바일만 쓰는
 * 선생님은 공급을 만들 수 없었다 — 상담 목록·인박스가 아무리 잘 돌아도 그 앞이 비어 있었다.
 *
 * 웹(`SchedulePage`)과 같은 계약을 쓰되 입력 방식만 폰에 맞춘다:
 *   · 웹은 30분 셀 **드래그 그리드**가 주력이다. 폰에서는 셀이 손끝보다 작고 드래그가
 *     스크롤과 싸워서, 여기서는 **요일별 구간 편집(30분 스텝)** 하나로 간다.
 *   · **엑셀 일괄 업로드는 넣지 않았다** — 파일 선택·CSV 파싱은 폰에서 얻는 것보다 잃는 게 크다.
 *     하단에 웹에서 하라고 안내한다(없는 기능을 있는 척하지 않는다).
 *
 * ⚠ 저장 경로는 웹과 **반드시 같아야 한다**. 주계획 저장은 `PUT week-plans` 하나로 끝나지만
 * 그 앞에 `POST week-plans/conflicts` 를 반드시 태운다 — 건너뛰면 이미 잡힌 학생 상담 위로
 * 근무를 지워도 **아무에게도 알리지 않고** 저장된다. 그건 조용한 파손이다.
 */

type Win = { start: string; end: string };
type Tpl = Record<string, Win[]>;
type WeekPlan = { weekStart: string; template: Tpl };
type Leave = { date: string; type: string };
type OfflineWin = { weekday: string; start: string; end: string };
type Conflict = { bookingId: string; date: string; startMin: number; endMin: number; studentName: string; consultType: string | null; mode: string };
type Booking = { start: string | null; end: string | null; status: string };

const WD_LABEL = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 월~일
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

const STEP = 30, MIN_T = 6 * 60, MAX_T = 23 * 60;
const clampT = (m: number) => Math.max(MIN_T, Math.min(MAX_T, m));

/** 자주 쓰는 근무 형태 — 빈 요일에서 구간을 처음 만들 때의 출발점. */
const PRESETS: { label: string; wins: Win[] }[] = [
  { label: '오전 09~12', wins: [{ start: '09:00', end: '12:00' }] },
  { label: '오후 13~18', wins: [{ start: '13:00', end: '18:00' }] },
  { label: '저녁 18~22', wins: [{ start: '18:00', end: '22:00' }] },
  { label: '종일 09~18', wins: [{ start: '09:00', end: '18:00' }] },
  { label: '분할 09~12·17~21', wins: [{ start: '09:00', end: '12:00' }, { start: '17:00', end: '21:00' }] },
];

function mondayOf(d: Date) { const x = new Date(d); x.setDate(d.getDate() - ((d.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0); return x; }
/** 다음 주부터 8주 — 서버가 '다음 주 이후'만 받는다(이번 주는 이미 예약이 도는 중). */
function upcomingWeeks() {
  const nextMon = mondayOf(new Date()); nextMon.setDate(nextMon.getDate() + 7);
  return Array.from({ length: 8 }, (_, i) => {
    const m = new Date(nextMon); m.setDate(nextMon.getDate() + i * 7);
    const end = new Date(m); end.setDate(m.getDate() + 6);
    return { key: iso(m), label: `${m.getMonth() + 1}/${m.getDate()}~${end.getMonth() + 1}/${end.getDate()}` };
  });
}

/** KST 기준 날짜 — 예약 겹침 표시는 학생이 보는 시간대로 계산해야 한다(UTC 로 세면 하루가 밀린다). */
const KSTf = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
const kstDate = (s: string) => KSTf.format(new Date(s));

/** 구간 정규화 — 시작<종료 보장 + 시작 순 정렬. 저장 직전에만 쓴다(편집 중 커서가 튀지 않게). */
function normalize(wins: Win[]): Win[] {
  return wins
    .map((w) => (toMin(w.start) < toMin(w.end) ? w : { start: w.start, end: hhmm(clampT(toMin(w.start) + STEP)) }))
    .sort((a, b) => toMin(a.start) - toMin(b.start));
}

export function TeacherScheduleScreen({ myId, onBack }: { myId: string; onBack: () => void }) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => mk(C), [C]);

  const weeks = useMemo(() => [{ key: 'default', label: '기본 근무시간' }, ...upcomingWeeks()], []);
  const [week, setWeek] = useState('default');
  const [recurring, setRecurring] = useState<Tpl>({});
  const [plans, setPlans] = useState<WeekPlan[]>([]);
  const [tpl, setTpl] = useState<Tpl>({});
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [leaveType, setLeaveType] = useState('연차');
  const [leaveDate, setLeaveDate] = useState(iso(new Date()));
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [offlineOn, setOfflineOn] = useState(false);
  const [offlineWins, setOfflineWins] = useState<OfflineWin[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [pending, setPending] = useState<Tpl | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const isDefault = week === 'default';
  const planForWeek = plans.find((p) => p.weekStart === week);
  const usingDefault = !isDefault && !planForWeek;

  const load = useCallback(async () => {
    setError('');
    try {
      const [wp, lv, off] = await Promise.all([
        api.get<{ recurringTemplate: Tpl; weekPlans: WeekPlan[] }>(`/teachers/${myId}/week-plans`),
        api.get<Leave[]>(`/teachers/${myId}/leave`).catch(() => [] as Leave[]),
        api.get<{ enabled: boolean; timeWindows: OfflineWin[] }>(`/teachers/${myId}/offline-availability`).catch(() => ({ enabled: false, timeWindows: [] })),
      ]);
      setRecurring(wp.recurringTemplate ?? {});
      setPlans(wp.weekPlans ?? []);
      setLeaves(Array.isArray(lv) ? lv : []);
      setOfflineOn(off.enabled);
      setOfflineWins(Array.isArray(off.timeWindows) ? off.timeWindows : []);
    } catch (e) { setError(e instanceof ApiError ? e.message : '근무표 조회 실패'); }
    finally { setLoading(false); }
  }, [myId]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    api.get<{ data?: Booking[] } | Booking[]>('/bookings?role=teacher')
      .then((r) => setBookings(Array.isArray(r) ? r : (r.data ?? []))).catch(() => {});
  }, [myId]);

  // 선택한 주의 편집 대상 — 주계획이 있으면 그것, 없으면 기본을 복사해 시작한다(웹과 동일).
  useEffect(() => {
    const base = isDefault ? recurring : (planForWeek?.template ?? recurring);
    const next: Tpl = {};
    for (const wd of DAY_ORDER) next[String(wd)] = (base[String(wd)] ?? []).map((w) => ({ ...w }));
    setTpl(next);
  }, [week, recurring, plans]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 이 주에 이미 잡힌 상담 — 요일별 건수. 지우기 전에 보이는 편이 저장 후 충돌창보다 낫다. */
  const bookedByDay = useMemo(() => {
    const out: Record<number, number> = {};
    if (isDefault) return out;
    const dateToWd: Record<string, number> = {};
    DAY_ORDER.forEach((wd, i) => { const d = new Date(week + 'T00:00:00'); d.setDate(d.getDate() + i); dateToWd[iso(d)] = wd; });
    for (const b of bookings) {
      if (!b.start || !['new', 'confirmed', 'done'].includes(b.status)) continue;
      const wd = dateToWd[kstDate(b.start)];
      if (wd !== undefined) out[wd] = (out[wd] ?? 0) + 1;
    }
    return out;
  }, [bookings, week, isDefault]);

  const leaveDates = useMemo(() => new Set(leaves.map((l) => l.date)), [leaves]);
  const dayDate = (wd: number) => {
    if (isDefault) return null;
    const i = DAY_ORDER.indexOf(wd);
    const d = new Date(week + 'T00:00:00'); d.setDate(d.getDate() + i);
    return iso(d);
  };

  const winsOf = (wd: number) => tpl[String(wd)] ?? [];
  const setWins = (wd: number, wins: Win[]) => setTpl((p) => ({ ...p, [String(wd)]: wins }));
  const shift = (wd: number, i: number, key: 'start' | 'end', delta: number) =>
    setWins(wd, winsOf(wd).map((w, j) => (j === i ? { ...w, [key]: hhmm(clampT(toMin(w[key]) + delta)) } : w)));

  // ── 저장 ──────────────────────────────────────────────
  async function save() {
    setMsg(''); setError(''); setBusy(true);
    const clean: Tpl = {};
    for (const wd of DAY_ORDER) clean[String(wd)] = normalize(winsOf(wd));
    try {
      if (isDefault) {
        await api.put(`/teachers/${myId}/work-schedule`, { recurringTemplate: clean });
        setMsg('기본 근무시간이 저장되었습니다.');
        await load();
      } else {
        const r = await api.post<{ conflicts: Conflict[] }>(`/teachers/${myId}/week-plans/conflicts`, { weekPlans: [{ weekStart: week, template: clean }] });
        if (r.conflicts?.length) { setConflicts(r.conflicts); setPending(clean); }
        else await commit(clean);
      }
    } catch (e) { setError(e instanceof ApiError ? e.message : '저장 실패'); }
    finally { setBusy(false); }
  }

  async function commit(t: Tpl) {
    const next = [...plans.filter((p) => p.weekStart !== week), { weekStart: week, template: t }];
    await api.put(`/teachers/${myId}/week-plans`, { weekPlans: next });
    setConflicts(null); setPending(null);
    setMsg('해당 주 근무계획이 저장되었습니다.');
    await load();
  }

  async function deletePlan() {
    setBusy(true); setError(''); setMsg('');
    try {
      await api.put(`/teachers/${myId}/week-plans`, { weekPlans: plans.filter((p) => p.weekStart !== week) });
      setMsg('이 주 계획을 삭제했어요. 기본 근무시간이 적용됩니다.');
      await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '삭제 실패'); }
    finally { setBusy(false); }
  }

  /** 충돌 4경로 — 웹 §5-6 과 같은 값을 그대로 보낸다(경로 이름이 갈리면 통계·알림이 갈린다). */
  async function respond(route: 'rebook_notice' | 'substitute' | 'priority' | 'admin_manual') {
    setBusy(true); setError('');
    try {
      for (const c of conflicts ?? []) {
        await api.patch(`/bookings/${c.bookingId}/cancel`, { reason: '근무시간 변경', route }).catch(() => {});
      }
      if (pending) await commit(pending);
      const label: Record<typeof route, string> = {
        rebook_notice: '학생에게 타 시간 변경 안내를 발송하고 저장했습니다.',
        substitute: '대체 선생님 후보를 제안하고 저장했습니다.',
        priority: '학생 일정 우선권을 부여하고 저장했습니다.',
        admin_manual: '센터 관리자 수동 배정을 요청하고 저장했습니다.',
      };
      setMsg(`${label[route]} 학생·보호자·관리자에게 알림이 가고 예정 크레딧은 환원됩니다.`);
    } catch (e) { setError(e instanceof ApiError ? e.message : '처리 실패'); }
    finally { setBusy(false); }
  }

  async function addLeave() {
    setMsg(''); setError('');
    try { await api.post(`/teachers/${myId}/leave`, { date: leaveDate, type: leaveType }); setMsg(`${leaveDate} ${leaveType} 등록됨`); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '사유 등록 실패'); }
  }
  async function removeLeave(date: string) {
    try { await api.del(`/teachers/${myId}/leave/${date}`); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '해제 실패'); }
  }
  async function saveOffline() {
    setBusy(true); setMsg(''); setError('');
    try { await api.put(`/teachers/${myId}/offline-availability`, { enabled: offlineOn, timeWindows: offlineWins }); setMsg('오프라인 가능 설정이 저장되었습니다.'); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '오프라인 설정 저장 실패'); }
    finally { setBusy(false); }
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={C.teal} /></View>;

  // 충돌 시트 — 고르기 전에는 저장되지 않는다(닫으면 저장 취소).
  if (conflicts) {
    return (
      <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={ui.h}>근무 변경 · 예약 충돌</Text>
        <Text style={ui.sub}>바꾼 근무시간과 겹쳐 진행이 어려운 학생 상담이 <Text style={s.b}>{conflicts.length}건</Text> 있어요. 어떻게 할지 고르면 그때 저장됩니다.</Text>
        <View style={{ gap: 6, marginTop: SP.md }}>
          {conflicts.map((c) => (
            <View key={c.bookingId} style={s.conflictRow}>
              <Text style={s.conflictT}>{c.date} {hhmm(c.startMin)}~{hhmm(c.endMin)}</Text>
              <Text style={ui.sub}>{c.studentName} · {c.consultType ?? '상담'}</Text>
            </View>
          ))}
        </View>
        <View style={{ gap: 8, marginTop: SP.lg }}>
          {([
            ['rebook_notice', '① 학생에게 타 시간 변경 안내'],
            ['substitute', '② 대체 선생님 후보 제안'],
            ['priority', '③ 학생 일정 우선권 부여'],
            ['admin_manual', '④ 센터 관리자 수동 배정 요청'],
          ] as const).map(([k, label], i) => (
            <TouchableOpacity key={k} style={i === 0 ? ui.btn : ui.btnGhost} disabled={busy} onPress={() => respond(k)}>
              <Text style={i === 0 ? ui.btnText : ui.btnGhostText}>{label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={{ paddingVertical: 12, alignItems: 'center' }} onPress={() => { setConflicts(null); setPending(null); }}>
            <Text style={{ color: C.muted, fontWeight: '700' }}>취소(저장하지 않음)</Text>
          </TouchableOpacity>
          <Text style={s.warn}>선생님 사유 취소는 패널티(당일취소·랭킹 가중치)가 적용될 수 있습니다.</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 48 }}>
      <TouchableOpacity onPress={onBack}><Text style={s.back}>‹ 오늘</Text></TouchableOpacity>
      <Text style={ui.h}>근무·슬롯</Text>
      <Text style={[ui.sub, { marginBottom: SP.md }]}>여기서 연 시간이 학생에게 보이는 예약 슬롯이 됩니다. 설정하지 않은 주는 기본 근무시간이 적용돼요.</Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {msg ? <Text style={s.ok}>{msg}</Text> : null}

      {/* 주 선택 */}
      <Text style={s.secTitle}>설정할 주</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
        {weeks.map((w) => {
          const on = w.key === week;
          const planned = w.key !== 'default' && plans.some((p) => p.weekStart === w.key);
          return (
            <TouchableOpacity key={w.key} style={[s.chip, on && s.chipOn]} onPress={() => setWeek(w.key)}>
              <Text style={[s.chipT, on && s.chipTOn]}>{w.label}{planned ? ' •' : ''}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {usingDefault && <Text style={s.notice}>ⓘ 이 주는 아직 설정되지 않아 기본 근무시간이 적용됩니다. 아래에서 바꾼 뒤 저장하면 이 주에만 적용돼요.</Text>}

      {/* 요일별 구간 */}
      <Text style={s.secTitle}>근무시간 (30분 단위)</Text>
      {DAY_ORDER.map((wd) => {
        const wins = winsOf(wd);
        const d = dayDate(wd);
        const n = bookedByDay[wd] ?? 0;
        return (
          <View key={wd} style={[ui.card, s.dayCard]}>
            <View style={s.dayHead}>
              <Text style={s.dayName}>{WD_LABEL[wd]}{d ? <Text style={s.dayDate}>  {d.slice(5)}</Text> : null}</Text>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                {n > 0 && <Text style={s.badgeBooked}>예약 {n}</Text>}
                {d && leaveDates.has(d) && <Text style={s.badgeLeave}>휴무</Text>}
              </View>
            </View>

            {wins.length === 0 ? (
              <>
                <Text style={ui.sub}>근무 없음</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 8 }}>
                  {PRESETS.map((p) => (
                    <TouchableOpacity key={p.label} style={s.chipSm} onPress={() => setWins(wd, p.wins.map((w) => ({ ...w })))}>
                      <Text style={s.chipSmT}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            ) : (
              wins.map((w, i) => (
                <View key={i} style={s.winRow}>
                  <Stepper C={C} value={w.start} onMinus={() => shift(wd, i, 'start', -STEP)} onPlus={() => shift(wd, i, 'start', STEP)} />
                  <Text style={s.tilde}>~</Text>
                  <Stepper C={C} value={w.end} onMinus={() => shift(wd, i, 'end', -STEP)} onPlus={() => shift(wd, i, 'end', STEP)} />
                  <TouchableOpacity onPress={() => setWins(wd, wins.filter((_, j) => j !== i))} style={s.del}>
                    <Text style={s.delT}>삭제</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}

            {wins.length > 0 && (
              <TouchableOpacity onPress={() => setWins(wd, [...wins, { start: '18:00', end: '21:00' }])}>
                <Text style={s.addT}>＋ 구간 추가(분할근무)</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      <TouchableOpacity style={[ui.btn, busy && ui.btnDisabled, { marginTop: SP.md }]} disabled={busy} onPress={save}>
        <Text style={ui.btnText}>{busy ? '저장 중…' : isDefault ? '기본 근무 저장' : '이 주 저장'}</Text>
      </TouchableOpacity>
      {!isDefault && planForWeek && (
        <TouchableOpacity style={[ui.btnGhost, { marginTop: 8 }]} disabled={busy} onPress={deletePlan}>
          <Text style={ui.btnGhostText}>이 주 계획 삭제(기본으로 되돌리기)</Text>
        </TouchableOpacity>
      )}

      {/* 사유로 제외 */}
      <Text style={s.secTitle}>사유로 제외 (연차·반차·병가)</Text>
      <View style={ui.card}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {['연차', '반차', '병가'].map((t) => (
            <TouchableOpacity key={t} style={[s.chip, { flex: 1, alignItems: 'center' }, leaveType === t && s.chipOn]} onPress={() => setLeaveType(t)}>
              <Text style={[s.chipT, leaveType === t && s.chipTOn]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[ui.sub, { marginTop: SP.md }]}>날짜</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 6 }}>
          {Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; }).map((d) => {
            const v = iso(d); const on = v === leaveDate;
            return (
              <TouchableOpacity key={v} style={[s.chipSm, on && s.chipOn]} onPress={() => setLeaveDate(v)}>
                <Text style={[s.chipSmT, on && s.chipTOn]}>{v.slice(5)}({WD_LABEL[d.getDay()]})</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <TouchableOpacity style={[ui.btn, { marginTop: SP.md }]} onPress={addLeave}><Text style={ui.btnText}>제외 등록</Text></TouchableOpacity>
        {leaves.length > 0 && (
          <View style={{ marginTop: SP.md, gap: 6 }}>
            {leaves.map((l) => (
              <View key={l.date} style={s.leaveRow}>
                <Text style={s.badgeLeave}>{l.type}</Text>
                <Text style={[ui.sub, { flex: 1 }]}>{l.date}</Text>
                <TouchableOpacity onPress={() => removeLeave(l.date)}><Text style={s.delT}>해제</Text></TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 오프라인 가능 */}
      <Text style={s.secTitle}>오프라인 상담 가능</Text>
      <View style={ui.card}>
        <View style={s.leaveRow}>
          <Text style={[ui.sub, { flex: 1 }]}>켜면 학생 오프라인 매칭 대상이 됩니다.</Text>
          <Switch value={offlineOn} onValueChange={setOfflineOn} trackColor={{ false: C.line, true: C.teal100 }} thumbColor={offlineOn ? C.teal : '#f4f3f4'} />
        </View>
        {offlineOn && (
          <View style={{ gap: 8, marginTop: SP.md }}>
            {offlineWins.map((w, i) => (
              <View key={i} style={s.winRow}>
                <TouchableOpacity
                  style={s.wdBtn}
                  onPress={() => setOfflineWins((p) => p.map((x, j) => (j === i ? { ...x, weekday: String((Number(x.weekday) + 1) % 7) } : x)))}
                >
                  <Text style={s.wdBtnT}>{WD_LABEL[Number(w.weekday) % 7]}</Text>
                </TouchableOpacity>
                <Stepper C={C} value={w.start} onMinus={() => setOfflineWins((p) => p.map((x, j) => (j === i ? { ...x, start: hhmm(clampT(toMin(x.start) - STEP)) } : x)))} onPlus={() => setOfflineWins((p) => p.map((x, j) => (j === i ? { ...x, start: hhmm(clampT(toMin(x.start) + STEP)) } : x)))} />
                <Text style={s.tilde}>~</Text>
                <Stepper C={C} value={w.end} onMinus={() => setOfflineWins((p) => p.map((x, j) => (j === i ? { ...x, end: hhmm(clampT(toMin(x.end) - STEP)) } : x)))} onPlus={() => setOfflineWins((p) => p.map((x, j) => (j === i ? { ...x, end: hhmm(clampT(toMin(x.end) + STEP)) } : x)))} />
                <TouchableOpacity onPress={() => setOfflineWins((p) => p.filter((_, j) => j !== i))} style={s.del}><Text style={s.delT}>삭제</Text></TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity onPress={() => setOfflineWins((p) => [...p, { weekday: '2', start: '16:00', end: '20:00' }])}>
              <Text style={s.addT}>＋ 시간대 추가</Text>
            </TouchableOpacity>
          </View>
        )}
        <TouchableOpacity style={[ui.btnGhost, { marginTop: SP.md }]} disabled={busy} onPress={saveOffline}>
          <Text style={ui.btnGhostText}>오프라인 설정 저장</Text>
        </TouchableOpacity>
      </View>

      {/* 웹에만 있는 것 — 있는 척하지 않고 어디서 되는지 알려준다. */}
      <TouchableOpacity
        style={{ marginTop: SP.lg }}
        onPress={() => showAlert('엑셀 일괄 등록', '기본 근무 + 주별 근무를 CSV 한 파일로 올리는 기능은 웹에서만 지원돼요. 웹 [근무·슬롯] 화면의 [엑셀] 탭에서 양식을 내려받아 쓰세요.')}
      >
        <Text style={s.webNote}>엑셀로 여러 주를 한 번에 넣고 싶다면 ›</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

/** 30분 스텝 시간 조절 — 폰에서 드래그 그리드 대신 쓰는 입력기. */
function Stepper({ C, value, onMinus, onPlus }: { C: Palette; value: string; onMinus: () => void; onPlus: () => void }) {
  const s = useMemo(() => mk(C), [C]);
  return (
    <View style={s.stepper}>
      <TouchableOpacity onPress={onMinus} style={s.stepBtn} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}><Text style={s.stepT}>−</Text></TouchableOpacity>
      <Text style={s.stepV}>{value}</Text>
      <TouchableOpacity onPress={onPlus} style={s.stepBtn} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}><Text style={s.stepT}>＋</Text></TouchableOpacity>
    </View>
  );
}

const mk = (C: Palette) => StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  back: { color: C.teal, fontWeight: '700', marginBottom: 8 },
  b: { fontWeight: '800', color: C.ink },
  ok: { color: C.teal, fontSize: 13, marginTop: SP.sm, fontWeight: '600' },
  secTitle: { fontSize: 13, fontWeight: '800', color: C.muted, marginTop: SP.lg, marginBottom: SP.sm, letterSpacing: 0.3 },
  notice: { marginTop: 8, fontSize: 12.5, color: '#8A5A00', backgroundColor: 'rgba(207,154,58,.14)', borderRadius: R.md, padding: 10, overflow: 'hidden' },
  chip: { borderWidth: 1, borderColor: C.line, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.white },
  chipOn: { backgroundColor: C.teal, borderColor: C.teal },
  chipT: { fontSize: 12.5, fontWeight: '700', color: C.body },
  chipTOn: { color: '#fff' },
  chipSm: { borderWidth: 1, borderColor: C.line, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: C.white },
  chipSmT: { fontSize: 11.5, fontWeight: '700', color: C.body },
  dayCard: { padding: 14, marginBottom: 8 },
  dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  dayName: { fontSize: 15, fontWeight: '800', color: C.ink },
  dayDate: { fontSize: 12, fontWeight: '600', color: C.muted },
  badgeBooked: { fontSize: 11, fontWeight: '800', color: '#2F6FB3', backgroundColor: 'rgba(47,111,179,.13)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  badgeLeave: { fontSize: 11, fontWeight: '800', color: '#8A5A00', backgroundColor: 'rgba(207,154,58,.16)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  winRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' },
  tilde: { color: C.muted, fontWeight: '700' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.inputBorder, borderRadius: R.md, backgroundColor: C.white },
  stepBtn: { paddingHorizontal: 10, paddingVertical: 7 },
  stepT: { fontSize: 15, fontWeight: '800', color: C.teal },
  stepV: { fontSize: 14, fontWeight: '700', color: C.ink, minWidth: 46, textAlign: 'center', fontVariant: ['tabular-nums'] },
  del: { paddingHorizontal: 6, paddingVertical: 6 },
  delT: { color: C.danger, fontSize: 12.5, fontWeight: '700' },
  addT: { color: C.teal, fontSize: 12.5, fontWeight: '700', marginTop: 4 },
  leaveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  conflictRow: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: 10 },
  conflictT: { fontSize: 13.5, fontWeight: '700', color: C.ink },
  warn: { color: C.danger, fontSize: 12, marginTop: 4 },
  wdBtn: { borderWidth: 1, borderColor: C.inputBorder, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.white },
  wdBtnT: { fontSize: 14, fontWeight: '800', color: C.ink },
  webNote: { color: C.muted, fontSize: 12.5, fontWeight: '600', textAlign: 'center' },
});
