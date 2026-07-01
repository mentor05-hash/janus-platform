import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { CreditAccount, Quote, Slot, Teacher } from '../api/types';
import { PageHeader, Card, Button, Badge, GradeBadge, ErrorText, Spinner, EmptyState, TextField, TextareaField, SelectField } from '../components/ui';

const todayStr = () => new Date().toISOString().slice(0, 10);
const minToTime = (idx: number) => `${String(Math.floor((idx * 10) / 60)).padStart(2, '0')}:${String((idx * 10) % 60).padStart(2, '0')}`;
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const DURATION = 3, MIN_LEN = 1, FORCE_WINDOW = 4;

const SLOT_UI: Record<Slot['status'], { label: string; bg: string; fg: string; bd: string }> = {
  avail: { label: '가능', bg: '#CDEBDD', fg: '#0F7A43', bd: '#9FD9BE' },
  booked: { label: '예약', bg: '#D6E4FB', fg: '#2563EB', bd: '#AFC8F4' },
  rest: { label: '휴게', bg: '#E9EDF0', fg: '#8B9BA3', bd: '#DCE2E6' },
  off: { label: '근무외', bg: '#F4F6F8', fg: '#BAC4CA', bd: '#EAEEF0' },
  blocked: { label: '차단', bg: '#FAD9D9', fg: '#C92A2A', bd: '#F0BEBE' },
};
const SUBJECTS = ['국어', '수학', '영어', '탐구'];
const MODES = ['zoom', 'chat', 'hand'];
type Attachment = { id: string; name: string; type?: string };

