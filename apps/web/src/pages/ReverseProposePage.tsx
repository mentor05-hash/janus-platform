import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Slot } from '../api/types';
import { PageHeader, Card, Button, ErrorText, TextField, TextareaField, SelectField, Badge, Spinner, EmptyState } from '../components/ui';

const todayStr = () => new Date().toISOString().slice(0, 10);
const minToTime = (slotIdx: number) => {
  const m = slotIdx * 10;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

type ReverseType = 'first' | 'admin' | 'self';
type EligibleStudent = {
  studentId: string;
  name: string;
  loginId: string | null;
  doneCount: number;
  lastConsultAt: string | null;
  types: ReverseType[];
};

const TYPE_LABEL: Record<ReverseType, string> = {
  first: '첫상담 대상',
  admin: '관리자 지정',
  self: '학생 신청',
};
const TYPE_KIND: Record<ReverseType, 'confirmed' | 'soft' | 'done'> = {
  first: 'confirmed',
  admin: 'soft',
  self: 'done',
};

// 슬롯 상태 표시(전체 예약현황 표). avail = 선생님 가용 ∩ 학생 체류(교집합) → 선택 가능.
const SLOT_STATUS: Record<Slot['status'], { label: string; bg: string; fg: string; border: string }> = {
  avail: { label: '가능', bg: '#CDEBDD', fg: '#0F7A43', border: '#9FD9BE' },
  booked: { label: '내 예약', bg: '#D6E4FB', fg: '#2563EB', border: '#AFC8F4' },
  rest: { label: '휴게', bg: '#E9EDF0', fg: '#8B9BA3', border: '#DCE2E6' },
  off: { label: '불가', bg: '#F4F6F8', fg: '#BAC4CA', border: '#EAEEF0' },
  blocked: { label: '차단', bg: '#FAD9D9', fg: '#C92A2A', border: '#F0BEBE' },
};

/** 자격 배지: 단일이면 일반 배지, 중복이면 작은 조합 배지("관리자 지정/학생 신청"). */
function TypeBadges({ types }: { types: ReverseType[] }) {
  if (types.length <= 1) {
    const t = types[0] ?? 'first';
    return <Badge kind={TYPE_KIND[t]}>{TYPE_LABEL[t]}</Badge>;
  }
  return (
    <span
      className="badge soft"
      style={{ fontSize: 11, padding: '2px 7px', letterSpacing: '-0.2px' }}
      title={types.map((t) => TYPE_LABEL[t]).join(' / ')}
    >
      {types.map((t) => TYPE_LABEL[t]).join('/')}
    </span>
  );
}

function StudentRow({
  s,
  selected,
  onSelect,
}: {
  s: EligibleStudent;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        width: '100%',
        textAlign: 'left',
        padding: '10px 12px',
        marginBottom: 6,
        borderRadius: 10,
        border: selected ? '2px solid var(--teal)' : '1px solid var(--line)',
        background: selected ? 'var(--teal-50, #eef6fa)' : 'var(--surface, #fff)',
        cursor: 'pointer',
      }}
    >
      <span style={{ minWidth: 0 }}>
        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{s.name}</span>
        {s.loginId && (
          <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 6 }}>@{s.loginId}</span>
        )}
        <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 8 }}>
          완료 {s.doneCount}회
        </span>
      </span>
      <TypeBadges types={s.types} />
    </button>
  );
}

