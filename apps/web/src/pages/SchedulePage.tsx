import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PageHeader, Card, Button, ErrorText, Badge, Modal } from '../components/ui';

type Win = { start: string; end: string };
type Tpl = Record<string, Win[]>; // weekday '0'..'6' → windows
type Leave = { date: string; type: string };
type WeekPlan = { weekStart: string; template: Tpl };
type Conflict = { bookingId: string; date: string; startMin: number; endMin: number; studentId: string; studentName: string; consultType: string | null; mode: string };

const WD_LABEL = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 월~일
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

// 드래그 그리드: 08:00~22:00 30분 = 28행
const ROW0 = 8 * 60, ROWS = 28, STEP = 30;
const rowMin = (i: number) => ROW0 + i * STEP;

// 다음 주 월요일들(최대 8주) + 기본
function mondayOf(d: Date) { const x = new Date(d); x.setDate(d.getDate() - ((d.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0); return x; }
function upcomingWeeks(): { key: string; label: string }[] {
  const nextMon = mondayOf(new Date()); nextMon.setDate(nextMon.getDate() + 7);
  return Array.from({ length: 8 }, (_, i) => {
    const m = new Date(nextMon); m.setDate(nextMon.getDate() + i * 7);
    const end = new Date(m); end.setDate(m.getDate() + 6);
    return { key: iso(m), label: `${m.getMonth() + 1}/${m.getDate()}~${end.getMonth() + 1}/${end.getDate()}` };
  });
}

// 템플릿 ↔ 30분 셀 집합
function tplToCells(tpl: Tpl): Record<number, Set<number>> {
  const out: Record<number, Set<number>> = {};
  for (const wd of DAY_ORDER) {
    out[wd] = new Set();
    for (const w of tpl[wd] ?? []) {
      const s = toMin(w.start), e = toMin(w.end);
      for (let i = 0; i < ROWS; i++) { const m = rowMin(i); if (m >= s && m < e) out[wd].add(i); }
    }
  }
  return out;
}
function cellsToTpl(cells: Record<number, Set<number>>): Tpl {
  const tpl: Tpl = {};
  for (const wd of DAY_ORDER) {
    const idx = [...(cells[wd] ?? [])].sort((a, b) => a - b);
    const wins: Win[] = [];
    let start: number | null = null, prev: number | null = null;
    for (const i of idx) {
      if (start === null) { start = i; prev = i; }
      else if (i === (prev as number) + 1) prev = i;
      else { wins.push({ start: hhmm(rowMin(start)), end: hhmm(rowMin(prev as number) + STEP) }); start = i; prev = i; }
    }
    if (start !== null) wins.push({ start: hhmm(rowMin(start)), end: hhmm(rowMin(prev as number) + STEP) });
    // 시각 편집기는 전체 주를 나타냄 — 빈 요일도 []로 명시(그 주 휴무). 주계획 저장 시 부분 override 로 정확히 반영.
    tpl[String(wd)] = wins;
  }
  return tpl;
}

const HOUR_OPTS = Array.from({ length: 17 }, (_, i) => 6 + i).map((h) => ({ value: pad(h), label: pad(h) }));
const MIN_OPTS = [0, 10, 20, 30, 40, 50].map((m) => ({ value: pad(m), label: pad(m) }));

export function SchedulePage() {
  const { user } = useAuth();
  const teacherId = user!.id;
  const weeks = useMemo(() => [{ key: 'default', label: '기본 근무시간' }, ...upcomingWeeks()], []);
  const [week, setWeek] = useState('default');
  const [mode, setMode] = useState<'grid' | 'time' | 'excel'>('grid');
  const [recurring, setRecurring] = useState<Tpl>({});
  const [plans, setPlans] = useState<WeekPlan[]>([]);
  const [cells, setCells] = useState<Record<number, Set<number>>>({});
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [leaveType, setLeaveType] = useState<'연차' | '반차' | '병가'>('연차');
  const [leaveDate, setLeaveDate] = useState(iso(new Date()));
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [pendingSave, setPendingSave] = useState<Tpl | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const drag = useRef<{ on: boolean; paint: boolean }>({ on: false, paint: true });

  const isDefault = week === 'default';
  const planForWeek = plans.find((p) => p.weekStart === week);
  const usingDefault = !isDefault && !planForWeek; // 이 주 미설정 → 기본 적용

  const load = useCallback(async () => {
    setError('');
    try {
      const [wp, lv] = await Promise.all([
        api.get<{ recurringTemplate: Tpl; weekPlans: WeekPlan[] }>(`/teachers/${teacherId}/week-plans`),
        api.get<Leave[]>(`/teachers/${teacherId}/leave`).catch(() => [] as Leave[]),
      ]);
      setRecurring(wp.recurringTemplate ?? {});
      setPlans(wp.weekPlans ?? []);
      setLeaves(lv);
    } catch (e) { setError(e instanceof ApiError ? e.message : '근무표 조회 실패'); }
  }, [teacherId]);
  useEffect(() => { void load(); }, [load]);

  // 선택 주 바뀌면 편집 셀 로드(주계획 있으면 그것, 없으면 기본 복사)
  useEffect(() => {
    const base = isDefault ? recurring : (planForWeek?.template ?? recurring);
    setCells(tplToCells(base));
  }, [week, recurring, plans]); // eslint-disable-line

  // ── 드래그 그리드 ──
  const has = (wd: number, i: number) => cells[wd]?.has(i) ?? false;
  const paintCell = (wd: number, i: number, on: boolean) =>
    setCells((prev) => { const s = new Set(prev[wd] ?? []); on ? s.add(i) : s.delete(i); return { ...prev, [wd]: s }; });
  const onDown = (wd: number, i: number) => { const on = !has(wd, i); drag.current = { on: true, paint: on }; paintCell(wd, i, on); };
  const onEnter = (wd: number, i: number) => { if (drag.current.on) paintCell(wd, i, drag.current.paint); };
  useEffect(() => { const up = () => (drag.current.on = false); window.addEventListener('mouseup', up); return () => window.removeEventListener('mouseup', up); }, []);

  // ── 시간 선택(직접 입력) ── — 현재 cells → 요일별 구간
  const timeTpl = useMemo(() => cellsToTpl(cells), [cells]);
  function setWin(wd: number, i: number, patch: Partial<Win>) {
    const wins = (timeTpl[String(wd)] ?? []).map((w, idx) => (idx === i ? { ...w, ...patch } : w));
    applyTpl({ ...timeTpl, [String(wd)]: wins });
  }
  function addWin(wd: number) { applyTpl({ ...timeTpl, [String(wd)]: [...(timeTpl[String(wd)] ?? []), { start: '09:00', end: '18:00' }] }); }
  function delWin(wd: number, i: number) { applyTpl({ ...timeTpl, [String(wd)]: (timeTpl[String(wd)] ?? []).filter((_, idx) => idx !== i) }); }
  function applyTpl(tpl: Tpl) { setCells(tplToCells(tpl)); }

  // ── 엑셀(CSV) — 기본 + 주별을 한 파일로. '주'=기본 또는 그 주 월요일 날짜, 하루 여러 줄=분할근무, 휴무=시간 비움 ──
  function downloadTemplate() {
    const nm1 = mondayOf(new Date()); nm1.setDate(nm1.getDate() + 7);
    const nm2 = new Date(nm1); nm2.setDate(nm1.getDate() + 7);
    const d1 = iso(nm1), d2 = iso(nm2);
    const rows: string[][] = [
      ['주', '요일', '시작', '종료', '설명'],
      ['# 주=기본(매주 반복) 또는 특정 주 월요일 날짜(YYYY-MM-DD). 하루에 여러 줄이면 분할근무. 휴무는 시작·종료를 비웁니다. 설명 칸은 참고용(무시).', '', '', '', ''],
      ['기본', '월', '09:00', '18:00', '종일 근무'],
      ['기본', '화', '09:00', '12:00', '오전 근무(분할)'],
      ['기본', '화', '17:00', '21:00', '오전 근무 후 쉬고 저녁 근무(분할)'],
      ['기본', '수', '13:00', '21:00', '오후~저녁 근무'],
      ['기본', '목', '09:00', '13:00', '오전(분할)'],
      ['기본', '목', '14:00', '18:00', '오후(분할)'],
      ['기본', '금', '09:00', '12:00', '오전만 근무'],
      ['기본', '토', '10:00', '14:00', '주말 근무'],
      ['기본', '일', '', '', '휴무(시작·종료 비움)'],
      [d1, '월', '10:00', '15:00', `${d1} 주만 다르게 — 그 주 월요일 날짜로 지정`],
      [d1, '수', '', '', '그 주 수요일 휴무'],
      [d2, '화', '18:00', '22:00', `${d2} 주 화요일 저녁만`],
    ];
    const csv = '﻿' + rows.map((r) => r.map((c) => (/[,"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '근무시간_양식.csv'; a.click(); URL.revokeObjectURL(a.href);
  }
  function parseCsvLine(line: string): string[] {
    const out: string[] = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur); return out.map((x) => x.trim());
  }
  async function onExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    setError(''); setMsg('');
    try {
      const text = (await f.text()).replace(/^﻿/, '');
      const recur: Tpl = {};
      const byWeek: Record<string, Tpl> = {};
      let hasRecur = false;
      for (const line of text.split(/\r?\n/).slice(1)) {
        if (!line.trim() || line.trim().startsWith('#')) continue;
        const [wk, wdName, s, en] = parseCsvLine(line);
        if (!wk) continue;
        const wd = WD_LABEL.indexOf(wdName);
        if (wd < 0) continue;
        const valid = /^\d{1,2}:\d{2}$/.test(s ?? '') && /^\d{1,2}:\d{2}$/.test(en ?? ''); // 휴무행=빈칸 → []로 명시(그 날 off)
        if (wk === '기본') { const arr = (recur[String(wd)] ??= []); if (valid) arr.push({ start: s, end: en }); hasRecur = true; }
        else if (/^\d{4}-\d{2}-\d{2}$/.test(wk)) { const key = iso(mondayOf(new Date(wk + 'T00:00:00'))); const t = (byWeek[key] ??= {}); const arr = (t[String(wd)] ??= []); if (valid) arr.push({ start: s, end: en }); }
      }
      const uploadedPlans: WeekPlan[] = Object.entries(byWeek).map(([weekStart, template]) => ({ weekStart, template }));
      const parts: string[] = [];
      if (hasRecur) parts.push('기본 근무시간');
      if (uploadedPlans.length) parts.push(`${uploadedPlans.length}개 주 계획`);
      if (!parts.length) { setError('엑셀에서 유효한 근무시간을 찾지 못했어요. 양식(주,요일,시작,종료)을 확인하세요.'); return; }
      if (!window.confirm(`엑셀로 ${parts.join(' + ')}을 일괄 적용·저장할까요?`)) return;
      setBusy(true);
      if (hasRecur) await api.put(`/teachers/${teacherId}/work-schedule`, { recurringTemplate: recur });
      if (uploadedPlans.length) {
        const merged = [...plans.filter((p) => !uploadedPlans.some((u) => u.weekStart === p.weekStart)), ...uploadedPlans];
        await api.put(`/teachers/${teacherId}/week-plans`, { weekPlans: merged });
      }
      await load();
      setMsg(`엑셀 적용 완료 — ${parts.join(' + ')} 저장됨.`);
    } catch (er) { setError(er instanceof ApiError ? er.message : '엑셀 처리 실패'); } finally { setBusy(false); }
  }

  // ── 저장(충돌 검사 포함) ──
  async function save() {
    setMsg(''); setError(''); setBusy(true);
    const tpl = cellsToTpl(cells);
    try {
      if (isDefault) {
        await api.put(`/teachers/${teacherId}/work-schedule`, { recurringTemplate: tpl });
        setMsg('기본 근무시간이 저장되었습니다.'); await load();
      } else {
        const r = await api.post<{ conflicts: Conflict[] }>(`/teachers/${teacherId}/week-plans/conflicts`, { weekPlans: [{ weekStart: week, template: tpl }] });
        if (r.conflicts.length) { setConflicts(r.conflicts); setPendingSave(tpl); }
        else await commitWeek(tpl);
      }
    } catch (e) { setError(e instanceof ApiError ? e.message : '저장 실패'); } finally { setBusy(false); }
  }
  async function deleteWeekPlan() {
    if (isDefault) return;
    setBusy(true); setError(''); setMsg('');
    try {
      const next = plans.filter((p) => p.weekStart !== week);
      await api.put(`/teachers/${teacherId}/week-plans`, { weekPlans: next });
      setMsg('이 주 계획을 삭제했어요. 기본 근무시간이 적용됩니다.'); await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '삭제 실패'); } finally { setBusy(false); }
  }
  async function commitWeek(tpl: Tpl) {
    const next = [...plans.filter((p) => p.weekStart !== week), { weekStart: week, template: tpl }];
    await api.put(`/teachers/${teacherId}/week-plans`, { weekPlans: next });
    setMsg('해당 주 근무계획이 저장되었습니다.'); setConflicts(null); setPendingSave(null); await load();
  }
  // 충돌 대응
  async function respondConflict(route: 'rebook_notice' | 'substitute' | 'penalty') {
    setBusy(true); setError('');
    try {
      for (const c of conflicts ?? []) {
        const r = route === 'penalty' ? 'rebook_notice' : route; // penalty=취소+패널티 통보(경로는 재예약안내로 처리)
        await api.patch(`/bookings/${c.bookingId}/cancel`, { reason: '근무시간 변경', route: r }).catch(() => {});
      }
      if (pendingSave) await commitWeek(pendingSave);
      setMsg(route === 'rebook_notice' ? '학생에게 타 시간 변경 안내를 발송하고 저장했습니다.'
        : route === 'substitute' ? '타 선생님 변경(대체) 요청을 보내고 저장했습니다.'
        : '상담불가를 통보하고 저장했습니다. 관련 패널티가 적용될 수 있습니다.');
    } catch (e) { setError(e instanceof ApiError ? e.message : '처리 실패'); } finally { setBusy(false); }
  }

  async function addLeave() {
    setMsg('');
    try { await api.post(`/teachers/${teacherId}/leave`, { date: leaveDate, type: leaveType }); setMsg(`${leaveDate} ${leaveType} 등록됨`); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '사유 등록 실패'); }
  }
  async function removeLeave(date: string) { try { await api.del(`/teachers/${teacherId}/leave/${date}`); await load(); } catch (e) { setError(e instanceof ApiError ? e.message : '해제 실패'); } }

  return (
    <div>
      <PageHeader title="근무 시간 설정" sub="주별 근무를 미리 설정합니다. 미설정 주는 기본 근무시간이 적용됩니다."
        actions={<Button onClick={save} loading={busy}>{isDefault ? '기본 근무 저장' : '이 주 저장'}</Button>} />
      <ErrorText>{error}</ErrorText>
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13, marginTop: -8 }}>{msg}</p>}

      {/* 주 선택 */}
      <Card title="설정할 주" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {weeks.map((w) => {
            const on = w.key === week;
            const planned = w.key !== 'default' && plans.some((p) => p.weekStart === w.key);
            return (
              <button key={w.key} onClick={() => setWeek(w.key)} className={`btn sm ${on ? '' : 'ghost'}`}
                style={{ boxShadow: 'none', display: 'flex', gap: 6, alignItems: 'center' }}>
                {w.label}{planned && <span style={{ width: 6, height: 6, borderRadius: '50%', background: on ? '#fff' : 'var(--teal)' }} />}
              </button>
            );
          })}
        </div>
        {usingDefault && (
          <p style={{ marginTop: 10, marginBottom: 0, fontSize: 13, color: '#92600a', background: '#FEF6E7', border: '1px solid #F0DCAE', borderRadius: 9, padding: '8px 10px' }}>
            ⓘ 이 주는 아직 설정되지 않아 <b>기본 근무시간</b>이 적용됩니다. 아래에서 변경 후 저장하면 이 주에만 적용됩니다.
          </p>
        )}
        {!isDefault && planForWeek && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>이 주는 개별 근무계획이 저장되어 있어요.</span>
            <Button size="sm" variant="ghost" onClick={deleteWeekPlan} loading={busy}>이 주 계획 삭제(기본으로 되돌리기)</Button>
          </div>
        )}
      </Card>

      {/* 입력 방식 */}
      <Card title="근무시간 입력" style={{ marginBottom: 14 }}
        actions={
          <div style={{ display: 'flex', gap: 6 }}>
            {([['grid', '주간표 드래그'], ['time', '시간 선택'], ['excel', '엑셀']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setMode(k)} className={`btn sm ${mode === k ? '' : 'ghost'}`} style={{ boxShadow: 'none' }}>{l}</button>
            ))}
          </div>
        }>
        {mode === 'grid' && (
          <>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: -2 }}>칸을 클릭하거나 드래그해 근무시간을 칠하세요(30분 단위).</p>
            <div style={{ userSelect: 'none', overflowX: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: `52px repeat(7, minmax(52px,1fr))`, gap: 3, minWidth: 460 }}>
                <div />
                {DAY_ORDER.map((wd) => <div key={wd} style={{ textAlign: 'center', fontWeight: 700, fontSize: 12, color: 'var(--ink)' }}>{WD_LABEL[wd]}</div>)}
                {Array.from({ length: ROWS }, (_, i) => (
                  <div key={i} style={{ display: 'contents' }}>
                    {i % 2 === 0 ? <div style={{ fontSize: 11, color: 'var(--caption)', textAlign: 'right', paddingRight: 4, lineHeight: '16px' }}>{hhmm(rowMin(i))}</div> : <div />}
                    {DAY_ORDER.map((wd) => {
                      const on = has(wd, i);
                      return <div key={wd + '-' + i} onMouseDown={() => onDown(wd, i)} onMouseEnter={() => onEnter(wd, i)}
                        style={{ height: 16, borderRadius: 3, cursor: 'pointer', background: on ? 'var(--teal)' : '#f4f6f7', border: on ? 'none' : '1px solid #eef2f4' }} />;
                    })}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {mode === 'time' && (
          <div style={{ display: 'grid', gap: 10 }}>
            {DAY_ORDER.map((wd) => (
              <div key={wd} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ width: 20, paddingTop: 8, fontWeight: 700 }}>{WD_LABEL[wd]}</span>
                <div style={{ display: 'grid', gap: 6 }}>
                  {(timeTpl[String(wd)] ?? []).map((w, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <TimeSel value={w.start} onChange={(v) => setWin(wd, i, { start: v })} />
                      <span>~</span>
                      <TimeSel value={w.end} onChange={(v) => setWin(wd, i, { end: v })} />
                      <Button size="sm" variant="ghost" onClick={() => delWin(wd, i)}>삭제</Button>
                    </div>
                  ))}
                  <div>
                    <Button size="sm" variant="ghost" onClick={() => addWin(wd)}>+ 구간 추가</Button>
                    {(timeTpl[String(wd)]?.length ?? 0) === 0 && <span style={{ marginLeft: 8, color: 'var(--muted)', fontSize: 13 }}>근무 없음</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {mode === 'excel' && (
          <div style={{ display: 'grid', gap: 10, maxWidth: 620 }}>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
              양식을 내려받아 <b>기본 근무 + 주별 근무</b>를 한 파일로 채운 뒤 업로드하면 <b>일괄 적용·저장</b>됩니다.
              <br />· <b>주</b> = <code>기본</code>(매주 반복) 또는 특정 주 월요일 날짜(<code>YYYY-MM-DD</code>)
              <br />· 하루에 <b>여러 줄</b>이면 <b>분할근무</b>(예: 오전 근무 후 쉬고 저녁 근무)
              <br />· <b>휴무</b>는 시작·종료를 비웁니다 · 설명 칸은 참고용(무시)
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" onClick={downloadTemplate}>⬇ 엑셀 양식(예시 포함) 내려받기</Button>
              <label className="btn ghost" style={{ cursor: 'pointer' }}>
                ⬆ 엑셀 업로드(일괄 적용)<input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={onExcel} />
              </label>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', background: 'var(--fill,#f6f8fa)', borderRadius: 8, padding: 10, fontFamily: 'monospace', whiteSpace: 'pre', overflowX: 'auto' }}>
{`주,요일,시작,종료,설명
기본,월,09:00,18:00,종일 근무
기본,화,09:00,12:00,오전 근무(분할)
기본,화,17:00,21:00,오전 근무 후 쉬고 저녁 근무
기본,수,13:00,21:00,오후~저녁
기본,금,09:00,12:00,오전만
기본,토,10:00,14:00,주말 근무
기본,일,,,휴무(비움)
2026-07-13,월,10:00,15:00,그 주만 다르게
2026-07-13,수,,,그 주 수요일 휴무`}
            </div>
          </div>
        )}
        {mode !== 'excel' && <div style={{ marginTop: 14 }}><Button onClick={save} loading={busy}>{isDefault ? '기본 근무 저장' : '이 주 저장'}</Button></div>}
      </Card>

      {/* 사유로 제외 */}
      <Card title="사유로 제외 (연차·반차·병가)" style={{ maxWidth: 520 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {(['연차', '반차', '병가'] as const).map((t) => (
            <button key={t} onClick={() => setLeaveType(t)} className={`btn sm ${leaveType === t ? '' : 'ghost'}`} style={{ flex: 1, boxShadow: 'none' }}>{t}</button>
          ))}
        </div>
        <div className="form-row">
          <label className="label">날짜</label>
          <input className="input" type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} />
        </div>
        <Button block style={{ marginTop: 4 }} onClick={addLeave}>제외 등록</Button>
        {leaves.length > 0 && (
          <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
            {leaves.map((l) => (
              <div key={l.date} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <Badge kind="soft">{l.type}</Badge><span style={{ color: 'var(--muted)' }}>{l.date}</span>
                <Button size="sm" variant="ghost" style={{ marginLeft: 'auto' }} onClick={() => removeLeave(l.date)}>해제</Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 충돌 대응 팝업 */}
      {conflicts && (
        <Modal open title="근무 변경 · 예약 충돌" onClose={() => { setConflicts(null); setPendingSave(null); }}>
          <p style={{ fontSize: 14, color: 'var(--ink)' }}>변경한 근무시간과 겹쳐 진행이 어려운 학생 상담이 <b>{conflicts.length}건</b> 있습니다. 대응 방안을 선택하세요.</p>
          <div style={{ display: 'grid', gap: 6, margin: '8px 0 14px', maxHeight: 160, overflow: 'auto' }}>
            {conflicts.map((c) => (
              <div key={c.bookingId} style={{ fontSize: 13, background: 'var(--fill,#f6f8fa)', borderRadius: 8, padding: '6px 10px' }}>
                {c.date} {hhmm(c.startMin)}~{hhmm(c.endMin)} · {c.studentName} · {c.consultType ?? ''}·{c.mode}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <Button onClick={() => respondConflict('rebook_notice')} loading={busy}>① 학생에게 타 시간 변경 안내</Button>
            <Button variant="ghost" onClick={() => respondConflict('substitute')} loading={busy}>② 타 선생님으로 변경 요청(대체)</Button>
            <Button variant="danger" onClick={() => respondConflict('penalty')} loading={busy}>③ 상담불가 통보 (패널티 수용)</Button>
            <p style={{ fontSize: 12, color: '#b91c1c', margin: 0 }}>③ 선택 시 선생님에게 관련 패널티(당일취소·랭킹 가중치 등)가 적용될 수 있습니다.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TimeSel({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [h, m] = (value || '09:00').split(':');
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <select className="input" style={{ width: 68 }} value={h} onChange={(e) => onChange(`${e.target.value}:${m}`)}>
        {HOUR_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span>:</span>
      <select className="input" style={{ width: 68 }} value={m} onChange={(e) => onChange(`${h}:${e.target.value}`)}>
        {MIN_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </span>
  );
}
