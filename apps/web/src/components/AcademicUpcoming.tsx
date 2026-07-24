import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Card, Spinner, EmptyState } from './ui';
import { acaMeta, acaDateLabel, acaDdayLabel, acaDday, type AcademicEvent } from '../lib/academic';

/** 다가오는 학사일정(중요일정) 위젯 — 학생 대시보드 등. 오늘 이후 N건. */
export function AcademicUpcoming({ limit = 5, title = '다가오는 학사일정', moreHref = '/student/academic' }: { limit?: number; title?: string; moreHref?: string }) {
  const [events, setEvents] = useState<AcademicEvent[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    api.get<AcademicEvent[]>(`/academic-events?from=${today}`).then((r) => setEvents(Array.isArray(r) ? r : [])).catch(() => { setFailed(true); setEvents([]); });
  }, []);

  // 오늘 진행중(기간)도 포함 — 종료일이 오늘 이후인 것.
  const upcoming = (events ?? [])
    .filter((e) => acaDday(e.end_date ?? e.start_date) >= 0)
    .slice(0, limit);

  return (
    <Card title={title}>
      {events === null ? <Spinner /> : failed ? (
        <EmptyState>학사일정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</EmptyState>
      ) : upcoming.length === 0 ? (
        <EmptyState>예정된 학사일정이 없어요.</EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {upcoming.map((e) => {
            const m = acaMeta(e.type);
            const dday = acaDdayLabel(e);
            const soon = acaDday(e.start_date) <= 7 && acaDday(e.end_date ?? e.start_date) >= 0;
            return (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontSize: 19 }}>{m.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    <span style={{ color: m.color, fontWeight: 700 }}>{m.label}</span> · {acaDateLabel(e)}{e.grade ? ` · ${e.grade}` : ''}
                  </div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 800, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap', color: soon ? '#fff' : m.color, background: soon ? m.color : 'var(--surface-2, #f0f3f7)' }}>{dday}</span>
              </div>
            );
          })}
        </div>
      )}
      {moreHref && <div style={{ marginTop: 10 }}><Link to={moreHref} style={{ color: 'var(--teal)', fontSize: 13, fontWeight: 700 }}>전체 학사일정 달력 →</Link></div>}
    </Card>
  );
}
