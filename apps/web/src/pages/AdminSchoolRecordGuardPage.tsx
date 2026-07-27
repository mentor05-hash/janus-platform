import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { isHq } from '../auth/roleHome';
import { PageHeader, Card, Button, Badge, ErrorText, EmptyState } from '../components/ui';
import type { SrGuardToggle, SrGuardStats, SrGuardAppeal } from '../api/types';

/* 생기부 가드 관리자 콘솔(지시서 §6 스텝3) — 차단 통계(사유 코드별)·이의 큐·컨설팅 업로드 토글.
 * 무취급: 화면에 파일명·내용은 없다. 사유 코드·표면·시각 등 메타만 표시. */

const REASON_LABEL: Record<string, string> = {
  SR_FILENAME: '파일명 감지',
  SR_KEYWORD: '서식 키워드',
  SR_VISION: '이미지(비전)',
  SR_UNSURE: '유보(보수적 차단)',
  CONSULTING_UPLOAD_DISABLED: '컨설팅 정책(생기부)',
};
const SURFACE_LABEL: Record<string, string> = {
  upload: '일반 업로드',
  scores_ocr: '성적표 OCR',
  consulting_intake: '컨설팅 접수',
  qna_escalation: '상담 이관',
  unknown: '기타',
};
const STATUS_LABEL: Record<string, string> = {
  open: '접수',
  reviewing: '검토 중',
  resolved: '해결',
  rejected: '반려',
};
const rLabel = (r: string) => REASON_LABEL[r] ?? r;
const sLabel = (s: string) => SURFACE_LABEL[s] ?? s;
const fmt = (s: string | null) =>
  s ? new Date(s).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export function AdminSchoolRecordGuardPage() {
  const { user } = useAuth();
  const hq = isHq(user);
  const [toggle, setToggle] = useState<SrGuardToggle | null>(null);
  const [stats, setStats] = useState<SrGuardStats | null>(null);
  const [appeals, setAppeals] = useState<SrGuardAppeal[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const [tg, st, ap] = await Promise.all([
        api.get<SrGuardToggle>('/admin/school-record-guard/consulting-toggle'),
        api.get<SrGuardStats>('/admin/school-record-guard/stats'),
        api.getPage<SrGuardAppeal>('/admin/school-record-guard/appeals'),
      ]);
      setToggle(tg);
      setStats(st);
      setAppeals(ap.data);
      setOpenCount((ap.meta as { openCount?: number })?.openCount ?? 0);
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '조회 실패');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function flipToggle() {
    if (!toggle) return;
    setBusy('toggle');
    setMsg('');
    setError('');
    try {
      const next = await api.put<SrGuardToggle>('/admin/school-record-guard/consulting-toggle', { enabled: !toggle.enabled });
      setToggle(next);
      setMsg(`컨설팅 신규 생기부 업로드를 ${next.enabled ? '차단(비활성)' : '허용(활성)'}했습니다.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '변경 실패');
    } finally {
      setBusy('');
    }
  }

  async function setStatus(id: string, status: SrGuardAppeal['status']) {
    setBusy(id);
    try {
      await api.patch(`/admin/school-record-guard/appeals/${id}`, { status });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '처리 실패');
    } finally {
      setBusy('');
    }
  }

  const on = toggle?.enabled ?? false;

  return (
    <div>
      <PageHeader
        title="생기부 가드"
        sub="학교생활기록부 업로드 차단 통계와 이의 신고, 컨설팅 접수의 신규 생기부 업로드 정책을 관리합니다."
      />
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}
      <ErrorText>{error}</ErrorText>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 16, alignItems: 'start' }}>
        {/* 컨설팅 업로드 토글 */}
        <Card title="컨설팅 신규 생기부 업로드">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Badge kind={on ? 'danger' : 'soft'}>{on ? '차단됨(비활성)' : '허용(활성)'}</Badge>
            {toggle?.isDefault && <Badge kind="soft">기본값</Badge>}
            {toggle?.source === 'scheduler' && <Badge kind="soft">자동 활성</Badge>}
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 10px' }}>
            토글을 켜면 컨설팅 접수에서 <strong>신규 생기부(student_record) 업로드</strong>가 거부됩니다. 성적표·기존 저장분·다운로드는
            영향받지 않습니다. 법령(제25조의2) 시행일{' '}
            <strong>{toggle ? new Date(toggle.activationAt).toLocaleDateString('ko-KR') : '2026. 7. 29.'}</strong>{' '}
            00:00(KST)에 자동으로 활성화됩니다.
          </p>
          {toggle?.autoActivatedAt && (
            <p style={{ fontSize: 12, color: 'var(--caption)', margin: '0 0 10px' }}>
              자동 활성 발화: {fmt(toggle.autoActivatedAt)}
            </p>
          )}
          <Button size="sm" variant={on ? 'ghost' : 'primary'} loading={busy === 'toggle'} disabled={!hq} onClick={flipToggle}>
            {on ? '허용으로 전환' : '지금 차단(비활성화)'}
          </Button>
          {!hq && <p style={{ fontSize: 12, color: 'var(--caption)', marginTop: 8 }}>· 변경은 본사 마스터관리자만 가능합니다(열람 전용).</p>}
        </Card>

        {/* 차단 통계 */}
        <Card title={`차단 통계 (총 ${stats?.total ?? 0}건)`}>
          {!stats || stats.total === 0 ? (
            <EmptyState>집계된 차단이 없습니다.</EmptyState>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>사유 코드별</div>
                {stats.byReason.map((r) => (
                  <div key={r.reason} style={rowStyle}>
                    <span>{rLabel(r.reason)}</span>
                    <strong>{r.count}</strong>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>표면(경로)별</div>
                {stats.bySurface.map((s) => (
                  <div key={s.surface} style={rowStyle}>
                    <span>{sLabel(s.surface)}</span>
                    <strong>{s.count}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* 이의 신고 큐 */}
      <Card title={`이의 신고 큐${openCount ? ` · 미처리 ${openCount}건` : ''}`} style={{ marginTop: 16 }}>
        {appeals.length === 0 ? (
          <EmptyState>접수된 이의 신고가 없습니다.</EmptyState>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {appeals.map((a) => (
              <div key={a.id} style={{ borderBottom: '1px solid var(--line-soft)', paddingBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, flexWrap: 'wrap' }}>
                  <Badge kind={a.status === 'open' ? 'danger' : a.status === 'resolved' ? 'done' : 'soft'}>
                    {STATUS_LABEL[a.status] ?? a.status}
                  </Badge>
                  <Badge kind="soft">{rLabel(a.reason)}</Badge>
                  {a.surface && <span style={{ color: 'var(--muted)' }}>{sLabel(a.surface)}</span>}
                  <span style={{ color: 'var(--caption)' }}>{a.actorRole ?? '—'}</span>
                  <span style={{ color: 'var(--caption)', marginLeft: 'auto' }}>{fmt(a.createdAt)}</span>
                </div>
                {a.note && <p style={{ fontSize: 13, color: 'var(--text)', margin: '6px 0 0' }}>“{a.note}”</p>}
                {a.resolution && <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>처리: {a.resolution}</p>}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <Button size="sm" variant="ghost" loading={busy === a.id} disabled={a.status === 'reviewing'} onClick={() => setStatus(a.id, 'reviewing')}>검토 중</Button>
                  <Button size="sm" variant="ghost" loading={busy === a.id} disabled={a.status === 'resolved'} onClick={() => setStatus(a.id, 'resolved')}>해결</Button>
                  <Button size="sm" variant="ghost" loading={busy === a.id} disabled={a.status === 'rejected'} onClick={() => setStatus(a.id, 'rejected')}>반려</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: 13,
  padding: '5px 0',
  borderBottom: '1px solid var(--line-soft)',
};
