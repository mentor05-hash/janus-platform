import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, ErrorText, Table } from '../components/ui';
import type { Column } from '../components/ui';
import { BarList, SectionCard } from '../components/dashboard/widgets';

type Wait = { id: string; studentName: string; consultType: string | null; mode: string; createdAt: string };
type FT = { teacherId: string; name: string; center: string | null; todayAssigned: number };
type CenterRow = { centerId: string; center: string; waiting: number; assigned7d: number; fullTimers: number };
type Dash = {
  scope: string;
  queue: { waiting: number; assigned: number; cancelled: number };
  waitingList: Wait[];
  byOrigin: Record<string, number>;
  teachers: FT[];
  byCenter?: CenterRow[];
};

const ORIGIN_LABEL: Record<string, string> = {
  전임자동: '학생 직접신청(즉시확정)',
  자동배정: '자동배정 대기열',
  질문배정: '질문 답변블록',
  역상담자동: '최초상담(역상담)',
};
const MODE_LABEL: Record<string, string> = { zoom: '줌 화상', chat: '채팅', hand: '필기', offline: '오프라인' };
const fmt = (s: string) => new Date(s).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

type PayRow = { teacherId: string; name: string; center: string; sessions: number; revenue: number; gross: number; net: number; totalCost: number; freelancerCost: number; premium: number };
type Model = { mode: string; base: number; incentivePct: number };
type Pay = { period: string; sharePct: number; model: Model; count: number; totals: { revenue: number; gross: number; net: number; totalCost: number; freelancerCost: number; premium: number }; rows: PayRow[] };

