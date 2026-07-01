import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Payroll } from '../api/types';
import { PageHeader, Card, Spinner, ErrorText, Badge } from '../components/ui';
import { StatCard, StatGrid } from '../components/dashboard/widgets';

const won = (n: number) => `${n.toLocaleString()}원`;
const GRADE_ORDER = ['S', 'A', 'B', 'C'];

export function PayrollPage() {
  const { user } = useAuth();
  const [p, setP] = useState<Payroll | null>(null);
  const [view, setView] = useState<'confirmed' | 'expected'>('confirmed');
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
  const grades = Object.keys(p.gradeTable).sort((a, c) => (GRADE_ORDER.indexOf(a) + 1 || 99) - (GRADE_ORDER.indexOf(c) + 1 || 99));
  const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 700, color: 'var(--muted)', borderBottom: '1px solid var(--line)' };
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid var(--line)' };

  return (
    <div>
      <PageHeader title="급여 · 예상급여" sub="정산 주기 월 1회 기본(카테고리별 변경 가능) · 자동 인센티브 적용" />

      {/* 확정 / 예상 토글 */}
      <div style={{ display: 'inline-flex', background: 'var(--fill,#eef2f4)', borderRadius: 10, padding: 3, marginBottom: 14 }}>
        {([['confirmed', '확정(완료분)'], ['expected', '예상(예약 포함)']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setView(v)} style={{ border: 'none', cursor: 'pointer', padding: '7px 18px', borderRadius: 8, fontWeight: 700, fontSize: 13,
            background: view === v ? '#fff' : 'transparent', color: view === v ? 'var(--teal)' : 'var(--muted)', boxShadow: view === v ? '0 1px 2px rgba(0,0,0,.08)' : 'none' }}>{l}</button>
        ))}
      </div>

      <StatGrid>
        <StatCard label={view === 'confirmed' ? '이번 달 확정' : '이번 달 예상(예정 포함)'} value={won(view === 'confirmed' ? p.confirmedAmount : p.expectedAmount)} tone="teal" />
        <StatCard label="자동 인센티브" value={`${won(p.incentive)} · ${p.incentiveOn ? 'ON' : 'OFF'}`} />
      </StatGrid>

      <Card title="산정 내역" style={{ marginTop: 16 }}>
        <ul style={{ lineHeight: 1.9, color: 'var(--ink)', margin: 0 }}>
          <li>완료 상담: {b.doneCases}건 × {won(b.perCaseRate)}</li>
          {view === 'expected' && <li>예정 상담(예상): {b.upcomingCases}건 × {won(b.perCaseRate)}</li>}
          <li>채택 Q&amp;A: {b.qnaAccepted}건 × {won(b.qnaRate)}</li>
          {(b.hourlyRate > 0 || b.workHoursPay > 0) && <li>근무시간 기반: {Math.round(b.workMinutes / 6) / 10}시간 × {won(b.hourlyRate)} = {won(b.workHoursPay)}</li>}
          {(b.staleAnswerBonus > 0 || b.staleBonus > 0) && <li>48시간 미답 보상: {b.staleAnswerCount}건 × {won(b.staleAnswerBonus)} = {won(b.staleBonus)}</li>}
          <li>등급 수당({p.grade}급): {won(b.gradeAllowance)}</li>
          <li>자동 인센티브: {won(p.incentive)} {p.incentiveOn ? <Badge kind="done">ON</Badge> : <Badge kind="soft">OFF</Badge>}</li>
        </ul>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>근무시간 시급·48시간 미답 보상·자동 인센티브는 관리자 정책에서 관리됩니다.</p>
      </Card>

      {grades.length > 0 && (
        <Card title="등급별 급여표" style={{ marginTop: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>등급</th><th style={th}>건당 요율</th><th style={th}>Q&amp;A 요율</th><th style={th}>등급 수당</th></tr></thead>
            <tbody>
              {grades.map((g) => (
                <tr key={g} style={g === p.grade ? { background: 'var(--teal-50,#F0F7FA)' } : undefined}>
                  <td style={td}><b>{g}{g === p.grade ? ' (내 등급)' : ''}</b></td>
                  <td style={td}>{won(p.rates.perCaseRate)}</td>
                  <td style={td}>{won(p.rates.qnaRate)}</td>
                  <td style={td}>{won(p.gradeTable[g])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
