import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { isHq } from '../auth/roleHome';
import { PageHeader, Card, Button, ErrorText, Badge } from '../components/ui';

/* 운영 설정 — SQL 없이 정책값 조정(본사 마스터 저장, 그 외 관리자는 열람).
 * 서버 화이트리스트: chat_session · qa_free_quota · qa_ticket_bundles. */

type Setting = { key: string; label: string; value: unknown; isDefault: boolean };
type Bundle = { count: number; discountPct: number };

const num = (v: string, fb = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fb; };

export function AdminOpsSettingsPage() {
  const { user } = useAuth();
  const hq = isHq(user);
  const [rows, setRows] = useState<Setting[]>([]);
  const [chat, setChat] = useState({ lockAfterDays: 3, postFreeMsgs: 5 });
  const [quota, setQuota] = useState({ premiumWeekly: 3, defaultWeekly: 0 });
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.get<Setting[]>('/admin/ops-settings');
      setRows(r);
      const byKey = new Map(r.map((x) => [x.key, x.value]));
      const c = byKey.get('chat_session') as typeof chat | undefined;
      if (c) setChat({ lockAfterDays: c.lockAfterDays ?? 3, postFreeMsgs: c.postFreeMsgs ?? 5 });
      const q = byKey.get('qa_free_quota') as typeof quota | undefined;
      if (q) setQuota({ premiumWeekly: q.premiumWeekly ?? 3, defaultWeekly: q.defaultWeekly ?? 0 });
      const b = byKey.get('qa_ticket_bundles') as Bundle[] | undefined;
      if (Array.isArray(b)) setBundles(b);
      setError('');
    } catch (e) { setError(e instanceof ApiError ? e.message : '조회 실패'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(key: string, value: unknown) {
    setBusy(key); setMsg(''); setError('');
    try {
      await api.put('/admin/ops-settings', { key, value });
      setMsg('저장했습니다 — 1분 내 반영됩니다(서버 캐시).');
      await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '저장 실패'); }
    finally { setBusy(''); }
  }

  const dflt = (key: string) => rows.find((r) => r.key === key)?.isDefault;
  const inputStyle: React.CSSProperties = { width: 90, border: '1px solid var(--input-border)', borderRadius: 8, padding: '7px 10px', fontSize: 13 };

  return (
    <div>
      <PageHeader title="운영 설정" sub="서비스 정책값을 화면에서 조정합니다. 저장은 본사 마스터관리자만 가능해요." />
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}
      <ErrorText>{error}</ErrorText>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, alignItems: 'start' }}>
        {/* 채팅형 상담 유예 (O94·O95) */}
        <Card>
          <h3 style={{ fontSize: 14, margin: '0 0 4px' }}>💬 채팅형 상담 유예 {dflt('chat_session') && <Badge kind="soft">기본값</Badge>}</h3>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>종료 후 채팅이 열려 있는 기간과, 그 동안 학생이 무료로 보낼 수 있는 마무리 메시지 수예요.</p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8 }}>
            유예 기간(일)
            <input type="number" min={0} max={30} style={inputStyle} value={chat.lockAfterDays} onChange={(e) => setChat((p) => ({ ...p, lockAfterDays: num(e.target.value) }))} />
            <span style={{ fontSize: 11.5, color: 'var(--caption)' }}>0 = 무기한 개방</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 12 }}>
            무료 마무리 메시지(건)
            <input type="number" min={0} max={50} style={inputStyle} value={chat.postFreeMsgs} onChange={(e) => setChat((p) => ({ ...p, postFreeMsgs: num(e.target.value) }))} />
            <span style={{ fontSize: 11.5, color: 'var(--caption)' }}>0 = 무제한</span>
          </label>
          <Button size="sm" loading={busy === 'chat_session'} disabled={!hq} onClick={() => save('chat_session', chat)}>저장</Button>
        </Card>

        {/* 주간 무료 질문권 (P1) */}
        <Card>
          <h3 style={{ fontSize: 14, margin: '0 0 4px' }}>🎫 주간 무료 질문권 {dflt('qa_free_quota') && <Badge kind="soft">기본값</Badge>}</h3>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>등급별 주간 무료 질문 수(월요일 리셋). 소진 후에는 묶음 질문권·크레딧이 사용돼요.</p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8 }}>
            프리미엄 등급(주)
            <input type="number" min={0} max={50} style={inputStyle} value={quota.premiumWeekly} onChange={(e) => setQuota((p) => ({ ...p, premiumWeekly: num(e.target.value) }))} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 12 }}>
            일반 등급(주)
            <input type="number" min={0} max={50} style={inputStyle} value={quota.defaultWeekly} onChange={(e) => setQuota((p) => ({ ...p, defaultWeekly: num(e.target.value) }))} />
          </label>
          <Button size="sm" loading={busy === 'qa_free_quota'} disabled={!hq} onClick={() => save('qa_free_quota', quota)}>저장</Button>
        </Card>

        {/* 질문권 묶음 상품 (B1·O93) */}
        <Card>
          <h3 style={{ fontSize: 14, margin: '0 0 4px' }}>🎟️ 질문권 묶음 상품 {dflt('qa_ticket_bundles') && <Badge kind="soft">기본값</Badge>}</h3>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>학생이 선구매하는 묶음 구성. 가격은 일반 질문 시세 × 건수 × (100−할인%)로 자동 계산돼요.</p>
          {bundles.map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8 }}>
              <input type="number" min={1} max={50} style={inputStyle} value={b.count} onChange={(e) => setBundles((p) => p.map((x, k) => (k === i ? { ...x, count: num(e.target.value, 1) } : x)))} />건
              <input type="number" min={0} max={90} style={inputStyle} value={b.discountPct} onChange={(e) => setBundles((p) => p.map((x, k) => (k === i ? { ...x, discountPct: num(e.target.value) } : x)))} />% 할인
              <button onClick={() => setBundles((p) => p.filter((_, k) => k !== i))} style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 13 }}>삭제</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            {bundles.length < 5 && <Button size="sm" variant="ghost" onClick={() => setBundles((p) => [...p, { count: 5, discountPct: 10 }])}>＋ 묶음 추가</Button>}
            <Button size="sm" loading={busy === 'qa_ticket_bundles'} disabled={!hq} onClick={() => save('qa_ticket_bundles', bundles)}>저장</Button>
          </div>
        </Card>
      </div>
      {!hq && <p style={{ fontSize: 12, color: 'var(--caption)', marginTop: 12 }}>· 저장은 본사 마스터관리자 계정에서만 가능합니다(열람 전용).</p>}
    </div>
  );
}
