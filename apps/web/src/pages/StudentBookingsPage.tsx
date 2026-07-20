import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Booking, ConsultationNote, Slot, Teacher } from '../api/types';
import { PageHeader, Card, Button, Badge, ErrorText, Spinner, EmptyState } from '../components/ui';
import { SessionChatPanel } from '../components/SessionChatPanel';
import { SessionWhiteboardPanel } from '../components/SessionWhiteboardPanel';

const KST = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '-';
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const slotLen = (b: Booking) => (b.start && b.end ? Math.max(1, Math.round((new Date(b.end).getTime() - new Date(b.start).getTime()) / 600000)) : 3);

function RescheduleBox({ booking, onDone }: { booking: Booking; onDone: () => void }) {
  const duration = slotLen(booking);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [selStart, setSelStart] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const dates = useMemo(() => {
    const base = new Date();
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      return { iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, md: `${d.getMonth() + 1}/${d.getDate()}`, wd: WD[d.getDay()] };
    });
  }, []);
  useEffect(() => {
    setSlots(null); setSelStart(null);
    api.get<Slot[]>(`/teachers/${booking.teacherId}/slots?date=${date}`).then(setSlots).catch(() => setSlots([]));
  }, [booking.teacherId, date]);
  const availSet = useMemo(() => new Set((slots ?? []).filter((s) => s.status === 'avail').map((s) => s.index)), [slots]);
  const selValid = selStart !== null && Array.from({ length: duration }, (_, k) => selStart + k).every((i) => availSet.has(i));
  const byHour = useMemo(() => {
    const m = new Map<number, Slot[]>();
    for (const s of slots ?? []) { const h = Math.floor((s.index * 10) / 60); if (!m.has(h)) m.set(h, []); m.get(h)!.push(s); }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [slots]);

  async function submit() {
    if (selStart === null || !selValid) return;
    setBusy(true); setErr('');
    try { await api.patch(`/bookings/${booking.id}/reschedule`, { date, slotStart: selStart, slotEnd: selStart + duration }); onDone(); }
    catch (e) { setErr(e instanceof ApiError ? (e.status === 409 ? '선택한 시간은 예약할 수 없어요. 다른 시간을 골라주세요.' : e.message) : '시간 변경 실패'); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--line)' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>시간 변경 · {duration * 10}분 (같은 길이로 이동)</div>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
        {dates.map((d) => (
          <button key={d.iso} onClick={() => setDate(d.iso)} style={{ minWidth: 48, padding: '5px 6px', borderRadius: 8, cursor: 'pointer',
            border: d.iso === date ? '2px solid var(--teal)' : '1px solid var(--line)', background: d.iso === date ? 'var(--teal)' : '#fff', color: d.iso === date ? '#fff' : 'var(--ink)' }}>
            <div style={{ fontSize: 10 }}>{d.wd}</div><div style={{ fontSize: 13, fontWeight: 700 }}>{d.md}</div>
          </button>
        ))}
      </div>
      {slots === null ? <Spinner /> : slots.length === 0 ? <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>이 날짜엔 근무 시간이 없어요.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 8 }}>
          {byHour.map(([h, cells]) => (
            <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 26, fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>{h}시</span>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {cells.map((s) => {
                  const inSel = selStart !== null && selValid && s.index >= selStart && s.index < selStart + duration;
                  return <button key={s.index} disabled={s.status !== 'avail'} onClick={() => setSelStart(s.index)}
                    style={{ width: 48, padding: '4px 0', fontSize: 11, borderRadius: 6, border: 'none', cursor: s.status === 'avail' ? 'pointer' : 'default',
                      background: inSel ? 'var(--teal)' : s.status === 'avail' ? '#CFE7DA' : '#EEF1F3', color: inSel ? '#fff' : 'var(--ink)' }}>{s.time}</button>;
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {selStart !== null && !selValid && <p style={{ fontSize: 12, color: '#A97D24', marginTop: 6 }}>이 시작 시간부터 {duration * 10}분 연속으로 비어있지 않아요.</p>}
      {err && <ErrorText>{err}</ErrorText>}
      <Button size="sm" disabled={!selValid || busy} onClick={submit} style={{ marginTop: 8 }}>이 시간으로 변경</Button>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  new: '대기', confirmed: '예약됨', done: '완료', cancelled: '취소', rejected: '거절', noshow: '노쇼',
};
const badgeKind = (s: string) => (['new', 'confirmed', 'done', 'cancelled', 'rejected', 'noshow'].includes(s) ? s : 'soft') as 'new';

function ReviewBox({ bookingId, alreadyReviewed }: { bookingId: string; alreadyReviewed?: boolean }) {
  const [r, setR] = useState({ ratingAttitude: 5, ratingContent: 5, ratingSkill: 5, ratingAgain: 5, text: '' });
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const items: [keyof typeof r, string][] = [['ratingAttitude', '태도'], ['ratingContent', '내용'], ['ratingSkill', '실력'], ['ratingAgain', '재신청']];
  async function submit() {
    setErr('');
    try { await api.post(`/bookings/${bookingId}/review`, r); setDone(true); }
    catch (e) { setErr(e instanceof ApiError ? e.message : '후기 등록 실패'); }
  }
  if (alreadyReviewed && !done) return <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>✓ 이미 후기를 남긴 상담입니다. 선생님 평점에 반영되었어요.</p>;
  if (done) return <p style={{ color: 'var(--chip-done)', fontSize: 13, marginTop: 8 }}>후기가 등록되었습니다. 감사합니다!</p>;
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--line)' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>상담 후기 작성</div>
      {items.map(([k, label]) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ width: 56, fontSize: 13, color: 'var(--muted)' }}>{label}</span>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setR((p) => ({ ...p, [k]: n }))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: n <= (r[k] as number) ? '#CF9A3A' : 'var(--line)' }}>★</button>
          ))}
        </div>
      ))}
      <textarea className="textarea" rows={2} placeholder="후기(선택)" value={r.text} onChange={(e) => setR((p) => ({ ...p, text: e.target.value }))} style={{ marginTop: 6 }} />
      {err && <ErrorText>{err}</ErrorText>}
      <Button size="sm" onClick={submit}>후기 등록</Button>
    </div>
  );
}

