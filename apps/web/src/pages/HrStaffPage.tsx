import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { HrStaff } from '../api/types';
import { PageHeader, Card, Badge, Spinner, ErrorText, EmptyState } from '../components/ui';

const PERM_KIND: Record<string, 'done' | 'confirmed' | 'soft'> = { L1: 'confirmed', L2: 'done', L3: 'soft' };
const PERMS: ('L1' | 'L2' | 'L3')[] = ['L1', 'L2', 'L3'];

export function HrStaffPage() {
  const [rows, setRows] = useState<HrStaff[] | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setRows(await api.get<HrStaff[]>('/hr/staff')); }
    catch (e) { setError(e instanceof ApiError ? e.message : '조회 실패'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function changePerm(id: string, permLevel: string) {
    setMsg(''); setError('');
    try { await api.patch(`/hr/staff/${id}/perm`, { permLevel }); setMsg('권한이 변경되었습니다.'); setEditing(null); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '권한 변경 실패'); }
  }

  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: 'var(--fill,#f6f8fa)' };
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, borderTop: '1px solid var(--line)' };

  return (
    <div>
      <PageHeader title="직원 · 권한 관리" sub="운영 인력·관리자 권한(L1 본사 / L2 센터장 / L3 과목 책임)" />
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}
      <ErrorText>{error}</ErrorText>
      {rows === null ? <Spinner /> : rows.length === 0 ? <Card><EmptyState>직원이 없습니다.</EmptyState></Card> : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>이름</th><th style={th}>아이디</th><th style={th}>역할</th><th style={th}>소속</th><th style={th}>권한</th><th style={th} /></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td style={td}><b>{s.name}</b></td>
                  <td style={{ ...td, color: 'var(--muted)' }}>{s.loginId ?? '-'}</td>
                  <td style={td}>{s.staffRole ?? '-'}</td>
                  <td style={td}>{s.centerName ?? '본사'}</td>
                  <td style={td}><Badge kind={PERM_KIND[s.permLevel] ?? 'soft'}>{s.permLevel}</Badge></td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {editing === s.id ? (
                      <span style={{ display: 'inline-flex', gap: 4 }}>
                        {PERMS.map((p) => (
                          <button key={p} onClick={() => changePerm(s.id, p)} disabled={p === s.permLevel}
                            style={{ cursor: p === s.permLevel ? 'default' : 'pointer', padding: '4px 9px', borderRadius: 7, fontSize: 12, fontWeight: 700, border: '1px solid var(--line)', background: p === s.permLevel ? 'var(--teal)' : '#fff', color: p === s.permLevel ? '#fff' : 'var(--ink)' }}>{p}</button>
                        ))}
                        <button onClick={() => setEditing(null)} style={{ cursor: 'pointer', padding: '4px 9px', borderRadius: 7, fontSize: 12, border: 'none', background: 'none', color: 'var(--muted)' }}>취소</button>
                      </span>
                    ) : (
                      <button onClick={() => setEditing(s.id)} style={{ cursor: 'pointer', padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1px solid var(--line)', background: '#fff', color: 'var(--ink)' }}>권한 변경</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, lineHeight: 1.6 }}>
        L1 본사(전 센터·정책) · L2 센터장(자기 센터) · L3 과목 책임(담당 과목). 상담 기록 뷰어 열람 범위도 권한 등급별로 차등됩니다. L1 권한 부여·회수는 관리자만 가능합니다.
      </p>
    </div>
  );
}
