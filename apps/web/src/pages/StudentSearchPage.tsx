import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { CreditAccount, Material, Quote, Slot, Teacher } from '../api/types';
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
const MODES: { value: string; label: string }[] = [
  { value: 'zoom', label: '줌 화상' }, { value: 'chat', label: '실시간 채팅' }, { value: 'hand', label: '필기 공유' }, { value: 'offline', label: '오프라인(센터 대면)' },
];
type Attachment = { id: string; name: string; type?: string };
const actBtn: React.CSSProperties = { flex: 1, background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 0', fontSize: 12, color: 'var(--muted)', cursor: 'pointer' };

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
      if (e instanceof ApiError && e.status === 409 && mode === 'zoom') {
        setError('지금은 줌 상담실이 가득 찼어요. 채팅·필기·오프라인 등 다른 방식을 선택해 주세요.');
        return;
      }
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
          <SelectField label="진행 방식" value={mode} onChange={(e) => setMode(e.target.value)} options={MODES} />
          {mode === 'offline' && <p style={{ fontSize: 12, color: 'var(--muted)', background: 'var(--fill,#f6f8fa)', borderRadius: 8, padding: 9, margin: '0 0 8px' }}>🏫 오프라인은 가능한 선생님·센터·시간이 제한되며 센터 상담실 점유료가 가산됩니다.</p>}
          {mode === 'zoom' && <p style={{ fontSize: 12, color: '#92600a', background: '#FEF6E7', borderRadius: 8, padding: 9, margin: '0 0 8px' }}>🎥 줌은 센터 상담실 동시 이용 한도가 있어, 예약 시점에 자리가 없으면 다른 방식을 선택해야 할 수 있어요.</p>}
          <p style={{ fontSize: 12, color: 'var(--teal)', background: 'var(--teal-50,#F0F7FA)', borderRadius: 8, padding: 9, margin: '0 0 8px' }}>📋 게시판(문항·일반) 질문은 Q&A 게시판에서 건당 신청해요.</p>
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

type TeacherDetail = Teacher & { career?: string | null; subSubjects?: string[]; intro?: string | null; strengths?: string[]; reRequestRate?: number | null; avgResponseMin?: number | null };

function TeacherDetailView({ teacher, onBook, onBack }: { teacher: Teacher; onBook: () => void; onBack: () => void }) {
  const [detail, setDetail] = useState<TeacherDetail>(teacher);
  const [materials, setMaterials] = useState<Material[] | null>(null);

  useEffect(() => {
    api.get<TeacherDetail>(`/teachers/${teacher.id}`).then((d) => setDetail({ ...teacher, ...d })).catch(() => {});
    api.get<Material[]>('/materials').then((all) => setMaterials(all.filter((m) => m.teacherId === teacher.id))).catch(() => setMaterials([]));
  }, [teacher]);

  const stat = (label: string, value: string) => (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div>
    </div>
  );

  return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontWeight: 600, marginBottom: 8 }}>‹ 선생님 목록</button>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--teal-100,#DCECF3)', color: 'var(--teal)', display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 800 }}>{teacher.name.slice(0, 1)}</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <b style={{ fontSize: 19 }}>{teacher.name}</b><GradeBadge grade={teacher.grade} />
              {teacher.offlineAvailable && <Badge kind="done">오프라인 가능</Badge>}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
              {detail.subjects.join(', ')}{detail.category ? ` · ${detail.category}` : ''}{detail.career ? ` · ${detail.career}` : ''}
            </div>
          </div>
        </div>
        {(detail.strengths?.length ?? 0) > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            {detail.strengths!.map((s) => <Badge key={s} kind="soft">#{s}</Badge>)}
          </div>
        )}
        {detail.intro && <p style={{ fontSize: 14, color: 'var(--ink)', margin: '10px 0 0', lineHeight: 1.6 }}>{detail.intro}</p>}
        <div style={{ display: 'flex', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
          {stat('만족도', `★ ${detail.rating ?? 0}`)}
          {stat('누적 상담', `${(detail.totalConsult ?? 0).toLocaleString()}회`)}
          {stat('재요청률', detail.reRequestRate != null ? `${detail.reRequestRate}%` : '-')}
          {stat('평균 응답', detail.avgResponseMin != null ? `${detail.avgResponseMin}분` : '-')}
        </div>
      </Card>

      <h3 style={{ fontSize: 15, margin: '18px 0 8px' }}>칼럼 · 기출 자료</h3>
      {materials === null ? <Spinner /> : materials.length === 0 ? <Card><EmptyState>등록된 자료가 없어요.</EmptyState></Card> : (
        materials.map((m) => (
          <Card key={m.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <b style={{ fontSize: 14 }}>📄 {m.title}</b>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{m.subject ?? ''}{m.category ? ` · ${m.category}` : ''} · {new Date(m.createdAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</div>
              </div>
              {m.fileId && <Button size="sm" variant="ghost" onClick={() => api.downloadFile(m.fileId!, m.filename ?? m.title).catch(() => {})}>다운로드</Button>}
            </div>
            {m.description && <p style={{ fontSize: 13, color: 'var(--muted)', margin: '8px 0 0' }}>{m.description}</p>}
          </Card>
        ))
      )}

      <div style={{ position: 'sticky', bottom: 0, background: 'var(--bg,#fff)', padding: '12px 0', marginTop: 12 }}>
        <Button block onClick={onBook}>시간대 선택하고 예약 →</Button>
      </div>
    </div>
  );
}

const STRENGTH_POOL = ['개념정리', '문제풀이', '내신대비', '수능대비', '오답관리', '동기부여', '기초탄탄', '심화학습', '입시전략', '멘탈관리'];
const CTYPES: [string, string][] = [['담임', '🏫'], ['교과', '📐'], ['입시', '🎯'], ['심리', '💬']];
const SUBTYPES: Record<string, string[]> = {
  담임: ['생활전반', '학습전반'],
  교과: ['국어', '수학', '영어', '과학', '사회'],
  입시: ['성적별 대학라인', '유리한 전형', '입시정보', '유료컨설팅'],
  심리: ['LCA코칭', '심리상담'],
};

export function StudentSearchPage() {
  const navigate = useNavigate();
  const [teachers, setTeachers] = useState<Teacher[] | null>(null);
  const [picked, setPicked] = useState<Teacher | null>(null);
  const [phase, setPhase] = useState<'detail' | 'book'>('detail');
  const [credit, setCredit] = useState<CreditAccount | null>(null);
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [mode, setMode] = useState<'상담' | '질문'>('상담');
  const [consultType, setConsultType] = useState<string | null>(null);
  const [subType, setSubType] = useState<string | null>(null);
  const [category, setCategory] = useState('전체');
  const [sort, setSort] = useState('grade');
  const [q, setQ] = useState('');
  const [needs, setNeeds] = useState<string[]>([]);
  const [recs, setRecs] = useState<(Teacher & { matchedNeeds?: string[]; strengths?: string[] })[] | null>(null);
  const [board, setBoard] = useState<(Teacher & { rank: number; score: number })[]>([]);
  const [error, setError] = useState('');

  const subjectFilter = consultType === '교과' ? subType : null;

  async function recommend() {
    setError('');
    try {
      const r = await api.post<(Teacher & { matchedNeeds?: string[] })[]>('/teachers/recommend', { subject: subjectFilter ?? undefined, needs });
      setRecs(r);
    } catch (e) { setError(e instanceof ApiError ? e.message : '추천 실패'); }
  }

  useEffect(() => {
    const params = new URLSearchParams();
    if (category !== '전체') params.set('category', category);
    if (subjectFilter) params.set('subject', subjectFilter);
    if (sort) params.set('sort', sort);
    params.set('size', '100');
    setTeachers(null);
    api.get<{ data?: Teacher[] } | Teacher[]>(`/teachers?${params}`).then((r) => setTeachers(Array.isArray(r) ? r : (r.data ?? []))).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, [category, sort, subjectFilter]);
  // 뒤로가기: 목록↔상세↔예약을 브라우저 히스토리와 동기화(뒤로가기 시 이전 단계로).
  const pickedRef = useRef(picked); pickedRef.current = picked;
  const phaseRef = useRef(phase); phaseRef.current = phase;
  useEffect(() => {
    const onPop = () => {
      if (!pickedRef.current) return;
      if (phaseRef.current === 'book') setPhase('detail');
      else setPicked(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const openDetail = (t: Teacher) => { setPicked(t); setPhase('detail'); window.history.pushState({ itall: 'detail' }, ''); };
  const openBook = () => { setPhase('book'); window.history.pushState({ itall: 'book' }, ''); };

  useEffect(() => {
    api.get<CreditAccount>('/credits/account').then(setCredit).catch(() => {});
    api.get<{ id: string; name: string }[]>('/categories?kind=teacher').then(setCats).catch(() => {});
    api.get<(Teacher & { rank: number; score: number })[]>('/teachers/leaderboard').then(setBoard).catch(() => {});
  }, []);

  const [note, setNote] = useState('');
  async function fav(t: Teacher) {
    setNote('');
    try { await api.post('/me/teacher-lists', { teacherId: t.id, type: 'fit' }); setNote(`${t.name} 선생님을 내 선생님(찜)에 추가했어요.`); }
    catch (e) { setNote(e instanceof ApiError ? e.message : '실패'); }
  }
  async function block(t: Teacher) {
    setNote('');
    try { await api.post('/teacher-blocks', { teacherId: t.id }); setNote(`${t.name} 선생님을 차단했어요.`); }
    catch (e) { setNote(e instanceof ApiError ? e.message : '실패'); }
  }
  async function report(t: Teacher) {
    const reason = window.prompt(`${t.name} 선생님 신고 사유를 입력하세요.`);
    if (!reason) return;
    setNote('');
    try { await api.post('/reports', { targetType: 'teacher', targetId: t.id, reason }); setNote('신고가 접수되었습니다.'); }
    catch (e) { setNote(e instanceof ApiError ? e.message : '실패'); }
  }

  if (picked && phase === 'book') return <BookingForm teacher={picked} onBack={() => window.history.back()} onDone={() => { setPicked(null); setPhase('detail'); }} />;
  if (picked) return <TeacherDetailView teacher={picked} onBook={openBook} onBack={() => window.history.back()} />;

  const rows = (teachers ?? []).filter((t) => !q.trim() || t.name.toLowerCase().includes(q.toLowerCase()) || t.subjects.join(',').includes(q));
  return (
    <div>
      <PageHeader title="선생님 찾기" sub={credit ? `보유 크레딧 ${credit.total.toLocaleString()}` : '선생님을 고르고 상담을 신청하세요.'} />
      {error && <ErrorText>{error}</ErrorText>}

      {/* 상담 / 질문 토글 */}
      <div style={{ display: 'inline-flex', background: 'var(--fill,#eef2f4)', borderRadius: 10, padding: 3, marginBottom: 12 }}>
        {(['상담', '질문'] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} style={{ border: 'none', cursor: 'pointer', padding: '7px 22px', borderRadius: 8, fontWeight: 700, fontSize: 13,
            background: mode === m ? '#fff' : 'transparent', color: mode === m ? 'var(--teal)' : 'var(--muted)', boxShadow: mode === m ? '0 1px 2px rgba(0,0,0,.08)' : 'none' }}>{m}</button>
        ))}
      </div>

      {mode === '질문' ? (
        <Card style={{ maxWidth: 520 }}>
          <b style={{ fontSize: 15 }}>질문은 Q&A 게시판에서</b>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '6px 0 12px' }}>선생님에게 공개·지정 질문을 남기고 답변을 받을 수 있어요(건당 크레딧).</p>
          <Button onClick={() => navigate('/student/qna')}>Q&A 게시판으로 →</Button>
        </Card>
      ) : (
      <>
      {board.length > 0 && (
        <Card style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>🏆 이달의 우수 선생님</div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {board.slice(0, 5).map((t) => (
              <button key={t.id} onClick={() => openDetail(t)} style={{ all: 'unset', cursor: 'pointer', flex: '0 0 auto' }}>
                <div style={{ width: 150, background: t.rank <= 3 ? 'var(--teal-50,#F0F7FA)' : '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 20 }}>{t.rank === 1 ? '🥇' : t.rank === 2 ? '🥈' : t.rank === 3 ? '🥉' : `#${t.rank}`}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 }}><b style={{ fontSize: 14 }}>{t.name}</b><GradeBadge grade={t.grade} /></div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{t.subjects.join(',')} · ⭐ {t.rating ?? 0}</div>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}
      {/* 상담 유형 → 세부 유형 */}
      <label className="label">상담 유형</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {CTYPES.map(([t, ic]) => {
          const on = consultType === t;
          return <button key={t} onClick={() => { setConsultType(on ? null : t); setSubType(null); }} style={{ cursor: 'pointer', padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700,
            border: on ? '1px solid var(--teal)' : '1px solid var(--line)', background: on ? 'var(--teal)' : '#fff', color: on ? '#fff' : 'var(--muted)' }}>{ic} {t}</button>;
        })}
      </div>
      {consultType && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {SUBTYPES[consultType].map((s) => {
            const on = subType === s;
            return <button key={s} onClick={() => setSubType(on ? null : s)} style={{ cursor: 'pointer', padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700,
              border: on ? '1px solid var(--teal)' : '1px solid var(--line)', background: on ? 'var(--teal-100,#DCECF3)' : 'var(--teal-50,#F0F7FA)', color: on ? 'var(--teal)' : 'var(--muted)' }}>{s}</button>;
          })}
        </div>
      )}
      {consultType === '심리' && <p style={{ fontSize: 12, color: 'var(--teal)', background: 'var(--teal-50,#F0F7FA)', borderRadius: 8, padding: 9, marginBottom: 8 }}>💬 심리상담(LCA코칭·심리상담)은 기숙 온/오프라인으로 운영돼요.</p>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <div style={{ flex: '1 1 220px', minWidth: 180 }}><TextField label="검색" placeholder="이름·과목" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div style={{ minWidth: 140 }}><SelectField label="카테고리" value={category} onChange={(e) => setCategory(e.target.value)} options={['전체', ...cats.map((c) => c.name)].map((c) => ({ value: c, label: c }))} /></div>
        <div style={{ minWidth: 160 }}><SelectField label="정렬" value={sort} onChange={(e) => setSort(e.target.value)} options={[{ value: 'grade', label: '기본(등급)' }, { value: 'rating', label: '만족도순' }, { value: 'consult', label: '상담횟수순' }, { value: 'question', label: '질문답변순' }, { value: 'offline', label: '오프라인 가능' }]} /></div>
      </div>
      {note && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{note}</p>}

      {/* 니즈 기반 맞춤 추천 */}
      <Card style={{ marginBottom: 14, background: 'var(--teal-50,#F0F7FA)', borderColor: 'var(--teal-100,#DCECF3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <b style={{ fontSize: 14 }}>✨ 맞춤 추천</b>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>필요한 점을 고르면 선생님 강점·평가로 매칭해 드려요.</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {STRENGTH_POOL.map((s) => {
            const on = needs.includes(s);
            return <button key={s} onClick={() => setNeeds((p) => on ? p.filter((x) => x !== s) : [...p, s])} style={{ cursor: 'pointer', padding: '5px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700,
              border: on ? '1px solid var(--teal)' : '1px solid var(--line)', background: on ? 'var(--teal)' : '#fff', color: on ? '#fff' : 'var(--muted)' }}>#{s}</button>;
          })}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="sm" onClick={recommend}>맞춤 추천 받기</Button>
          {recs && <Button size="sm" variant="ghost" onClick={() => setRecs(null)}>추천 닫기</Button>}
        </div>
        {recs && (recs.length === 0 ? <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10 }}>조건에 맞는 선생님이 없어요.</p> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10, marginTop: 12 }}>
            {recs.slice(0, 6).map((t) => (
              <button key={t.id} onClick={() => openDetail(t)} style={{ all: 'unset', cursor: 'pointer' }}>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><b style={{ fontSize: 15 }}>{t.name}</b><GradeBadge grade={t.grade} /></div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{t.subjects.join(', ')} · ⭐ {t.rating ?? 0}</div>
                  {(t.matchedNeeds?.length ?? 0) > 0 && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>{t.matchedNeeds!.map((n) => <Badge key={n} kind="done">#{n}</Badge>)}</div>}
                </div>
              </button>
            ))}
          </div>
        ))}
      </Card>

      {teachers === null ? <Spinner /> : rows.length === 0 ? <Card><EmptyState>선생님이 없어요.</EmptyState></Card> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {rows.map((t) => (
            <Card key={t.id}>
              <button onClick={() => openDetail(t)} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <b style={{ fontSize: 15 }}>{t.name}</b>
                  <GradeBadge grade={t.grade} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{t.subjects.join(', ')}{t.category ? ` · ${t.category}` : ''}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span>⭐ {t.rating ?? 0}</span>
                  <span>· 상담 {t.totalConsult ?? 0}회</span>
                  <span>· 질문답변 {t.questionCount ?? 0}</span>
                  {t.offlineAvailable && <Badge kind="done">오프라인 가능</Badge>}
                </div>
                <div style={{ marginTop: 8 }}><Badge kind="confirmed">상세 보기 →</Badge></div>
              </button>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                <button type="button" onClick={() => fav(t)} style={actBtn}>☆ 찜</button>
                <button type="button" onClick={() => block(t)} style={actBtn}>🚫 차단</button>
                <button type="button" onClick={() => report(t)} style={actBtn}>🚩 신고</button>
              </div>
            </Card>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}
