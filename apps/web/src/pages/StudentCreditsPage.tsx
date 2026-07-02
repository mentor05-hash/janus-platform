import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { CreditAccount } from '../api/types';
import { PageHeader, Card, ErrorText, Spinner, EmptyState, Badge } from '../components/ui';

type Tx = { id: string; amount: number; kind: string; reason?: string | null; createdAt?: string | null; created_at?: string | null };

export function StudentCreditsPage() {
  const [acc, setAcc] = useState<CreditAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [txs, setTxs] = useState<Tx[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get<CreditAccount>('/credits/account')
      .then(setAcc)
      .catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'))
      .finally(() => setLoading(false)); // 실패해도 스피너를 멈춰 무한 로딩 방지
    api.get<{ data?: Tx[] } | Tx[]>('/credits/transactions').then((r) => setTxs(Array.isArray(r) ? r : (r.data ?? []))).catch(() => setTxs([]));
  }, []);
  return (
    <div>
      <PageHeader title="크레딧" sub="보유 크레딧과 사용 내역입니다." />
      {error && <ErrorText>{error}</ErrorText>}
      {loading ? <Spinner /> : acc ? (
        <Card style={{ maxWidth: 460 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--teal)' }}>{acc.total.toLocaleString()} <span style={{ fontSize: 15, color: 'var(--muted)' }}>크레딧</span></div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>주간부여 {acc.grantedBalance.toLocaleString()} · 구매분 {acc.purchasedBalance.toLocaleString()}</div>
        </Card>
      ) : (
        <Card style={{ maxWidth: 460 }}><EmptyState>크레딧 정보를 불러오지 못했어요.</EmptyState></Card>
      )}
      <h3 style={{ fontSize: 15, margin: '18px 0 8px' }}>사용 내역</h3>
      {txs === null ? <Spinner /> : txs.length === 0 ? <Card><EmptyState>내역이 없어요.</EmptyState></Card> : (
        <Card>
          {txs.slice(0, 40).map((t) => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ fontSize: 13 }}><Badge kind="soft">{t.kind}</Badge> {t.reason ?? ''}</span>
              <b style={{ color: t.amount < 0 ? 'var(--danger)' : 'var(--chip-done)' }}>{t.amount > 0 ? '+' : ''}{t.amount.toLocaleString()}</b>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
