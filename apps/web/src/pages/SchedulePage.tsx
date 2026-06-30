import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Slot, WorkSchedule } from '../api/types';
import { PageHeader, Card, Button, ErrorText, Badge } from '../components/ui';

type Win = { start: string; end: string };
type Leave = { date: string; type: string };
type DayCol = { label: string; date: string; wd: number };

const WD_LABEL = ['일', '월', '화', '수', '목', '금', '토'];
const HOURS = Array.from({ length: 14 }, (_, i) => 9 + i); // 09:00 ~ 22:00
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// 이번 주 월~일
function weekDays(base = new Date()): DayCol[] {
  const mon = new Date(base);
  mon.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return { label: WD_LABEL[d.getDay()], date: iso(d), wd: d.getDay() };
  });
}

type Cell = 'work' | 'booked' | 'leave' | 'blocked' | 'off';
const CELL_BG: Record<Cell, string> = {
  work: 'var(--teal)',
  booked: '#EFF4FE',
  leave: '#FDE8C8',
  blocked: '#fdecec',
  off: '#f4f6f7',
};

export function SchedulePage() {
  const { user } = useAuth();
  const teacherId = user!.id;
  const [days] = useState<DayCol[]>(() => weekDays());
  const [grid, setGrid] = useState<Record<string, Record<number, Cell>>>({}); // date → hour → cell
  const [tpl, setTpl] = useState<Record<string, Win[]>>({});
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [leaveType, setLeaveType] = useState<'연차' | '반차' | '병가'>('연차');
  const [leaveDate, setLeaveDate] = useState(iso(new Date()));
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const setWin = (d: number, i: number, patch: Partial<Win>) =>
    setTpl((p) => ({ ...p, [d]: (p[d] ?? []).map((w, idx) => (idx === i ? { ...w, ...patch } : w)) }));
  const addWin = (d: number) => setTpl((p) => ({ ...p, [d]: [...(p[d] ?? []), { start: '', end: '' }] }));
  const delWin = (d: number, i: number) => setTpl((p) => ({ ...p, [d]: (p[d] ?? []).filter((_, idx) => idx !== i) }));

  // 주간 그리드: 7일 슬롯 + 연차 반영
  const loadWeek = useCallback(async () => {
    setError('');
    try {
      const [lv, ...weekSlots] = await Promise.all([
        api.get<Leave[]>(`/teachers/${teacherId}/leave`).catch(() => [] as Leave[]),
        ...days.map((d) => api.get<Slot[]>(`/teachers/${teacherId}/slots?date=${d.date}`).catch(() => [] as Slot[])),
      ]);
      setLeaves(lv);
      const leaveDates = new Set(lv.map((l) => l.date));
      const g: Record<string, Record<number, Cell>> = {};
      days.forEach((d, di) => {
        const slots = weekSlots[di];
        g[d.date] = {};
        for (const h of HOURS) {
          const inHour = slots.filter((s) => Number(s.time.slice(0, 2)) === h);
          let cell: Cell = 'off';
          if (leaveDates.has(d.date) && inHour.length === 0 && tplHasHour(tpl, d.wd, h)) cell = 'leave';
          if (inHour.some((s) => s.status === 'booked')) cell = 'booked';
          else if (inHour.some((s) => s.status === 'blocked')) cell = 'blocked';
          else if (inHour.some((s) => s.status === 'avail' || s.status === 'rest')) cell = 'work';
          else if (leaveDates.has(d.date) && tplHasHour(tpl, d.wd, h)) cell = 'leave';
          g[d.date][h] = cell;
        }
      });
      setGrid(g);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '근무표 조회 실패');
    }
  }, [teacherId, days, tpl]);

  useEffect(() => {
    api
      .get<WorkSchedule>(`/teachers/${teacherId}/work-schedule`)
      .then((ws) => {
        const t: Record<string, Win[]> = {};
        const rt = ws.recurring_template ?? {};
        for (let d = 0; d < 7; d++) t[d] = rt[d] ?? [];
        setTpl(t);
      })
      .catch(() => undefined);
  }, [teacherId]);

  useEffect(() => {
    void loadWeek();
  }, [loadWeek]);

  async function saveSchedule() {
    setMsg('');
    setError('');
    const recurringTemplate: Record<string, Win[]> = {};
    for (const [d, wins] of Object.entries(tpl)) {
      const valid = wins.filter((w) => w.start && w.end);
      if (valid.length) recurringTemplate[d] = valid;
    }
    try {
      await api.put(`/teachers/${teacherId}/work-schedule`, { recurringTemplate });
      setMsg('근무표가 저장되었습니다.');
      await loadWeek();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장 실패');
    }
  }

  async function addLeave() {
    setMsg('');
    try {
      await api.post(`/teachers/${teacherId}/leave`, { date: leaveDate, type: leaveType });
      setMsg(`${leaveDate} ${leaveType} 등록됨`);
      await loadWeek();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '사유 등록 실패');
    }
  }
  async function removeLeave(date: string) {
    try {
      await api.del(`/teachers/${teacherId}/leave/${date}`);
      await loadWeek();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '해제 실패');
    }
  }

  return (
    <div>
      <PageHeader
        title="근무 시간 설정"
        sub="근무 요일·시간을 지정하고 연차/반차/병가로 제외할 수 있어요."
        actions={<Button onClick={saveSchedule}>변경 저장</Button>}
      />
      <ErrorText>{error}</ErrorText>
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13, marginTop: -8 }}>{msg}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.7fr) minmax(280px,1fr)', gap: 16, alignItems: 'start' }}>
        {/* ── 주간 그리드 ── */}
        <Card title="주간 근무 그리드">
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10, fontSize: 12, color: 'var(--muted)' }}>
            <Legend c="work" t="근무" /><Legend c="booked" t="예약됨" /><Legend c="leave" t="연차·반차·병가" /><Legend c="off" t="근무 외" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '46px repeat(7, 1fr)', gap: 3, fontSize: 12 }}>
            <div />
            {days.map((d) => (
              <div key={d.date} style={{ textAlign: 'center', fontWeight: 700, color: leaves.some((l) => l.date === d.date) ? '#b86c04' : 'var(--ink)' }}>
                {d.label}
              </div>
            ))}
            {HOURS.map((h) => (
              <div key={h} style={{ display: 'contents' }}>
                <div style={{ color: 'var(--caption)', textAlign: 'right', paddingRight: 4, lineHeight: '22px' }}>{pad(h)}:00</div>
                {days.map((d) => {
                  const cell = grid[d.date]?.[h] ?? 'off';
                  return (
                    <div
                      key={d.date + h}
                      title={`${d.date} ${pad(h)}:00 · ${cell}`}
                      style={{
                        height: 22, borderRadius: 4, background: CELL_BG[cell],
                        border: cell === 'off' ? '1px solid #eef2f4' : 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 700,
                        color: cell === 'booked' ? '#2563eb' : '#fff',
                      }}
                    >
                      {cell === 'booked' ? '예약' : ''}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>

        {/* ── 사유로 제외 ── */}
        <div style={{ display: 'grid', gap: 14 }}>
          <Card title="사유로 제외">
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: -4 }}>선택한 날짜를 비근무로 처리합니다.</p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {(['연차', '반차', '병가'] as const).map((t) => (
                <button
                  key={t}
                  className="btn sm"
                  style={{
                    flex: 1,
                    background: leaveType === t ? 'var(--teal-50)' : '#fff',
                    color: leaveType === t ? 'var(--teal)' : 'var(--muted)',
                    border: `1px solid ${leaveType === t ? 'var(--teal-100)' : 'var(--line)'}`,
                    boxShadow: 'none',
                  }}
                  onClick={() => setLeaveType(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <input className="input" type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} />
            <Button block style={{ marginTop: 10 }} onClick={addLeave}>제외 등록</Button>
            {leaves.length > 0 && (
              <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
                {leaves.map((l) => (
                  <div key={l.date} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <Badge kind="soft">{l.type}</Badge>
                    <span style={{ color: 'var(--muted)' }}>{l.date}</span>
                    <Button size="sm" variant="ghost" style={{ marginLeft: 'auto' }} onClick={() => removeLeave(l.date)}>해제</Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ── 근무표(요일별 다구간) ── */}
      <Card title="근무표 (요일별 · 여러 구간 가능)" style={{ marginTop: 16 }}>
        <div style={{ display: 'grid', gap: 10 }}>
          {WD_LABEL.map((label, d) => (
            <div key={d} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ width: 24, paddingTop: 6 }}>{label}</span>
              <div style={{ display: 'grid', gap: 6 }}>
                {(tpl[d] ?? []).map((w, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input className="input" type="time" style={{ width: 130 }} value={w.start} onChange={(e) => setWin(d, i, { start: e.target.value })} />
                    <span>~</span>
                    <input className="input" type="time" style={{ width: 130 }} value={w.end} onChange={(e) => setWin(d, i, { end: e.target.value })} />
                    <Button size="sm" variant="ghost" onClick={() => delWin(d, i)}>삭제</Button>
                  </div>
                ))}
                <div>
                  <Button size="sm" variant="ghost" onClick={() => addWin(d)}>+ 구간 추가</Button>
                  {(tpl[d]?.length ?? 0) === 0 && <span style={{ marginLeft: 8, color: 'var(--muted)', fontSize: 13 }}>근무 없음</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
        <Button style={{ marginTop: 12 }} onClick={saveSchedule}>근무표 저장</Button>
      </Card>
    </div>
  );
}

function Legend({ c, t }: { c: Cell; t: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: CELL_BG[c], border: c === 'off' ? '1px solid #eef2f4' : 'none' }} />
      {t}
    </span>
  );
}

function tplHasHour(tpl: Record<string, Win[]>, wd: number, h: number): boolean {
  const wins = tpl[wd] ?? [];
  return wins.some((w) => {
    const s = Number(w.start?.slice(0, 2)), e = Number(w.end?.slice(0, 2));
    return Number.isFinite(s) && Number.isFinite(e) && h >= s && h < e;
  });
}
