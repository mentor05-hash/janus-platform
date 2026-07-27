import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Booking, ConsultationNote } from '../api/types';
import { Card, Button, Badge, ErrorText, TextareaField } from '../components/ui';

const empty = {
  coreSummary: '',
  memo: '',
  homework: '',
  futureDir: '',
  guardianVisible: true,
  saveState: 'draft' as 'draft' | 'final',
};

export function NotePage() {
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState(empty);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    api.get<Booking>(`/bookings/${id}`).then(setBooking).catch(() => {});
    api
      .get<ConsultationNote>(`/bookings/${id}/note`)
      .then((n) =>
        setForm({
          coreSummary: n.coreSummary ?? '',
          memo: n.memo ?? '',
          homework: n.homework ?? '',
          futureDir: n.futureDir ?? '',
          guardianVisible: n.guardianVisible ?? true,
          saveState: n.saveState,
        }),
      )
      .catch(() => {
        /* 아직 기록 없음 — 빈 폼 */
      });
  }, [id]);

  async function save(saveState: 'draft' | 'final') {
    setError('');
    setMsg('');
    try {
      await api.put(`/bookings/${id}/note`, { ...form, saveState });
      setForm((f) => ({ ...f, saveState }));
      setMsg(saveState === 'final' ? '최종 저장되었습니다(학생·보호자 공개).' : '임시 저장되었습니다.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장 실패');
    }
  }

  const f = form;
  const set = (k: keyof typeof empty, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div>
      <Link to="/app/bookings">← 예약 목록</Link>
      <h2 style={{ color: 'var(--teal)' }}>
        상담 기록{' '}
        <Badge kind={f.saveState === 'final' ? 'done' : 'confirmed'}>
          {f.saveState === 'final' ? '최종' : '임시'}
        </Badge>
      </h2>
      {booking && (
        <p style={{ margin: '-4px 0 12px', fontSize: 13.5, color: 'var(--muted)' }}>
          <b style={{ color: 'var(--ink)' }}>{booking.studentName ?? `학생 ${booking.studentId.slice(0, 6)}`}</b>
          {booking.consultType ? ` · ${booking.consultType}` : ''}
          {booking.start ? ` · ${new Date(booking.start).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''} 상담
        </p>
      )}
      {booking && (booking.content || (booking.attachments?.length ?? 0) > 0) && (
        <Card style={{ marginBottom: 12, background: 'var(--teal-50, #eef4fb)' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--ink)' }}>학생 상담 요청</h4>
          {booking.content && (
            <p style={{ whiteSpace: 'pre-wrap', fontSize: 14, color: 'var(--ink)', margin: '0 0 10px' }}>{booking.content}</p>
          )}
          {(booking.attachments?.length ?? 0) > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>첨부 문제 ({booking.attachments!.length})</span>
              {booking.attachments!.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => api.downloadFile(a.id, a.name).catch((e) => setError(e instanceof ApiError ? e.message : '다운로드 실패'))}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer', fontSize: 13, color: 'var(--teal)' }}
                >
                  📄 {a.name} <span style={{ color: 'var(--muted)', fontSize: 11 }}>· 다운로드</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}
      <Card>
        <TextareaField label="핵심 요약 (학생·보호자 공개)" rows={2} value={f.coreSummary} onChange={(e) => set('coreSummary', e.target.value)} />
        <TextareaField label="숙제 (공개)" rows={2} value={f.homework} onChange={(e) => set('homework', e.target.value)} />
        <TextareaField label="향후 방향 (공개)" rows={2} value={f.futureDir} onChange={(e) => set('futureDir', e.target.value)} />
        <TextareaField label="내부 메모 (비공개 · 선생님/관리자만)" rows={2} value={f.memo} onChange={(e) => set('memo', e.target.value)} />
        <label style={{ fontSize: 14 }}>
          <input type="checkbox" checked={f.guardianVisible} onChange={(e) => set('guardianVisible', e.target.checked)} /> 보호자 공개
        </label>
        {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}
        <ErrorText>{error}</ErrorText>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Button variant="ghost" onClick={() => save('draft')}>임시 저장</Button>
          <Button onClick={() => save('final')}>최종 저장(완료 가능)</Button>
        </div>
      </Card>
    </div>
  );
}
