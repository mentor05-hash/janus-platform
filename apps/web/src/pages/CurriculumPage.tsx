import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Badge, ErrorText, Spinner } from '../components/ui';

// 주간 학습 플랜 — 진단 약점 + 성적 → 우선순위 처방 카드.
type PlanItem = { order: number; subject: string; unit: string; rate: number; focus: string; actions: string[] };
type Plan = {
  headline: string;
  score: { label: string; hasScore: boolean };
  items: PlanItem[];
  hasDiagnostic: boolean;
  latestAttemptId: string | null;
};

export function CurriculumPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Plan>('/curriculum/me').then(setPlan).catch((e) => setError(e instanceof ApiError ? e.message : '플랜 조회 실패'));
  }, []);

  if (error) return <div><PageHeader title="학습 플랜" /><ErrorText>{error}</ErrorText></div>;
  if (!plan) return <Spinner />;

  return (
    <div>
      <PageHeader title="학습 플랜" sub="실력진단 약점과 성적을 묶어, 이번 주 무엇부터 할지 순서대로 처방해요." />

      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginBottom: 6 }}>{plan.headline}</div>
        <div style={{ fontSize: 13, color: plan.score.hasScore ? 'var(--muted)' : 'var(--danger, #dc2626)' }}>
          📊 {plan.score.label}
          {!plan.score.hasScore && <> · <Link to="/student/scores/input" style={{ color: 'inherit' }}>지금 입력 →</Link></>}
        </div>
      </Card>

      {plan.items.length === 0 ? (
        <Card>
          <div style={{ fontSize: 14, color: 'var(--ink)', marginBottom: 10 }}>
            아직 처방할 약점이 없어요. 실력진단을 먼저 보면 여기에 이번 주 플랜이 만들어져요.
          </div>
          <Link to="/student/diagnostic" className="btn" style={{ textDecoration: 'none' }}>실력진단 하러 가기 →</Link>
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {plan.items.map((it) => (
            <Card key={it.order} style={{ borderLeft: '3px solid var(--j-blue)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <span style={{ width: 22, height: 22, borderRadius: 999, background: 'var(--j-blue)', color: '#fff', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{it.order}</span>
                <Badge kind="new">{it.subject}</Badge><Badge kind="soft">{it.unit}</Badge>
                <span style={{ fontSize: 12, color: 'var(--danger, #dc2626)' }}>정답률 {it.rate}%</span>
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--ink)', marginBottom: 10 }}>{it.focus}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Link to={`/student/community/board?subject=${encodeURIComponent(it.subject)}`} className="btn sm outline" style={{ textDecoration: 'none' }}>이 과목 질문하기</Link>
                <Link to={`/student/materials?subject=${encodeURIComponent(it.subject)}`} className="btn sm outline" style={{ textDecoration: 'none' }}>자료 찾기</Link>
                <Link to={`/student/lectures?subject=${encodeURIComponent(it.subject)}`} className="btn sm outline" style={{ textDecoration: 'none' }}>강좌 보기</Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
