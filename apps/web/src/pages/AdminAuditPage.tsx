import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Badge, Spinner, ErrorText, EmptyState } from '../components/ui';

type Entry = {
  id: string; action: string; actor_role: string | null; actor_id: string | null;
  target_type: string | null; target_id: string | null; summary: string | null;
  center_id: string | null; created_at: string;
};

const GROUPS: { key: string; label: string }[] = [
  { key: '', label: '전체' },
  { key: 'pricing', label: '요금' },
  { key: 'limits', label: '한도' },
  { key: 'penalty', label: '가중제한' },
  { key: 'feature', label: '기능토글' },
  { key: 'payroll', label: '급여' },
  { key: 'org', label: '조직' },
  // 보호자 연결 강제 복구(O125) — 칩이 없으면 '전체' 200건 안에 묻힌다.
  { key: 'guardian', label: '보호자 연결' },
];
const kindOf = (a: string): 'new' | 'confirmed' | 'done' | 'soft' =>
  a.startsWith('payroll') ? 'confirmed' : a.startsWith('org') ? 'done' : a.startsWith('pricing') || a.startsWith('feature') ? 'new' : 'soft';
const KST = (iso: string) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

export function AdminAuditPage() {
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [prefix, setPrefix] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setRows(null);
    try { setRows(await api.get<Entry[]>(`/admin/audit-log${prefix ? `?prefix=${prefix}` : ''}`)); }
    catch (e) { setError(e instanceof ApiError ? e.message : '조회 실패'); }
  }, [prefix]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <PageHeader title="감사 로그" sub="정책·급여·조직 등 민감 조작 기록(센터 스코프)" />
      <ErrorText>{error}</ErrorText>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {GROUPS.map((g) => (
          <button key={g.key} onClick={() => setPrefix(g.key)} style={{
            cursor: 'pointer', padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700,
            border: prefix === g.key ? '1px solid var(--teal)' : '1px solid var(--line)',
            background: prefix === g.key ? 'var(--teal)' : 'var(--surface)', color: prefix === g.key ? '#fff' : 'var(--muted)',
          }}>{g.label}</button>
        ))}
      </div>
      {rows === null ? <Spinner /> : rows.length === 0 ? <Card><EmptyState>기록이 없습니다.</EmptyState></Card> : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['시각', '조작', '요약', '수행자'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: 'var(--fill,#f4f7fb)' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)', borderTop: '1px solid var(--line)', whiteSpace: 'nowrap' }}>{KST(e.created_at)}</td>
                  <td style={{ padding: '10px 12px', borderTop: '1px solid var(--line)' }}><Badge kind={kindOf(e.action)}>{e.action}</Badge></td>
                  <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--ink)', borderTop: '1px solid var(--line)' }}>{e.summary ?? '-'}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)', borderTop: '1px solid var(--line)' }}>{e.actor_role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