export function AdminAssignmentPage() {
  const [d, setD] = useState<Dash | null>(null);
  const [pay, setPay] = useState<Pay | null>(null);
  const [shareIn, setShareIn] = useState('');
  const [baseIn, setBaseIn] = useState('');
  const [incIn, setIncIn] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try { setD(await api.get<Dash>('/assignment/dashboard')); setError(''); }
    catch (e) { setError(e instanceof ApiError ? e.message : '조회 실패'); }
    try { const p = await api.get<Pay>('/admin/payroll/revenue-share'); setPay(p); setShareIn(String(p.sharePct)); setBaseIn(String(p.model.base)); setIncIn(String(p.model.incentivePct)); } catch { /* noop */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function run(path: string, label: string) {
    setBusy(path); setMsg('');
    try {
      const r = await api.post<Record<string, number>>(path, {});
      setMsg(`${label} 완료 — ${Object.entries(r).map(([k, v]) => `${k} ${v}`).join(', ')}`);
      await load();
    } catch (e) { setMsg(e instanceof ApiError ? e.message : '실행 실패'); }
    finally { setBusy(''); }
  }

  if (error) return <><PageHeader title="자동배정" /><ErrorText>{error}</ErrorText></>;
  if (!d) return <><PageHeader title="자동배정" /><p style={{ color: 'var(--muted)' }}>불러오는 중…</p></>;

  const assignedTotal = Object.values(d.byOrigin).reduce((a, b) => a + b, 0);
  const stats = [
    { label: '대기 중', value: d.queue.waiting, accent: d.queue.waiting > 0 },
    { label: '최근 7일 배정', value: assignedTotal },
    { label: '전임 선생님', value: d.teachers.length },
    { label: '오늘 배정', value: d.teachers.reduce((a, t) => a + t.todayAssigned, 0) },
  ];

  const waitCols: Column<Wait>[] = [
    { key: 'studentName', header: '학생' },
    { key: 'consultType', header: '종류', render: (r) => r.consultType ?? '-' },
    { key: 'mode', header: '방식', render: (r) => MODE_LABEL[r.mode] ?? r.mode },
    { key: 'createdAt', header: '신청 시각', align: 'right', render: (r) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(r.createdAt)}</span> },
  ];
  const centerCols: Column<CenterRow>[] = [
    { key: 'center', header: '센터' },
    { key: 'fullTimers', header: '전임', align: 'right' },
    { key: 'waiting', header: '대기', align: 'right' },
    { key: 'assigned7d', header: '7일 배정', align: 'right' },
  ];
  const w = (n: number) => n.toLocaleString();
  const payCols: Column<PayRow>[] = [
    { key: 'name', header: '전임' },
    { key: 'sessions', header: '세션', align: 'right' },
    { key: 'revenue', header: '매출', align: 'right', render: (r) => w(r.revenue) },
    { key: 'gross', header: '세전급여', align: 'right', render: (r) => w(r.gross) },
    { key: 'net', header: '실수령', align: 'right', render: (r) => w(r.net) },
    { key: 'totalCost', header: '회사총부담(전임)', align: 'right', render: (r) => <b>{w(r.totalCost)}</b> },
    { key: 'freelancerCost', header: '프리랜서 부담', align: 'right', render: (r) => w(r.freelancerCost) },
    { key: 'premium', header: '전임 추가비용', align: 'right', render: (r) => <span style={{ color: '#C0392B' }}>+{w(r.premium)}</span> },
  ];

  return (
    <>
      <PageHeader title="자동배정" sub="전임 근무시간 강제배정 큐·배치 결과·부하 현황" />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ flex: '1 1 150px', minWidth: 140, border: '1px solid var(--line)', borderRadius: 12, padding: '14px 16px', background: 'var(--surface)' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: s.accent ? 'var(--teal)' : 'var(--ink)' }}>{s.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button disabled={!!busy} onClick={() => run('/assignment/run-fill', '채우기 배치')}
          style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: '1px solid var(--teal)', background: 'var(--teal)', color: '#fff', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          {busy === '/assignment/run-fill' ? '실행 중…' : '채우기 배치 실행'}
        </button>
        <button disabled={!!busy} onClick={() => run('/assignment/run-reverse-scan', '역상담 스캔')}
          style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          {busy === '/assignment/run-reverse-scan' ? '실행 중…' : '역상담 스캔 실행'}
        </button>
        {msg && <span style={{ alignSelf: 'center', fontSize: 12.5, color: 'var(--muted)' }}>{msg}</span>}
      </div>

      <SectionCard title="출처별 배정 (최근 7일)" desc="강제배정 4종의 성사 건수">
        <BarList items={['전임자동', '자동배정', '질문배정', '역상담자동'].map((o) => ({ id: o, label: ORIGIN_LABEL[o], value: d.byOrigin[o] ?? 0 }))} suffix="건" />
      </SectionCard>

      <SectionCard title={`대기열 (${d.queue.waiting})`} desc="아직 배정되지 않은 자동배정 신청 — 오래된 순">
        <Table columns={waitCols} rows={d.waitingList} rowKey={(r) => r.id} empty="대기 중인 신청이 없습니다." />
      </SectionCard>

      <SectionCard title="전임 부하 (오늘)" desc="전임 선생님별 오늘 강제배정 건수">
        <BarList items={d.teachers.map((t) => ({ id: t.teacherId, label: `${t.name}${t.center ? ` · ${t.center}` : ''}`, value: t.todayAssigned }))} suffix="건" />
      </SectionCard>

      {d.byCenter && (
        <SectionCard title="센터별 현황" desc="전임 수 · 대기 · 최근 7일 배정(본사 전용)">
          <Table columns={centerCols} rows={d.byCenter} rowKey={(r) => r.centerId} empty="데이터가 없습니다." />
        </SectionCard>
      )}

      {pay && (
        <SectionCard title={`전임 급여 · ${pay.period}`} desc="완료·확정 세션 매출 기반. 4대보험(2025)+퇴직금 반영. 크레딧=원 가정.">
          {/* 급여 모델 선택 */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>급여 모델</span>
            {([['share', '순수 배분'], ['floor', '기본급 보장+배분'], ['base_incentive', '기본급+인센티브']] as const).map(([m, l]) => (
              <button key={m} onClick={() => run2('/admin/payroll/model', { mode: m })}
                style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: pay.model.mode === m ? '1px solid var(--teal)' : '1px solid var(--line)', background: pay.model.mode === m ? 'var(--teal)' : 'var(--surface)', color: pay.model.mode === m ? '#fff' : 'var(--muted)' }}>{l}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>배분율</span>
              <input type="number" min={0} max={100} value={shareIn} onChange={(e) => setShareIn(e.target.value)} style={{ width: 56, padding: '5px 8px', borderRadius: 8, border: '1px solid var(--line)', textAlign: 'right' }} />%
              <button onClick={() => run2('/admin/payroll/share-policy', { sharePct: Number(shareIn) })} style={{ padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1px solid var(--teal)', background: 'var(--teal)', color: '#fff', cursor: 'pointer' }}>저장</button>
            </div>
            {(pay.model.mode === 'floor' || pay.model.mode === 'base_incentive') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>기본급</span>
                <input type="number" step={100000} value={baseIn} onChange={(e) => setBaseIn(e.target.value)} style={{ width: 96, padding: '5px 8px', borderRadius: 8, border: '1px solid var(--line)', textAlign: 'right' }} />원
                <button onClick={() => run2('/admin/payroll/model', { base: Number(baseIn) })} style={{ padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1px solid var(--teal)', background: 'var(--teal)', color: '#fff', cursor: 'pointer' }}>저장</button>
              </div>
            )}
            {pay.model.mode === 'base_incentive' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>인센티브</span>
                <input type="number" min={0} max={100} value={incIn} onChange={(e) => setIncIn(e.target.value)} style={{ width: 56, padding: '5px 8px', borderRadius: 8, border: '1px solid var(--line)', textAlign: 'right' }} />%
                <button onClick={() => run2('/admin/payroll/model', { incentivePct: Number(incIn) })} style={{ padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1px solid var(--teal)', background: 'var(--teal)', color: '#fff', cursor: 'pointer' }}>저장</button>
              </div>
            )}
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>· 본사 관리자</span>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            {[['매출 합계', pay.totals.revenue], ['세전 급여', pay.totals.gross], ['회사 총부담(전임)', pay.totals.totalCost], ['프리랜서 부담', pay.totals.freelancerCost], ['전임 추가비용', pay.totals.premium]].map(([l, v]) => (
              <div key={l as string} style={{ flex: '1 1 150px', minWidth: 140, border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', background: 'var(--surface)' }}>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{l}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{(v as number).toLocaleString()}<span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}> 원</span></div>
              </div>
            ))}
          </div>
          <div className="scroll" style={{ overflowX: 'auto' }}>
            <Table columns={payCols} rows={pay.rows} rowKey={(r) => r.teacherId} empty="전임 실적이 없습니다." />
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>세전 = 매출 × {pay.sharePct}%. 실수령 = 세전 − 근로자 4대보험·소득세. <b>회사 총부담 = 세전 + 사업주 4대보험(≈10.35%) + 퇴직금 적립(8.33%)</b>. 같은 배분액을 프리랜서(사업소득 3.3%)로 지급하면 회사부담은 세전과 동일(추가부담 0). 크레딧↔현금 비율(O1)이 1:1이 아니면 비례 조정.</p>
        </SectionCard>
      )}
    </>
  );

  function run2(path: string, body: Record<string, unknown>) {
    setBusy(path);
    api.patch(path, body).then(() => load()).catch(() => {}).finally(() => setBusy(''));
  }
}
