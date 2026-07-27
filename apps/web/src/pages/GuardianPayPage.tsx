import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Button, Card, ErrorText, PageHeader } from '../components/ui';

/* 학부모 결제·충전(모바일 GuardianScreens 파리티) — 자녀 크레딧 현황·충전(카드/상품권)·
 * 결제요청 응답·자녀 구독. 금액 정수(원)·1크레딧=0.5원 규약은 서버 계약 그대로. */

type Child = { linkId: string; studentId: string; name: string | null; relation: string | null; membershipGrade?: string | null; balance?: number };
type ChildCredits = {
  account: { purchasedBalance: number; grantedBalance: number; total: number };
  transactions: { id: string; type: string; amount: number; balance: number; description: string | null; created_at: string }[];
};
type PaymentRequest = { id: string; student_id: string; needed_credits: number; status: string; origin: string; created_at: string };
type Plan = { id: string; name: string; price: number; billing_cycle: string; membership_grade?: { name: string; weekly_credits: number } | null };

const won = (n: number) => `${n.toLocaleString()}원`;
const KST = (iso: string) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const CHARGE = [30000, 50000, 100000];
const TX_META: Record<string, { label: string; color: string }> = {
  charge: { label: '충전', color: 'var(--chip-done,#15803d)' },
  refund: { label: '환원', color: 'var(--chip-done,#15803d)' },
  weekly_grant: { label: '주간 부여', color: 'var(--chip-done,#15803d)' },
  spend: { label: '차감', color: 'var(--ink)' },
  weekly_expire: { label: '주간 소멸', color: 'var(--chip-confirmed,#A97D24)' },
};

