import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Dashboard } from '../api/types';
import { PageHeader, Spinner, ErrorText, Card } from '../components/ui';
import { StatCard, StatGrid } from '../components/dashboard/widgets';

/** GET /funnel/summary 응답(전환 퍼널 — 배치표·학원찾기). */
type FunnelStep = { viewSessions: number; conversionPct: number | null };
type FunnelSummary = {
  since: string;
  baechi: FunnelStep & { views: number; consultClicks: number; ctaSessions: number };
  academy: FunnelStep & { searches: number; leadClicks: number; leadSessions: number };
};

/** 급여 모델 라벨·산식 — 화면이 모델과 무관하게 곱셈 공식을 단언하지 않게 한다(floor/base_incentive 도 도달 가능). */
const PAY_MODEL_LABEL: Record<string, string> = {
  share: '매출 배분(share)', floor: '기본급 보장 + 배분(floor)', base_incentive: '기본급 + 인센티브',
};
const PAY_MODEL_FORMULA: Record<string, string> = {
  share: '세전 = 매출 × 배분율',
  floor: '세전 = max(보장 기본급, 매출 × 배분율)',
  base_incentive: '세전 = 기본급 + 매출 × 인센티브율',
};

export function AdminDashboardPage() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [meta, setMeta] = useState<{ generatedAt: string; scope: string } | null>(null);
  const [funnel, setFunnel] = useState<FunnelSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    // 대시보드는 {data, meta} 모두 필요 → raw fetch 로 메타까지 수신
    fetch('/api/v1/admin/dashboard', { headers: { Authorization: `Bearer ${localStorage.getItem('mp_access')}` } })
      .then((r) => r.json())
      .then((j) => {
        if (j.error) throw new ApiError(j.error.code, j.error.message, 0);
        setD(j.data);
        setMeta(j.meta);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
    // 전환 퍼널(최근 30일) — 대시보드를 막지 않도록 실패해도 조용히 무시.
    api.get<FunnelSummary>('/funnel/summary?days=30').then(setFunnel).catch(() => setFunnel(null));
  }, []);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!d) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="운영 대시보드"
        sub={
          meta
            ? `범위: ${meta.scope === 'global' ? '전체' : '자기 센터'} · 생성 ${new Date(meta.generatedAt).toLocaleString('ko-KR')}`
            : undefined
        }
      />
      <StatGrid>
        <StatCard label="활성 사용자" value={d.activeUsers} />
        <StatCard label="매칭 성사율" value={d.matchRate} unit="%" />
        <StatCard label="평균 만족도" value={d.avgSatisfaction != null ? `★ ${d.avgSatisfaction}` : '—'} />
        <StatCard label="주간 상담" value={d.weeklyConsult} />
        <StatCard label="완료 상담" value={d.doneTotal} />
        <StatCard label="예정(확정)" value={d.confirmedUpcoming} />
      </StatGrid>

      {d.gradeDistribution && (d.teacherCount ?? 0) > 0 && (
        <Card title={`선생님 등급 분포 (총 ${d.teacherCount}명)`} style={{ marginTop: 16, maxWidth: 620 }}>
          {(() => {
            const total = d.teacherCount || 1;
            const seg = [
              { g: 'S', n: d.gradeDistribution!.S ?? 0, c: '#CF9A3A' },
              { g: 'A', n: d.gradeDistribution!.A ?? 0, c: '#2F6FB3' },
              { g: 'B', n: d.gradeDistribution!.B ?? 0, c: '#8496AB' },
            ];
            return (
              <>
                <div style={{ display: 'flex', height: 18, borderRadius: 9, overflow: 'hidden' }}>
                  {seg.map((s) => s.n > 0 && <div key={s.g} style={{ width: `${(s.n / total) * 100}%`, background: s.c }} />)}
                </div>
                <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12.5, color: 'var(--muted)', flexWrap: 'wrap' }}>
                  {seg.map((s) => (
                    <span key={s.g} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: s.c }} />{s.g} {s.n}명 · {Math.round((s.n / total) * 100)}%
                    </span>
                  ))}
                </div>
              </>
            );
          })()}
        </Card>
      )}

      {d.trend && d.trend.length > 0 && (
        <Card title="주별 매칭 추이 (신청 vs 성사, 최근 6주)" style={{ marginTop: 16, maxWidth: 620 }}>
          {(() => {
            const max = Math.max(1, ...d.trend!.flatMap((t) => [t.applied, t.matched]));
            return (
              <>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', height: 110 }}>
                  {d.trend!.map((t, i) => (
                    <div key={i} style={{ flex: 1, display: 'flex', gap: 3, alignItems: 'flex-end', height: '100%' }}>
                      <div title={`신청 ${t.applied}`} style={{ flex: 1, background: '#C6D1E0', height: `${(t.applied / max) * 100}%`, borderRadius: '4px 4px 0 0', minHeight: 2 }} />
                      <div title={`성사 ${t.matched}`} style={{ flex: 1, background: 'var(--teal)', height: `${(t.matched / max) * 100}%`, borderRadius: '4px 4px 0 0', minHeight: 2 }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                  {d.trend!.map((t, i) => <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--muted)' }}>{t.weeksAgo === 0 ? '이번주' : `${t.weeksAgo}주전`}</div>)}
                </div>
                <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
                  <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#C6D1E0', verticalAlign: 'middle', marginRight: 4 }} />신청</span>
                  <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--teal)', verticalAlign: 'middle', marginRight: 4 }} />성사</span>
                </div>
              </>
            );
          })()}
        </Card>
      )}

      {/* 급여 기준 — **실제 지급 산식**만 보여준다. 이전 '등급별 급여·수당표'는 폐지된 건당 단가·시급·
          등급수당을 보여줬고(급여는 매출 배분으로 산정된다), DB 에 정책 행이 없어도 `?? 30000` 폴백이
          '건당 30,000원'을 창작해 제시했다. 등급은 평가·배정용이며 지급액에 영향이 없어 등급별 행도 지웠다. */}
      {d.payBasis && (
        <Card title="급여 기준" style={{ marginTop: 16, maxWidth: 620 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              <tr><td style={ptd}>급여 모델</td><td style={ptd}><b>{PAY_MODEL_LABEL[d.payBasis.model] ?? d.payBasis.model}</b></td></tr>
              {d.payBasis.model !== 'base_incentive' && (
                <tr style={{ borderTop: '1px solid var(--line)' }}><td style={ptd}>매출 배분율</td><td style={ptd}><b>{d.payBasis.sharePct}%</b></td></tr>
              )}
              {d.payBasis.model !== 'share' && (
                <tr style={{ borderTop: '1px solid var(--line)' }}><td style={ptd}>{d.payBasis.model === 'floor' ? '보장 기본급' : '기본급'}</td><td style={ptd}><b>{d.payBasis.base.toLocaleString()}원</b></td></tr>
              )}
              {d.payBasis.model === 'base_incentive' && (
                <tr style={{ borderTop: '1px solid var(--line)' }}><td style={ptd}>인센티브율</td><td style={ptd}><b>{d.payBasis.incentivePct}%</b></td></tr>
              )}
              <tr style={{ borderTop: '1px solid var(--line)' }}><td style={ptd}>크레딧 → 원 환산</td><td style={ptd}>1크레딧 = {d.payBasis.creditWonRatio}원</td></tr>
            </tbody>
          </table>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
            {PAY_MODEL_FORMULA[d.payBasis.model] ?? ''}
            {d.payBasis.source === 'default' && ' · 정책 미설정 — 코드 기본값이 적용 중이에요(배정·급여 설정에서 변경).'}
          </div>
        </Card>
      )}

      {funnel && (
        <Card title="전환 퍼널 (최근 30일 · 세션 기준)" style={{ marginTop: 16, maxWidth: 620 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {([
              { key: 'baechi', label: '배치표 → 상담 신청', top: funnel.baechi.viewSessions, botn: funnel.baechi.ctaSessions, topL: '열람', botL: '상담 CTA', pct: funnel.baechi.conversionPct },
              { key: 'academy', label: '학원찾기 → 리드 신청', top: funnel.academy.viewSessions, botn: funnel.academy.leadSessions, topL: '검색', botL: '리드 신청', pct: funnel.academy.conversionPct },
            ] as const).map((f) => (
              <div key={f.key} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>{f.label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--teal)' }}>{f.pct != null ? f.pct : '—'}</span>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>{f.pct != null ? '%' : '데이터 없음'}</span>
                </div>
                <div style={{ marginTop: 8 }}>
                  <div style={{ height: 8, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${f.pct != null ? Math.min(100, f.pct) : 0}%`, height: '100%', background: 'var(--teal)' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
                    <span>{f.topL} {f.top}</span>
                    <span>→ {f.botL} {f.botn}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

const ptd: React.CSSProperties = { padding: '8px 10px', fontVariantNumeric: 'tabular-nums' };
