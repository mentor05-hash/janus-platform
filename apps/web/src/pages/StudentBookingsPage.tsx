import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Booking, ConsultationNote, Teacher } from '../api/types';
import { PageHeader, Card, Button, Badge, ErrorText, Spinner, EmptyState } from '../components/ui';

const KST = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '-';

const STATUS_LABEL: Record<string, string> = {
  new: '대기', confirmed: '예약됨', done: '완료', cancelled: '취소', rejected: '거절', noshow: '노쇼',
};
const badgeKind = (s: string) => (['new', 'confirmed', 'done', 'cancelled', 'rejected', 'noshow'].includes(s) ? s : 'soft') as 'new';

function Detail({ bookingId }: { bookingId: string }) {
  const [b, setB] = useState<Booking | null>(null);
  const [note, setNote] = useState<ConsultationNote | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.get<Booking>(`/bookings/${bookingId}`).then(setB).catch((e) => setErr(e instanceof ApiError ? e.message : '조회 실패'));
    api.get<ConsultationNote>(`/bookings/${bookingId}/note`).then(setNote).catch(() => setNote(null));
  }, [bookingId]);
  const noteFinal = note && note.saveState === 'final';
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
      {err && <ErrorText>{err}</ErrorText>}
      {b?.content && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>내가 보낸 상담 내용</div>
          <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{b.content}</div>
        </div>
      )}
      {(b?.attachments?.length ?? 0) > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>첨부 문제</div>
          {b!.attachments!.map((a) => (
            <button key={a.id} type="button" onClick={() => api.downloadFile(a.id, a.name).catch(() => {})}
              style={{ display: 'block', color: 'var(--teal)', background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer', fontSize: 13 }}>
              📄 {a.name} · 다운로드
            </button>
          ))}
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>상담 기록</div>
      {noteFinal ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
          {note!.coreSummary && <div><b>핵심 요약</b> · {note!.coreSummary}</div>}
          {note!.homework && <div><b>숙제</b> · {note!.homework}</div>}
          {note!.futureDir && <div><b>향후 방향</b> · {note!.futureDir}</div>}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>아직 공개된 상담 기록이 없어요(완료 후 열람 가능).</div>
      )}
    </div>
  );
}

export function StudentBookingsPage() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [teachers, setTeachers] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  function load() {
    api.get<Booking[]>('/bookings?role=student').then(setBookings).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }
  useEffect(() => {
    load();
    api.get<{ data?: Teacher[] } | Teacher[]>('/teachers').then((r) => {
      const list = Array.isArray(r) ? r : (r.data ?? []);
      setTeachers(Object.fromEntries(list.map((t) => [t.id, t.name])));
    }).catch(() => {});
  }, []);

  const { incoming, mine } = useMemo(() => {
    const all = bookings ?? [];
    return {
      incoming: all.filter((b) => b.direction === 'reverse' && b.status === 'new'),
      mine: all.filter((b) => !(b.direction === 'reverse' && b.status === 'new')),
    };
  }, [bookings]);

  async function respond(id: string, action: 'accept' | 'reject') {
    setBusy(id); setError(''); setMsg('');
    try {
      await api.patch(`/bookings/${id}/reverse-respond`, { action });
      setMsg(action === 'accept' ? '역상담을 수락했습니다. 예약이 확정됐어요.' : '역상담을 거절했습니다.');
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '처리 실패');
    } finally {
      setBusy(null);
    }
  }

  const tName = (id: string) => teachers[id] ?? '선생님';

  return (
    <div>
      <PageHeader title="내 예약·상담" sub="역상담 제안 수락, 예약 현황과 상담 기록을 확인합니다." />
      {error && <ErrorText>{error}</ErrorText>}
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}

      {/* 역상담 수신 */}
      <h3 style={{ fontSize: 15, margin: '8px 0' }}>
        선생님 역상담 제안 {incoming.length > 0 && <Badge kind="new">{incoming.length}</Badge>}
      </h3>
      {bookings === null ? <Spinner /> : incoming.length === 0 ? (
        <Card><EmptyState>받은 역상담 제안이 없어요.</EmptyState></Card>
      ) : (
        incoming.map((b) => (
          <Card key={b.id} style={{ marginBottom: 8, borderColor: 'var(--teal)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <b>{tName(b.teacherId)}</b> 선생님의 역상담 제안
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{KST(b.start)} · {b.consultType ?? ''} · {b.mode}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="ghost" size="sm" disabled={busy === b.id} onClick={() => respond(b.id, 'reject')}>거절</Button>
                <Button size="sm" disabled={busy === b.id} onClick={() => respond(b.id, 'accept')}>수락</Button>
              </div>
            </div>
          </Card>
        ))
      )}

      {/* 내 예약 */}
      <h3 style={{ fontSize: 15, margin: '18px 0 8px' }}>예약 현황</h3>
      {bookings === null ? <Spinner /> : mine.length === 0 ? (
        <Card><EmptyState>예약 내역이 없어요.</EmptyState></Card>
      ) : (
        mine.map((b) => (
          <Card key={b.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <b>{tName(b.teacherId)}</b>
                {b.direction === 'reverse' && <Badge kind="soft">역상담</Badge>}
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{KST(b.start)} · {b.consultType ?? ''} · {b.mode} · {b.chargedCredits.toLocaleString()}크레딧</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Badge kind={badgeKind(b.status)}>{STATUS_LABEL[b.status] ?? b.status}</Badge>
                <Button variant="ghost" size="sm" onClick={() => setOpen(open === b.id ? null : b.id)}>{open === b.id ? '접기' : '상세'}</Button>
              </div>
            </div>
            {open === b.id && <Detail bookingId={b.id} />}
          </Card>
        ))
      )}
    </div>
  );
}
