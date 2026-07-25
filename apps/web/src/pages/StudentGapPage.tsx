import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Spinner, EmptyState, ErrorText } from '../components/ui';
import { computeSubjectGaps, avgSpread, BAND_COLOR, type TrendLike, type SubjectGapModel } from '../lib/gap';

/**
 * 과목별 격차(실행층) — 목표 평균 대비 과목 점수 격차를 바로 보여주고 무료 처방부터 안내한다.
 *
 * 고도 구분(O102): 전략 리포트(`/student/placement/gap`)는 누백·내신등급으로 목표 대학 컷과 겨루는 정본이고,
 * 이 화면은 그 아래 실행층이다 — 서버 저장 없이 `/me/scores/trend` 에서 클라 계산한다.
 * 조합 추천·종합 합격확률은 다루지 않는다(N28 안건).
 */
export function StudentGapPage() {
  const [trend, setTrend] = useState<TrendLike | null | undefined>(undefined); // undefined=로딩, null=실패
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<TrendLike>('/me/scores/trend')
      .then(setTrend)
      .catch((e) => { setError(e instanceof ApiError ? e.message : '조회 실패'); setTrend(null); });
  }, []);

  const m: SubjectGapModel | null = computeSubjectGaps(trend ?? null);
  const spread = avgSpread(trend ?? null);

  return (
    <div>
      <PageHeader
        title="과목별 격차"
        sub="목표 평균까지 과목별로 얼마나 남았는지 보고, 무엇부터 좁힐지 정하세요."
      />
      <div style={{ marginBottom: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link to="/student/goal" className="btn ghost">목표 설정</Link>
        <Link to="/student/placement/gap" className="btn ghost">목표 대학 기준 격차 리포트 →</Link>
      </div>
      <ErrorText>{error}</ErrorText>

      {trend === undefined ? <Spinner /> : !m ? (
        <Card><EmptyState>성적 기록이 없어요. 성적을 입력하면 과목별 격차가 계산돼요.</EmptyState></Card>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <Card title="지금 내 위치">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 30, fontWeight: 800, color: 'var(--ink)' }}>{m.lastAvg ?? '-'}</span>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>현재 평균 · {m.lastLabel ?? '-'}</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', background: 'var(--surface-2, #f0f3f7)', borderRadius: 6, padding: '2px 7px' }}>내 성적 기준</span>
            </div>
            {m.goalAvg != null ? (
              <div style={{ marginTop: 8, fontSize: 14, color: 'var(--ink-body)' }}>
                🎯 목표 평균 <b>{m.goalAvg}</b>
                {m.overallGap != null && (
                  <span style={{ marginLeft: 8, color: m.overallBand ? BAND_COLOR[m.overallBand] : undefined, fontWeight: 700 }}>
                    {m.overallGap > 0 ? `목표까지 +${m.overallGap}` : '목표 도달'}
                  </span>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 8, fontSize: 13.5, color: 'var(--muted)' }}>
                목표 평균이 없어요. <Link to="/student/goal">목표 설정</Link>에서 정하면 과목별 격차가 계산돼요.
              </div>
            )}
            {spread && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--muted)' }}>
                최근 {spread.count}회 평균 {spread.worst}~{spread.best}(변동 폭 {spread.spread}).
                {spread.spread > 0 && ' 시험은 회차마다 흔들려요(컨디션·난이도) — 한 회차 결과만으로 단정하지 마세요.'}
              </div>
            )}
          </Card>

          <Card title="과목별 격차">
            {m.goalAvg == null ? (
              <EmptyState>목표 평균을 설정하면 과목별 격차 바가 표시돼요.</EmptyState>
            ) : m.scaleMismatch ? (
              <EmptyState>
                이번 회차는 표준점수(수능)라 목표 평균과 척도가 달라 과목별 격차를 계산하지 않아요.
                목표 대학 기준 비교는 <Link to="/student/placement/gap">격차 리포트</Link>를 이용하세요.
              </EmptyState>
            ) : m.subjects.length === 0 ? (
              <EmptyState>최신 회차의 과목 점수가 없어요.</EmptyState>
            ) : (
              <div style={{ display: 'grid', gap: 14 }}>
                {m.subjects.map((s) => (
                  <div key={s.subject}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5, gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{s.subject}</span>
                      {s.band && (
                        <span style={{ fontSize: 12, fontWeight: 800, color: BAND_COLOR[s.band], background: 'var(--surface-2, #f0f3f7)', borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' }}>
                          {s.band}{s.gap != null && s.gap > 0 ? ` · +${s.gap}` : ''}
                        </span>
                      )}
                    </div>
                    <div style={{ height: 10, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
                      <div style={{ width: `${s.pct}%`, height: 10, borderRadius: 999, background: s.band ? BAND_COLOR[s.band] : 'var(--muted)' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 11.5, color: 'var(--muted)' }}>
                      <span>현재 {s.score}</span>
                      <span>목표 {m.goalAvg}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {m.weakest && (
            <Card title="이 격차, 이렇게 좁혀요">
              {/* 업셀 윤리(§9) — 무료로 할 수 있는 것을 먼저, 유료 상담 CTA 는 마지막 1개만. */}
              <div style={{ fontSize: 14, color: 'var(--ink-body)', marginBottom: 10 }}>
                가장 큰 격차는 <b>{m.weakest.subject}</b>({m.weakest.gap}점)예요. 무료로 시작할 수 있는 것부터 해보세요.
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.8 }}>
                <li><Link to={`/student/materials?subject=${encodeURIComponent(m.weakest.subject)}`}>자료실</Link> — {m.weakest.subject} 자료로 약점 단원부터 (무료)</li>
                <li><Link to={`/student/qna?subject=${encodeURIComponent(m.weakest.subject)}`}>질문 올리기</Link> — 막히는 문제를 바로 물어보기</li>
                <li><Link to={`/student/tasks`}>할 일</Link> — 약점 과목이 자동으로 할 일에 올라와요</li>
              </ul>
              <div style={{ marginTop: 12 }}>
                <Link to={`/student/search?subject=${encodeURIComponent(m.weakest.subject)}`} className="btn" data-janus-cta="gap_prescribe">
                  {m.weakest.subject} 선생님 찾기 →
                </Link>
              </div>
            </Card>
          )}

          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            과목별 격차는 내가 입력·업로드한 성적에 대한 산술이며 입시 결과를 예측하지 않아요.
            목표 대학 컷 대비 위치는 <Link to="/student/placement/gap">격차 리포트</Link>에서 확인하세요.
          </div>
        </div>
      )}
    </div>
  );
}
