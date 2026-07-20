import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, Badge, GradeBadge, ErrorText, Spinner, TextField, TextareaField } from '../components/ui';

type Profile = {
  id: string;
  name: string;
  grade: string;
  subjects: string[];
  category: string | null;
  career: string | null;
  rating: number | null;
  totalConsult?: number;
  intro: string | null;
  strengths: string[];
  modes?: string[];
  qnaEscalation?: boolean;
  qnaReceive?: boolean;
  qnaSubjects?: string[];
  reRequestRate?: number | null;
  avgResponseMin?: number | null;
};

const STRENGTH_POOL = ['개념정리', '문제풀이', '내신대비', '수능대비', '오답관리', '동기부여', '기초탄탄', '심화학습', '입시전략', '멘탈관리'];
// P6 — 비교과(학습법·진로) 포함: 입시 컨설턴트·멘토가 담당 카테고리로 선택.
const SUBJECTS = ['국어', '수학', '영어', '과학', '사회', '입시', '학습법', '진로'];
const MODE_OPTIONS: { value: string; label: string; icon: string; desc: string }[] = [
  { value: 'zoom', label: '줌 화상', icon: '📹', desc: '얼굴 보며 화상 상담' },
  { value: 'chat', label: '실시간 채팅', icon: '💬', desc: '텍스트·이미지 실시간 대화' },
  { value: 'hand', label: '필기 공유', icon: '✍️', desc: '공유 화이트보드로 풀이' },
  { value: 'offline', label: '오프라인 대면', icon: '🏫', desc: '센터 상담실 대면(점유료)' },
];