export function ReverseProposePage() {
  const { user } = useAuth();
  const teacherId = user?.id ?? null;
  const [list, setList] = useState<EligibleStudent[] | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [q, setQ] = useState('');
  const [f, setF] = useState({
    studentId: '',
    date: todayStr(),
    consultType: '교과',
    mode: 'zoom',
    content: '',
  });
  // 슬롯(교집합) 선택 — selStart..selEnd(포함) 10분 단위 인덱스
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotErr, setSlotErr] = useState('');
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const set = (k: keyof typeof f, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    api
      .get<EligibleStudent[]>('/bookings/reverse/eligible')
      .then((r) => setList(r))
      .catch((e) => setLoadErr(e instanceof ApiError ? e.message : '목록을 불러오지 못했습니다.'));
  }, []);

  // 학생·날짜 선택 시 교집합 슬롯 조회(내 가용 ∩ 학생 체류 − 예약/휴게/차단)
  useEffect(() => {
    setSelStart(null);
    setSelEnd(null);
    setSlots(null);
    setSlotErr('');
    if (!f.studentId || !f.date || !teacherId) return;
    api
      .get<Slot[]>(`/teachers/${teacherId}/slots?date=${f.date}&studentId=${f.studentId}`)
      .then(setSlots)
      .catch((e) => setSlotErr(e instanceof ApiError ? e.message : '예약현황을 불러오지 못했습니다.'));
  }, [f.studentId, f.date, teacherId]);

  const { firstGroup, extraGroup } = useMemo(() => {
    const rows = (list ?? []).filter((s) => {
      if (!q.trim()) return true;
      const k = q.trim().toLowerCase();
      return s.name.toLowerCase().includes(k) || (s.loginId ?? '').toLowerCase().includes(k);
    });
    return {
      firstGroup: rows.filter((s) => s.types.includes('first')),
      extraGroup: rows.filter((s) => !s.types.includes('first')),
    };
  }, [list, q]);

  const byHour = useMemo(() => {
    const m = new Map<number, Slot[]>();
    for (const s of slots ?? []) {
      const h = Math.floor((s.index * 10) / 60);
      if (!m.has(h)) m.set(h, []);
      m.get(h)!.push(s);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [slots]);

  const availCount = (slots ?? []).filter((s) => s.status === 'avail').length;
  const selected = (list ?? []).find((s) => s.studentId === f.studentId) ?? null;
  const hasRange = selStart !== null && selEnd !== null;

  function clickSlot(s: Slot) {
    if (s.status !== 'avail') return;
    if (selStart === null || s.index < selStart) {
      setSelStart(s.index);
      setSelEnd(s.index);
      return;
    }
    // selStart..s.index 가 모두 avail 이면 범위 확장, 아니면 새 시작점으로
    const between = (slots ?? []).filter((x) => x.index >= selStart && x.index <= s.index);
    if (between.length && between.every((x) => x.status === 'avail')) setSelEnd(s.index);
    else {
      setSelStart(s.index);
      setSelEnd(s.index);
    }
  }

  async function submit() {
    setMsg('');
    setError('');
    if (selStart === null || selEnd === null) {
      setError('예약현황 표에서 가능한 시간을 선택하세요.');
      return;
    }
    try {
      const r = await api.post<{ id: string; status: string }>('/bookings/reverse', {
        studentId: f.studentId,
        date: f.date,
        consultType: f.consultType,
        mode: f.mode,
        slotStart: selStart,
        slotEnd: selEnd + 1, // end 는 배타적(마지막 10분 슬롯 +1)
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
        sub="대상 학생을 고르고, 전체 예약현황 표에서 ‘내 가용 ∩ 학생 가능’ 시간을 선택해 제안합니다."
      />
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* 왼쪽: 대상 학생 목록 */}
        <Card style={{ flex: '1 1 360px', minWidth: 300 }}>
          <div style={{ marginBottom: 10 }}>
            <TextField label="학생 검색" placeholder="이름 또는 아이디" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {loadErr && <ErrorText>{loadErr}</ErrorText>}
          {list === null && !loadErr && <Spinner />}
          {list !== null && (
            <>
              <h4 style={{ margin: '8px 0 6px', fontSize: 13, color: 'var(--ink)' }}>
                첫상담이 필요한 학생 <span style={{ color: 'var(--muted)' }}>({firstGroup.length})</span>
              </h4>
              {firstGroup.length === 0 ? (
                <EmptyState>대상 없음</EmptyState>
              ) : (
                firstGroup.map((s) => (
                  <StudentRow key={s.studentId} s={s} selected={s.studentId === f.studentId} onSelect={() => set('studentId', s.studentId)} />
                ))
              )}
              <h4 style={{ margin: '14px 0 6px', fontSize: 13, color: 'var(--ink)' }}>
                추가 역상담 가능 학생 <span style={{ color: 'var(--muted)' }}>({extraGroup.length})</span>
                <span style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 400, marginLeft: 6 }}>
                  첫상담은 진행, 관리자 지정/학생 신청
                </span>
              </h4>
              {extraGroup.length === 0 ? (
                <EmptyState>대상 없음</EmptyState>
              ) : (
                extraGroup.map((s) => (
                  <StudentRow key={s.studentId} s={s} selected={s.studentId === f.studentId} onSelect={() => set('studentId', s.studentId)} />
                ))
              )}
            </>
          )}
        </Card>

        {/* 오른쪽: 제안 폼 + 예약현황 표 */}
        <Card style={{ flex: '1 1 440px', minWidth: 340 }}>
          {selected ? (
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 10, background: 'var(--teal-50, #eef6fa)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                {selected.name}
                {selected.loginId && <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 6 }}>@{selected.loginId}</span>}
              </span>
              <TypeBadges types={selected.types} />
            </div>
          ) : (
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>왼쪽에서 학생을 선택하세요.</p>
          )}

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
                options={['zoom', 'chat', 'hand', 'offline'].map((m) => ({ value: m, label: m }))}
              />
            </div>
          </div>

          {/* 전체 예약현황 표(교집합) */}
          <div style={{ marginTop: 6 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <label className="label" style={{ marginBottom: 0 }}>예약현황 · 가능시간 선택</label>
              {slots !== null && (
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>가능 슬롯 {availCount}칸</span>
              )}
            </div>
            {!f.studentId ? (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>학생을 선택하면 교집합 시간표가 표시됩니다.</p>
            ) : slotErr ? (
              <ErrorText>{slotErr}</ErrorText>
            ) : slots === null ? (
              <Spinner />
            ) : slots.length === 0 ? (
              <EmptyState>이 날짜에는 근무·체류 시간이 없습니다.</EmptyState>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                  {byHour.map(([h, cells]) => (
                    <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 30, fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>{h}시</span>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {cells.map((s) => {
                          const sel = hasRange && s.index >= (selStart as number) && s.index <= (selEnd as number);
                          const st = SLOT_STATUS[s.status];
                          const clickable = s.status === 'avail';
                          return (
                            <button
                              key={s.index}
                              type="button"
                              disabled={!clickable}
                              onClick={() => clickSlot(s)}
                              title={`${s.time} · ${st.label}`}
                              style={{
                                width: 50,
                                padding: '5px 0',
                                fontSize: 11,
                                borderRadius: 7,
                                border: sel ? '2px solid var(--teal)' : `1px solid ${st.border}`,
                                background: sel ? 'var(--teal-50, #eef6fa)' : st.bg,
                                color: sel ? 'var(--teal)' : st.fg,
                                cursor: clickable ? 'pointer' : 'default',
                                fontWeight: sel ? 700 : 500,
                              }}
                            >
                              {s.time}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {/* 범례 */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
                  {(['avail', 'booked', 'rest', 'off', 'blocked'] as Slot['status'][]).map((k) => (
                    <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 11, height: 11, borderRadius: 3, background: SLOT_STATUS[k].bg, border: '1px solid var(--line)', display: 'inline-block' }} />
                      {SLOT_STATUS[k].label}
                    </span>
                  ))}
                </div>
                {/* 선택 요약 */}
                <div style={{ marginTop: 8, fontSize: 13, color: hasRange ? 'var(--ink)' : 'var(--muted)' }}>
                  {hasRange ? (
                    <>
                      선택: <b>{minToTime(selStart as number)} ~ {minToTime((selEnd as number) + 1)}</b>{' '}
                      ({((selEnd as number) - (selStart as number) + 1) * 10}분)
                    </>
                  ) : (
                    '가능(초록) 칸을 눌러 시작~종료를 선택하세요. 연속한 가능 칸만 이어집니다.'
                  )}
                </div>
              </>
            )}
          </div>

          <div style={{ marginTop: 10 }}>
            <TextareaField label="내용(선택)" rows={2} value={f.content} onChange={(e) => set('content', e.target.value)} />
          </div>
          {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}
          <ErrorText>{error}</ErrorText>
          <Button onClick={submit} disabled={!f.studentId || !hasRange}>제안 보내기</Button>
        </Card>
      </div>
    </div>
  );
}
