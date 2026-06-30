import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { isHq } from '../auth/roleHome';
import type { FeatureRule, LimitPolicy, PenaltyPolicy, PricingPolicy } from '../api/types';
import { PageHeader, Card, Button, Badge, ErrorText } from '../components/ui';

const MODES = ['board', 'chat', 'zoom', 'hand', 'offline'];
type Row = { perHour: number; surchargePct: number; enabled: boolean };

export function AdminPolicyPage() {
  const { user } = useAuth();
  const myCenter = user!.center_id;
  const hq = isHq(user);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [limits, setLimits] = useState<Partial<LimitPolicy>>({});
  const [penalty, setPenalty] = useState<Partial<PenaltyPolicy>>({});
  const [features, setFeatures] = useState<FeatureRule[]>([]);
  const [feat, setFeat] = useState({ scope: '센터', targetType: 'mode', targetValue: 'zoom', enabled: true });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const pricing = await api.get<PricingPolicy[]>('/admin/pricing');
      const map: Record<string, Row> = {};
      for (const m of MODES) {
        const center = pricing.find((p) => p.mode === m && p.center_id === myCenter);
        const base = pricing.find((p) => p.mode === m && p.center_id === null);
        const p = center ?? base;
        map[m] = { perHour: p?.per_hour ?? 0, surchargePct: p?.surcharge_pct ?? 0, enabled: p?.enabled ?? true };
      }
      setRows(map);
      setLimits(await api.get<LimitPolicy>('/admin/limits'));
      setPenalty(await api.get<PenaltyPolicy>('/admin/penalty-policy'));
      setFeatures(await api.get<FeatureRule[]>('/admin/feature-availability'));
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
      setMsg(`${mode} 요금 저장됨(${hq ? '전사' : '센터'} 적용).`);
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

  async function savePenalty() {
    setMsg('');
    setError('');
    try {
      await api.put('/admin/penalty-policy', {
        cancelThreshold: penalty.cancel_threshold ?? null,
        noshowThreshold: penalty.noshow_threshold ?? null,
        rejectThreshold: penalty.reject_threshold ?? null,
        rankingWeightDown: penalty.ranking_weight_down ?? null,
      });
      setMsg('가중 제한 임계 저장됨.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장 실패');
    }
  }

  async function saveFeature() {
    setMsg('');
    setError('');
    try {
      await api.put('/admin/feature-availability', feat);
      setMsg(`기능 토글 저장됨(${feat.scope} ${feat.targetValue} = ${feat.enabled ? '열림' : '닫힘'}).`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장 실패');
    }
  }

  const setRow = (m: string, k: keyof Row, v: unknown) => setRows((p) => ({ ...p, [m]: { ...p[m], [k]: v } }));
  const setPen = (k: keyof PenaltyPolicy, v: string) =>
    setPenalty((p) => ({ ...p, [k]: v === '' ? null : Number(v) }));

  return (
    <div>
      <PageHeader title={`요금 정책 (${hq ? '전사 기본' : '센터 적용'})`} />
      <ErrorText>{error}</ErrorText>
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}

      <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
        {MODES.map((m) => {
          const r = rows[m];
          if (!r) return null;
          return (
            <Card key={m}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <strong style={{ width: 70 }}>{m}</strong>
                <label className="label" style={{ margin: 0 }}>시간당</label>
                <input className="input" style={{ width: 110 }} type="number" value={r.perHour} onChange={(e) => setRow(m, 'perHour', Number(e.target.value))} />
                <label className="label" style={{ margin: 0 }}>S급 할증%</label>
                <input className="input" style={{ width: 80 }} type="number" value={r.surchargePct} onChange={(e) => setRow(m, 'surchargePct', Number(e.target.value))} />
                <label style={{ fontSize: 13 }}>
                  <input type="checkbox" checked={r.enabled} onChange={(e) => setRow(m, 'enabled', e.target.checked)} /> 활성
                </label>
                <Button size="sm" style={{ marginLeft: 'auto' }} onClick={() => savePricing(m)}>저장</Button>
              </div>
            </Card>
          );
        })}
      </div>

      {!hq && (
        <Card title="한도 정책 (§5-9 축소 시 기존 동결·신규만 차단)" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <label className="label">맞는 선생님 한도</label>
              <input className="input" style={{ width: 120 }} type="number" value={limits.classify_fit_limit ?? 10} onChange={(e) => setLimits((p) => ({ ...p, classify_fit_limit: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="label">맞지 않는 선생님 한도</label>
              <input className="input" style={{ width: 120 }} type="number" value={limits.classify_unfit_limit ?? 30} onChange={(e) => setLimits((p) => ({ ...p, classify_unfit_limit: Number(e.target.value) }))} />
            </div>
          </div>
          <Button style={{ marginTop: 12 }} onClick={saveLimits}>한도 저장</Button>
        </Card>
      )}

      {!hq && (
        <Card title="가중 제한 임계 (§5-7, 빈칸=미설정)" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {(
              [
                ['cancel_threshold', '당일취소'],
                ['noshow_threshold', '노쇼'],
                ['reject_threshold', '과다거절'],
                ['ranking_weight_down', '랭킹 가중치↓'],
              ] as const
            ).map(([k, label]) => (
              <div key={k}>
                <label className="label">{label}</label>
                <input className="input" style={{ width: 110 }} type="number" value={penalty[k] ?? ''} onChange={(e) => setPen(k, e.target.value)} />
              </div>
            ))}
          </div>
          <Button style={{ marginTop: 12 }} onClick={savePenalty}>가중 제한 저장</Button>
        </Card>
      )}

      <Card title="기능 열기/닫기 (전사 강제 + 센터 자율, 충돌 시 전사 우선)">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label className="label">범위</label>
            <select className="input" value={feat.scope} onChange={(e) => setFeat((p) => ({ ...p, scope: e.target.value }))}>
              {['전사', '센터'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">대상유형</label>
            <input className="input" style={{ width: 100 }} value={feat.targetType} onChange={(e) => setFeat((p) => ({ ...p, targetType: e.target.value }))} />
          </div>
          <div>
            <label className="label">대상값</label>
            <input className="input" style={{ width: 100 }} value={feat.targetValue} onChange={(e) => setFeat((p) => ({ ...p, targetValue: e.target.value }))} />
          </div>
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" checked={feat.enabled} onChange={(e) => setFeat((p) => ({ ...p, enabled: e.target.checked }))} /> 열림
          </label>
          <Button size="sm" onClick={saveFeature}>토글 저장</Button>
        </div>
        <div style={{ marginTop: 12, display: 'grid', gap: 4 }}>
          {features.map((f) => (
            <div key={f.id} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Badge kind="soft">{f.scope}</Badge>
              <span style={{ color: 'var(--muted)' }}>{f.target_type}:{f.target_value}</span>
              <Badge kind={f.enabled ? 'done' : 'cancelled'}>{f.enabled ? '열림' : '닫힘'}</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