export function TeacherProfilePage() {
  const [p, setP] = useState<Profile | null>(null);
  const [intro, setIntro] = useState('');
  const [strengths, setStrengths] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [career, setCareer] = useState('');
  const [modes, setModes] = useState<string[]>([]);
  const [qnaEsc, setQnaEsc] = useState(true); // Q&A 후 "이어서 상담" 제공 여부
  const [qnaRecv, setQnaRecv] = useState(true); // F3 — Q&A 질문 수신 on/off
  const [qnaSubs, setQnaSubs] = useState<string[]>([]); // F3 — 수신 과목 제한(빈=전체)
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  function hydrate(d: Profile) {
    setP(d); setIntro(d.intro ?? ''); setStrengths(d.strengths ?? []); setSubjects(d.subjects ?? []); setCareer(d.career ?? ''); setModes(d.modes ?? []); setQnaEsc(d.qnaEscalation !== false); setQnaRecv(d.qnaReceive !== false); setQnaSubs(d.qnaSubjects ?? []);
  }
  useEffect(() => {
    api.get<Profile>('/teachers/me/profile').then(hydrate).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, []);

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  async function save() {
    setBusy(true); setMsg(''); setError('');
    try {
      const d = await api.put<Profile>('/teachers/me/profile', { intro, strengths, subjects, career, modes, qnaEscalation: qnaEsc, qnaReceive: qnaRecv, qnaSubjects: qnaSubs });
      hydrate(d); setMsg('프로필이 저장되었습니다. 학생 검색·추천에 반영됩니다.');
    } catch (e) { setError(e instanceof ApiError ? e.message : '저장 실패'); } finally { setBusy(false); }
  }

  if (!p) return error ? <ErrorText>{error}</ErrorText> : <Spinner />;

  return (
    <div>
      <PageHeader title="내 프로필" sub="소개·강점·특기를 채우면 학생의 니즈 기반 추천과 상세 페이지에 노출됩니다." />
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}
      {error && <ErrorText>{error}</ErrorText>}

      <Card style={{ maxWidth: 680 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--teal-100)', color: 'var(--teal)', display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 800 }}>{p.name.slice(0, 1)}</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><b style={{ fontSize: 17 }}>{p.name}</b><GradeBadge grade={p.grade} /></div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>★ {p.rating ?? 0} · 누적 상담 {(p.totalConsult ?? 0).toLocaleString()}회 · 재요청률 {p.reRequestRate ?? '-'}% · 평균 응답 {p.avgResponseMin ?? '-'}분</div>
          </div>
        </div>

        <TextareaField label="한 줄 소개 / 지도 스타일" rows={3} value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="예: 개념 원리부터 실전 적용까지, 학생 눈높이에 맞춰 단계적으로 지도합니다." />

        <label className="label" style={{ marginTop: 4 }}>강점·특기 (여러 개 선택)</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {STRENGTH_POOL.map((t) => {
            const on = strengths.includes(t);
            return <button key={t} type="button" onClick={() => toggle(strengths, setStrengths, t)} style={{ cursor: 'pointer', padding: '5px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700,
              border: on ? '1px solid var(--teal)' : '1px solid var(--line)', background: on ? 'var(--teal)' : '#fff', color: on ? '#fff' : 'var(--muted)' }}>{t}</button>;
          })}
        </div>

        <label className="label">제공 상담 방식 <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(학생이 방식으로 선생님을 찾을 때 반영)</span></label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginBottom: modes.length === 0 ? 4 : 12 }}>
          {MODE_OPTIONS.map((m) => {
            const on = modes.includes(m.value);
            return (
              <button key={m.value} type="button" onClick={() => toggle(modes, setModes, m.value)} style={{ cursor: 'pointer', textAlign: 'left', padding: '10px 12px', borderRadius: 10,
                border: on ? '1px solid var(--teal)' : '1px solid var(--line)', background: on ? 'var(--teal-50,#EEF4FB)' : '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, border: on ? 'none' : '1.5px solid var(--line)', background: on ? 'var(--teal)' : '#fff', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>{on ? '✓' : ''}</span>
                  <b style={{ fontSize: 14, color: on ? 'var(--teal)' : 'var(--ink)' }}>{m.icon} {m.label}</b>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, paddingLeft: 26 }}>{m.desc}</div>
              </button>
            );
          })}
        </div>
        {modes.length === 0 && <p style={{ fontSize: 12, color: 'var(--danger,#c25a43)', margin: '0 0 12px' }}>⚠ 방식을 하나도 선택하지 않으면 방식으로 검색하는 학생에게 노출되지 않아요.</p>}

        <label className="label">담당 과목</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {SUBJECTS.map((s) => {
            const on = subjects.includes(s);
            return <button key={s} type="button" onClick={() => toggle(subjects, setSubjects, s)} style={{ cursor: 'pointer', padding: '5px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700,
              border: on ? '1px solid var(--teal)' : '1px solid var(--line)', background: on ? 'var(--teal-50)' : '#fff', color: on ? 'var(--teal)' : 'var(--muted)' }}>{s}</button>;
          })}
        </div>

        <TextField label="경력(선택)" value={career} onChange={(e) => setCareer(e.target.value)} placeholder="예: 대치 5년 · 강남대성 출강" />
        {/* F3 — Q&A 수신 설정(기본 최소·개별맞춤 원칙): on/off + 과목 제한 */}
        <label className="label" style={{ marginTop: 12 }}>Q&A 질문 수신</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer', marginBottom: 6 }}>
          <input type="checkbox" checked={qnaRecv} onChange={(e) => setQnaRecv(e.target.checked)} />
          새 질문을 받습니다 <span style={{ fontSize: 12, color: 'var(--muted)' }}>(끄면 학생 목록·자동배정에서 제외 — 시험기간·휴가용)</span>
        </label>
        {qnaRecv && (
          <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
              {SUBJECTS.map((sub) => (
                <button key={sub} type="button" onClick={() => setQnaSubs((p2) => (p2.includes(sub) ? p2.filter((x) => x !== sub) : [...p2, sub]))}
                  style={{ fontSize: 12.5, borderRadius: 999, padding: '4px 12px', cursor: 'pointer', border: qnaSubs.includes(sub) ? '1px solid var(--teal)' : '1px solid var(--line)', background: qnaSubs.includes(sub) ? 'var(--teal-50,#E8F0F9)' : 'var(--surface)', color: qnaSubs.includes(sub) ? 'var(--teal)' : 'var(--muted)', fontWeight: 700 }}>
                  {sub}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>수신할 과목만 선택하세요 — 아무것도 선택하지 않으면 전 과목을 받습니다.</p>
          </>
        )}

        {/* Q&A 후 이어서 상담 제공 여부 — 학생 질문 폼의 선생님 선별에 반영 */}
        <label className="label" style={{ marginTop: 12 }}>Q&A 이어서 상담</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer', marginBottom: 4 }}>
          <input type="checkbox" checked={qnaEsc} onChange={(e) => setQnaEsc(e.target.checked)} />
          질문 답변 후 학생이 상담으로 이어가는 것(질문승격)을 받습니다
        </label>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 8px' }}>끄면 학생 질문 화면에서 "이어서 상담 가능" 표시가 빠지고, 상담 이어가기 요청이 차단됩니다.</p>
        <Button onClick={save} loading={busy} style={{ marginTop: 8 }}>프로필 저장</Button>
      </Card>

      {(p.strengths?.length ?? 0) > 0 && (
        <Card style={{ maxWidth: 680, marginTop: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>학생에게 이렇게 보여요 (미리보기)</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {strengths.map((s) => <Badge key={s} kind="soft">#{s}</Badge>)}
          </div>
          {modes.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {modes.map((m) => { const o = MODE_OPTIONS.find((x) => x.value === m); return <Badge key={m} kind="done">{o?.icon} {o?.label ?? m}</Badge>; })}
            </div>
          )}
          {intro && <p style={{ fontSize: 14, color: 'var(--ink)', margin: '8px 0 0' }}>{intro}</p>}
        </Card>
      )}
    </div>
  );
}
