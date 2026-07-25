import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Spinner, ErrorText, Button, TextField, SelectField } from '../components/ui';

/**
 * 목표 설정 (WD-9) — 목표 대학·학과·라인·평균(janus_goal 규약).
 * 저장 시 격차 리포트·대시보드에 반영. 상담·컨설팅이 같은 목표 계약을 읽는다.
 */

type Goal = { tier: string | null; avg: number | null; university: string | null; department: string | null };

const TIER_OPTIONS = [
  { value: '', label: '선택 안 함' },
  { value: '최상위', label: '최상위 (서울대·의약학 라인)' },
  { value: '상위', label: '상위 (서성한·중경외시 라인)' },
  { value: '중상위', label: '중상위 (건동홍·국숭세단 라인)' },
  { value: '중위', label: '중위 (인서울 하위·수도권 라인)' },
  { value: '중하위', label: '중하위 (수도권·지방 국립 라인)' },
  { value: '기초', label: '기초 (지방권·전문대 라인)' },
];

export function StudentGoalPage() {
  const nav = useNavigate();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<Goal>('/me/goal')
      .then((g) => setGoal({ tier: g.tier ?? null, avg: g.avg ?? null, university: g.university ?? null, department: g.department ?? null }))
      .catch((e) => { setGoal({ tier: null, avg: null, university: null, department: null }); if (!(e instanceof ApiError && e.status === 404)) setError(e instanceof ApiError ? e.message : '조회 실패'); });
  }, []);

  const set = (patch: Partial<Goal>) => { setGoal((g) => ({ ...(g as Goal), ...patch })); setSaved(false); };

  const save = async () => {
    if (!goal) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      const avg = goal.avg != null && !Number.isNaN(goal.avg) ? goal.avg : null;
      const g = await api.put<Goal>('/me/goal', {
        tier: goal.tier || null,
        avg,
        university: goal.university?.trim() || null,
        department: goal.department?.trim() || null,
      });
      setGoal({ tier: g.tier ?? null, avg: g.avg ?? null, university: g.university ?? null, department: g.department ?? null });
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장에 실패했어요. 잠시 후 다시 시도해 주세요.');
    } finally { setSaving(false); }
  };

  return (
    <div>
      <PageHeader title="목표 설정" sub="목표 평균을 정하면 약점 과목이 '할 일'로 자동 제안되고, 목표 대학·학과는 격차 리포트에 자동으로 채워져요." />
      <div style={{ marginBottom: 8 }}><Link to="/student/placement/gap" className="btn ghost" data-janus-cta="goal-to-report">격차 리포트 보기 →</Link></div>
      <ErrorText>{error}</ErrorText>
      {!goal ? <Spinner /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
          <Card title="내 목표">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <TextField label="목표 대학" placeholder="예) 성균관대" maxLength={60} value={goal.university ?? ''} onChange={(e) => set({ university: e.target.value })} />
              <TextField label="목표 학과" placeholder="예) 전자공학" maxLength={60} value={goal.department ?? ''} onChange={(e) => set({ department: e.target.value })} />
              <SelectField label="목표 라인(선택)" options={TIER_OPTIONS} value={goal.tier ?? ''} onChange={(e) => set({ tier: e.target.value || null })} />
              <TextField label="목표 평균 점수" type="number" min={0} max={100} step={1} placeholder="예) 90" hint="목표 평균에 못 미치는 과목이 '할 일'로 제안되는 기준이에요(정수)." value={goal.avg ?? ''} onChange={(e) => set({ avg: e.target.value === '' ? null : Math.round(Number(e.target.value)) })} />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                <Button onClick={save} disabled={saving} data-janus-cta="goal_save">{saving ? '저장 중…' : '목표 저장·리포트 갱신'}</Button>
                <button className="btn ghost" onClick={() => nav('/student/placement/gap')} data-janus-cta="goal-cancel">취소</button>
                {saved && <span style={{ fontSize: 13, color: 'var(--janus-signal-stable, #2e7d32)' }}>✓ 저장됐어요</span>}
              </div>
            </div>
          </Card>

          <Card title="목표는 이렇게 쓰여요">
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: 'var(--ink-body)', lineHeight: 1.7 }}>
              <li><b>맞춤 할 일</b> — 목표 평균에 못 미치는 과목이 '할 일'로 자동 제안돼요(<Link to="/student/tasks">할 일 보기</Link>).</li>
              <li><b>격차 리포트</b> — 목표 대학·학과가 리포트의 대학·학과 입력란에 자동으로 채워져요(목표 컷은 배치표에서 선택·입력).</li>
              <li><b>상담·컨설팅</b> — 선생님·컨설턴트가 같은 목표를 보고 전략을 잡아요.</li>
              <li>목표 평균을 비워 두면 과목별 '할 일' 제안이 만들어지지 않아요.</li>
            </ul>
            <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--muted)' }}>본 목표는 통계적 격차 계산의 기준일 뿐이며, 실제 합격을 보장하지 않아요.</div>
          </Card>
        </div>
      )}
    </div>
  );
}
