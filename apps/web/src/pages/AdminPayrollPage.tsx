import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, Badge, Spinner, ErrorText, EmptyState } from '../components/ui';
import { StatCard, StatGrid } from '../components/dashboard/widgets';
import { printPayslip } from './PayrollPage';

const won = (n: number) => `${n.toLocaleString()}원`;
type Report = {
  period: string; headcount: number; gross: number; net: number; paid: number; pending: number;
  deductions: Record<string, number>;
  byCenter: { center: string; count: number; gross: number; net: number; paid: number }[];
  rows: { teacherId: string; name: string; center: string; gross: number; net: number; status: string }[];
};
type Teacher = { id: string; name: string; grade: string; subjects: string[] };
const thisMonth = () => new Date().toISOString().slice(0, 7);
const DED = ['국민연금', '건강보험', '장기요양', '고용보험', '소득세', '지방소득세'];

export function AdminPayrollPage() {
  const [period, setPeriod] = useState(thisMonth());
  const [rep, setRep] = useState<Report | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setRep(await api.get<Report>(`/admin/payroll/report?period=${period}`));
      setError('');
    } catch (e) { setError(e instanceof ApiError ? e.message : '조회 실패'); }
  }, [period]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { api.get<Teacher[]>('/teachers?size=100').then(setTeachers).catch(() => {}); }, []);

  async function settle(id: string) {
    setBusy(id); setMsg(''); setError('');
    try { await api.post(`/teachers/${id}/payroll/settle`); setMsg('정산 확정됨.'); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '정산 실패'); } finally { setBusy(null); }
  }
  async function pay(id: string) {
    setBusy(id); setMsg(''); setError('');
    try { await api.post(`/teachers/${id}/payroll/pay?period=${period}`); setMsg('지급 완료 처리됨.'); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '지급 실패'); } finally { setBusy(null); }
  }
  async function openPayslip(id: string) {
    try { const ps = await api.get<Parameters<typeof printPayslip>[0]>(`/teachers/${id}/payroll/payslip?period=${period}`); printPayslip(ps); }
    catch (e) { setError(e instanceof ApiError ? e.message : '명세서 조회 실패'); }
  }

  const settledIds = new Set(rep?.rows.map((r) => r.teacherId) ?? []);
  const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: 'var(--fill,#f4f7fb)' };
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, borderTop: '1px solid var(--line)' };

  if (!rep) return <Spinner />;
  return (
    <div>
      <PageHeader title="급여 정산 · 재무 리포트" sub="원천징수·4대보험 공제 반영 · 정산 확정 → 지급완료" />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input className="input" style={{ width: 140 }} type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        {msg && <span style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</span>}
      </div>
      <ErrorText>{error}</ErrorText>

      <StatGrid>
        <StatCard label="정산 인원" value={`${rep.headcount}명`} />
        <StatCard label="지급 총액(세전)" value={won(rep.gross)} />
        <StatCard label="실지급 합계" value={won(rep.net)} tone="teal" />
        <StatCard label="지급완료 / 대기" value={`${won(rep.paid)} / ${won(rep.pending)}`} />
      </StatGrid>

      <Card title="공제 합계(원천징수·4대보험)" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
          {DED.map((k) => (
            <div key={k} style={{ color: 'var(--muted)' }}>{k} <b style={{ color: 'var(--ink)' }}>{won(rep.deductions[k] ?? 0)}</b></div>
          ))}
          <div style={{ fontWeight: 800 }}>공제 합계 {won(rep.deductions.total ?? 0)}</div>
        </div>
      </Card>

      {rep.byCenter.length > 0 && (
        <Card title="센터별" style={{ marginTop: 16, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>센터</th><th style={th}>인원</th><th style={th}>세전</th><th style={th}>실지급</th><th style={th}>지급완료</th></tr></thead>
            <tbody>
              {rep.byCenter.map((c) => (
                <tr key={c.center}><td style={td}><b>{c.center}</b></td><td style={td}>{c.count}</td><td style={td}>{won(c.gross)}</td><td style={td}>{won(c.net)}</td><td style={td}>{won(c.paid)}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card title="선생님 정산" style={{ marginTop: 16, padding: 0, overflow: 'hidden' }}>
        {teachers.length === 0 ? <EmptyState>선생님이 없습니다.</EmptyState> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>선생님</th><th style={th}>상태</th><th style={th}>실지급</th><th style={{ ...th, textAlign: 'right' }} /></tr></thead>
            <tbody>
              {teachers.map((t) => {
                const r = rep.rows.find((x) => x.teacherId === t.id);
                return (
                  <tr key={t.id}>
                    <td style={td}><b>{t.name}</b> <span style={{ color: 'var(--muted)', fontSize: 12 }}>{t.subjects?.[0]}</span></td>
                    <td style={td}>{r ? <Badge kind={r.status === 'paid' ? 'done' : 'confirmed'}>{r.status === 'paid' ? '지급완료' : '정산확정'}</Badge> : <Badge kind="soft">미정산</Badge>}</td>
                    <td style={td}>{r ? won(r.net) : '-'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <span style={{ display: 'inline-flex', gap: 6 }}>
                        <Button size="sm" variant="ghost" onClick={() => settle(t.id)} disabled={busy === t.id}>정산 확정</Button>
                        {r && <Button size="sm" variant="ghost" onClick={() => openPayslip(t.id)}>명세서</Button>}
                        {r && r.status !== 'paid' && <Button size="sm" onClick={() => pay(t.id)} disabled={busy === t.id}>지급완료</Button>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      {settledIds.size > 0 && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>실지급은 데모(가상 이체)로, 상태만 전환됩니다.</p>}
    </div>
  );
}
