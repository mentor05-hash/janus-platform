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
  rawTotal: '제거전',
  total: '제거후',
  dedupRemoved: '중복제거',
  dedupRate: '중복제거율%',
  done: '완료',
  rejected: '거부',
  noshow: '노쇼',
  cancelled: '취소',
  completion: '완료율%',
};

type ConsultStat = {
  type: string;
  done: number;
  notes: number;
  final: number;
  draft: number;
  guardianVisible: number;
  recordRate: number;
  finalRate: number;
};

export function AdminAnalyticsPage() {
  const { user } = useAuth();
  const hq = isHq(user);
  const [period, setPeriod] = useState('all');
  const [centers, setCenters] = useState<CenterCompareRow[]>([]);
  const [view, setView] = useState('center');
  const [pivot, setPivot] = useState<Record<string, unknown>[]>([]);
  const [consult, setConsult] = useState<ConsultStat[]>([]);
  const [byType, setByType] = useState<{ studentType: string; label: string; done: number; notes: number; final: number; recordRate: number }[]>([]);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false); // 본사 노출 정책상 이 센터 대시보드 비활성

  useEffect(() => {
    api.get<{ role: string; enabled?: boolean }>('/dashboard/access')
      .then((a) => setBlocked(a.role === 'centerAdmin' && a.enabled === false))
      .catch(() => {});
  }, []);

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

  const loadConsult = useCallback(async () => {
    try {
      // unwrap=false 로 봉투 전체 수신 → data(유형별 rows) + byStudentType(재원/외부)
      const env = await api.getPage<ConsultStat>(`/ops/consultation-stats?period=${period}`) as unknown as { data: ConsultStat[]; byStudentType?: typeof byType };
      setConsult(env.data ?? []);
      setByType(env.byStudentType ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '조회 실패');
    }
  }, [period]);

  useEffect(() => {
    void loadCompare();
  }, [loadCompare]);
  useEffect(() => {
    void loadPivot();
  }, [loadPivot]);
  useEffect(() => {
    void loadConsult();
  }, [loadConsult]);
  const consultTotals = consult.reduce(
    (a, r) => ({ done: a.done + r.done, notes: a.notes + r.notes, final: a.final + r.final, guardianVisible: a.guardianVisible + r.guardianVisible }),
    { done: 0, notes: 0, final: 0, guardianVisible: 0 },
  );

  const cols: Column<Record<string, unknown>>[] = pivot.length
    ? Object.keys(pivot[0]).map((k) => ({
        key: k,
        header: COL_LABEL[k] ?? k,
        render: (row) => String(row[k] ?? ''),
      }))
    : [];

  if (blocked) return (
    <div>
      <PageHeader title="센터 분석" sub="자기 센터 위치" />
      <SectionCard title="대시보드 비활성화">
        <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>본사 정책에 따라 이 센터의 대시보드가 현재 비활성화되어 있어요. 본사 관리자에게 문의하세요.</p>
      </SectionCard>
    </div>
  );

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

      <SectionCard
        title="상담기록 종류별 통계"
        desc="완료 상담 대비 기록 작성(최종저장) 완비율 · 보호자 공개(§5 상담기록)"
      >
        {consult.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>완료된 상담이 없습니다.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11 }}>
                <th style={{ padding: '8px 10px' }}>종류</th>
                <th style={{ padding: '8px 10px' }}>완료 상담</th>
                <th style={{ padding: '8px 10px' }}>기록 수</th>
                <th style={{ padding: '8px 10px' }}>최종저장</th>
                <th style={{ padding: '8px 10px' }}>보호자 공개</th>
                <th style={{ padding: '8px 10px' }}>기록작성률</th>
              </tr>
            </thead>
            <tbody>
              {consult.map((r) => (
                <tr key={r.type} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700 }}>{r.type}</td>
                  <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>{r.done.toLocaleString()}</td>
                  <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>{r.notes.toLocaleString()}</td>
                  <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>{r.final.toLocaleString()}</td>
                  <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>{r.guardianVisible.toLocaleString()}</td>
                  <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>{r.recordRate}%</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--line)', fontWeight: 700 }}>
                <td style={{ padding: '8px 10px' }}>합계</td>
                <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>{consultTotals.done.toLocaleString()}</td>
                <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>{consultTotals.notes.toLocaleString()}</td>
                <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>{consultTotals.final.toLocaleString()}</td>
                <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>{consultTotals.guardianVisible.toLocaleString()}</td>
                <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>
                  {consultTotals.done ? Math.round((consultTotals.notes / consultTotals.done) * 1000) / 10 : 0}%
                </td>
              </tr>
            </tbody>
          </table>
        )}
        {byType.length > 0 && (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>학생 유형별 (재원 / 외부)</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {byType.map((t) => (
                <div key={t.studentType} style={{ flex: '1 1 200px', minWidth: 180, border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, color: '#fff', background: t.studentType === 'enrolled' ? 'var(--teal)' : '#B4690E' }}>{t.label}</span>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{t.done.toLocaleString()}<span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}> 완료</span></div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>기록 {t.notes.toLocaleString()} · 최종 {t.final.toLocaleString()} · 작성률 {t.recordRate}%</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="피벗">
        <Tabs items={VIEWS} value={view} onChange={setView} />
        <Table columns={cols} rows={pivot} rowKey={(_, i) => String(i)} />
      </SectionCard>
    </div>
  );
}
