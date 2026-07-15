import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, Badge, ErrorText, Spinner, TextField, SelectField } from '../components/ui';

// 수능 성적 자가 입력 → 배치표·격차 자동 반영(C1 단일 소스). 세부과목·제2외국어는 메타(배치표 미반영).
type Mode = 'std' | 'nb';
type Gye = '문과' | '이과' | '';

// 올해(2026)까지 수능 선택과목 — 국어·수학·탐구·제2외국어는 세부과목 선택.
const SUB_KOR = ['화법과작문', '언어와매체'];
const SUB_MAT = ['확률과통계', '미적분', '기하'];
const SUB_TAM = [
  '생활과윤리', '윤리와사상', '한국지리', '세계지리', '동아시아사', '세계사', '정치와법', '경제', '사회·문화',
  '물리학Ⅰ', '화학Ⅰ', '생명과학Ⅰ', '지구과학Ⅰ', '물리학Ⅱ', '화학Ⅱ', '생명과학Ⅱ', '지구과학Ⅱ',
];
const SUB_LANG = ['독일어Ⅰ', '프랑스어Ⅰ', '스페인어Ⅰ', '중국어Ⅰ', '일본어Ⅰ', '러시아어Ⅰ', '아랍어Ⅰ', '베트남어Ⅰ', '한문Ⅰ'];
const GRADES = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

type Row = { subject: string; sub: string; score: string; grade: string };

const initRows = (): Record<string, Row> => ({
  국어: { subject: '국어', sub: '', score: '', grade: '' },
  수학: { subject: '수학', sub: '', score: '', grade: '' },
  탐구1: { subject: '탐구1', sub: '', score: '', grade: '' },
  탐구2: { subject: '탐구2', sub: '', score: '', grade: '' },
  영어: { subject: '영어', sub: '', score: '', grade: '' },
  한국사: { subject: '한국사', sub: '', score: '', grade: '' },
  제2외국어: { subject: '제2외국어', sub: '', score: '', grade: '' },
});

