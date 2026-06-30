import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Center, RankingRow, WeightPolicy } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { isHq } from '../auth/roleHome';

const WEIGHT_FIELDS: { key: keyof WeightPolicy; label: string; reverse?: boolean }[] = [
  { key: 'w_total', label: '누적 상담' },
  { key: 'w_completion', label: '완료율' },
  { key: 'w_rerequest', label: '재요청률' },
  { key: 'w_reject', label: '거부율', reverse: true },
  { key: 'w_noshow', label: '노쇼율', reverse: true },
  { key: 'w_response', label: '평균 응답', reverse: true },
  { key: 'w_satisfaction', label: '만족도' },
];
const PERIODS = [
  { v: 'all', t: '전체' },
  { v: '1w', t: '최근 1주' },
  { v: '2w', t: '최근 2주' },
  { v: '1m', t: '최근 1달' },
];

export function AdminEvaluationPage() {
  const { user } = useAuth();
  const hq = isHq(user);
  const isAdmin = user?.role === 'admin';
  const canEdit = user?.permLevel === 'L1' || user?.permLevel === 'L2'; // 본사급만 설정(가중치·원장)

  const [rows, setRows] = useState<RankingRow[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [period, setPeriod] = useState('all');
  const [director, setDirector] = useState('');
  const [centerId, setCenterId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [weights, setWeights] = useState<WeightPolicy | null>(null);
  const [showWeights, setShowWeights] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ period });
      if (director) qs.set('director', director);
      if (hq && centerId) qs.set('centerId', centerId);
      setRows(await api.get<RankingRow[]>(`/admin/evaluation/ranking?${qs}`));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [period, director, centerId, hq]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (hq) api.get<Center[]>('/centers').then(setCenters).catch(() => undefined);
  }, [hq]);

  const loadWeights = useCallback(async () => {
    const q = hq && centerId ? `?centerId=${centerId}` : '';
    setWeights(await api.get<WeightPolicy>(`/admin/evaluation/weights${q}`));
  }, [hq, centerId]);

  const weightSum = useMemo(
    () => (weights ? WEIGHT_FIELDS.reduce((s, f) => s + Number(weights[f.key] || 0), 0) : 0),
    [weights],
  );

  async function openWeights() {
    if (!showWeights && !weights) await loadWeights();
    setShowWeights((v) => !v);
  }

  async function saveWeights() {
    if (!weights) return;
    if (weightSum !== 100) {
      alert(`가중치 합계가 ${weightSum} 입니다. 정확히 100 이어야 합니다.`);
      return;
    }
    try {
      const body: Record<string, unknown> = { centerId: hq && centerId ? centerId : null };
      WEIGHT_FIELDS.forEach((f) => (body[f.key] = Number(weights[f.key])));
      await api.put('/admin/evaluation/weights', body);
      alert('가중치 저장 완료');
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '저장 실패');
    }
  }

  async function setDirectorRole(t: RankingRow) {
    const cur = t.directorRole ?? '';
    const next = window.prompt('직무 (원장 / 부원장 / 빈칸=해제):', cur);
    if (next === null) return;
    const role = next.trim() === '' ? null : next.trim();
    if (role && role !== '원장' && role !== '부원장') return alert('원장 또는 부원장만 가능');
    try {
      await api.put(`/admin/teachers/${t.teacherId}/director`, { directorRole: role });
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '지정 실패');
    }
  }

  async function setHours(t: RankingRow) {
    const ym = new Date().toISOString().slice(0, 7);
    const h = window.prompt(`${t.name ?? t.teacherId} ${ym} 근무시수(시간):`, String(t.hours ?? ''));
    if (h === null) return;
    const hours = Number(h);
    if (!Number.isFinite(hours) || hours < 0) return alert('숫자를 입력하세요');
    try {
      await api.put(`/admin/teachers/${t.teacherId}/monthly-hours`, { yearMonth: ym, hours });
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '입력 실패');
    }
  }

  return (
    <div>
      <h2 style={{ color: 'var(--teal)' }}>선생님 평가·순위</h2>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: -6 }}>
        가중 종합점수(0~100) 기준 순위. {hq ? '전체 센터' : '자기 센터'} 범위.
      </p>

      {/* 필터 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '12px 0' }}>
        <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map((p) => (
            <option key={p.v} value={p.v}>{p.t}</option>
          ))}
        </select>
        <select className="input" value={director} onChange={(e) => setDirector(e.target.value)}>
          <option value="">직무 전체</option>
          <option value="원장">원장</option>
          <option value="부원장">부원장</option>
        </select>
        {hq && (
          <select className="input" value={centerId} onChange={(e) => setCenterId(e.target.value)}>
            <option value="">전체 센터</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        {canEdit && (
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={openWeights}>
            가중치 {showWeights ? '닫기' : '설정'}
          </button>
        )}
      </div>

      {/* 가중치 편집 */}
      {showWeights && weights && (
        <div className="card" style={{ marginBottom: 14 }}>
          <strong>평가 가중치 {hq && centerId ? '(선택 센터)' : '(전사 기본)'}</strong>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '10px 0' }}>
            {WEIGHT_FIELDS.map((f) => (
              <label key={f.key} style={{ fontSize: 13 }}>
                {f.label}{f.reverse ? ' ↓' : ''}
                <br />
                <input
                  className="input"
                  type="number"
                  style={{ width: 76 }}
                  value={weights[f.key] as number}
                  onChange={(e) =>
                    setWeights({ ...weights, [f.key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: weightSum === 100 ? 'var(--teal)' : '#d23b3b', fontWeight: 700 }}>
              합계 {weightSum} / 100
            </span>
            <button className="btn" disabled={weightSum !== 100} onClick={saveWeights}>
              저장
            </button>
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>표시할 선생님이 없습니다.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left' }}>
              <th style={{ padding: 6 }}>#</th>
              <th>선생님</th>
              <th>센터</th>
              <th>종합점수</th>
              <th>완료/거부/노쇼</th>
              <th>만족도</th>
              <th>시간당</th>
              {isAdmin && <th>관리</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.teacherId} style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: 6, fontWeight: 700 }}>{r.rank}</td>
                <td>
                  {r.name ?? r.teacherId.slice(0, 8)}
                  {r.directorRole && (
                    <span className="chip confirmed" style={{ marginLeft: 6 }}>{r.directorRole}</span>
                  )}
                </td>
                <td style={{ color: 'var(--muted)' }}>{r.center ?? '-'}</td>
                <td>
                  <strong style={{ color: 'var(--teal)' }}>{r.score}</strong>
                  <span style={{ display: 'inline-block', width: 60, height: 6, background: 'var(--line)', borderRadius: 4, marginLeft: 6, verticalAlign: 'middle' }}>
                    <span style={{ display: 'block', width: `${r.score}%`, height: 6, background: 'var(--teal)', borderRadius: 4 }} />
                  </span>
                </td>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {r.metrics.completion}% / {r.metrics.reject}% / {r.metrics.noshow}%
                </td>
                <td>{r.metrics.satisfaction}</td>
                <td>{r.perHour ?? '–'}</td>
                {isAdmin && (
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {canEdit && (
                      <>
                        <button className="btn ghost sm" onClick={() => setDirectorRole(r)}>직무</button>{' '}
                      </>
                    )}
                    <button className="btn ghost sm" onClick={() => setHours(r)}>시수</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
