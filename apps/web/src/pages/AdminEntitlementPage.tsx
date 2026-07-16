import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, Badge, ErrorText, Spinner, EmptyState } from '../components/ui';

type Product = { key: string; label: string; services: string[] };
type Entitlement = {
  id: string;
  service_id: string;
  product_key: string | null;
  source: string;
  granted_at: string;
  expires_at: string | null;
  note: string | null;
  revoked_at: string | null;
};
type Summary = {
  account: { id: string; login_id: string; name: string; role: string };
  entitlements: Entitlement[];
  activeServices: string[];
};

const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }) : '무기한');
const isActive = (e: Entitlement) => !e.revoked_at && (!e.expires_at || new Date(e.expires_at) > new Date());

/**
 * 상품 권한(entitlement) 관리 — 유료 배치표·계산기 상품을 계정에 수동 부여/취소(O74).
 * 결제/체크아웃 도입 전까지 관리자 부여 경로. account 는 login_id(student01) 또는 UUID.
 */
export function AdminEntitlementPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [account, setAccount] = useState('');
  const [productKey, setProductKey] = useState('full');
  const [expiresAt, setExpiresAt] = useState('2026-01-31'); // 기본: 정시 시즌 말(일회성 기간제)
  const [note, setNote] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Product[]>('/admin/entitlements/products').then(setProducts).catch(() => setProducts([]));
  }, []);

  async function lookup(ref?: string) {
    const acc = (ref ?? account).trim();
    if (!acc) return;
    setError(''); setMsg(''); setSummary(null); setBusy(true);
    try {
      const s = await api.get<Summary>(`/admin/entitlements?account=${encodeURIComponent(acc)}`);
      setSummary(s);
      setAccount(s.account.login_id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '조회 실패');
    } finally { setBusy(false); }
  }

  async function grant() {
    if (!summary) return;
    setError(''); setMsg(''); setBusy(true);
    try {
      const prod = products.find((p) => p.key === productKey);
      await api.post('/admin/entitlements', {
        account: summary.account.login_id,
        productKey,
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59+09:00`).toISOString() : undefined,
        source: 'admin',
        note: note || undefined,
      });
      setMsg(`${summary.account.name}(${summary.account.login_id}) 에 「${prod?.label ?? productKey}」 부여 완료 — 로그인 시 즉시 해제됩니다.`);
      setNote('');
      await lookup(summary.account.login_id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '부여 실패');
    } finally { setBusy(false); }
  }

  async function revoke(id: string) {
    setError(''); setMsg(''); setBusy(true);
    try {
      await api.del(`/admin/entitlements/${id}`);
      setMsg('권한을 취소했습니다.');
      if (summary) await lookup(summary.account.login_id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '취소 실패');
    } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader title="상품 권한" sub="유료 배치표·계산기 상품을 계정에 부여/취소합니다. 일회성 기간제(수능시즌) — 결제 도입 전 수동 부여 경로." />
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}
      {error && <ErrorText>{error}</ErrorText>}

      {/* 계정 조회 */}
      <Card>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: '1 1 260px' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>계정 (로그인 ID 또는 UUID)</div>
            <input className="input" value={account} placeholder="예: student01"
              onChange={(e) => setAccount(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') lookup(); }} />
          </label>
          <Button onClick={() => lookup()} loading={busy}>조회</Button>
        </div>
      </Card>

      {busy && !summary && <Spinner />}

      {summary && (
        <>
          {/* 계정 요약 */}
          <Card style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <b style={{ fontSize: 15 }}>{summary.account.name}</b>
              <Badge kind="soft">{summary.account.login_id}</Badge>
              <Badge kind="soft">{summary.account.role}</Badge>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>활성 서비스: {summary.activeServices.length ? summary.activeServices.join(', ') : '없음'}</span>
            </div>
          </Card>

          {/* 상품 부여 */}
          <Card title="상품 권한 부여" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ flex: '1 1 220px' }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>상품</div>
                <select className="input" value={productKey} onChange={(e) => setProductKey(e.target.value)}>
                  {products.map((p) => <option key={p.key} value={p.key}>{p.label} ({p.services.join('+')})</option>)}
                </select>
              </label>
              <label style={{ flex: '0 1 180px' }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>만료일 (비우면 무기한)</div>
                <input className="input" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </label>
              <label style={{ flex: '1 1 200px' }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>메모 (선택)</div>
                <input className="input" value={note} placeholder="예: 수능 프로모션" onChange={(e) => setNote(e.target.value)} />
              </label>
              <Button onClick={grant} loading={busy}>부여</Button>
            </div>
          </Card>

          {/* 권한 이력 */}
          <h3 style={{ fontSize: 15, margin: '20px 0 8px' }}>권한 이력</h3>
          {summary.entitlements.length === 0 ? <Card><EmptyState>부여된 권한이 없습니다.</EmptyState></Card> : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--fill,#f4f7fb)', textAlign: 'left' }}>
                    <th style={th}>상태</th><th style={th}>상품</th><th style={th}>서비스</th><th style={th}>부여일</th><th style={th}>만료</th><th style={th}>출처</th><th style={th} />
                  </tr>
                </thead>
                <tbody>
                  {summary.entitlements.map((e) => {
                    const active = isActive(e);
                    return (
                      <tr key={e.id} style={{ borderTop: '1px solid var(--line,#eceff1)', opacity: active ? 1 : 0.55 }}>
                        <td style={td}><Badge kind={active ? 'done' : 'soft'}>{e.revoked_at ? '취소' : active ? '활성' : '만료'}</Badge></td>
                        <td style={td}>{e.product_key ?? '-'}</td>
                        <td style={td}>{e.service_id}</td>
                        <td style={td}>{fmt(e.granted_at)}</td>
                        <td style={td}>{fmt(e.expires_at)}</td>
                        <td style={td}>{e.source}</td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          {active && <Button size="sm" variant="ghost" onClick={() => revoke(e.id)}>취소</Button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: '10px 12px', fontWeight: 700, color: 'var(--muted)' };
const td: React.CSSProperties = { padding: '10px 12px' };
