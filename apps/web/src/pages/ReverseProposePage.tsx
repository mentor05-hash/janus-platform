import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, ErrorText, TextField, TextareaField, SelectField, Badge, Spinner, EmptyState } from '../components/ui';

const todayStr = () => new Date().toISOString().slice(0, 10);

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

/** 자격 배지: 단일이면 일반 배지, 중복이면 작은 조합 배지("관리자 지정/학생 신청"). */
function TypeBadges({ types }: { types: ReverseType[] }) {
  if (types.length <= 1) {
    const t = types[0] ?? 'first';
    return <Badge kind={TYPE_KIND[t]}>{TYPE_LABEL[t]}</Badge>;
  }
  // 중복: 슬래시로 합쳐 작게 표시
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
  const [list, setList] = useState<EligibleStudent[] | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [q, setQ] = useState('');
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

  useEffect(() => {
    api
      .get<EligibleStudent[]>('/bookings/reverse/eligible')
      .then((r) => setList(r))
      .catch((e) => setLoadErr(e instanceof ApiError ? e.message : '목록을 불러오지 못했습니다.'));
  }, []);

  // 첫상담 필요(types 에 first 포함) vs 추가 역상담 가능(관리자/학생만)
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

  const selected = (list ?? []).find((s) => s.studentId === f.studentId) ?? null;

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
        sub="역상담 대상 학생을 목록에서 선택해 제안합니다. 분류: 첫상담 대상 · 관리자 지정 · 학생 신청(중복 시 조합 표시)."
      />
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* 왼쪽: 대상 학생 목록 */}
        <Card style={{ flex: '1 1 380px', minWidth: 320 }}>
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

        {/* 오른쪽: 제안 폼 */}
        <Card style={{ flex: '1 1 380px', minWidth: 320 }}>
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
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <TextField label="시작 슬롯" type="number" value={f.slotStart} onChange={(e) => set('slotStart', e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <TextField label="종료 슬롯" type="number" value={f.slotEnd} onChange={(e) => set('slotEnd', e.target.value)} />
            </div>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 11, marginTop: -4 }}>슬롯은 10분 단위 인덱스(예: 10:00=60, 10:30=63).</p>
          <TextareaField label="내용(선택)" rows={2} value={f.content} onChange={(e) => set('content', e.target.value)} />
          {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}
          <ErrorText>{error}</ErrorText>
          <Button onClick={submit} disabled={!f.studentId}>제안 보내기</Button>
        </Card>
      </div>
    </div>
  );
}
