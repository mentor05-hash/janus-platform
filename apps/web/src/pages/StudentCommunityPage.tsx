import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Badge, Spinner, ErrorText, EmptyState } from '../components/ui';

type Feed = {
  questions: { id: string; subject: string; difficulty: string | null; question: string; answerExcerpt: string; answeredBy: string; answerCount: number; createdAt: string }[];
  materials: { id: string; title: string; subject: string; category: string | null; teacherName: string; viewCount: number; createdAt: string }[];
  reviews: { id: string; teacherName: string; rating: number; text: string; createdAt: string }[];
};

const fmtDate = (s: string) => { const d = new Date(s); return `${d.getMonth() + 1}/${d.getDate()}`; };

export function StudentCommunityPage() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Feed>('/community/feed').then(setFeed).catch((e) => setError(e instanceof ApiError ? e.message : '커뮤니티 조회 실패'));
  }, []);

  return (
    <div>
      <PageHeader title="커뮤니티 라운지" sub="센터에서 인기 있는 질문·자료·후기를 모았어요. 읽고 참고만 할 수 있어요." />
      <ErrorText>{error}</ErrorText>
      {feed === null ? <Spinner /> : (
        <div style={{ display: 'grid', gap: 16 }}>
          {/* 인기 질문 */}
          <Card>
            <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>💬 인기 질문 &amp; 채택 답변</h3>
            {feed.questions.length === 0 ? <EmptyState>아직 공개된 질문이 없어요.</EmptyState> : (
              <div style={{ display: 'grid', gap: 10 }}>
                {feed.questions.map((q) => (
                  <div key={q.id} style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                      <Badge kind="new">{q.subject}</Badge>
                      {q.difficulty && <Badge kind="soft">{q.difficulty}</Badge>}
                      <span style={{ fontSize: 12, color: 'var(--caption)' }}>답변 {q.answerCount}개 · {fmtDate(q.createdAt)}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Q. {q.question}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
                      <b style={{ color: 'var(--teal)' }}>✓ {q.answeredBy}</b> {q.answerExcerpt}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 인기 자료 */}
          <Card>
            <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>📚 이번 주 인기 자료</h3>
            {feed.materials.length === 0 ? <EmptyState>공개된 자료가 없어요.</EmptyState> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                {feed.materials.map((m, i) => (
                  <div key={m.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <span style={{ fontWeight: 800, color: 'var(--teal)', fontSize: 13 }}>#{i + 1}</span>
                      <Badge kind="soft">{m.subject}</Badge>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4 }}>{m.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--caption)', marginTop: 6 }}>{m.teacherName} · 조회 {m.viewCount.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 우수 후기 */}
          <Card>
            <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>⭐ 우수 상담 후기</h3>
            {feed.reviews.length === 0 ? <EmptyState>아직 등록된 후기가 없어요.</EmptyState> : (
              <div style={{ display: 'grid', gap: 10 }}>
                {feed.reviews.map((r) => (
                  <div key={r.id} style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <b style={{ fontSize: 13, color: 'var(--ink)' }}>{r.teacherName} 선생님</b>
                      <span style={{ fontSize: 13, color: '#e0a52e', fontWeight: 700 }}>⭐ {r.rating.toFixed(1)}</span>
                      <span style={{ fontSize: 12, color: 'var(--caption)' }}>{fmtDate(r.createdAt)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>“{r.text}”</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <p style={{ fontSize: 12, color: 'var(--caption)', textAlign: 'center', margin: 0 }}>
            학생·보호자 정보는 비식별 처리되며, 센터에 공개된 활동만 표시됩니다.
          </p>
        </div>
      )}
    </div>
  );
}
