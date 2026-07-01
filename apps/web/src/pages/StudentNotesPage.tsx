import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { ConsultationNote, RecordOverview } from '../api/types';
import { Card, Badge, ErrorText, EmptyState } from '../components/ui';
import { ScoreTrend, type Trend } from '../components/ScoreTrend';

const GAP_BADGE: Record<RecordOverview['homeroomGap']['level'], { kind: 'done' | 'noshow' | 'danger' | 'soft'; label: string }> = {
  ok: { kind: 'done', label: '담임 정상' },
  warn: { kind: 'noshow', label: '담임 공백 주의' },
  danger: { kind: 'danger', label: '담임 공백 위험' },
  none: { kind: 'soft', label: '담임 상담 이력 없음' },
};

export function StudentNotesPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const [notes, setNotes] = useState<ConsultationNote[]>([]);
  const [overview, setOverview] = useState<RecordOverview | null>(null);
  const [trend, setTrend] = useState<Trend | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!studentId) return;
    api.get<Trend>(`/teacher/scores/trend?studentId=${studentId}`).then(setTrend).catch(() => setTrend(null));
    api
      .get<ConsultationNote[]>(`/students/${studentId}/notes`)
      .then(setNotes)
      .catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
    // 개요(담임 공백 + 거부 이력)는 보조 정보 — 실패해도 기록 목록은 유지
    api
      .get<RecordOverview>(`/students/${studentId}/record-overview`)
      .then(setOverview)
      .catch(() => setOverview(null));
  }, [studentId]);

  const gap = overview && GAP_BADGE[overview.homeroomGap.level];

  return (
    <div>
      <Link to="/app/bookings">← 예약 목록</Link>
      <h2 style={{ color: 'var(--teal)' }}>학생 상담 이력</h2>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>소속 범위 내 상담 기록을 표시합니다. 타 선생님 기록의 내부 메모는 작성자만 볼 수 있어요.</p>
      <ErrorText>{error}</ErrorText>

      {overview && (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {gap && <Badge kind={gap.kind}>{gap.label}</Badge>}
            {overview.homeroomGap.daysSince != null && (
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                마지막 담임 상담 {overview.homeroomGap.daysSince}일 경과
                {overview.homeroomGap.warnDays != null && ` · 주의 ${overview.homeroomGap.warnDays}일`}
                {overview.homeroomGap.dangerDays != null && ` · 위험 ${overview.homeroomGap.dangerDays}일`}
              </span>
            )}
            <Badge kind={overview.rejectCount > 0 ? 'rejected' : 'soft'}>거부 {overview.rejectCount}건</Badge>
            <Badge kind={(overview.noshowCount ?? 0) > 0 ? 'noshow' : 'soft'}>노쇼 {overview.noshowCount ?? 0}건</Badge>
          </div>
          {overview.rejections.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--muted)' }}>
              {overview.rejections.map((r) => (
                <li key={r.bookingId}>
                  {r.consultType ?? '-'} · {r.teacherName ?? r.teacherId.slice(0, 8)}
                  {r.startAt && ` · ${new Date(r.startAt).toLocaleDateString('ko-KR')}`}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {trend && trend.points.length > 0 && (
        <Card style={{ marginBottom: 12 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>성적·배치 추이</h3>
          <ScoreTrend trend={trend} />
        </Card>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {notes.map((n) => (
          <Card key={n.bookingId}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <strong>{n.coreSummary || '(요약 없음)'}</strong>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {n.teacherName && <Badge kind="soft">{n.teacherName}{n.isMine ? ' · 나' : ''}</Badge>}
                <Badge kind={n.saveState === 'final' ? 'done' : 'confirmed'}>{n.saveState === 'final' ? '최종' : '임시'}</Badge>
              </span>
            </div>
            {n.homework && <div style={{ fontSize: 13, marginTop: 4 }}>숙제: {n.homework}</div>}
            {n.futureDir && <div style={{ fontSize: 13 }}>향후: {n.futureDir}</div>}
            {n.memo != null ? <div style={{ fontSize: 13, color: 'var(--muted)' }}>내부메모: {n.memo}</div>
              : !n.isMine && <div style={{ fontSize: 12, color: 'var(--muted)' }}>🔒 내부메모는 작성 선생님만 볼 수 있어요.</div>}
          </Card>
        ))}
        {notes.length === 0 && !error && <EmptyState>기록이 없습니다.</EmptyState>}
      </div>
    </div>
  );
}