export function StudentScoreInputPage() {
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('std');
  const [gye, setGye] = useState<Gye>('');
  const [period, setPeriod] = useState('');
  const [nb, setNb] = useState('');
  const [rows, setRows] = useState<Record<string, Row>>(initRows());
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [linkable, setLinkable] = useState<boolean | null>(null);

  useEffect(() => {
    api.get<{ exists: boolean; period?: string; mode?: Mode; gye?: string | null; nb?: number | null; items?: { subject: string; subSubject: string | null; score: number | null; grade: string | null }[] }>('/scores/me')
      .then((r) => {
        if (r.exists) {
          setPeriod(r.period ?? ''); setMode(r.mode ?? 'std'); setGye((r.gye as Gye) ?? '');
          setNb(r.nb != null ? String(r.nb) : '');
          const next = initRows();
          for (const it of r.items ?? []) {
            if (next[it.subject]) next[it.subject] = { subject: it.subject, sub: it.subSubject ?? '', score: it.score != null ? String(it.score) : '', grade: it.grade ?? '' };
          }
          setRows(next);
        }
      })
      .catch(() => { /* 최초 입력 */ })
      .finally(() => setLoading(false));
  }, []);

  const setRow = (k: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [k]: { ...r[k], ...patch } }));

  async function save() {
    setError(''); setMsg('');
    if (!period.trim()) { setError('시험(기간)을 입력해 주세요 — 예: 2026-9월 모의고사'); return; }
    if (mode === 'nb' && !nb.trim()) { setError('누백 모드에선 전국누백을 입력해 주세요.'); return; }
    // items 구성: 표점 모드는 국어/수학/탐구1/탐구2 표점, 공통으로 영어·한국사 등급 + 제2외국어(메타).
    const items: { subject: string; score?: number | null; grade?: string | null; subSubject?: string | null }[] = [];
    const push = (r: Row, opts: { score?: boolean; grade?: boolean }) => {
      const it: { subject: string; score?: number | null; grade?: string | null; subSubject?: string | null } = { subject: r.subject };
      if (opts.score && r.score.trim()) it.score = Number(r.score);
      if (opts.grade && r.grade.trim()) it.grade = r.grade;
      if (r.sub) it.subSubject = r.sub;
      if (it.score != null || it.grade != null || it.subSubject) items.push(it);
    };
    if (mode === 'std') {
      push(rows['국어'], { score: true }); push(rows['수학'], { score: true });
      push(rows['탐구1'], { score: true }); push(rows['탐구2'], { score: true });
    } else {
      // 누백 모드: 탐구 세부만 메타로, 표점은 안 씀
      push(rows['탐구1'], {}); push(rows['탐구2'], {});
    }
    push(rows['영어'], { grade: true });
    push(rows['한국사'], { grade: true });
    push(rows['제2외국어'], { grade: true });

    setSaving(true);
    try {
      const r = await api.post<{ ok: boolean; linkable: boolean }>('/scores/me', {
        period, mode, gye: gye || undefined, nb: mode === 'nb' && nb ? Number(nb) : undefined, items,
      });
      setLinkable(r.linkable);
      setMsg(r.linkable ? '저장 완료 — 배치표·격차 리포트에 자동 반영됐어요.' : '저장했어요. 다만 배치표 연동엔 필수값(표점 4종 또는 누백 + 영어·한국사)이 더 필요해요.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장 실패');
    } finally { setSaving(false); }
  }

  if (loading) return <Spinner />;
  const isStd = mode === 'std';

  return (
    <div>
      <PageHeader title="성적진단" sub="수능 성적을 한 번 입력하면 배치표·격차 리포트에 자동 반영돼요. 세부과목·제2외국어는 참고용으로 저장돼요." />
      <ErrorText>{error}</ErrorText>
      {msg && (
        <div style={{ fontSize: 13.5, color: linkable ? 'var(--brand)' : 'var(--muted)', marginBottom: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {msg}
          {linkable && (<>
            <Link to="/placement/hub" className="btn sm" style={{ textDecoration: 'none' }}>배치표 열기 →</Link>
            <Link to="/placement/gap" className="btn sm outline" style={{ textDecoration: 'none' }}>격차 리포트 →</Link>
          </>)}
        </div>
      )}

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 200 }}>
            <TextField label="시험(기간)" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="예: 2026-9월 모의고사" />
          </div>
          <div style={{ minWidth: 120 }}>
            <SelectField label="계열" value={gye} onChange={(e) => setGye(e.target.value as Gye)}
              options={[{ value: '', label: '선택' }, { value: '문과', label: '문과' }, { value: '이과', label: '이과' }]} />
          </div>
          <div>
            <div className="label" style={{ marginBottom: 4 }}>입력 방식</div>
            <div style={{ display: 'inline-flex', padding: 3, gap: 3, borderRadius: 10, background: 'var(--j-ghost-bg)', border: '1px solid var(--j-ghost-border)' }}>
              {(['std', 'nb'] as Mode[]).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} style={{
                  padding: '7px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  background: mode === m ? 'var(--j-blue)' : 'transparent', color: mode === m ? '#fff' : 'var(--muted)',
                }}>{m === 'std' ? '표준점수' : '전국누백'}</button>
              ))}
            </div>
          </div>
          {mode === 'nb' && (
            <div style={{ minWidth: 140 }}>
              <TextField label="전국누백(0~100)" value={nb} onChange={(e) => setNb(e.target.value)} placeholder="예: 3.2" />
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13, lineHeight: 1.6,
          background: isStd ? 'var(--j-blue-soft)' : 'var(--surface-soft, #f6f7f9)', color: 'var(--ink-body)' }}>
          {isStd
            ? '📝 표준점수 모드 — 국어·수학·탐구1·탐구2 옆 칸에 과목별 표준점수(0~200)를 넣어주세요. 영어·한국사는 등급.'
            : '📝 전국누백 모드 — 성적은 위의 전국누백(하나)로 판단해요. 과목별 점수 입력칸은 없고, 아래 세부과목은 참고용이에요. 과목별 점수로 넣으려면 위 입력 방식을 「표준점수」로 바꾸세요.'}
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          <SubjectRow label="국어" row={rows['국어']} subs={SUB_KOR} showScore={isStd} onSub={(v) => setRow('국어', { sub: v })} onScore={(v) => setRow('국어', { score: v })} />
          <SubjectRow label="수학" row={rows['수학']} subs={SUB_MAT} showScore={isStd} onSub={(v) => setRow('수학', { sub: v })} onScore={(v) => setRow('수학', { score: v })} />
          <SubjectRow label="탐구1" row={rows['탐구1']} subs={SUB_TAM} showScore={isStd} onSub={(v) => setRow('탐구1', { sub: v })} onScore={(v) => setRow('탐구1', { score: v })} />
          <SubjectRow label="탐구2" row={rows['탐구2']} subs={SUB_TAM} showScore={isStd} onSub={(v) => setRow('탐구2', { sub: v })} onScore={(v) => setRow('탐구2', { score: v })} />
          <SubjectRow label="영어" row={rows['영어']} gradeOnly onGrade={(v) => setRow('영어', { grade: v })} />
          <SubjectRow label="한국사" row={rows['한국사']} gradeOnly onGrade={(v) => setRow('한국사', { grade: v })} />
          <SubjectRow label="제2외국어" row={rows['제2외국어']} subs={SUB_LANG} gradeOnly meta onSub={(v) => setRow('제2외국어', { sub: v })} onGrade={(v) => setRow('제2외국어', { grade: v })} />
        </div>
        <div style={{ marginTop: 16 }}><Button onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장하고 배치표에 반영'}</Button></div>
        <p style={{ fontSize: 12, color: 'var(--caption)', marginTop: 8 }}>
          {isStd ? '표준점수 모드: 국어·수학·탐구1·탐구2 표점(0~200) + 영어·한국사 등급이 있으면 배치표 연동돼요.' : '전국누백 모드: 위 전국누백 + 영어·한국사 등급으로 연동돼요.'}
          {' '}영어·한국사·제2외국어는 절대평가(등급 1~9).
        </p>
      </Card>
    </div>
  );
}

