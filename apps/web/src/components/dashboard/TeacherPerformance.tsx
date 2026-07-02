import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Card, Badge, Spinner, EmptyState } from '../ui';

type Metrics = { total: number; completion: number; rerequest: number; reject: number; noshow: number; response: number; satisfaction: number };
type Me = { teacherId: string; name: string | null; score: number; rank: number; perHour: number | null; hours: number | null; metrics: Metrics };
type Dash = {
  enabled: boolean; tabs: string[];
  me: Me | null; rank: number | null; totalInCenter: number; centerAvgScore: number;
  trend: { month: string; total: number; done: number }[];
};

const METRIC_LABEL: { key: keyof Metrics; label: string; suffix?: string; reverse?: boolean }[] = [
  { key: 'total', label: '상담 건수', suffix: '건' },
  { key: 'completion', label: '완료율', suffix: '%' },
  { key: 'rerequest', label: '재요청률', suffix: '%' },
  { key: 'satisfaction', label: '만족도', suffix: '점' },
  { key: 'reject', label: '거부율', suffix: '%', reverse: true },
  { key: 'noshow', label: '노쇼율', suffix: '%', reverse: true },
  { key: 'response', label: '평균 응답', suffix: '분', reverse: true },
];

/** 선생님 본인 성과 대시보드(정책 게이팅). 3형태 중 '센터별 선생님' 뷰. */
export function TeacherPerformance() {
  const [d, setD] = useState<Dash | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<'summary' | 'rank' | 'trend'>('summary');

  useEffect(() => {
    api.get<Dash>('/me/dashboard').then(setD).catch(() => setD(null)).finally(() => setLoaded(true));
  }, []);

  if (!loaded) return <Card title="내 성과"><Spinner /></Card>;
  if (!d || !d.enabled) return null; // 정책상 비노출이면 섹션 자체를 숨김
  const tabs = (d.tabs.length ? d.tabs : ['summary', 'rank', 'trend']).filter((t) => ['summary', 'rank', 'trend'].includes(t)) as ('summary' | 'rank' | 'trend')[];
  const cur = tabs.includes(tab) ? tab : tabs[0];
  const me = d.me;
  const maxTrend = Math.max(1, ...d.trend.map((t) => t.total));
  const TAB_LABEL: Record<string, string> = { summary: '지표 요약', rank: '센터 내 순위', trend: '월별 추이' };

  return (
    <Card title="내 성과 대시보드" style={{ marginTop: 16 }}>
      <div style={{ display: 'inline-flex', background: 'var(--fill,#eef2f4)', borderRadius: 10, padding: 3, marginBottom: 14 }}>
        {tabs.map((v) => (
          <button key={v} onClick={() => setTab(v)} style={{ border: 'none', cursor: 'pointer', padding: '6px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13, background: cur === v ? 'var(--surface)' : 'transparent', color: cur === v ? 'var(--teal)' : 'var(--muted)' }}>{TAB_LABEL[v]}</button>
        ))}
      </div>

      {!me ? <EmptyState>집계할 상담 데이터가 아직 없어요.</EmptyState> : cur === 'summary' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, alignItems: 'center', padding: '4px 0 10px' }}>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>종합점수</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--teal)' }}>{me.score}</div>
            <Badge kind="confirmed">센터 {me.rank}위 / {d.totalInCenter}명</Badge>
            <span style={{ fontSize: 12, color: 'var(--caption)' }}>센터 평균 {d.centerAvgScore}</span>
            {me.perHour != null && <Badge kind="soft">시간당 {me.perHour}건</Badge>}
          </div>
          {METRIC_LABEL.map((m) => (
            <div key={m.key} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{m.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{me.metrics[m.key]}<span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{m.suffix}</span></div>
            </div>
          ))}
        </div>
      ) : cur === 'rank' ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 34, fontWeight: 800, color: 'var(--teal)' }}>{me.rank}<span style={{ fontSize: 16, color: 'var(--muted)' }}>위</span></div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>센터 내 {d.totalInCenter}명 중 (종합점수 기준)</div>
          </div>
          <div style={{ background: 'var(--fill,#eef2f4)', borderRadius: 8, height: 12, overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(4, ((d.totalInCenter - me.rank + 1) / d.totalInCenter) * 100)}%`, height: '100%', background: 'var(--teal)', borderRadius: 8 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--caption)', marginTop: 4 }}><span>하위</span><span>상위</span></div>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 12 }}>내 종합점수 <b>{me.score}</b> · 센터 평균 <b>{d.centerAvgScore}</b> ({me.score >= d.centerAvgScore ? '평균 이상 ▲' : '평균 이하 ▼'})</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {d.trend.map((t) => (
            <div key={t.month} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 64, fontSize: 12, color: 'var(--muted)' }}>{t.month.slice(2)}</span>
              <div style={{ flex: 1, background: 'var(--fill,#eef2f4)', borderRadius: 6, height: 22, overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: `${(t.done / maxTrend) * 100}%`, background: '#2F9E44', height: '100%' }} title={`완료 ${t.done}`} />
                <div style={{ width: `${((t.total - t.done) / maxTrend) * 100}%`, background: 'var(--teal)', opacity: 0.4, height: '100%' }} title={`기타 ${t.total - t.done}`} />
              </div>
              <span style={{ width: 64, fontSize: 12, fontWeight: 700 }}>{t.total}건<span style={{ color: 'var(--muted)', fontWeight: 500 }}> ·완료{t.done}</span></span>
            </div>
          ))}
          <p style={{ fontSize: 11, color: 'var(--caption)', marginTop: 4 }}>■ 완료 ■ 기타(최근 6개월)</p>
        </div>
      )}
    </Card>
  );
}