export function GuardianPayPage() {
  const [children, setChildren] = useState<Child[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [credits, setCredits] = useState<ChildCredits | null>(null);
  const [reqs, setReqs] = useState<PaymentRequest[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [amount, setAmount] = useState(50000);
  const [method, setMethod] = useState<'card' | 'voucher'>('card');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const loadReqs = useCallback(() => { api.get<PaymentRequest[]>('/payment-requests').then((r) => setReqs(Array.isArray(r) ? r : [])).catch(() => { /* 무시 */ }); }, []);
  useEffect(() => {
    api.get<Child[]>('/guardian/children').then((cs) => { setChildren(cs); if (cs[0]) setActiveId((p) => p ?? cs[0].studentId); }).catch(() => setChildren([]));
    api.get<Plan[]>('/subscription/plans').then((p) => setPlans(Array.isArray(p) ? p : [])).catch(() => setPlans([]));
    loadReqs();
  }, [loadReqs]);
  const loadCredits = useCallback(() => {
    if (!activeId) return;
    api.get<ChildCredits>(`/guardian/children/${activeId}/credits`).then(setCredits).catch(() => setCredits(null));
  }, [activeId]);
  useEffect(loadCredits, [loadCredits]);

  const active = children.find((c) => c.studentId === activeId) ?? null;

  async function charge() {
    if (!activeId || !active) return;
    if (!confirm(`${active.name ?? '자녀'}에게 ${won(amount)}을 충전할까요? (${method === 'voucher' ? '상품권' : '카드'})`)) return;
    setBusy(true); setError(''); setMsg('');
    try {
      await api.post(`/guardian/children/${activeId}/charge`, { amount, method });
      setMsg(`${active.name ?? '자녀'}에게 ${won(amount)} 충전했어요(${method === 'voucher' ? '상품권' : '카드'}).`);
      loadCredits();
    } catch (e) { setError(e instanceof ApiError ? e.message : '충전 실패'); } finally { setBusy(false); }
  }
  async function respond(id: string, action: 'pay' | 'reject') {
    setBusy(true); setError(''); setMsg('');
    try {
      await api.patch(`/payment-requests/${id}/respond`, { action });
      setMsg(action === 'pay' ? '결제요청에 응답했어요(자녀 크레딧 충전).' : '결제요청을 거절했어요.');
      loadReqs(); loadCredits();
    } catch (e) { setError(e instanceof ApiError ? e.message : '처리 실패'); } finally { setBusy(false); }
  }
  async function subscribe(plan: Plan) {
    if (!activeId || !active) return;
    if (!confirm(`${active.name ?? '자녀'}에게 [${plan.name}] 구독을 적용할까요?\n\n· ${won(plan.price)} / ${plan.billing_cycle === 'monthly' ? '월' : plan.billing_cycle}${plan.membership_grade ? `\n· 등급 ${plan.membership_grade.name} · 주간 크레딧 ${plan.membership_grade.weekly_credits.toLocaleString()}` : ''}`)) return;
    setBusy(true); setError(''); setMsg('');
    try {
      await api.post('/subscription/subscribe-for-child', { studentId: activeId, planId: plan.id });
      setMsg(`${active.name ?? '자녀'}에게 ${plan.name} 구독을 적용했어요.`);
      loadCredits();
    } catch (e) { setError(e instanceof ApiError ? e.message : '구독 실패'); } finally { setBusy(false); }
  }

  const openReqs = reqs.filter((r) => r.status === 'open');

  return (
    <div>
      <PageHeader title="결제 · 충전" sub="자녀 크레딧을 충전하고, 결제요청에 응답하거나 구독을 적용합니다." />
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}
      <ErrorText>{error}</ErrorText>

      {/* 자녀 선택 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {children.map((c) => {
          const on = c.studentId === activeId;
          return (
            <button key={c.studentId} onClick={() => setActiveId(c.studentId)} style={{
              cursor: 'pointer', padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700,
              border: on ? '1px solid var(--teal)' : '1px solid var(--line)',
              background: on ? 'var(--teal)' : 'var(--surface)', color: on ? '#fff' : 'var(--muted)',
            }}>{c.name ?? '자녀'}{c.relation ? ` (${c.relation})` : ''}</button>
          );
        })}
        {children.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>연결된 자녀가 없어요 — 센터에 자녀 연결을 요청하세요.</p>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, alignItems: 'start' }}>
        {/* 크레딧 현황 + 충전 */}
        <Card>
          <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>💳 {active?.name ?? '자녀'} 크레딧</h3>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{credits ? credits.account.total.toLocaleString() : '…'} <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>크레딧</span></div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>주간부여 {credits?.account.grantedBalance.toLocaleString() ?? 0} · 구매 {credits?.account.purchasedBalance.toLocaleString() ?? 0}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            {([['card', '💳 카드'], ['voucher', '🎟️ 상품권']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setMethod(v)} style={{ cursor: 'pointer', padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, border: method === v ? '1px solid var(--teal)' : '1px solid var(--line)', background: method === v ? 'var(--teal-50,#EEF4FB)' : 'var(--surface)', color: method === v ? 'var(--teal)' : 'var(--muted)' }}>{l}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {CHARGE.map((a) => (
              <button key={a} onClick={() => setAmount(a)} style={{ cursor: 'pointer', padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, border: amount === a ? '1px solid var(--teal)' : '1px solid var(--line)', background: amount === a ? 'var(--teal)' : 'var(--surface)', color: amount === a ? '#fff' : 'var(--muted)' }}>{a / 10000}만원</button>
            ))}
          </div>
          <Button block loading={busy} onClick={charge} style={{ marginTop: 12 }} disabled={!activeId}>{won(amount)} 충전</Button>

          {/* 거래 내역 */}
          <h4 style={{ fontSize: 13, margin: '16px 0 6px' }}>최근 내역</h4>
          {(credits?.transactions ?? []).slice(0, 8).map((t) => {
            const meta = TX_META[t.type] ?? { label: t.type, color: 'var(--muted)' };
            return (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, padding: '5px 0', borderBottom: '1px solid var(--line)' }}>
                <span style={{ color: 'var(--muted)' }}>{KST(t.created_at)} · {meta.label}{t.description ? ` · ${t.description}` : ''}</span>
                <b style={{ color: meta.color, whiteSpace: 'nowrap' }}>{t.amount > 0 ? '+' : ''}{t.amount.toLocaleString()}</b>
              </div>
            );
          })}
          {credits && credits.transactions.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>거래 내역이 없어요.</p>}
        </Card>

        {/* 결제요청 + 구독 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card>
            <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>📨 결제요청 {openReqs.length > 0 && <span style={{ background: 'var(--danger,#dc2626)', color: '#fff', borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>{openReqs.length}</span>}</h3>
            {openReqs.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>대기 중인 결제요청이 없어요. 자녀가 크레딧 부족으로 예약·질문하지 못하면 여기로 요청이 도착해요.</p>}
            {openReqs.map((r) => {
              const child = children.find((c) => c.studentId === r.student_id);
              return (
                <div key={r.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{child?.name ?? '자녀'} · {r.needed_credits.toLocaleString()} 크레딧 부족</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{KST(r.created_at)} · {r.origin}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <Button size="sm" loading={busy} onClick={() => respond(r.id, 'pay')}>충전으로 응답</Button>
                    <Button size="sm" variant="ghost" loading={busy} onClick={() => respond(r.id, 'reject')}>거절</Button>
                  </div>
                </div>
              );
            })}
          </Card>

          <Card>
            <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>📦 자녀 구독 적용</h3>
            {plans.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>구독 플랜이 없어요.</p>}
            {plans.map((p) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {won(p.price)} / {p.billing_cycle === 'monthly' ? '월' : p.billing_cycle}
                    {p.membership_grade ? ` · ${p.membership_grade.name} · 주간 ${p.membership_grade.weekly_credits.toLocaleString()} 크레딧` : ''}
                  </div>
                </div>
                <Button size="sm" loading={busy} onClick={() => subscribe(p)} disabled={!activeId}>적용</Button>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
