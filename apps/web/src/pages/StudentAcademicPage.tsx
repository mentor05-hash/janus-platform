import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { PageHeader, Card, Spinner, EmptyState } from '../components/ui';
import { AcademicCalendar } from '../components/AcademicCalendar';
import { acaMeta, acaDateLabel, acaDdayLabel, type AcademicEvent } from '../lib/academic';

/** 학생 학사일정 — 월 달력 + 선택 일정 상세. */
export function StudentAcademicPage() {
  const [events, setEvents] = useState<AcademicEvent[] | null>(null);
  const [sel, setSel] = useState<AcademicEvent | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.get<AcademicEvent[]>('/academic-events').then((r) => { setEvents(Array.isArray(r) ? r : []); setFailed(false); }).catch(() => { setFailed(true); setEvents([]); });
  }, []);

  return (
    <div>
      <PageHeader title="학사일정" sub="수능·모의고사·신청기간·내신 등 이번 학기 중요일정을 달력으로 확인하세요." />
      {events === null ? <Spinner /> : failed ? (
        <Card><EmptyState>학사일정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</EmptyState></Card>
      ) : events.length === 0 ? (
        <Card><EmptyState>등록된 학사일정이 없어요.</EmptyState></Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
          <Card><AcademicCalendar events={events} onPick={setSel} /></Card>
          <Card title={sel ? '일정 상세' : '일정을 선택하세요'}>
            {sel ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 22 }}>{acaMeta(sel.type).icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, padding: '3px 9px', borderRadius: 999, color: '#fff', background: acaMeta(sel.type).color }}>{acaMeta(sel.type).label}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: acaMeta(sel.type).color }}>{acaDdayLabel(sel)}</span>
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>{sel.title}</div>
                <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 4 }}>{acaDateLabel(sel)}{sel.grade ? ` · ${sel.grade}` : ''}</div>
                {sel.description && <p style={{ fontSize: 14, color: 'var(--ink-body)', lineHeight: 1.6, marginTop: 12 }}>{sel.description}</p>}
              </div>
            ) : (
              <p style={{ fontSize: 14, color: 'var(--muted)' }}>달력에서 일정을 누르면 자세한 내용이 표시돼요.</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