function BookingForm({ teacher, onDone, onBack }: { teacher: Teacher; onDone: () => void; onBack: () => void }) {
  const [date, setDate] = useState(todayStr());
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [subject, setSubject] = useState('수학');
  const [content, setContent] = useState('');
  const [mode, setMode] = useState('zoom');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function resetSel() { setSelStart(null); setSelEnd(null); setNotice(''); setQuote(null); }

  useEffect(() => {
    resetSel(); setSlots(null);
    api.get<Slot[]>(`/teachers/${teacher.id}/slots?date=${date}`).then(setSlots).catch((e) => setError(e instanceof ApiError ? e.message : '슬롯 조회 실패'));
  }, [teacher.id, date]);

  useEffect(() => {
    if (selStart === null || selEnd === null) return;
    api.post<Quote>('/bookings/quote', { teacherId: teacher.id, date, mode, slotStart: selStart, slotEnd: selEnd + 1 })
      .then(setQuote).catch(() => setQuote(null));
  }, [selStart, selEnd, mode, teacher.id, date]);

  const dateOptions = useMemo(() => {
    const base = new Date();
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { iso, md: `${d.getMonth() + 1}/${d.getDate()}`, wd: WD[d.getDay()], dow: d.getDay() };
    });
  }, []);
  const byHour = useMemo(() => {
    const m = new Map<number, Slot[]>();
    for (const s of slots ?? []) { const h = Math.floor((s.index * 10) / 60); if (!m.has(h)) m.set(h, []); m.get(h)!.push(s); }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [slots]);
  const availSet = useMemo(() => new Set((slots ?? []).filter((s) => s.status === 'avail').map((s) => s.index)), [slots]);
  const statusAt = (idx: number) => (slots ?? []).find((s) => s.index === idx)?.status;
  const selLen = selStart !== null && selEnd !== null ? selEnd - selStart + 1 : 0;

  const runStartOf = (idx: number) => { let i = idx; while (availSet.has(i - 1)) i -= 1; return i; };
  const afterBooking = (rs: number) => statusAt(rs - 1) === 'rest' && statusAt(rs - 2) === 'booked';
  const forcedStartFor = (idx: number) => { const rs = runStartOf(idx); return afterBooking(rs) && idx - rs < FORCE_WINDOW ? rs : idx; };
  function selectNew(idx: number) {
    if (!availSet.has(idx)) return;
    const fs = forcedStartFor(idx); let end = fs;
    while (end - fs + 1 < DURATION && availSet.has(end + 1)) end += 1;
    setSelStart(fs); setSelEnd(end);
    setNotice(fs !== idx ? `이전 상담 직후라 이 시간대는 ${minToTime(fs)} 시작만 가능해요(휴게 10분).` : afterBooking(fs) ? `이전 상담 직후 — ${minToTime(fs)} 시작 고정.` : '');
  }
  function onTapCell(idx: number) {
    if (statusAt(idx) !== 'avail') return;
    if (selStart === null || selEnd === null) return selectNew(idx);
    if (idx === selStart && selEnd > selStart) { const ns = selStart + 1; if (forcedStartFor(ns) !== ns) { setNotice(`이 시간대는 ${minToTime(selStart)} 시작만 가능해요.`); return; } setSelStart(ns); return; }
    if (idx === selEnd && selEnd > selStart) { setSelEnd(selEnd - 1); return; }
    return selectNew(idx);
  }

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []); if (!files.length) return;
    for (const f of files) {
      const form = new FormData(); form.append('file', f, f.name);
      try {
        const r = await api.upload<{ id: string; filename: string; contentType: string }>('/files', form);
        setAttachments((p) => [...p, { id: r.id, name: r.filename, type: r.contentType }]);
      } catch (er) { setError(er instanceof ApiError ? er.message : '업로드 실패'); }
    }
    e.target.value = '';
  }

  async function book() {
    if (selStart === null || selEnd === null) return;
    setError(''); setMsg('');
    try {
      await api.post('/bookings', { teacherId: teacher.id, date, consultType: '교과', subType: subject, mode, slotStart: selStart, slotEnd: selEnd + 1, content: content || undefined, attachments });
      setMsg('상담이 신청되었습니다.'); setTimeout(onDone, 900);
    } catch (e) {
      setError(e instanceof ApiError ? (e.status === 402 ? '크레딧이 부족합니다.' : e.message) : '예약 실패');
    }
  }

  return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontWeight: 600, marginBottom: 8 }}>‹ 선생님 목록</button>
      <PageHeader title={`상담 신청 · ${teacher.name}`} sub="날짜·시간을 고르면 크레딧이 함께 계산됩니다." />
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Card style={{ flex: '1 1 440px', minWidth: 340 }}>
          {/* 날짜 */}
          <label className="label">날짜</label>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {dateOptions.map((d) => {
              const on = d.iso === date;
              return (
                <button key={d.iso} onClick={() => setDate(d.iso)} style={{
                  minWidth: 54, padding: '6px 8px', borderRadius: 9, cursor: 'pointer',
                  border: on ? '2px solid var(--teal)' : '1px solid var(--line)', background: on ? 'var(--teal)' : '#fff', color: on ? '#fff' : 'var(--ink)',
                }}>
                  <div style={{ fontSize: 11, color: on ? '#fff' : d.dow === 0 ? '#DC2626' : d.dow === 6 ? '#2563EB' : 'var(--muted)' }}>{d.wd}</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{d.md}</div>
                </button>
              );
            })}
          </div>
          {/* 시간 표 */}
          <label className="label" style={{ marginTop: 12 }}>시간 (가능 시간만 · 기본 30분)</label>
          {slots === null ? <Spinner /> : slots.length === 0 ? <EmptyState>이 날짜엔 선생님 근무 시간이 없어요.</EmptyState> : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {byHour.map(([h, cells]) => (
                  <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 30, fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>{h}시</span>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {cells.map((s) => {
                        const inRange = selStart !== null && selEnd !== null && s.index >= selStart && s.index <= selEnd;
                        const u = SLOT_UI[s.status]; const clickable = s.status === 'avail';
                        return (
                          <button key={s.index} disabled={!clickable} onClick={() => onTapCell(s.index)} title={`${s.time} · ${u.label}`}
                            style={{ width: 50, padding: '5px 0', fontSize: 11, borderRadius: 7, fontWeight: inRange ? 700 : 500,
                              border: inRange ? '2px solid var(--teal)' : `1px solid ${u.bd}`, background: inRange ? 'var(--teal)' : u.bg, color: inRange ? '#fff' : u.fg, cursor: clickable ? 'pointer' : 'default' }}>
                            {s.time}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
                {(['avail', 'booked', 'rest', 'off'] as Slot['status'][]).map((k) => (
                  <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 11, height: 11, borderRadius: 3, background: SLOT_UI[k].bg, border: `1px solid ${SLOT_UI[k].bd}` }} />{SLOT_UI[k].label}
                  </span>
                ))}
              </div>
              {notice && <div style={{ marginTop: 8, background: '#FEF6E7', border: '1px solid #F0DCAE', borderRadius: 8, padding: 8, fontSize: 12, color: '#92600a' }}>ⓘ {notice}</div>}
              {selStart !== null && selEnd !== null && (
                <div style={{ marginTop: 10, background: 'var(--teal-50, #eef6fa)', borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <b>{minToTime(selStart)} ~ {minToTime(selEnd + 1)} · {selLen * 10}분</b>
                    <b style={{ color: 'var(--teal)', fontSize: 16 }}>{quote ? `${quote.credits.toLocaleString()} 크레딧` : '계산 중…'}</b>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <Button variant="ghost" size="sm" disabled={selLen <= MIN_LEN} onClick={() => selEnd !== null && setSelEnd(selEnd - 1)}>−10분</Button>
                    <Button variant="ghost" size="sm" disabled={!availSet.has(selEnd + 1)} onClick={() => selEnd !== null && setSelEnd(selEnd + 1)}>＋10분</Button>
                    <Button variant="ghost" size="sm" onClick={resetSel}>초기화</Button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>시간을 늘리거나 줄이면 크레딧도 함께 바뀝니다.</div>
                </div>
              )}
            </>
          )}
        </Card>

        <Card style={{ flex: '1 1 320px', minWidth: 280 }}>
          <SelectField label="과목" value={subject} onChange={(e) => setSubject(e.target.value)} options={SUBJECTS.map((s) => ({ value: s, label: s }))} />
          <SelectField label="진행 방식" value={mode} onChange={(e) => setMode(e.target.value)} options={MODES.map((m) => ({ value: m, label: m }))} />
          <TextareaField label="상담 내용" rows={3} value={content} onChange={(e) => setContent(e.target.value)} placeholder="예: 미적분 30번, 합성함수 미분 풀이가 막혀요." />
          <label className="label">문제 업로드</label>
          <input ref={fileRef} type="file" multiple accept="image/*,application/pdf,video/*" style={{ display: 'none' }} onChange={onFiles} />
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>📎 파일 첨부</Button>
          {attachments.map((a) => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: 13 }}>
              <span>📄 {a.name}</span>
              <button onClick={() => setAttachments((p) => p.filter((x) => x.id !== a.id))} style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>삭제</button>
            </div>
          ))}
          {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}
          <ErrorText>{error}</ErrorText>
          <Button block onClick={book} disabled={selStart === null || (quote ? !quote.valid : false)}>예약하기 {quote && quote.valid ? `· ${quote.credits.toLocaleString()} 크레딧` : ''}</Button>
          {quote && !quote.valid && <p style={{ color: '#92600a', fontSize: 12 }}>⚠ {quote.message || '이 시간대는 이용할 수 없어요.'}</p>}
        </Card>
      </div>
    </div>
  );
}

export function StudentSearchPage() {
  const [teachers, setTeachers] = useState<Teacher[] | null>(null);
  const [picked, setPicked] = useState<Teacher | null>(null);
  const [credit, setCredit] = useState<CreditAccount | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ data?: Teacher[] } | Teacher[]>('/teachers').then((r) => setTeachers(Array.isArray(r) ? r : (r.data ?? []))).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
    api.get<CreditAccount>('/credits/account').then(setCredit).catch(() => {});
  }, []);

  if (picked) return <BookingForm teacher={picked} onBack={() => setPicked(null)} onDone={() => setPicked(null)} />;

  const rows = (teachers ?? []).filter((t) => !q.trim() || t.name.toLowerCase().includes(q.toLowerCase()) || t.subjects.join(',').includes(q));
  return (
    <div>
      <PageHeader title="선생님 찾기" sub={credit ? `보유 크레딧 ${credit.total.toLocaleString()}` : '선생님을 고르고 상담을 신청하세요.'} />
      {error && <ErrorText>{error}</ErrorText>}
      <div style={{ maxWidth: 420, marginBottom: 12 }}>
        <TextField placeholder="이름·과목 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {teachers === null ? <Spinner /> : rows.length === 0 ? <Card><EmptyState>선생님이 없어요.</EmptyState></Card> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {rows.map((t) => (
            <Card key={t.id} style={{ cursor: 'pointer' }}>
              <button onClick={() => setPicked(t)} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <b style={{ fontSize: 15 }}>{t.name}</b>
                  <GradeBadge grade={t.grade} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{t.subjects.join(', ')} · {t.category ?? '-'} · 평점 {t.rating ?? 0}</div>
                <div style={{ marginTop: 8 }}><Badge kind="confirmed">상담 신청 →</Badge></div>
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
