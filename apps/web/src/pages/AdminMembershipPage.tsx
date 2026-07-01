import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, Badge, ErrorText, Spinner, EmptyState } from '../components/ui';
import { StatCard, StatGrid } from '../components/dashboard/widgets';

type Grade = {
  id: string;
  name: string;
  tier: number;
  weekly_credits: number;
  expire_policy?: string | null;
  priority?: number | null;
  active?: boolean;
};
type Limits = { classifyFitLimit: number; classifyUnfitLimit: number; centerScoped?: boolean };
type Plan = {
  id: string;
  name: string;
  price: number;
  billing_cycle?: string | null;
  payer?: string | null;
  membership_grade?: { name: string; weekly_credits: number; tier: number } | null;
};

const won = (n: number) => `${n.toLocaleString()}원`;
const cycleLabel = (c?: string | null) => (c === 'monthly' ? '월간' : c === 'yearly' ? '연간' : c ?? '-');
const payerLabel = (p?: string | null) => (p === 'guardian' ? '보호자' : p === 'student' ? '학생' : p ?? '-');
const expireLabel = (e?: string | null) => (e === 'end_of_week' ? '주말 소멸(이월 없음)' : e ?? '-');

/**
 * 회원 등급·구독·주간크레딧 관리 (H4). HR·관리자 조회.
 * 등급/플랜은 정책 테이블(시드/DB)로 관리되어 읽기 전용으로 노출하고,
 * 운영 액션으로 "주간 크레딧 수동 부여"(관리자 전용)를 제공한다.
 */
