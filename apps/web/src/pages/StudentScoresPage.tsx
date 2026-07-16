import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Spinner, ErrorText, EmptyState } from '../components/ui';
import { ScoreTrend, type Trend } from '../components/ScoreTrend';
import { GapReportPage } from './GapReportPage';

/** 내 성적·배치 — 추세 리포트(회차별 성적·배치 추이) + 격차 리포트(목표까지 격차)를 탭으로. */
export function StudentScoresPage() {
  const [tab, setTab] = useState<'trend' | 'gap'>('trend');
  const [trend, setTrend] = useState<Trend | null>(null);
  const [access, setAccess] = useState<{ showTrend: boolean; showPlacement: boolean } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ showTrend: boolean; showPlacement: boolean }>('/me/scores/access').then(setAccess).catch(() => setAccess({ showTrend: false, showPlacement: false }));
    api.get<Trend>('/me/scores/trend').then(setTrend).catch((e) => {
      setTrend({ student: {}, points: [] });
      if (!(e instanceof ApiError && e.status === 403)) setError(e instanceof ApiError ? e.message : '조회 실패');
    });
  }, []);

  const TABS: { key: 'trend' | 'gap'; label: string }[] = [
    { key: 'trend', label: '추세 리포트' },
    { key: 'gap', label: '격차 리포트' },
  ];

  return (
    <div>
      <PageHeader title="내 성적·배치" sub="회차별 성적 추이와 목표까지의 격차를 한곳에서 확인하세요." />

      {/* 탭 (underline) */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--line)', marginBottom: 16 }}>
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} style={{
              padding: '9px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 14.5, fontWeight: on ? 800 : 600, marginBottom: -1,
              color: on ? 'var(--j-blue)' : 'var(--muted)',
              borderBottom: on ? '2.5px solid var(--j-blue)' : '2.5px solid transparent',
            }}>{t.label}</button>
          );
        })}
      </div>

      {tab === 'trend' ? (
        <>
          <ErrorText>{error}</ErrorText>
          {trend === null || access === null ? <Spinner /> : !access.showTrend ? (
            <Card><EmptyState>성적 조회가 현재 비활성화되어 있어요. 센터에 문의해 주세요.</EmptyState></Card>
          ) : trend.points.length === 0 ? (
            <Card><EmptyState>아직 연동된 성적 회차가 없어요. 성적진단에서 표준점수를 입력하면 추이가 쌓입니다.</EmptyState></Card>
          ) : (
            <Card><ScoreTrend trend={trend} showPlacement={access.showPlacement} /></Card>
          )}
        </>
      ) : (
        // 격차 리포트 — 자체완결 컴포넌트(배치표 허브와 동일). 목표 학과까지의 누백/등급 격차·처방.
        <GapReportPage />
      )}
    </div>
  );
}
