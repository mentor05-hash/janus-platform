import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, ErrorText, TextField, Badge, Spinner, EmptyState } from '../components/ui';

type AdminStudent = {
  studentId: string;
  name: string;
  loginId: string | null;
  doneCount: number;
  reverseAdmin: boolean;
  reverseSelf: boolean;
};

export function AdminReversePage() {
  const [list, setList] = useState<AdminStudent[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    api
      .get<AdminStudent[]>('/bookings/reverse/admin-students')
      .then((r) => setList(r))
      .catch((e) => setErr(e instanceof ApiError ? e.message : '목록을 불러오지 못했습니다.'));
  }
  useEffect(load, []);

  async function toggle(s: AdminStudent) {
    setErr('');
    setBusy(s.studentId);
    try {
      await api.patch(`/bookings/reverse/admin/${s.studentId}`, { value: !s.reverseAdmin });
      setList((prev) =>
        (prev ?? []).map((x) => (x.studentId === s.studentId ? { ...x, reverseAdmin: !x.reverseAdmin } : x)),
      );
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '변경 실패');
    } finally {
      setBusy(null);
    }
  }

  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (list ?? []).filter(
      (s) => !k || s.name.toLowerCase().includes(k) || (s.loginId ?? '').toLowerCase().includes(k),
    );
  }, [list, q]);

  return (
    <div>
      <PageHeader
        title="역상담 대상 관리"
        sub="선생님이 역상담을 제안할 수 있는 학생을 지정합니다. 첫상담 학생(완료 0회)은 지정 없이도 대상이며, 추가 역상담은 여기서 지정하거나 학생이 직접 신청합니다."
      />
      <Card style={{ maxWidth: 720 }}>
        <div style={{ marginBottom: 10 }}>
          <TextField label="학생 검색" placeholder="이름 또는 아이디" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {err && <ErrorText>{err}</ErrorText>}
        {list === null && !err && <Spinner />}
        {list !== null && (rows.length === 0 ? (
          <EmptyState>학생 없음</EmptyState>
        ) : (
          rows.map((s) => {
            const first = s.doneCount === 0;
            return (
              <div
                key={s.studentId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '10px 12px',
                  marginBottom: 6,
                  borderRadius: 10,
                  border: '1px solid var(--line)',
                  background: s.reverseAdmin ? 'var(--teal-50, #eef6fa)' : 'var(--surface, #fff)',
                }}
              >
                <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{s.name}</span>
                  {s.loginId && <span style={{ color: 'var(--muted)', fontSize: 12 }}>@{s.loginId}</span>}
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>완료 {s.doneCount}회</span>
                  {first && <Badge kind="confirmed">첫상담 대상</Badge>}
                  {s.reverseSelf && <Badge kind="done">학생 신청</Badge>}
                </span>
                <Button
                  variant={s.reverseAdmin ? 'ghost' : 'primary'}
                  size="sm"
                  onClick={() => toggle(s)}
                  disabled={busy === s.studentId}
                >
                  {s.reverseAdmin ? '지정 해제' : '역상담 지정'}
                </Button>
              </div>
            );
          })
        ))}
      </Card>
    </div>
  );
}
