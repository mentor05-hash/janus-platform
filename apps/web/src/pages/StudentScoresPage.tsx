import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Spinner, ErrorText, EmptyState } from '../components/ui';
import { ScoreTrend, type Trend } from '../components/ScoreTrend';

/** 학생 본인 성적·배치 추이(웹 콘솔). 정책 노출 시에만 접근 가능. */
export function StudentScoresPage() {
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

  return (
    <div>
      <PageHeader title="내 성적·배치" sub="회차별 성적 추이와 예상 대학·학과 라인 변화를 확인하세요." />
      <ErrorText>{error}</ErrorText>
      {trend === null || access === null ? <Spinner /> : !access.showTrend ? (
        <Card><EmptyState>성적 조회가 현재 비활성화되어 있어요. 센터에 문의해 주세요.</EmptyState></Card>
      ) : (
        <Card><ScoreTrend trend={trend} showPlacement={access.showPlacement} /></Card>
      )}
    </div>
  );
}
