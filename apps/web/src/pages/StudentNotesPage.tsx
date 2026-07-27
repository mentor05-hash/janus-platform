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

/** 학생 산출물 이력(선생님) — 관계 게이트(O107) 통과 시에만 온다. */
type GapHist = {
  id: string; created_at: string;
  payload: { unit: { label: string; suffix: string }; gap: { band: string; shortfall: number }; target: { univ: string; dept: string; cut: number }; generatedFor: { value: number } };
};
const HIST_BAND: Record<string, string> = { 안정: '#2A8A5F', 적정: '#2F6FB3', 소신: '#CF9A3A', 상향: '#E5484D' };

export function StudentNotesPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const [gapHist, setGapHist] = useState<GapHist[] | null>(null);
  const [gapGate, setGapGate] = useState('');
  const [notes, setNotes] = useState<ConsultationNote[]>([]);
  const [overview, setOverview] = useState<RecordOverview | null>(null);
  const [trend, setTrend] = useState<Trend | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!studentId) return;
    api.get<Trend>(`/teacher/scores/trend?studentId=${studentId}`).then(setTrend).catch(() => setTrend(null));
    // 격차 리포트 이력 — 관계 게이트(O107) 미충족이면 403 사유를 그대로 안내한다.
    api.get<GapHist[]>(`/teacher/reports?studentId=${studentId}&kind=gap&limit=5`)
      .then((r) => setGapHist(Array.isArray(r) ? r : []))
      .catch((e) => { setGapHist([]); setGapGate(e instanceof ApiError ? e.message : '열람 권한이 없습니다.'); });
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

      {/* 격차 리포트 이력(O107) — 담임이거나 상담을 진행한 학생만 열람. 지도 목적의 최소 정보. */}
      <Card style={{ marginBottom: 12 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>격차 리포트 이력</h3>
        {gapGate ? (
          <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.7 }}>
            {gapGate}
            <div style={{ marginTop: 4 }}>담임으로 지정되거나 이 학생과 상담을 진행하면 열람할 수 있어요.</div>
          </div>
        ) : gapHist === null ? (
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>불러오는 중…</div>
        ) : gapHist.length === 0 ? (
          <EmptyState>아직 생성된 격차 리포트가 없어요.</EmptyState>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {gapHist.map((h) => (
              <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 8, borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 62 }}>
                  {new Date(h.created_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: HIST_BAND[h.payload.gap.band] ?? 'var(--ink)' }}>{h.payload.gap.band}</span>
                <span style={{ fontSize: 13, flex: 1, minWidth: 150 }}>
                  {h.payload.target.univ} {h.payload.target.dept} · 컷 {h.payload.target.cut}{h.payload.unit.suffix}
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {h.payload.unit.label} {h.payload.generatedFor.value}{h.payload.unit.suffix}
                  {h.payload.gap.shortfall > 0 ? ` · ${h.payload.gap.shortfall} 부족` : ' · 도달'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

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
