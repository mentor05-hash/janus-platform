import { useMemo, useState } from 'react';
import { acaMeta, acaDateLabel, type AcademicEvent } from '../lib/academic';

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const d10 = (s: string) => s.slice(0, 10);
const todayKst = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

/** YYYY-MM-DD → 로컬 자정 Date(월 그리드 계산용). */
const toDate = (s: string) => new Date(`${d10(s)}T00:00:00`);
const ymKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** 학사일정 월 달력(그리드). 유형색 칩·기간 span·월 이동. 칩 클릭 시 onPick. */
export function AcademicCalendar({ events, onPick }: { events: AcademicEvent[]; onPick?: (e: AcademicEvent) => void }) {
  const [cur, setCur] = useState(() => { const t = toDate(todayKst()); return new Date(t.getFullYear(), t.getMonth(), 1); });

  const { weeks, monthKey } = useMemo(() => {
    const first = new Date(cur.getFullYear(), cur.getMonth(), 1);
    const startOffset = first.getDay(); // 0=일
    const daysInMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cur.getFullYear(), cur.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return { weeks, monthKey: ymKey(cur) };
  }, [cur]);

  // 날짜별 이벤트(기간이면 [시작..종료] 모든 날짜에 표기)
  const byDay = useMemo(() => {
    const map = new Map<string, AcademicEvent[]>();
    for (const e of events) {
      const s = toDate(e.start_date);
      const end = e.end_date ? toDate(e.end_date) : s;
      for (let d = new Date(s); d <= end; d.setDate(d.getDate() + 1)) {
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        (map.get(k) ?? map.set(k, []).get(k)!).push(e);
      }
    }
    return map;
  }, [events]);

  const today = todayKst();
  const shift = (n: number) => setCur(new Date(cur.getFullYear(), cur.getMonth() + n, 1));
  const [y, m] = monthKey.split('-');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button className="btn ghost sm" onClick={() => shift(-1)}>‹ 이전달</button>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{y}년 {Number(m)}월</div>
        <button className="btn ghost sm" onClick={() => shift(1)}>다음달 ›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: 'var(--line)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
        {WD.map((w, i) => (
          <div key={w} style={{ background: 'var(--surface-2, #f6f8fa)', textAlign: 'center', padding: '6px 0', fontSize: 12, fontWeight: 700, color: i === 0 ? '#d06b52' : i === 6 ? '#2F6FB3' : 'var(--muted)' }}>{w}</div>
        ))}
        {weeks.flat().map((d, i) => {
          if (!d) return <div key={i} style={{ background: 'var(--surface)', minHeight: 82 }} />;
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const isToday = key === today;
          const evs = byDay.get(key) ?? [];
          const dow = d.getDay();
          return (
            <div key={i} style={{ background: 'var(--surface)', minHeight: 82, padding: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 600, textAlign: 'right', color: isToday ? '#fff' : dow === 0 ? '#d06b52' : dow === 6 ? '#2F6FB3' : 'var(--ink-body)', background: isToday ? 'var(--teal)' : 'transparent', borderRadius: 999, alignSelf: 'flex-end', minWidth: 20, height: 20, lineHeight: '20px', paddingInline: isToday ? 6 : 0 }}>{d.getDate()}</div>
              {evs.slice(0, 3).map((e) => {
                const mt = acaMeta(e.type);
                return (
                  <button key={e.id + key} onClick={() => onPick?.(e)} title={`${mt.label} · ${acaDateLabel(e)}${e.grade ? ` · ${e.grade}` : ''}`}
                    style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: onPick ? 'pointer' : 'default', fontSize: 10.5, fontWeight: 700, color: '#fff', background: mt.color, borderRadius: 4, padding: '2px 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {mt.icon} {e.title}
                  </button>
                );
              })}
              {evs.length > 3 && <span style={{ fontSize: 10, color: 'var(--muted)', paddingLeft: 2 }}>+{evs.length - 3}</span>}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
        {['suneung', 'mock', 'mock_apply', 'exam', 'admission'].map((t) => (
          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--muted)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: acaMeta(t).color, display: 'inline-block' }} />{acaMeta(t).label}
          </span>
        ))}
      </div>
    </div>
  );
}
