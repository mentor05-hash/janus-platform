import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { PageHeader, Card, Spinner, ErrorText } from '../components/ui';

// 관리자 통계 — 진단·강좌·커뮤니티 핵심 지표.
type Overview = {
  diagnostic: { attempts: number; avgScore: number; students: number };
  lecture: { active: number; enrollments: number };
  community: { posts: number; answers: number; accepted: number; acceptRate: number; leaguePromoted: number };
};

// tutor_source 파생 지표(상근 도입 전후 비교 — 정산 무개입 관측).
type SourceRow = {
  tutorSource: string; completed: number; repurchase: number; repurchaseRate: number | null;
  settleAmount: number; settleSessions: number; amountPerSession: number | null;
  reviews: number; satisfaction: number | null;
};
type TutorSourceMetric = { days: number; bySource: SourceRow[]; note: string };
const SRC_LABEL: Record<string, string> = { freelance: '프리랜서(위탁)', salaried: '상근' };
const won = (n: number) => `₩${n.toLocaleString('ko-KR')}`;
const numOrDash = (n: number | null, suffix = '') => (n == null ? '—' : `${n}${suffix}`);

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)', fontFamily: 'var(--j-font-mono)' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--caption)', marginTop: 2 }}>{sub}</div>}
    </Card>
  );
}

export function AdminStatsPage() {
  const [d, setD] = useState<Overview | null>(null);
  const [ts, setTs] = useState<TutorSourceMetric | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get<Overview>('/admin/stats/overview').then(setD).catch(() => setError('통계 조회 실패'));
    // tutor_source 지표는 부가 섹션 — 실패해도 본 대시보드는 막지 않는다.
    api.get<TutorSourceMetric>('/admin/metrics/tutor-source?days=90').then(setTs).catch(() => setTs(null));
  }, []);

  if (error) return <div><PageHeader title="지표 대시보드" /><ErrorText>{error}</ErrorText></div>;
  if (!d) return <Spinner />;

  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 };
  const th: React.CSSProperties = { textAlign: 'right', padding: '8px 12px', fontSize: 12, color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid var(--line-soft, #e5e9f0)' };
  const td: React.CSSProperties = { textAlign: 'right', padding: '9px 12px', fontSize: 13.5, color: 'var(--ink)', fontFamily: 'var(--j-font-mono)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

  return (
    <div>
      <PageHeader title="지표 대시보드" sub="진단·강좌·커뮤니티 핵심 지표를 한눈에." />

      <h3 style={{ fontSize: 14, margin: '4px 0 8px', color: 'var(--ink)' }}>🎯 실력진단</h3>
      <div style={grid}>
        <Stat label="제출 진단" value={d.diagnostic.attempts} sub={`응시 학생 ${d.diagnostic.students}명`} />
        <Stat label="평균 점수" value={`${d.diagnostic.avgScore}점`} />
      </div>

      <h3 style={{ fontSize: 14, margin: '4px 0 8px', color: 'var(--ink)' }}>◧ 강좌</h3>
      <div style={grid}>
        <Stat label="활성 강좌" value={d.lecture.active} />
        <Stat label="총 수강신청" value={d.lecture.enrollments} />
      </div>

      <h3 style={{ fontSize: 14, margin: '4px 0 8px', color: 'var(--ink)' }}>◎ 커뮤니티·리그</h3>
      <div style={grid}>
        <Stat label="질문" value={d.community.posts} />
        <Stat label="답변" value={d.community.answers} sub={`채택 ${d.community.accepted} · ${d.community.acceptRate}%`} />
        <Stat label="리그 승급자" value={d.community.leaguePromoted} sub="2부 이상" />
      </div>

      {ts && (
        <>
          <h3 style={{ fontSize: 14, margin: '18px 0 8px', color: 'var(--ink)' }}>🧑‍🏫 상담사 소스별 지표 <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--caption)' }}>(최근 {ts.days}일 · 상근 도입 전후 비교)</span></h3>
          <Card>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: 'left' }}>구분</th>
                    <th style={th}>완주</th>
                    <th style={th}>재결제</th>
                    <th style={th}>재결제율</th>
                    <th style={th}>만족도</th>
                    <th style={th}>후기</th>
                    <th style={th}>정산액</th>
                    <th style={th}>세션당</th>
                  </tr>
                </thead>
                <tbody>
                  {ts.bySource.map((r) => (
                    <tr key={r.tutorSource}>
                      <td style={{ ...td, textAlign: 'left', fontFamily: 'inherit', fontWeight: 700 }}>{SRC_LABEL[r.tutorSource] ?? r.tutorSource}</td>
                      <td style={td}>{r.completed}</td>
                      <td style={td}>{r.repurchase}</td>
                      <td style={td}>{numOrDash(r.repurchaseRate, '%')}</td>
                      <td style={td}>{r.satisfaction == null ? '—' : `${r.satisfaction} / 5`}</td>
                      <td style={td}>{r.reviews}</td>
                      <td style={td}>{won(r.settleAmount)}</td>
                      <td style={td}>{r.amountPerSession == null ? '—' : won(r.amountPerSession)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 12, color: 'var(--caption)', marginTop: 10, lineHeight: 1.6 }}>ℹ️ {ts.note}</div>
          </Card>
        </>
      )}
    </div>
  );
}
