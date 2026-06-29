import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { ConsultationNote } from '../api/types';

export function StudentNotesPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const [notes, setNotes] = useState<ConsultationNote[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!studentId) return;
    api
      .get<ConsultationNote[]>(`/students/${studentId}/notes`)
      .then(setNotes)
      .catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, [studentId]);

  return (
    <div>
      <Link to="/app/bookings">← 예약 목록</Link>
      <h2 style={{ color: 'var(--teal)' }}>학생 상담 이력</h2>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>내가 작성한 이 학생의 상담 기록만 표시됩니다.</p>
      {error && <p className="error">{error}</p>}
      <div style={{ display: 'grid', gap: 8 }}>
        {notes.map((n) => (
          <div className="card" key={n.bookingId}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{n.coreSummary || '(요약 없음)'}</strong>
              <span className={`chip ${n.saveState === 'final' ? 'done' : 'confirmed'}`}>{n.saveState}</span>
            </div>
            {n.homework && <div style={{ fontSize: 13, marginTop: 4 }}>숙제: {n.homework}</div>}
            {n.futureDir && <div style={{ fontSize: 13 }}>향후: {n.futureDir}</div>}
            {n.memo != null && <div style={{ fontSize: 13, color: 'var(--muted)' }}>내부메모: {n.memo}</div>}
          </div>
        ))}
        {notes.length === 0 && !error && <p style={{ color: 'var(--muted)' }}>기록이 없습니다.</p>}
      </div>
    </div>
  );
}
