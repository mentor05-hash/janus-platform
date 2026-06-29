import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Payroll } from '../api/types';

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

  if (error) return <p className="error">{error}</p>;
  if (!p) return <p>불러오는 중…</p>;

  const b = p.breakdown;
  return (
    <div>
      <h2 style={{ color: 'var(--teal)' }}>예상 급여</h2>
      <div style={{ display: 'flex', gap: 16 }}>
        <div className="card" style={{ flex: 1 }}>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>확정분</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--chip-done)' }}>{won(p.confirmedAmount)}</div>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>예상분(예정 포함)</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--teal)' }}>{won(p.expectedAmount)}</div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>산정 내역</h3>
        <ul style={{ lineHeight: 1.9, color: 'var(--ink)' }}>
          <li>완료 상담: {b.doneCases}건 × {won(b.perCaseRate)}</li>
          <li>예정 상담(예상): {b.upcomingCases}건</li>
          <li>채택 Q&amp;A: {b.qnaAccepted}건 × {won(b.qnaRate)}</li>
          <li>등급 수당: {won(b.gradeAllowance)}</li>
          <li>자동 인센티브: {won(p.incentive)}</li>
        </ul>
      </div>
    </div>
  );
}
