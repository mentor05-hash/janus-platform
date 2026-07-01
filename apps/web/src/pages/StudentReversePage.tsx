import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, ErrorText, Spinner } from '../components/ui';

export function StudentReversePage() {
  const [value, setValue] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get<{ reverseSelf: boolean }>('/bookings/reverse/self').then((r) => setValue(r.reverseSelf)).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, []);

  async function toggle(next: boolean) {
    setBusy(true); setError(''); setMsg('');
    try {
      await api.patch('/bookings/reverse/self', { value: next });
      setValue(next);
      setMsg(next ? '역상담 받기를 신청했습니다. 선생님 목록에 노출됩니다.' : '역상담 받기 신청을 취소했습니다.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '변경 실패');
    } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader title="역상담 받기" sub="역상담은 선생님이 먼저 상담을 제안하는 기능입니다. 켜면 첫 상담 이후에도 선생님이 제안할 수 있어요." />
      {error && <ErrorText>{error}</ErrorText>}
      {value === null ? <Spinner /> : (
        <Card style={{ maxWidth: 520, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <b style={{ fontSize: 15 }}>선생님 역상담 제안 받기</b>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{value ? '신청됨 — 선생님 목록에 노출됩니다.' : '꺼짐 — 첫 상담만 제안받습니다.'}</div>
          </div>
          <Button variant={value ? 'ghost' : 'primary'} disabled={busy} onClick={() => toggle(!value)}>{value ? '신청 취소' : '역상담 받기 신청'}</Button>
        </Card>
      )}
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}
      <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 12 }}>• 받은 제안은 <b>내 예약·상담</b>에서 수락/거절할 수 있어요.<br />• 첫 상담이 필요한 경우엔 이 설정과 무관하게 선생님이 제안할 수 있습니다.</p>
    </div>
  );
}
