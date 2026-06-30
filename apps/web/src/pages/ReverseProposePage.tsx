import { useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, ErrorText, TextField, TextareaField, SelectField } from '../components/ui';

const todayStr = () => new Date().toISOString().slice(0, 10);

export function ReverseProposePage() {
  const [f, setF] = useState({
    studentId: '',
    date: todayStr(),
    consultType: '교과',
    mode: 'zoom',
    slotStart: 60,
    slotEnd: 63,
    content: '',
  });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const set = (k: keyof typeof f, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  async function submit() {
    setMsg('');
    setError('');
    try {
      const r = await api.post<{ id: string; status: string }>('/bookings/reverse', {
        studentId: f.studentId,
        date: f.date,
        consultType: f.consultType,
        mode: f.mode,
        slotStart: Number(f.slotStart),
        slotEnd: Number(f.slotEnd),
        content: f.content || undefined,
      });
      setMsg(`역상담 제안 생성됨(${r.status}). 학생 수락 시 확정됩니다.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '제안 실패');
    }
  }

  return (
    <div>
      <PageHeader
        title="역상담 제안"
        sub="첫 상담에 한해 선생님이 학생에게 먼저 제안. 슬롯은 10분 단위 인덱스(예: 10:00=60)."
      />
      <Card style={{ maxWidth: 480 }}>
        <TextField label="학생 ID (UUID)" value={f.studentId} onChange={(e) => set('studentId', e.target.value)} />
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <TextField label="날짜" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} />
          </div>
          <div>
            <SelectField
              label="유형"
              value={f.consultType}
              onChange={(e) => set('consultType', e.target.value)}
              options={['담임', '교과', '입시', '심리'].map((t) => ({ value: t, label: t }))}
            />
          </div>
          <div>
            <SelectField
              label="방식"
              value={f.mode}
              onChange={(e) => set('mode', e.target.value)}
              options={['zoom', 'chat', 'hand', 'offline', 'board'].map((m) => ({ value: m, label: m }))}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <TextField label="시작 슬롯" type="number" value={f.slotStart} onChange={(e) => set('slotStart', e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <TextField label="종료 슬롯" type="number" value={f.slotEnd} onChange={(e) => set('slotEnd', e.target.value)} />
          </div>
        </div>
        <TextareaField label="내용(선택)" rows={2} value={f.content} onChange={(e) => set('content', e.target.value)} />
        {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}
        <ErrorText>{error}</ErrorText>
        <Button onClick={submit} disabled={!f.studentId}>제안 보내기</Button>
      </Card>
    </div>
  );
}