export function AdminMembershipPage() {
  const [grades, setGrades] = useState<Grade[] | null>(null);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [limits, setLimits] = useState<Limits | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const g = await api.get<Grade[]>('/hr/membership-grades');
      setGrades(g);
      setEdits(Object.fromEntries(g.map((x) => [x.id, x.weekly_credits])));
      setPlans(await api.get<Plan[]>('/subscription/plans'));
      setLimits(await api.get<Limits>('/hr/limits').catch(() => null));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '조회 실패');
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function saveGrade(g: Grade, patch: { weeklyCredits?: number; active?: boolean }) {
    setMsg(''); setError('');
    try { await api.patch(`/hr/membership-grades/${g.id}`, patch); setMsg(`${g.name} 등급이 저장되었습니다. 학생 화면에 반영됩니다.`); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '등급 저장 실패'); }
  }
  async function saveLimits() {
    if (!limits) return;
    setMsg(''); setError('');
    try { await api.post('/hr/limits', { classifyFitLimit: limits.classifyFitLimit, classifyUnfitLimit: limits.classifyUnfitLimit }); setMsg('분류 한도가 저장되었습니다.'); }
    catch (e) { setError(e instanceof ApiError ? e.message : '한도 저장 실패'); }
  }

  const runWeeklyGrant = async () => {
    setBusy(true); setMsg(''); setError('');
    try {
      const r = await api.post<{ granted: number }>('/credits/run-weekly-grant', {});
      setMsg(`주간 크레딧 부여 완료 — ${r.granted}건 부여되었습니다.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '주간 부여 실패');
    } finally { setBusy(false); }
  };

  const maxWeekly = grades && grades.length ? Math.max(...grades.map((g) => g.weekly_credits)) : 0;

  return (
    <div>
      <PageHeader title="회원 등급·구독·주간크레딧" sub="멤버십 등급, 구독 플랜, 주간 크레딧 부여 정책을 관리합니다." />
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}
      {error && <ErrorText>{error}</ErrorText>}

      <StatGrid>
        <StatCard label="등급 수" value={grades ? String(grades.length) : '…'} tone="teal" />
        <StatCard label="구독 플랜" value={plans ? String(plans.length) : '…'} />
        <StatCard label="최대 주간 크레딧" value={maxWeekly ? maxWeekly.toLocaleString() : '…'} />
      </StatGrid>

      <Card style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <b style={{ fontSize: 14 }}>주간 크레딧 수동 부여</b>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>
              정기 스케줄(월 00:00 부여 / 일 24:00 소멸)과 별개로 지금 즉시 등급별 주간 크레딧을 부여합니다. 이월 없음.
            </p>
          </div>
          <Button onClick={runWeeklyGrant} loading={busy}>지금 부여 실행</Button>
        </div>
      </Card>

      <h3 style={{ fontSize: 15, margin: '20px 0 8px' }}>멤버십 등급</h3>
      {grades === null ? <Spinner /> : grades.length === 0 ? <Card><EmptyState>등급이 없습니다.</EmptyState></Card> : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--fill,#f6f8fa)', textAlign: 'left' }}>
                <th style={th}>등급</th><th style={th}>티어</th><th style={th}>주간 부여 크레딧</th><th style={th}>소멸 정책</th><th style={th}>활성</th><th style={th} />
              </tr>
            </thead>
            <tbody>
              {grades.map((g) => (
                <tr key={g.id} style={{ borderTop: '1px solid var(--line,#eceff1)' }}>
                  <td style={td}><b>{g.name}</b></td>
                  <td style={td}><Badge kind="soft">T{g.tier}</Badge></td>
                  <td style={td}>
                    <input className="input compact" style={{ width: 110, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} type="number" min={0}
                      value={edits[g.id] ?? g.weekly_credits} onChange={(e) => setEdits((p) => ({ ...p, [g.id]: Number(e.target.value) }))} />
                  </td>
                  <td style={td}>{expireLabel(g.expire_policy)}</td>
                  <td style={td}>
                    <button onClick={() => saveGrade(g, { active: !(g.active ?? true) })}
                      style={{ cursor: 'pointer', border: 'none', borderRadius: 7, padding: '3px 10px', fontSize: 12, fontWeight: 700, background: (g.active ?? true) ? 'var(--chip-done-bg,#ECF8EF)' : 'var(--fill,#f1f5f7)', color: (g.active ?? true) ? 'var(--chip-done,#15803D)' : 'var(--muted)' }}>
                      {(g.active ?? true) ? 'ON' : 'OFF'}
                    </button>
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <Button size="sm" disabled={(edits[g.id] ?? g.weekly_credits) === g.weekly_credits} onClick={() => saveGrade(g, { weeklyCredits: edits[g.id] })}>저장</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {limits && (
        <Card title="분류 한도 (학생 화면이 읽음)" style={{ marginTop: 20, maxWidth: 460 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
            <span style={{ fontSize: 13 }}>나와 맞는 선생님</span>
            <input className="input compact" style={{ width: 90, textAlign: 'right' }} type="number" min={0} value={limits.classifyFitLimit} onChange={(e) => setLimits({ ...limits, classifyFitLimit: Number(e.target.value) })} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--line)' }}>
            <span style={{ fontSize: 13 }}>맞지 않는 선생님</span>
            <input className="input compact" style={{ width: 90, textAlign: 'right' }} type="number" min={0} value={limits.classifyUnfitLimit} onChange={(e) => setLimits({ ...limits, classifyUnfitLimit: Number(e.target.value) })} />
          </div>
          <Button style={{ marginTop: 10 }} onClick={saveLimits} disabled={limits.centerScoped === false}>한도 저장</Button>
          {limits.centerScoped === false && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>센터 소속 HR만 저장할 수 있습니다(본사 계정은 조회만).</p>}
        </Card>
      )}

      <h3 style={{ fontSize: 15, margin: '20px 0 8px' }}>구독 플랜</h3>
      {plans === null ? <Spinner /> : plans.length === 0 ? <Card><EmptyState>플랜이 없습니다.</EmptyState></Card> : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--fill,#f6f8fa)', textAlign: 'left' }}>
                <th style={th}>플랜</th><th style={th}>가격</th><th style={th}>결제주기</th><th style={th}>납부자</th><th style={th}>연결 등급</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--line,#eceff1)' }}>
                  <td style={td}><b>{p.name}</b></td>
                  <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{won(p.price)}</td>
                  <td style={td}>{cycleLabel(p.billing_cycle)}</td>
                  <td style={td}>{payerLabel(p.payer)}</td>
                  <td style={td}>{p.membership_grade ? `${p.membership_grade.name} · 주 ${p.membership_grade.weekly_credits.toLocaleString()}C` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: '10px 12px', fontWeight: 700, color: 'var(--muted)' };
const td: React.CSSProperties = { padding: '10px 12px' };
