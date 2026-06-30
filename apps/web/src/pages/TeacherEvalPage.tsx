import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { MyEvaluations } from '../api/types';
import { PageHeader, Card, Spinner, ErrorText, Meter } from '../components/ui';

const MONTH = ['', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
const stars = (n: number) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));

export function TeacherEvalPage() {
  const [d, setD] = useState<MyEvaluations | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<MyEvaluations>('/me/evaluations')
      .then(setD)
      .catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, []);

  if (error) return <><PageHeader title="받은 평가" /><ErrorText>{error}</ErrorText></>;
  if (!d) return <><PageHeader title="받은 평가" /><Spinner /></>;

  const trendMax = Math.max(5, ...d.monthlyTrend.map((m) => m.avg ?? 0));
  const items: [string, number][] = [
    ['태도 · 친절', d.itemScores.attitude],
    ['내용 · 설명', d.itemScores.content],
    ['실력 · 전문성', d.itemScores.skill],
    ['재요청 의사', d.itemScores.again],
  ];

  return (
    <div>
      <PageHeader title="받은 평가" sub={`누적 평가 ${d.count}건`} />

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, marginBottom: 16, alignItems: 'stretch' }}>
        {/* 현재 등급 카드 */}
        <div style={{ background: 'linear-gradient(160deg, var(--teal), var(--teal-900))', borderRadius: 14, padding: 20, color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>현재 등급</div>
            <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1, margin: '2px 0' }}>{d.grade}급</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              {d.topPercent != null ? `상위 ${d.topPercent}%` : '상위 —'}
              {d.nextReviewAt ? ` · 다음 재평가 ${new Date(d.nextReviewAt).toLocaleDateString('ko-KR')}` : ''}
            </div>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 14 }}>
            <span style={{ color: '#E0B53D' }}>★★★★★</span> {d.overall}
          </div>
        </div>

        {/* 월별 평균 평점 추이 */}
        <Card title="월별 평균 평점 추이">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 150, padding: '8px 4px' }}>
            {d.monthlyTrend.map((m) => (
              <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{m.avg ?? '–'}</div>
                <div
                  style={{
                    width: '70%',
                    height: `${m.avg ? (m.avg / trendMax) * 110 : 2}px`,
                    background: m.avg ? 'var(--teal)' : 'var(--line)',
                    borderRadius: '6px 6px 0 0',
                  }}
                />
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{MONTH[m.month]}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
        {/* 항목별 점수 */}
        <Card title="항목별 점수">
          <div style={{ display: 'grid', gap: 12 }}>
            {items.map(([label, v]) => (
              <div key={label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: 'var(--muted)' }}>{label}</span>
                  <strong>{v}</strong>
                </div>
                <Meter value={(v / 5) * 100} width={210} />
              </div>
            ))}
          </div>
        </Card>

        {/* 학생 후기 */}
        <Card title="학생 후기" actions={<span style={{ fontSize: 12, color: 'var(--muted)' }}>학생 정보 비공개</span>}>
          {d.reviews.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>아직 후기가 없습니다.</p>}
          <div style={{ display: 'grid', gap: 12 }}>
            {d.reviews.map((r, i) => (
              <div key={i} style={{ borderBottom: i < d.reviews.length - 1 ? '1px solid var(--line-soft)' : 'none', paddingBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13 }}>
                    <span style={{ color: 'var(--muted)' }}>익명 학생 </span>
                    <span style={{ color: '#E0B53D' }}>{stars(r.rating)}</span>
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--caption)' }}>{r.createdAt ? new Date(r.createdAt).toLocaleDateString('ko-KR') : ''}</span>
                </div>
                {r.text && <p style={{ fontSize: 13, color: 'var(--ink-body)', marginTop: 4 }}>{r.text}</p>}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
