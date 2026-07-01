import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { isHq } from '../auth/roleHome';
import type { FeatureRule, LimitPolicy, PenaltyPolicy, PricingPolicy } from '../api/types';
import { PageHeader, Card, Button, Badge, ErrorText } from '../components/ui';

function FeatureToggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--line)', background: '#fff', fontSize: 13, fontWeight: 600 }}>
      <span>{label}</span>
      <span style={{ width: 34, height: 20, borderRadius: 999, background: on ? 'var(--teal)' : 'var(--line)', position: 'relative', transition: '.15s' }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: '.15s' }} />
      </span>
    </button>
  );
}

const MODES = ['board', 'chat', 'zoom', 'hand', 'offline'];
const MODE_LABEL: Record<string, string> = { board: '게시판', chat: '채팅', zoom: '줌', hand: '필기공유', offline: '오프라인' };
const per10 = (perHour: number) => Math.round(perHour / 6);
type Row = { perHour: number; surchargePct: number; enabled: boolean; boardItemFee: number; boardGeneralFee: number; offlineOccupancyFee: number };

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
        map[m] = { perHour: p?.per_hour ?? 0, surchargePct: p?.surcharge_pct ?? 0, enabled: p?.enabled ?? true, boardItemFee: p?.board_item_fee ?? 0, boardGeneralFee: p?.board_general_fee ?? 0, offlineOccupancyFee: p?.offline_occupancy_fee ?? 0 };
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
      const body: Record<string, unknown> = { mode, perHour: r.perHour, surchargePct: r.surchargePct, enabled: r.enabled };
      if (mode === 'board') { body.boardItemFee = r.boardItemFee; body.boardGeneralFee = r.boardGeneralFee; }
      if (mode === 'offline') body.offlineOccupancyFee = r.offlineOccupancyFee;
      await api.put('/admin/pricing', body);
      setMsg(`${MODE_LABEL[mode]} 요금 저장됨(${hq ? '전사' : '센터'} 적용). 학생 화면에 즉시 반영됩니다.`);
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

  const featureOn = (targetType: string, targetValue: string) => {
    const rule = features.find((f) => f.target_type === targetType && f.target_value === targetValue && f.scope === '센터')
      ?? features.find((f) => f.target_type === targetType && f.target_value === targetValue);
    return rule?.enabled ?? true; // 규칙 없으면 기본 열림
  };
  async function toggleFeature(targetType: string, targetValue: string) {
    setMsg(''); setError('');
    const next = !featureOn(targetType, targetValue);
    try {
      await api.put('/admin/feature-availability', { scope: '센터', targetType, targetValue, enabled: next });
      setMsg(`${targetValue} ${next ? '열림' : '닫힘'}으로 저장됨.`);
      await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '저장 실패'); }
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
                <strong style={{ width: 70 }}>{MODE_LABEL[m]}</strong>
                {m !== 'board' && <>
                  <label className="label" style={{ margin: 0 }}>시간당</label>
                  <input className="input" style={{ width: 110 }} type="number" value={r.perHour} onChange={(e) => setRow(m, 'perHour', Number(e.target.value))} />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>10분당 {per10(r.perHour).toLocaleString()}</span>
                  <label className="label" style={{ margin: 0 }}>S급 할증%</label>
                  <input className="input" style={{ width: 70 }} type="number" value={r.surchargePct} onChange={(e) => setRow(m, 'surchargePct', Number(e.target.value))} />
                </>}
                {m === 'board' && <>
                  <label className="label" style={{ margin: 0 }}>문항</label>
                  <input className="input" style={{ width: 90 }} type="number" value={r.boardItemFee} onChange={(e) => setRow(m, 'boardItemFee', Number(e.target.value))} />
                  <label className="label" style={{ margin: 0 }}>일반</label>
                  <input className="input" style={{ width: 90 }} type="number" value={r.boardGeneralFee} onChange={(e) => setRow(m, 'boardGeneralFee', Number(e.target.value))} />
                  <Badge kind={r.boardItemFee >= r.boardGeneralFee ? 'done' : 'rejected'}>{r.boardItemFee >= r.boardGeneralFee ? '문항 ≥ 일반' : '문항 ≥ 일반 필요'}</Badge>
                </>}
                {m === 'offline' && <>
                  <label className="label" style={{ margin: 0 }}>점유 기본료</label>
                  <input className="input" style={{ width: 90 }} type="number" value={r.offlineOccupancyFee} onChange={(e) => setRow(m, 'offlineOccupancyFee', Number(e.target.value))} />
                </>}
                <label style={{ fontSize: 13 }}>
                  <input type="checkbox" checked={r.enabled} onChange={(e) => setRow(m, 'enabled', e.target.checked)} /> 활성
                </label>
                <Button size="sm" style={{ marginLeft: 'auto' }} disabled={m === 'board' && r.boardItemFee < r.boardGeneralFee} onClick={() => savePricing(m)}>저장</Button>
              </div>
            </Card>
          );
        })}
      </div>

      {!hq && (
        <Card title="한도 정책 (§5-9 축소 시 기존 동결·신규만 차단)" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <label className="label">예약 동시 보유(1인)</label>
              <input className="input" style={{ width: 120 }} type="number" value={limits.reservation_limit ?? ''} placeholder="무제한" onChange={(e) => setLimits((p) => ({ ...p, reservation_limit: e.target.value === '' ? null : Number(e.target.value) }))} />
            </div>
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
        {/* 프리셋 토글 */}
        <div style={{ marginBottom: 14 }}>
          <label className="label">상담 카테고리</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {[['category', '담임'], ['category', '교과'], ['category', '입시'], ['category', '심리'], ['category', '입시게시판']].map(([tt, tv]) => (
              <FeatureToggle key={tv} label={tv} on={featureOn(tt, tv)} onClick={() => toggleFeature(tt, tv)} />
            ))}
          </div>
          <label className="label">진행 방식 · 기간</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[['mode', 'zoom', '줌'], ['mode', 'chat', '채팅'], ['period', 'holiday', '공휴일 상담']].map(([tt, tv, l]) => (
              <FeatureToggle key={tv} label={l} on={featureOn(tt, tv)} onClick={() => toggleFeature(tt, tv)} />
            ))}
          </div>
        </div>
        <label className="label">고급 — 직접 지정</label>
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
