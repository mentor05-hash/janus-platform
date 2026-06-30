import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Slot, WorkSchedule } from '../api/types';
import { PageHeader, Card, Button, ErrorText } from '../components/ui';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const todayStr = () => new Date().toISOString().slice(0, 10);

const slotColor: Record<Slot['status'], string> = {
  avail: '#1f9d57',
  booked: '#2563eb',
  rest: '#c9d2d6',
  off: '#eef1f2',
  blocked: '#d23b3b',
};

export function SchedulePage() {
  const { user } = useAuth();
  const teacherId = user!.id;
  const [date, setDate] = useState(todayStr());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [tpl, setTpl] = useState<Record<string, { start: string; end: string }>>({});
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const loadSlots = useCallback(async () => {
    setError('');
    try {
      setSlots(await api.get<Slot[]>(`/teachers/${teacherId}/slots?date=${date}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '슬롯 조회 실패');
      setSlots([]);
    }
  }, [teacherId, date]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  useEffect(() => {
    api
      .get<WorkSchedule>(`/teachers/${teacherId}/work-schedule`)
      .then((ws) => {
        const t: Record<string, { start: string; end: string }> = {};
        const rt = ws.recurring_template ?? {};
        for (let d = 0; d < 7; d++) t[d] = rt[d]?.[0] ?? { start: '', end: '' };
        setTpl(t);
      })
      .catch(() => undefined);
  }, [teacherId]);

  async function saveSchedule() {
    setMsg('');
    setError('');
    const recurringTemplate: Record<string, { start: string; end: string }[]> = {};
    for (const [d, w] of Object.entries(tpl)) if (w.start && w.end) recurringTemplate[d] = [w];
    try {
      await api.put(`/teachers/${teacherId}/work-schedule`, { recurringTemplate });
      setMsg('근무표가 저장되었습니다.');
      await loadSlots();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장 실패');
    }
  }

  const availCount = slots.filter((s) => s.status === 'avail').length;

  return (
    <div>
      <PageHeader title="가용 슬롯" sub="10분 단위 · 초록=가용/파랑=예약/회색=휴게·근무외/빨강=차단" />
      <input className="input" type="date" style={{ width: 200 }} value={date} onChange={(e) => setDate(e.target.value)} />
      <ErrorText>{error}</ErrorText>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>가용 {availCount}칸</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 20 }}>
        {slots.map((s) => (
          <span
            key={s.index}
            title={`${s.time} · ${s.status}`}
            style={{
              width: 52,
              textAlign: 'center',
              fontSize: 11,
              padding: '4px 0',
              borderRadius: 4,
              background: slotColor[s.status],
              color: s.status === 'off' || s.status === 'rest' ? 'var(--muted)' : '#fff',
            }}
          >
            {s.time}
          </span>
        ))}
        {slots.length === 0 && !error && <span style={{ color: 'var(--muted)' }}>근무 시간이 없습니다.</span>}
      </div>

      <Card title="근무표(요일별, 1구간)">
        <div style={{ display: 'grid', gap: 8 }}>
          {WEEKDAYS.map((label, d) => (
            <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 24 }}>{label}</span>
              <input
                className="input"
                style={{ width: 120 }}
                placeholder="09:00"
                value={tpl[d]?.start ?? ''}
                onChange={(e) => setTpl((p) => ({ ...p, [d]: { ...p[d], start: e.target.value } }))}
              />
              <span>~</span>
              <input
                className="input"
                style={{ width: 120 }}
                placeholder="18:00"
                value={tpl[d]?.end ?? ''}
                onChange={(e) => setTpl((p) => ({ ...p, [d]: { ...p[d], end: e.target.value } }))}
              />
            </div>
          ))}
        </div>
        {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}
        <Button style={{ marginTop: 12 }} onClick={saveSchedule}>근무표 저장</Button>
      </Card>
    </div>
  );
}
