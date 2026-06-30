import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { CenterCompareRow } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { isHq } from '../auth/roleHome';

const PERIODS = [
  { v: 'all', t: '전체' },
  { v: '1w', t: '최근 1주' },
  { v: '2w', t: '최근 2주' },
  { v: '1m', t: '최근 1달' },
];
const VIEWS = [
  { v: 'center', t: '센터별' },
  { v: 'teacher-in-center', t: '센터 내 선생님' },
  { v: 'teacher-x-center', t: '선생님×센터' },
  { v: 'teacher-monthly', t: '선생님 월별' },
  { v: 'center-monthly', t: '센터 월별' },
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

  const cols = pivot.length ? Object.keys(pivot[0]) : [];
  const maxScore = Math.max(100, ...centers.map((c) => c.score0to100));

  return (
    <div>
      <h2 style={{ color: 'var(--teal)' }}>센터 분석</h2>
      <div style={{ margin: '10px 0' }}>
        <select className="input" style={{ width: 160 }} value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map((p) => (
            <option key={p.v} value={p.v}>{p.t}</option>
          ))}
        </select>
      </div>
      {error && <p className="error">{error}</p>}

      {/* 센터 비교 (z-score 0~100) */}
      <div className="card" style={{ marginBottom: 16 }}>
        <strong>센터 비교 — 표준화 상대점수(z→0~100)</strong>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '4px 0 12px' }}>
          {hq ? '전체 센터 순위' : '자기 센터 위치만 표시됩니다.'}
        </p>
        {centers.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>데이터가 없습니다.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {centers.map((c) => (
              <div key={c.centerId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 24, fontWeight: 700, color: 'var(--teal)' }}>{c.rank}</span>
                <span style={{ width: 110 }}>{c.name}</span>
                <span style={{ flex: 1, height: 14, background: 'var(--line)', borderRadius: 7 }}>
                  <span style={{ display: 'block', width: `${(c.score0to100 / maxScore) * 100}%`, height: 14, background: 'var(--teal)', borderRadius: 7 }} />
                </span>
                <span style={{ width: 48, textAlign: 'right', fontWeight: 700 }}>{c.score0to100}</span>
                <span style={{ width: 150, fontSize: 12, color: 'var(--muted)' }}>
                  완료 {c.raw.completion}% · 만족 {c.raw.satisfaction}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 피벗 뷰 */}
      <div className="card">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <strong>피벗</strong>
          <select className="input" style={{ width: 180 }} value={view} onChange={(e) => setView(e.target.value)}>
            {VIEWS.map((v) => (
              <option key={v.v} value={v.v}>{v.t}</option>
            ))}
          </select>
        </div>
        {pivot.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>데이터가 없습니다.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left' }}>
                {cols.map((c) => (
                  <th key={c} style={{ padding: 6 }}>{COL_LABEL[c] ?? c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pivot.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                  {cols.map((c) => (
                    <td key={c} style={{ padding: 6, fontVariantNumeric: 'tabular-nums' }}>
                      {String(row[c] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
