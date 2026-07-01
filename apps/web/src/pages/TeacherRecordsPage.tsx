import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { ConsultationNote, RecordOverview, TeacherStudent } from '../api/types';
import { PageHeader, Card, Badge, ErrorText, Spinner, EmptyState, TextField } from '../components/ui';

const GAP_BADGE: Record<RecordOverview['homeroomGap']['level'], { kind: 'done' | 'noshow' | 'danger' | 'soft'; label: string }> = {
  ok: { kind: 'done', label: '담임 정상' },
  warn: { kind: 'noshow', label: '담임 공백 주의' },
  danger: { kind: 'danger', label: '담임 공백 위험' },
  none: { kind: 'soft', label: '담임 상담 이력 없음' },
};
const KST = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' }) : '');

export function TeacherRecordsPage() {
  const [students, setStudents] = useState<TeacherStudent[] | null>(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<TeacherStudent | null>(null);
  const [notes, setNotes] = useState<ConsultationNote[] | null>(null);
  const [overview, setOverview] = useState<RecordOverview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<TeacherStudent[]>('/me/students').then(setStudents).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, []);
  useEffect(() => {
    if (!sel) { setNotes(null); setOverview(null); return; }
    setNotes(null);
    api.get<ConsultationNote[]>(`/students/${sel.studentId}/notes`).then(setNotes).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
    api.get<RecordOverview>(`/students/${sel.studentId}/record-overview`).then(setOverview).catch(() => setOverview(null));
  }, [sel]);

  const rows = useMemo(() => (students ?? []).filter((s) => !q.trim() || s.name.includes(q.trim())), [students, q]);
  const gap = overview && GAP_BADGE[overview.homeroomGap.level];

  return (
    <div>
      <PageHeader title="상담 기록 · 학생 뷰어" sub="소속 센터 학생의 상담 기록을 열람합니다. 타 선생님 기록도 권한 범위에서 열람하되 내부 메모는 작성자만 볼 수 있어요." />
      {error && <ErrorText>{error}</ErrorText>}
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        {/* 학생 리스트 */}
        <Card style={{ width: 240, flexShrink: 0 }}>
          <TextField label="학생 검색" placeholder="이름" value={q} onChange={(e) => setQ(e.target.value)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8, maxHeight: 520, overflow: 'auto' }}>
            {students === null ? <Spinner /> : rows.length === 0 ? <EmptyState>학생이 없어요.</EmptyState> : rows.map((s) => (
              <button key={s.studentId} onClick={() => setSel(s)} style={{ all: 'unset', cursor: 'pointer', padding: '9px 11px', borderRadius: 9, fontSize: 13, fontWeight: 600,
                background: sel?.studentId === s.studentId ? 'var(--teal-50,#e0f5f7)' : 'transparent', color: sel?.studentId === s.studentId ? 'var(--teal)' : 'var(--ink)' }}>
                {s.name} {s.isHomeroom && <Badge kind="done">담임</Badge>}
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>누적 {s.totalConsult}회</div>
              </button>
            ))}
          </div>
        </Card>

        {/* 선택 학생 상세 */}
        <div style={{ flex: 1 }}>
          {!sel ? <Card><EmptyState>왼쪽에서 학생을 선택하세요.</EmptyState></Card> : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <h3 style={{ fontSize: 16, margin: 0 }}>{sel.name}</h3>
                {sel.isHomeroom && <Badge kind="done">담임</Badge>}
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>누적 {sel.totalConsult}회</span>
              </div>

              {overview && (
                <Card style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {gap && <Badge kind={gap.kind}>{gap.label}</Badge>}
                    {overview.homeroomGap.daysSince != null && <span style={{ fontSize: 13, color: 'var(--muted)' }}>마지막 담임 상담 {overview.homeroomGap.daysSince}일 경과</span>}
                    <Badge kind={overview.rejectCount > 0 ? 'rejected' : 'soft'}>거부 {overview.rejectCount}건</Badge>
                    <Badge kind={(overview.noshowCount ?? 0) > 0 ? 'noshow' : 'soft'}>노쇼 {overview.noshowCount ?? 0}건</Badge>
                  </div>
                </Card>
              )}

              {/* 타임라인 */}
              {notes === null ? <Spinner /> : notes.length === 0 ? <Card><EmptyState>상담 기록이 없어요.</EmptyState></Card> : (
                <div style={{ borderLeft: '2px solid var(--line)', marginLeft: 6, paddingLeft: 16 }}>
                  {notes.map((n) => (
                    <div key={n.bookingId} style={{ position: 'relative', paddingBottom: 16 }}>
                      <span style={{ position: 'absolute', left: -23, top: 4, width: 10, height: 10, borderRadius: 5, background: 'var(--teal)' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <b style={{ fontSize: 12, color: 'var(--muted)' }}>{KST(n.createdAt)} · {n.consultType ?? '상담'}</b>
                        {n.teacherName && <Badge kind="soft">{n.teacherName}{n.isMine ? ' · 나' : ''}</Badge>}
                        <Badge kind={n.saveState === 'final' ? 'done' : 'confirmed'}>{n.saveState === 'final' ? '최종' : '임시'}</Badge>
                      </div>
                      {n.coreSummary && <div style={{ fontSize: 14, marginTop: 4 }}><b>핵심 요약</b> · {n.coreSummary}</div>}
                      {n.homework && <div style={{ fontSize: 13, marginTop: 2 }}><b>숙제</b> · {n.homework}</div>}
                      {n.futureDir && <div style={{ fontSize: 13 }}><b>향후 방향</b> · {n.futureDir}</div>}
                      {n.memo != null ? <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>내부메모 · {n.memo}</div>
                        : !n.isMine && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>🔒 내부메모는 작성 선생님만 볼 수 있어요.</div>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
