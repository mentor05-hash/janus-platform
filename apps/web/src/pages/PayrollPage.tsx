import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Payroll } from '../api/types';
import { PageHeader, Card, Spinner, ErrorText } from '../components/ui';
import { StatCard, StatGrid } from '../components/dashboard/widgets';

const won = (n: number) => `${n.toLocaleString()}원`;

export function PayrollPage() {
  const { user } = useAuth();
  const [p, setP] = useState<Payroll | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<Payroll>(`/teachers/${user!.id}/payroll`)
      .then(setP)
      .catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, [user]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!p) return <Spinner />;

  const b = p.breakdown;
  return (
    <div>
      <PageHeader title="예상 급여" />
      <StatGrid>
        <StatCard label="확정분" value={won(p.confirmedAmount)} tone="teal" />
        <StatCard label="예상분(예정 포함)" value={won(p.expectedAmount)} tone="teal" />
      </StatGrid>
      <Card title="산정 내역" style={{ marginTop: 16 }}>
        <ul style={{ lineHeight: 1.9, color: 'var(--ink)', margin: 0 }}>
          <li>완료 상담: {b.doneCases}건 × {won(b.perCaseRate)}</li>
          <li>예정 상담(예상): {b.upcomingCases}건</li>
          <li>채택 Q&amp;A: {b.qnaAccepted}건 × {won(b.qnaRate)}</li>
          <li>등급 수당: {won(b.gradeAllowance)}</li>
          <li>자동 인센티브: {won(p.incentive)}</li>
        </ul>
      </Card>
    </div>
  );
}
