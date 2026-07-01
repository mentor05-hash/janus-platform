import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { CreditAccount } from '../api/types';
import { PageHeader, Card, Button, Badge, ErrorText, Spinner, EmptyState } from '../components/ui';
import { StatCard, StatGrid } from '../components/dashboard/widgets';

type Plan = { id: string; name: string; price: number; membership_grade?: { name: string; weekly_credits: number; tier: string } | null };
type Sub = { id: string; plan_id: string; status: string; started_at: string } | null;
type Pay = { id: string; amount: number; status?: string | null; created_at: string };

const won = (n: number) => `${n.toLocaleString()}원`;
const CHARGE = [30000, 50000, 100000];

export function StudentMembershipPage() {
  const [acc, setAcc] = useState<CreditAccount | null>(null);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [sub, setSub] = useState<Sub>(null);
  const [pays, setPays] = useState<Pay[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  function load() {
    api.get<CreditAccount>('/credits/account').then(setAcc).catch(() => {});
    api.get<Plan[]>('/subscription/plans').then(setPlans).catch(() => setPlans([]));
    api.get<Sub>('/subscription/me').then(setSub).catch(() => setSub(null));
    api.get<Pay[]>('/payments/history').then(setPays).catch(() => setPays([]));
  }
  useEffect(load, []);

  async function subscribe(planId: string) {
    setBusy(true); setError(''); setMsg('');
    try { await api.post('/subscription/subscribe', { planId }); setMsg('구독이 적용되었습니다.'); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '구독 실패'); } finally { setBusy(false); }
  }
  async function charge(amount: number) {
    setBusy(true); setError(''); setMsg('');
    try { await api.post('/payments/charge', { amount }); setMsg(`${won(amount)} 충전되었습니다.`); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '충전 실패'); } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader title="멤버십·결제" sub="구독 플랜, 크레딧 충전과 결제 내역을 관리합니다." />
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}
      {error && <ErrorText>{error}</ErrorText>}

      <StatGrid>
        <StatCard label="보유 크레딧" value={acc ? acc.total.toLocaleString() : '…'} tone="teal" />
        <StatCard label="현재 구독" value={sub ? '구독중' : '없음'} />
      </StatGrid>

      {/* 크레딧 충전 */}
      <Card title="크레딧 충전" style={{ marginTop: 16, maxWidth: 620 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CHARGE.map((a) => <Button key={a} variant="ghost" disabled={busy} onClick={() => charge(a)}>{won(a)} 충전</Button>)}
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>모의 PG(로컬) — 실제 결제는 발생하지 않습니다.</p>
      </Card>

      {/* 구독 플랜 */}
      <h3 style={{ fontSize: 15, margin: '18px 0 8px' }}>구독 플랜</h3>
      {plans === null ? <Spinner /> : plans.length === 0 ? <Card><EmptyState>등록된 구독 플랜이 없습니다.</EmptyState></Card> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {plans.map((p) => (
            <Card key={p.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b style={{ fontSize: 15 }}>{p.name}</b>
                {p.membership_grade && <Badge kind="soft">{p.membership_grade.name}</Badge>}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--teal)', marginTop: 6 }}>{won(p.price)}<span style={{ fontSize: 13, color: 'var(--muted)' }}>/월</span></div>
              {p.membership_grade && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>주간 {p.membership_grade.weekly_credits.toLocaleString()} 크레딧</div>}
              <Button block style={{ marginTop: 10 }} disabled={busy || sub?.plan_id === p.id} onClick={() => subscribe(p.id)}>{sub?.plan_id === p.id ? '구독중' : '구독하기'}</Button>
            </Card>
          ))}
        </div>
      )}

      {/* 결제 내역 */}
      <h3 style={{ fontSize: 15, margin: '18px 0 8px' }}>결제 내역</h3>
      {pays === null ? <Spinner /> : pays.length === 0 ? <Card><EmptyState>결제 내역이 없어요.</EmptyState></Card> : (
        <Card>
          {pays.map((p) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ fontSize: 13 }}>{new Date(p.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' })} {p.status && <Badge kind="soft">{p.status}</Badge>}</span>
              <b style={{ color: 'var(--teal)' }}>{won(p.amount)}</b>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
