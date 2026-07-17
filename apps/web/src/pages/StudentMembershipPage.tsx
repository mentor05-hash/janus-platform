import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { CreditAccount } from '../api/types';
import { PageHeader, Card, Button, Badge, ErrorText, Spinner, EmptyState } from '../components/ui';
import { StatCard, StatGrid } from '../components/dashboard/widgets';

type Plan = { id: string; name: string; price: number; membership_grade?: { name: string; weekly_credits: number; tier: string } | null };
type Sub = { id: string; plan_id: string; status: string; started_at: string } | null;
type Pay = { id: string; amount: number; status?: string | null; created_at: string };
type Ent = { productKey: string | null; label: string; services: string[]; grantedAt: string; expiresAt: string | null; daysRemaining: number | null; active: boolean; source: string };
type MyEnt = { active: Ent[]; expired: Ent[] };

const entDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '무기한');

const won = (n: number) => `${n.toLocaleString()}원`;
const CHARGE = [30000, 50000, 100000];

export function StudentMembershipPage() {
  const [acc, setAcc] = useState<CreditAccount | null>(null);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [sub, setSub] = useState<Sub>(null);
  const [pays, setPays] = useState<Pay[] | null>(null);
  const [ent, setEnt] = useState<MyEnt | null>(null);
  const [redeemCode, setRedeemCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [payMethod, setPayMethod] = useState<'card' | 'voucher'>('card');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  function load() {
    api.get<CreditAccount>('/credits/account').then(setAcc).catch(() => {});
    api.get<Plan[]>('/subscription/plans').then(setPlans).catch(() => setPlans([]));
    api.get<Sub>('/subscription/me').then(setSub).catch(() => setSub(null));
    api.get<Pay[]>('/payments/history').then(setPays).catch(() => setPays([]));
    api.get<MyEnt>('/me/entitlements').then(setEnt).catch(() => setEnt({ active: [], expired: [] }));
  }
  useEffect(load, []);

  async function subscribe(planId: string) {
    setBusy(true); setError(''); setMsg('');
    try { await api.post('/subscription/subscribe', { planId }); setMsg('구독이 적용되었습니다.'); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '구독 실패'); } finally { setBusy(false); }
  }
  async function charge(amount: number) {
    setBusy(true); setError(''); setMsg('');
    try { await api.post('/payments/charge', { amount, method: payMethod }); setMsg(`${won(amount)} 충전되었습니다(${payMethod === 'voucher' ? '상품권' : '카드'}).`); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '충전 실패'); } finally { setBusy(false); }
  }
  async function redeem() {
    const code = redeemCode.trim();
    if (!code) return;
    setBusy(true); setError(''); setMsg('');
    try {
      const r = await api.post<{ product: string }>('/me/redemption/redeem', { code });
      setMsg(`「${r.product}」 이용권이 등록되었습니다.`); setRedeemCode(''); load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '코드 등록 실패'); } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader title="멤버십·결제" sub="구독 플랜, 크레딧 충전과 결제 내역을 관리합니다." />
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}
      {error && <ErrorText>{error}</ErrorText>}

      <StatGrid>
        <StatCard label="보유 크레딧" value={acc ? acc.total.toLocaleString() : '…'} tone="teal" />
        <StatCard label="현재 구독" value={sub ? '구독중' : '없음'} />
        <StatCard label="이용권" value={ent ? String(ent.active.length) : '…'} />
      </StatGrid>

      {/* 이용권 코드(수강권) 등록 */}
      <Card title="이용권 코드 등록" style={{ marginTop: 16, maxWidth: 620 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="input" value={redeemCode} placeholder="JANUS-XXXX-XXXX"
            onChange={(e) => setRedeemCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') redeem(); }}
            style={{ flex: '1 1 220px', textTransform: 'uppercase', letterSpacing: '.05em' }} />
          <Button disabled={busy || !redeemCode.trim()} onClick={redeem}>등록</Button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>센터에서 받은 수강권 코드를 입력하면 배치표·계산기 이용권이 바로 열립니다.</p>
      </Card>

      {/* 내 이용권(상품 권한) */}
      <h3 style={{ fontSize: 15, margin: '18px 0 8px' }}>내 이용권</h3>
      {ent === null ? <Spinner /> : ent.active.length === 0 && ent.expired.length === 0 ? (
        <Card><EmptyState>보유한 이용권이 없어요. 배치표·계산기는 상품 구매 시 열립니다.</EmptyState></Card>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {ent.active.map((e, i) => {
              const soon = e.daysRemaining != null && e.daysRemaining <= 14;
              return (
                <Card key={`a${i}`} style={soon ? { borderColor: 'var(--chip-confirmed, #d97706)' } : undefined}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <b style={{ fontSize: 15 }}>{e.label}</b>
                    <Badge kind={soon ? 'confirmed' : 'done'}>{e.daysRemaining == null ? '무기한' : `D-${e.daysRemaining}`}</Badge>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 6 }}>만료 {entDate(e.expiresAt)}</div>
                  {soon && <div style={{ fontSize: 12, color: 'var(--chip-confirmed, #d97706)', fontWeight: 700, marginTop: 4 }}>⚠ 만료 임박 — 연장을 준비하세요</div>}
                  <div style={{ fontSize: 11, color: 'var(--caption)', marginTop: 6 }}>해제: {e.services.join(' · ')}</div>
                </Card>
              );
            })}
          </div>
          {ent.expired.length > 0 && (
            <Card style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 6 }}>만료된 이용권</div>
              {ent.expired.map((e, i) => (
                <div key={`e${i}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: i ? '1px solid var(--line)' : 'none', opacity: 0.6 }}>
                  <span style={{ fontSize: 13 }}>{e.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--caption)' }}>만료 {entDate(e.expiresAt)}</span>
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      {/* 크레딧 충전 */}
      <Card title="크레딧 충전" style={{ marginTop: 16, maxWidth: 620 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {([['card', '💳 카드'], ['voucher', '🎟️ 상품권']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setPayMethod(v)} style={{ cursor: 'pointer', padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              border: payMethod === v ? '1px solid var(--teal)' : '1px solid var(--line)', background: payMethod === v ? 'var(--teal-50,#EEF4FB)' : '#fff', color: payMethod === v ? 'var(--teal)' : 'var(--muted)' }}>{l}</button>
          ))}
        </div>
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
