import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { CenterCompareRow } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { isHq } from '../auth/roleHome';
import { PageHeader, SelectField, ErrorText, Table, Tabs } from '../components/ui';
import type { Column } from '../components/ui';
import { BarList, SectionCard } from '../components/dashboard/widgets';

const PERIODS = [
  { value: 'all', label: '전체' },
  { value: '1w', label: '최근 1주' },
  { value: '2w', label: '최근 2주' },
  { value: '1m', label: '최근 1달' },
];
const VIEWS = [
  { value: 'center', label: '센터별' },
  { value: 'teacher-in-center', label: '센터 내 선생님' },
  { value: 'teacher-x-center', label: '선생님×센터' },
  { value: 'teacher-monthly', label: '선생님 월별' },
  { value: 'center-monthly', label: '센터 월별' },
];
const COL_LABEL: Record<string, string> = {
  key: '대상',
  month: '월',
  total: '전체',
  done: '완료',
  rejected: '거부',
  noshow: '노쇼',
  cancelled: '취소',
  completion: '완료율%',
};

export function AdminAnalyticsPage() {
  const { user } = useAuth();
  const hq = isHq(user);
  const [period, setPeriod] = useState('all');
  const [centers, setCenters] = useState<CenterCompareRow[]>([]);
  const [view, setView] = useState('center');
  const [pivot, setPivot] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState('');

  const loadCompare = useCallback(async () => {
    try {
      setCenters(await api.get<CenterCompareRow[]>(`/ops/center-comparison?period=${period}`));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '조회 실패');
    }
  }, [period]);

  const loadPivot = useCallback(async () => {
    try {
      setPivot(await api.get<Record<string, unknown>[]>(`/ops/pivots/${view}?period=${period}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '조회 실패');
    }
  }, [view, period]);

  useEffect(() => {
    void loadCompare();
  }, [loadCompare]);
  useEffect(() => {
    void loadPivot();
  }, [loadPivot]);

  const cols: Column<Record<string, unknown>>[] = pivot.length
    ? Object.keys(pivot[0]).map((k) => ({
        key: k,
        header: COL_LABEL[k] ?? k,
        render: (row) => String(row[k] ?? ''),
      }))
    : [];

  return (
    <div>
      <PageHeader title="센터 분석" sub={hq ? '전체 센터 비교' : '자기 센터 위치'} />
      <div style={{ maxWidth: 200, marginBottom: 8 }}>
        <SelectField value={period} onChange={(e) => setPeriod(e.target.value)} options={PERIODS} />
      </div>
      <ErrorText>{error}</ErrorText>

      <SectionCard
        title="센터 비교 — 표준화 상대점수(z→0~100)"
        desc={hq ? '전체 센터 순위' : '자기 센터 위치만 표시됩니다.'}
      >
        <BarList
          items={centers.map((c) => ({
            id: c.centerId,
            rank: c.rank,
            label: c.name,
            value: c.score0to100,
            caption: `완료 ${c.raw.completion}% · 만족 ${c.raw.satisfaction}`,
          }))}
        />
      </SectionCard>

      <SectionCard title="피벗">
        <Tabs items={VIEWS} value={view} onChange={setView} />
        <Table columns={cols} rows={pivot} rowKey={(_, i) => String(i)} />
      </SectionCard>
    </div>
  );
}
