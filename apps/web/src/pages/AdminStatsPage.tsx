import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { PageHeader, Card, Spinner, ErrorText } from '../components/ui';

// 관리자 통계 — 진단·강좌·커뮤니티 핵심 지표.
type Overview = {
  diagnostic: { attempts: number; avgScore: number; students: number };
  lecture: { active: number; enrollments: number };
  community: { posts: number; answers: number; accepted: number; acceptRate: number; leaguePromoted: number };
};

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
  const [error, setError] = useState('');
  useEffect(() => { api.get<Overview>('/admin/stats/overview').then(setD).catch(() => setError('통계 조회 실패')); }, []);

  if (error) return <div><PageHeader title="지표 대시보드" /><ErrorText>{error}</ErrorText></div>;
  if (!d) return <Spinner />;

  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 };

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
    </div>
  );
}