function SubjectRow({ label, row, subs, showScore, gradeOnly, meta, onSub, onScore, onGrade }: {
  label: string; row: Row; subs?: string[]; showScore?: boolean; gradeOnly?: boolean; meta?: boolean;
  onSub?: (v: string) => void; onScore?: (v: string) => void; onGrade?: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div style={{ width: 82, fontSize: 14, fontWeight: 700, color: 'var(--ink)', paddingBottom: 9, display: 'flex', alignItems: 'center', gap: 5 }}>
        {label}{meta && <Badge kind="soft">참고</Badge>}
      </div>
      {subs && (
        <div style={{ minWidth: 150 }}>
          <SelectField label="세부과목" value={row.sub} onChange={(e) => onSub?.(e.target.value)}
            options={[{ value: '', label: '선택' }, ...subs.map((s) => ({ value: s, label: s }))]} />
        </div>
      )}
      {showScore && (
        <div style={{ width: 110 }}>
          <TextField label="표준점수" value={row.score} onChange={(e) => onScore?.(e.target.value)} placeholder="0~200" />
        </div>
      )}
      {(gradeOnly || meta) && (
        <div style={{ width: 100 }}>
          <SelectField label="등급" value={row.grade} onChange={(e) => onGrade?.(e.target.value)}
            options={[{ value: '', label: '선택' }, ...GRADES.map((g) => ({ value: g, label: `${g}등급` }))]} />
        </div>
      )}
    </div>
  );
}