function Detail({ bookingId, status }: { bookingId: string; status: string }) {
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
      {status === 'done' && <ReviewBox bookingId={bookingId} alreadyReviewed={b?.reviewed} />}
    </div>
  );
}

export function StudentBookingsPage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [teachers, setTeachers] = useState<Record<string, string>>({});
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatOn, setChatOn] = useState(false);
  const [wbId, setWbId] = useState<string | null>(null);
  const [wbOn, setWbOn] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  function load() {
    api.get<Booking[]>('/bookings?role=student').then(setBookings).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
    api.get<{ chat: boolean; whiteboard: boolean }>('/realtime/features').then((f) => { setChatOn(!!f.chat); setWbOn(!!f.whiteboard); }).catch(() => {});
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

  async function cancel(id: string) {
    setBusy(id); setError(''); setMsg('');
    try { await api.patch(`/bookings/${id}/cancel`, {}); setMsg('예약을 취소했습니다. 크레딧은 환원됩니다.'); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '취소 실패'); } finally { setBusy(null); }
  }
  async function reportNoshow(id: string) {
    if (!window.confirm('이 상담이 실제로 진행되지 않았나요? 관리자에게 신고됩니다.')) return;
    setBusy(id); setError(''); setMsg('');
    try { await api.post('/reports', { targetType: 'booking', targetId: id, reason: '미진행(노쇼) 신고 — 상담이 실제로 진행되지 않았습니다.' }); setMsg('미진행 신고가 접수되었습니다. 관리자가 확인합니다.'); }
    catch (e) { setError(e instanceof ApiError ? e.message : '신고 실패'); } finally { setBusy(null); }
  }

  const tName = (id: string) => teachers[id] ?? '선생님';
  const UPCOMING = new Set(['new', 'confirmed']);

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
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Badge kind={badgeKind(b.status)}>{STATUS_LABEL[b.status] ?? b.status}</Badge>
                {/* 선생님 인지 확인(ack) — 자동확정 예약에서 "선생님이 봤는지"를 학생에게 노출 */}
                {b.status === 'confirmed' && (b.teacherAckAt
                  ? <Badge kind="done">선생님 확인 ✓</Badge>
                  : <Badge kind="soft">선생님 확인 대기</Badge>)}
                {UPCOMING.has(b.status) && <Button variant="ghost" size="sm" disabled={busy === b.id} onClick={() => setRescheduling(rescheduling === b.id ? null : b.id)}>시간 변경</Button>}
                {UPCOMING.has(b.status) && <Button variant="ghost" size="sm" disabled={busy === b.id} onClick={() => cancel(b.id)} style={{ color: 'var(--danger)' }}>예약 취소</Button>}
                {b.status === 'done' && <Button variant="ghost" size="sm" disabled={busy === b.id} onClick={() => reportNoshow(b.id)} style={{ color: 'var(--danger)' }}>미진행 신고</Button>}
                {b.mode === 'zoom' && b.meetingUrl && b.status !== 'new' && <Button size="sm" onClick={() => window.open(b.meetingUrl!, '_blank', 'noopener')}>🎥 줌 입장</Button>}
                {chatOn && <Button variant="ghost" size="sm" onClick={() => setChatId(b.id)}>💬 채팅</Button>}
                {wbOn && b.status !== 'new' && <Button variant="ghost" size="sm" onClick={() => setWbId(b.id)}>🖊 화이트보드</Button>}
                <Button variant="ghost" size="sm" onClick={() => setOpen(open === b.id ? null : b.id)}>{open === b.id ? '접기' : '상세'}</Button>
              </div>
            </div>
            {rescheduling === b.id && <RescheduleBox booking={b} onDone={() => { setRescheduling(null); setMsg('시간이 변경되었습니다. 선생님 재확인 후 확정됩니다.'); load(); }} />}
            {open === b.id && <Detail bookingId={b.id} status={b.status} />}
          </Card>
        ))
      )}
      {chatId && user && <SessionChatPanel bookingId={chatId} myId={user.id} title="상담 채팅" onClose={() => setChatId(null)} />}
      {wbId && <SessionWhiteboardPanel bookingId={wbId} title="공유 화이트보드" onClose={() => setWbId(null)} />}
    </div>
  );
}
