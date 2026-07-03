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

export function AdminAssignmentPage() {
  const [d, setD] = useState<Dash | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try { setD(await api.get<Dash>('/assignment/dashboard')); setError(''); }
    catch (e) { setError(e instanceof ApiError ? e.message : '조회 실패'); }
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
    </>
  );
}
