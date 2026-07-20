import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { CreditAccount, Material, Quote, Slot, Teacher } from '../api/types';
import { PageHeader, Card, Button, Badge, GradeBadge, ErrorText, Spinner, EmptyState, SkeletonList, TextField, TextareaField, SelectField } from '../components/ui';

const todayStr = () => new Date().toISOString().slice(0, 10);
const minToTime = (idx: number) => `${String(Math.floor((idx * 10) / 60)).padStart(2, '0')}:${String((idx * 10) % 60).padStart(2, '0')}`;
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const DURATION = 3, MIN_LEN = 1, FORCE_WINDOW = 4;

const SLOT_UI: Record<Slot['status'], { label: string; bg: string; fg: string; bd: string }> = {
  avail: { label: '가능', bg: '#CFE7DA', fg: '#2A8A5F', bd: '#BFE0D0' },
  booked: { label: '예약', bg: '#DCE9F7', fg: '#2F6FB3', bd: '#C4D8EE' },
  rest: { label: '휴게', bg: '#E9EDF0', fg: '#8695A8', bd: '#DCE4EE' },
  off: { label: '근무외', bg: '#F0F4FA', fg: '#B9C4D6', bd: '#E8EDF5' },
  blocked: { label: '차단', bg: '#F9E8E4', fg: '#C25A43', bd: '#EFC7BD' },
};
const SUBJECTS = ['국어', '수학', '영어', '탐구'];
const MODES: { value: string; label: string }[] = [
  { value: 'zoom', label: '줌 화상' }, { value: 'chat', label: '실시간 채팅' }, { value: 'hand', label: '필기 공유' }, { value: 'offline', label: '오프라인(센터 대면)' },
];
const MODE_META: Record<string, { label: string; icon: string }> = {
  zoom: { label: '줌 화상', icon: '📹' }, chat: { label: '실시간 채팅', icon: '💬' }, hand: { label: '필기 공유', icon: '✍️' }, offline: { label: '오프라인 대면', icon: '🏫' },
};
type Attachment = { id: string; name: string; type?: string };
const actBtn: React.CSSProperties = { flex: 1, background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 0', fontSize: 12, color: 'var(--muted)', cursor: 'pointer' };

function BookingForm({ teacher, onDone, onBack, initialMode, consultType, initialSubType }: { teacher: Teacher; onDone: () => void; onBack: () => void; initialMode?: string; consultType?: string; initialSubType?: string }) {
  // 검색에서 고른 상담 종류(없으면 교과). 예약·견적·기본시간에 실제 반영.
  const ctype = consultType || '교과';
  const [defaultSlots, setDefaultSlots] = useState(DURATION); // 종류별 기본 상담시간(분)/10칸
  useEffect(() => {
    api.get<Record<string, number>>('/bookings/duration/policy')
      .then((pol) => { const min = pol?.[ctype]; if (min && min > 0) setDefaultSlots(Math.max(MIN_LEN, Math.round(min / 10))); })
      .catch(() => { /* 정책 없으면 기본 30분 */ });
  }, [ctype]);
  const [date, setDate] = useState(todayStr());
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [subject, setSubject] = useState(initialSubType || '수학');
  const [content, setContent] = useState('');
  const supportedModes = teacher.modes?.length ? MODES.filter((m) => teacher.modes!.includes(m.value)) : MODES;
  const supportedVals = supportedModes.map((m) => m.value);
  const [mode, setMode] = useState(initialMode && supportedVals.includes(initialMode) ? initialMode : supportedVals.includes('zoom') ? 'zoom' : supportedVals[0]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function resetSel() { setSelStart(null); setSelEnd(null); setNotice(''); setQuote(null); }
  /** 슬롯 최신화(다른 학생 예약 반영). 선택은 유지하지 않고 호출측이 필요 시 resetSel. */
  function loadSlots() {
    setSlots(null);
    api.get<Slot[]>(`/teachers/${teacher.id}/slots?date=${date}`).then(setSlots).catch((e) => setError(e instanceof ApiError ? e.message : '슬롯 조회 실패'));
  }

  useEffect(() => {
    resetSel(); loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacher.id, date]);

  useEffect(() => {
    if (selStart === null || selEnd === null) return;
    api.post<Quote>('/bookings/quote', { teacherId: teacher.id, date, mode, consultType: ctype, slotStart: selStart, slotEnd: selEnd + 1 })
      .then(setQuote).catch(() => setQuote(null));
  }, [selStart, selEnd, mode, teacher.id, date, ctype]);

  const dateOptions = useMemo(() => {
    const base = new Date();
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { iso, md: `${d.getMonth() + 1}/${d.getDate()}`, wd: i === 0 ? '오늘' : i === 1 ? '내일' : WD[d.getDay()], dow: d.getDay() };
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
    while (end - fs + 1 < defaultSlots && availSet.has(end + 1)) end += 1;
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
      await api.post('/bookings', { teacherId: teacher.id, date, consultType: ctype, subType: subject, mode, slotStart: selStart, slotEnd: selEnd + 1, content: content || undefined, attachments });
      setMsg('상담이 신청되었습니다.'); setTimeout(onDone, 900);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && /줌.*초과/.test(e.message)) {
        // 줌 동시 한도 초과 — 슬롯은 유효하니 선택 유지, 방식만 바꾸도록 안내.
        setError('지금은 줌 상담실이 가득 찼어요. 채팅·필기·오프라인 등 다른 방식을 선택해 주세요.');
        return;
      }
      if (e instanceof ApiError && e.status === 409) {
        // 다른 학생이 먼저 예약함 등 슬롯 충돌 → 선택 해제 + 슬롯 새로고침(찬 자리 즉시 반영).
        setError(e.message);
        resetSel();
        loadSlots();
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
                  <div style={{ fontSize: 11, color: on ? '#fff' : d.dow === 0 ? '#D06B52' : d.dow === 6 ? '#2F6FB3' : 'var(--muted)' }}>{d.wd}</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{d.md}</div>
                </button>
              );
            })}
          </div>
          {/* 시간 표 */}
          <label className="label" style={{ marginTop: 12 }}>시간 (가능 시간만 · {ctype} 기본 {defaultSlots * 10}분)</label>
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
              {selStart === null && availSet.size > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>👆 예약할 시작 시간을 눌러주세요. 이어서 끝 시간을 누르면 구간이 선택돼요.</div>
              )}
              {availSet.size === 0 && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>이 날짜엔 예약 가능한 시간이 없어요. 다른 날짜를 골라보세요.</div>}
              {notice && <div style={{ marginTop: 8, background: '#FAF1E2', border: '1px solid #EDDCB8', borderRadius: 8, padding: 8, fontSize: 12, color: '#A97D24' }}>ⓘ {notice}</div>}
              {quote && !quote.valid && quote.message && (
                <div style={{ marginTop: 8, background: 'var(--danger-bg,#F9E8E4)', border: '1px solid var(--danger-border,#EFC7BD)', borderRadius: 8, padding: 8, fontSize: 12.5, color: 'var(--danger,#c25a43)' }}>⚠ {quote.message}</div>
              )}
              {selStart !== null && selEnd !== null && (
                <div style={{ marginTop: 10, background: 'var(--teal-50, #eef4fb)', borderRadius: 10, padding: 12 }}>
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
          <SelectField label="진행 방식" value={mode} onChange={(e) => setMode(e.target.value)} options={supportedModes} />
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '-2px 0 8px' }}>이 선생님이 제공하는 방식: {supportedModes.map((m) => m.label).join(' · ')}</p>
          {mode === 'offline' && <p style={{ fontSize: 12, color: 'var(--muted)', background: 'var(--fill,#f4f7fb)', borderRadius: 8, padding: 9, margin: '0 0 8px' }}>🏫 오프라인은 가능한 선생님·센터·시간이 제한되며 센터 상담실 점유료가 가산됩니다.</p>}
          {mode === 'zoom' && <p style={{ fontSize: 12, color: '#A97D24', background: '#FAF1E2', borderRadius: 8, padding: 9, margin: '0 0 8px' }}>🎥 줌은 센터 상담실 동시 이용 한도가 있어, 예약 시점에 자리가 없으면 다른 방식을 선택해야 할 수 있어요.</p>}
          <p style={{ fontSize: 12, color: 'var(--teal)', background: 'var(--teal-50,#EEF4FB)', borderRadius: 8, padding: 9, margin: '0 0 8px' }}>📋 게시판(문항·일반) 질문은 Q&A 게시판에서 건당 신청해요.</p>
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
          {quote && !quote.valid && <p style={{ color: '#A97D24', fontSize: 12 }}>⚠ {quote.message || '이 시간대는 이용할 수 없어요.'}</p>}
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
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--teal-100,#D7E4F2)', color: 'var(--teal)', display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 800 }}>{teacher.name.slice(0, 1)}</div>
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
  입시: ['대학라인', '전형선택', '입시정보', '유료상담'],
  심리: ['LCA코칭', '심리상담'],
};
// 교과 세부값(표시) → 실제 선생님 과목(DB) 매핑
const SUBJECT_MAP: Record<string, string> = { 국어: '국어', 수학: '수학', 영어: '영어', 과학: '과학', 사회: '사회' };

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
  const [modeFilter, setModeFilter] = useState<string | null>(null);
  const [category, setCategory] = useState('전체');
  const [sort, setSort] = useState('grade');
  const [q, setQ] = useState('');
  const [needs, setNeeds] = useState<string[]>([]);
  const [recs, setRecs] = useState<(Teacher & { matchedNeeds?: string[]; strengths?: string[] })[] | null>(null);
  const [board, setBoard] = useState<(Teacher & { rank: number; score: number })[]>([]);
  const [error, setError] = useState('');
  // 외부학생(비재원) 안내 — 온라인 전용·요금 할증·주간크레딧. 학원생이면 external=null.
  const [extCtx, setExtCtx] = useState<{ label: string; external: { onlineOnly: boolean; surchargePct: number; weeklyGrant: boolean; boardOnly: boolean } | null } | null>(null);
  useEffect(() => { api.get<{ label: string; external: { onlineOnly: boolean; surchargePct: number; weeklyGrant: boolean; boardOnly: boolean } | null }>('/bookings/external/me').then(setExtCtx).catch(() => { /* 실패시 배너 생략 */ }); }, []);

  const subjectFilter = consultType === '교과' && subType ? SUBJECT_MAP[subType] ?? subType : null;

  async function recommend() {
    setError('');
    try {
      const r = await api.post<(Teacher & { matchedNeeds?: string[] })[]>('/teachers/recommend', { subject: subjectFilter ?? undefined, needs });
      setRecs(r);
    } catch (e) { setError(e instanceof ApiError ? e.message : '추천 실패'); }
  }

  const [note, setNote] = useState('');
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  const [favOnly, setFavOnly] = useState(false);

  // B2 서버 페이지네이션 — 검색어 디바운스 후 서버 질의, "더 보기"로 다음 페이지 누적(1000명 규모 대비).
  const PAGE_SIZE = 30;
  const [qs, setQs] = useState('');
  useEffect(() => { const t = setTimeout(() => setQs(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const [pageMeta, setPageMeta] = useState<{ page: number; total: number; totalPages: number } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const fetchSeq = useRef(0);
  async function fetchPage(page: number, replace: boolean) {
    const params = new URLSearchParams();
    if (category !== '전체') params.set('category', category);
    if (subjectFilter) params.set('subject', subjectFilter);
    if (consultType) params.set('consultType', consultType);
    if (modeFilter) params.set('mode', modeFilter);
    if (sort) params.set('sort', sort);
    if (qs) params.set('q', qs);
    if (favOnly) params.set('favOnly', 'true');
    params.set('size', String(PAGE_SIZE));
    params.set('page', String(page));
    const seq = ++fetchSeq.current;
    try {
      const r = await api.get<{ data?: Teacher[]; meta?: { page: number; total: number; totalPages: number } } | Teacher[]>(`/teachers?${params}`);
      if (seq !== fetchSeq.current) return; // 뒤늦게 도착한 이전 요청은 무시
      const data = Array.isArray(r) ? r : (r.data ?? []);
      setPageMeta(Array.isArray(r) ? null : (r.meta ?? null));
      setTeachers((prev) => (replace ? data : [...(prev ?? []), ...data]));
    } catch (e) { if (seq === fetchSeq.current) setError(e instanceof ApiError ? e.message : '조회 실패'); }
  }
  useEffect(() => {
    setTeachers(null); setPageMeta(null);
    void fetchPage(1, true);
  }, [category, sort, subjectFilter, consultType, modeFilter, qs, favOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  // O95 — 유예 채팅 '이어서 상담 예약' CTA: ?teacher= 로 진입하면 해당 선생님 상세를 자동으로 연다.
  const [pendingTeacher, setPendingTeacher] = useState<string | null>(() => new URLSearchParams(window.location.search).get('teacher'));
  useEffect(() => {
    if (!pendingTeacher || !teachers) return;
    const t = teachers.find((x) => x.id === pendingTeacher);
    if (t) { openDetail(t); setPendingTeacher(null); }
  }, [pendingTeacher, teachers]); // eslint-disable-line react-hooks/exhaustive-deps
  async function loadMore() {
    if (!pageMeta || loadingMore) return;
    setLoadingMore(true);
    try { await fetchPage(pageMeta.page + 1, false); } finally { setLoadingMore(false); }
  }
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
  const openDetail = (t: Teacher) => { setPicked(t); setPhase('detail'); window.history.pushState({ mp: 'detail' }, ''); };
  const openBook = () => { setPhase('book'); window.history.pushState({ mp: 'book' }, ''); };

  useEffect(() => {
    api.get<CreditAccount>('/credits/account').then(setCredit).catch(() => {});
    api.get<{ id: string; name: string }[]>('/categories?kind=teacher').then(setCats).catch(() => {});
    api.get<(Teacher & { rank: number; score: number })[]>('/teachers/leaderboard').then(setBoard).catch(() => {});
    api.get<{ fit: string[] }>('/me/teacher-lists').then((r) => setFavIds(new Set(r.fit ?? []))).catch(() => { /* 찜 목록 조회 실패 */ });
  }, []);

  async function fav(t: Teacher) {
    setNote('');
    const on = favIds.has(t.id);
    try {
      if (on) { await api.del(`/me/teacher-lists/${t.id}`); setNote(`${t.name} 선생님 찜을 해제했어요.`); }
      else { await api.post('/me/teacher-lists', { teacherId: t.id, listKind: 'fit' }); setNote(`${t.name} 선생님을 내 선생님(찜)에 추가했어요.`); }
      setFavIds((p) => { const n = new Set(p); if (on) n.delete(t.id); else n.add(t.id); return n; });
    } catch (e) { setNote(e instanceof ApiError ? e.message : '실패'); }
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

  if (picked && phase === 'book') return <BookingForm teacher={picked} initialMode={modeFilter ?? undefined} consultType={consultType ?? undefined} initialSubType={subType ?? undefined} onBack={() => window.history.back()} onDone={() => { setPicked(null); setPhase('detail'); }} />;
  if (picked) return <TeacherDetailView teacher={picked} onBook={openBook} onBack={() => window.history.back()} />;

  const rows = teachers ?? []; // B2: 검색어·찜 필터는 서버 질의로 처리(페이지네이션과 정합)
  return (
    <div>
      <PageHeader title="선생님 찾기" sub={credit ? `보유 크레딧 ${credit.total.toLocaleString()}` : '선생님을 고르고 상담을 신청하세요.'} />
      {error && <ErrorText>{error}</ErrorText>}

      {/* 외부학생 안내 배너 */}
      {extCtx?.external && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--chip-confirmed-bg,#FAF1E2)', border: '1px solid #EDDCB8', borderRadius: 10, padding: '9px 12px', marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#A97D24', background: '#EDDCB8', borderRadius: 6, padding: '3px 7px' }}>{extCtx.label}</span>
          <span style={{ fontSize: 12.5, color: '#A97D24', fontWeight: 600 }}>
            {extCtx.external.onlineOnly ? '온라인 상담 전용' : '온·오프라인 이용 가능'}
            {extCtx.external.surchargePct > 0 ? ` · 요금 +${extCtx.external.surchargePct}%` : ''}
            {extCtx.external.weeklyGrant ? ' · 주간 크레딧 지급' : ' · 주간 크레딧 미지급'}
            {extCtx.external.boardOnly ? ' · 게시판 질문만' : ''}
          </span>
        </div>
      )}

      {/* 상담 / 질문 토글 */}
      <div style={{ display: 'inline-flex', background: 'var(--fill,#eef2f7)', borderRadius: 10, padding: 3, marginBottom: 12 }}>
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
                <div style={{ width: 150, background: t.rank <= 3 ? 'var(--teal-50,#EEF4FB)' : '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 20 }}>{t.rank === 1 ? '🥇' : t.rank === 2 ? '🥈' : t.rank === 3 ? '🥉' : `#${t.rank}`}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 }}><b style={{ fontSize: 14 }}>{t.name}</b><GradeBadge grade={t.grade} /></div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{t.subjects.join(',')} · ⭐ {t.rating ?? 0}</div>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}
      {/* 상담 방식 먼저 고르기(선택) — 원하는 진행 방식으로 상담 가능한 선생님만 필터 */}
      <Card style={{ marginBottom: 14, background: 'var(--teal-50,#EEF4FB)', borderColor: 'var(--teal-100,#D7E4F2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 14 }}>🎛️ 상담 방식 먼저 고르기</b>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>원하는 진행 방식을 정하면 그 방식으로 상담 가능한 선생님만 보여드려요.</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setModeFilter(null)} style={{ cursor: 'pointer', padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700,
            border: modeFilter === null ? '1px solid var(--teal)' : '1px solid var(--line)', background: modeFilter === null ? 'var(--teal)' : '#fff', color: modeFilter === null ? '#fff' : 'var(--muted)' }}>전체</button>
          {MODES.map((m) => {
            const on = modeFilter === m.value;
            return <button key={m.value} onClick={() => setModeFilter(on ? null : m.value)} style={{ cursor: 'pointer', padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700,
              border: on ? '1px solid var(--teal)' : '1px solid var(--line)', background: on ? 'var(--teal)' : '#fff', color: on ? '#fff' : 'var(--muted)' }}>{MODE_META[m.value].icon} {m.label}</button>;
          })}
        </div>
        {modeFilter && <p style={{ fontSize: 12, color: 'var(--teal)', margin: '10px 0 0' }}>✓ <b>{MODE_META[modeFilter].label}</b> 가능한 선생님만 표시 중 · 예약 시 이 방식이 기본 선택돼요.</p>}
      </Card>

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
        <>
          <label className="label" style={{ marginTop: 2 }}>{consultType === '교과' ? '과목' : '세부 유형'}</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {SUBTYPES[consultType].map((s) => {
              const on = subType === s;
              return <button key={s} onClick={() => setSubType(on ? null : s)} style={{ cursor: 'pointer', padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                border: on ? '1px solid var(--teal)' : '1px solid var(--line)', background: on ? 'var(--teal-100,#D7E4F2)' : 'var(--teal-50,#EEF4FB)', color: on ? 'var(--teal)' : 'var(--muted)' }}>{s}</button>;
            })}
          </div>
        </>
      )}
      {consultType === '심리' && <p style={{ fontSize: 12, color: 'var(--teal)', background: 'var(--teal-50,#EEF4FB)', borderRadius: 8, padding: 9, marginBottom: 8 }}>💬 심리상담(LCA코칭·심리상담)은 현재 기숙 온/오프라인으로 운영돼요.</p>}
      {subType === '유료상담' && <p style={{ fontSize: 12, color: '#A97D24', background: 'var(--chip-confirmed-bg,#FAF1E2)', borderRadius: 8, padding: 9, marginBottom: 8 }}>💎 입시 유료상담은 별도 단가가 적용돼요.</p>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <div style={{ flex: '1 1 220px', minWidth: 180 }}><TextField label="검색" placeholder="이름·과목" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div style={{ minWidth: 140 }}><SelectField label="카테고리" value={category} onChange={(e) => setCategory(e.target.value)} options={['전체', ...cats.map((c) => c.name)].map((c) => ({ value: c, label: c }))} /></div>
        <div style={{ minWidth: 160 }}><SelectField label="정렬" value={sort} onChange={(e) => setSort(e.target.value)} options={[{ value: 'grade', label: '기본(등급)' }, { value: 'rating', label: '만족도순' }, { value: 'consult', label: '상담횟수순' }, { value: 'question', label: '질문답변순' }, { value: 'offline', label: '오프라인 가능' }]} /></div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: favOnly ? '#A97D24' : 'var(--ink-soft,#5a6472)', cursor: 'pointer', padding: '9px 0' }}>
          <input type="checkbox" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} /> ⭐ 찜한 선생님만
        </label>
      </div>
      {note && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{note}</p>}

      {/* 니즈 기반 맞춤 추천 */}
      <Card style={{ marginBottom: 14, background: 'var(--teal-50,#EEF4FB)', borderColor: 'var(--teal-100,#D7E4F2)' }}>
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

      {teachers === null ? <SkeletonList rows={4} cols={2} /> : rows.length === 0 ? <Card><EmptyState>{favOnly ? '아직 찜한 선생님이 없어요 — 목록에서 ☆ 찜을 눌러 추가해 보세요.' : '선생님이 없어요.'}</EmptyState></Card> : (
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
                </div>
                {(t.modes?.length ?? 0) > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                    {t.modes!.map((m) => (
                      <Badge key={m} kind={m === modeFilter ? 'done' : 'soft'}>{MODE_META[m]?.icon ?? ''} {MODE_META[m]?.label ?? m}</Badge>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 8 }}><Badge kind="confirmed">상세 보기 →</Badge></div>
              </button>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                <button type="button" onClick={() => fav(t)} style={favIds.has(t.id) ? { ...actBtn, color: '#CF9A3A', borderColor: '#CF9A3A' } : actBtn}>{favIds.has(t.id) ? '★ 찜됨' : '☆ 찜'}</button>
                <button type="button" onClick={() => block(t)} style={actBtn}>🚫 차단</button>
                <button type="button" onClick={() => report(t)} style={actBtn}>🚩 신고</button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {/* B2 더 보기 — 서버 페이지네이션(누적 로드) */}
      {teachers !== null && pageMeta && teachers.length < pageMeta.total && (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <Button variant="ghost" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? '불러오는 중…' : `더 보기 (${teachers.length}/${pageMeta.total})`}
          </Button>
        </div>
      )}
      </>
      )}
    </div>
  );
}
