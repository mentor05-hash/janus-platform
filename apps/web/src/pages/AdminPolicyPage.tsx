import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { LimitPolicy, PricingPolicy } from '../api/types';

const MODES = ['board', 'chat', 'zoom', 'hand', 'offline'];
type Row = { perHour: number; surchargePct: number; enabled: boolean };

export function AdminPolicyPage() {
  const { user } = useAuth();
  const myCenter = user!.center_id;
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [limits, setLimits] = useState<Partial<LimitPolicy>>({});
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const pricing = await api.get<PricingPolicy[]>('/admin/pricing');
      const map: Record<string, Row> = {};
      for (const m of MODES) {
        // 센터 override 우선, 없으면 전사 기본
        const center = pricing.find((p) => p.mode === m && p.center_id === myCenter);
        const base = pricing.find((p) => p.mode === m && p.center_id === null);
        const p = center ?? base;
        map[m] = { perHour: p?.per_hour ?? 0, surchargePct: p?.surcharge_pct ?? 0, enabled: p?.enabled ?? true };
      }
      setRows(map);
      setLimits(await api.get<LimitPolicy>('/admin/limits'));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '정책 조회 실패');
    }
  }, [myCenter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function savePricing(mode: string) {
    setMsg('');
    setError('');
    const r = rows[mode];
    try {
      await api.put('/admin/pricing', { mode, perHour: r.perHour, surchargePct: r.surchargePct, enabled: r.enabled });
      setMsg(`${mode} 요금 저장됨(센터 적용).`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장 실패');
    }
  }

  async function saveLimits() {
    setMsg('');
    setError('');
    try {
      await api.put('/admin/limits', {
        classifyFitLimit: limits.classify_fit_limit,
        classifyUnfitLimit: limits.classify_unfit_limit,
        reservationLimit: limits.reservation_limit ?? null,
      });
      setMsg('한도 저장됨.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장 실패');
    }
  }

  const setRow = (m: string, k: keyof Row, v: unknown) => setRows((p) => ({ ...p, [m]: { ...p[m], [k]: v } }));

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <section>
        <h2 style={{ color: 'var(--teal)' }}>요금 정책 (센터 적용)</h2>
        {error && <p className="error">{error}</p>}
        {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}
        <div style={{ display: 'grid', gap: 8 }}>
          {MODES.map((m) => {
            const r = rows[m];
            if (!r) return null;
            return (
              <div className="card" key={m} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <strong style={{ width: 70 }}>{m}</strong>
                <label className="label" style={{ margin: 0 }}>
                  시간당
                </label>
                <input
                  className="input"
                  style={{ width: 110 }}
                  type="number"
                  value={r.perHour}
                  onChange={(e) => setRow(m, 'perHour', Number(e.target.value))}
                />
                <label className="label" style={{ margin: 0 }}>
                  S급 할증%
                </label>
                <input
                  className="input"
                  style={{ width: 80 }}
                  type="number"
                  value={r.surchargePct}
                  onChange={(e) => setRow(m, 'surchargePct', Number(e.target.value))}
                />
                <label style={{ fontSize: 13 }}>
                  <input type="checkbox" checked={r.enabled} onChange={(e) => setRow(m, 'enabled', e.target.checked)} /> 활성
                </label>
                <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => savePricing(m)}>
                  저장
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>한도 정책 (§5-9 축소 시 기존 동결·신규만 차단)</h3>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <label className="label">맞는 선생님 한도</label>
            <input
              className="input"
              style={{ width: 120 }}
              type="number"
              value={limits.classify_fit_limit ?? 10}
              onChange={(e) => setLimits((p) => ({ ...p, classify_fit_limit: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="label">맞지 않는 선생님 한도</label>
            <input
              className="input"
              style={{ width: 120 }}
              type="number"
              value={limits.classify_unfit_limit ?? 30}
              onChange={(e) => setLimits((p) => ({ ...p, classify_unfit_limit: Number(e.target.value) }))}
            />
          </div>
        </div>
        <button className="btn" style={{ marginTop: 12 }} onClick={saveLimits}>
          한도 저장
        </button>
      </section>
    </div>
  );
}
