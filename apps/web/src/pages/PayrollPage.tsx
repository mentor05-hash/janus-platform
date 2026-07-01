import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Payroll } from '../api/types';
import { PageHeader, Card, Spinner, ErrorText, Badge } from '../components/ui';
import { StatCard, StatGrid } from '../components/dashboard/widgets';

const won = (n: number) => `${n.toLocaleString()}원`;
const GRADE_ORDER = ['S', 'A', 'B', 'C'];

type Deductions = { 국민연금: number; 건강보험: number; 장기요양: number; 고용보험: number; 소득세: number; 지방소득세: number; total: number; net: number };
type Payslip = { period: string; teacherName: string; center: string; status: string; paidAt: string | null; gross: number; deductions: Deductions | null; net: number };
const DED_ROWS: (keyof Deductions)[] = ['국민연금', '건강보험', '장기요양', '고용보험', '소득세', '지방소득세'];

/** 명세서를 인쇄용 새 창으로 열어 브라우저에서 PDF로 저장. */
export function printPayslip(ps: Payslip) {
  const d = ps.deductions;
  const rows = d ? DED_ROWS.map((k) => `<tr><td>${k}</td><td style="text-align:right">- ${d[k].toLocaleString()}원</td></tr>`).join('') : '';
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>급여명세서 ${ps.period}</title>
  <style>body{font-family:'Pretendard',-apple-system,system-ui,sans-serif;color:#16242b;padding:32px;max-width:640px;margin:0 auto}
  h1{font-size:20px;margin:0 0 4px}.muted{color:#52656d;font-size:13px}
  table{width:100%;border-collapse:collapse;margin-top:16px}td{padding:8px 4px;border-bottom:1px solid #e7ecef;font-size:14px}
  .tot{font-weight:800}.net{font-size:18px;color:#0e5c7c;font-weight:800}
  .box{border:1px solid #e7ecef;border-radius:10px;padding:16px;margin-top:16px}
  @media print{button{display:none}}</style></head><body>
  <h1>급여명세서</h1><div class="muted">${ps.center} · ${ps.teacherName} 선생님 · ${ps.period} · 상태: ${ps.status === 'paid' ? '지급완료' : '정산확정'}</div>
  <div class="box"><table>
  <tr><td>지급 총액(세전)</td><td style="text-align:right" class="tot">${ps.gross.toLocaleString()}원</td></tr>
  ${rows}
  <tr><td class="tot">공제 합계</td><td style="text-align:right" class="tot">- ${(d?.total ?? 0).toLocaleString()}원</td></tr>
  <tr><td class="net">실지급액</td><td style="text-align:right" class="net">${ps.net.toLocaleString()}원</td></tr>
  </table></div>
  <p class="muted" style="margin-top:14px">본 명세서는 데모 산정 기준(원천징수·4대보험 근사)으로 생성되었습니다.</p>
  <button onclick="window.print()" style="margin-top:16px;padding:10px 20px;border:none;background:#0e5c7c;color:#fff;border-radius:8px;font-weight:700;cursor:pointer">PDF로 저장 / 인쇄</button>
  </body></html>`;
  const w = window.open('', '_blank', 'width=720,height=800');
  if (w) { w.document.write(html); w.document.close(); }
}

export function PayrollPage() {
  const { user } = useAuth();
  const [p, setP] = useState<Payroll | null>(null);
  const [payslip, setPayslip] = useState<Payslip | null>(null);
  const [view, setView] = useState<'confirmed' | 'expected'>('confirmed');
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<Payroll>(`/teachers/${user!.id}/payroll`)
      .then(setP)
      .catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
    api.get<Payslip>(`/teachers/${user!.id}/payroll/payslip`).then(setPayslip).catch(() => setPayslip(null));
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

      {payslip && payslip.deductions && (
        <Card title={`정산 명세 (${payslip.period})`} style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Badge kind={payslip.status === 'paid' ? 'done' : 'confirmed'}>{payslip.status === 'paid' ? '지급완료' : '정산확정'}</Badge>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{payslip.paidAt ? `${new Date(payslip.paidAt).toLocaleDateString('ko-KR')} 지급` : '지급 대기'}</span>
          </div>
          <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>지급 총액(세전)</span><b>{won(payslip.gross)}</b></div>
            {DED_ROWS.map((k) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}><span>{k}</span><span>- {won(payslip.deductions![k])}</span></div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 6, marginTop: 2 }}><span>공제 합계</span><b>- {won(payslip.deductions.total)}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: 'var(--teal)', fontWeight: 800 }}><span>실지급액</span><span>{won(payslip.net)}</span></div>
          </div>
          <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={() => printPayslip(payslip)}>명세서 인쇄 / PDF 저장</button>
        </Card>
      )}

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
