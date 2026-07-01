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
  reRequestRate?: number | null;
  avgResponseMin?: number | null;
};

const STRENGTH_POOL = ['개념정리', '문제풀이', '내신대비', '수능대비', '오답관리', '동기부여', '기초탄탄', '심화학습', '입시전략', '멘탈관리'];
const SUBJECTS = ['국어', '수학', '영어', '과학', '사회', '입시'];

export function TeacherProfilePage() {
  const [p, setP] = useState<Profile | null>(null);
  const [intro, setIntro] = useState('');
  const [strengths, setStrengths] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [career, setCareer] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  function hydrate(d: Profile) {
    setP(d); setIntro(d.intro ?? ''); setStrengths(d.strengths ?? []); setSubjects(d.subjects ?? []); setCareer(d.career ?? '');
  }
  useEffect(() => {
    api.get<Profile>('/teachers/me/profile').then(hydrate).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, []);

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  async function save() {
    setBusy(true); setMsg(''); setError('');
    try {
      const d = await api.put<Profile>('/teachers/me/profile', { intro, strengths, subjects, career });
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

        <label className="label">담당 과목</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {SUBJECTS.map((s) => {
            const on = subjects.includes(s);
            return <button key={s} type="button" onClick={() => toggle(subjects, setSubjects, s)} style={{ cursor: 'pointer', padding: '5px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700,
              border: on ? '1px solid var(--teal)' : '1px solid var(--line)', background: on ? 'var(--teal-50)' : '#fff', color: on ? 'var(--teal)' : 'var(--muted)' }}>{s}</button>;
          })}
        </div>

        <TextField label="경력(선택)" value={career} onChange={(e) => setCareer(e.target.value)} placeholder="예: 대치 5년 · 강남대성 출강" />
        <Button onClick={save} loading={busy} style={{ marginTop: 8 }}>프로필 저장</Button>
      </Card>

      {(p.strengths?.length ?? 0) > 0 && (
        <Card style={{ maxWidth: 680, marginTop: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>학생에게 이렇게 보여요 (미리보기)</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {strengths.map((s) => <Badge key={s} kind="soft">#{s}</Badge>)}
          </div>
          {intro && <p style={{ fontSize: 14, color: 'var(--ink)', margin: '8px 0 0' }}>{intro}</p>}
        </Card>
      )}
    </div>
  );
}
