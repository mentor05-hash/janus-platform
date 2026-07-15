import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { PageHeader, Card, Badge, Spinner, EmptyState } from '../components/ui';

// 리그 리더보드 — 내 등급·진행도 + 상위 랭킹(커뮤니티 채택 실적 기반).
type TierRule = { minAuthored: number; minAccepted: number; minRate: number };
type MyLeague = { tier: number; label: string; authored: number; accepted: number; acceptRate: number; next: { tier: number; label: string; rule: TierRule } | null };
type LeaderRow = { tier: number; label: string; name: string; role: string | null; accepted: number; authored: number; acceptRate: number };

const tierColor = (t: number) => (t === 1 ? '#d97706' : t === 2 ? '#2563eb' : 'var(--muted)');
const roleLabel = (r: string | null) => (r === 'teacher' ? '선생님' : r === 'student' ? '학생' : r === 'guardian' ? '학부모' : '');

export function LeaderboardPage() {
  const [me, setMe] = useState<MyLeague | null>(null);
  const [board, setBoard] = useState<LeaderRow[] | null>(null);

  useEffect(() => {
    api.get<MyLeague>('/qna/league/me').then(setMe).catch(() => setMe(null));
    api.get<LeaderRow[]>('/qna/league/leaderboard').then(setBoard).catch(() => setBoard([]));
  }, []);

  return (
    <div>
      <PageHeader title="리그 리더보드" sub="커뮤니티 답변 채택 실적으로 3부 → 2부 → 1부 승급해요." />

      {me && (
        <Card style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: tierColor(me.tier) }}>🏅 {me.label}</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>답변 {me.authored} · 채택 {me.accepted} · 채택률 {me.acceptRate}%</span>
          </div>
          {me.next ? (
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)' }}>
              다음 <b style={{ color: tierColor(me.next.tier) }}>{me.next.label}</b>까지 — 채택 <b>{me.accepted}/{me.next.rule.minAccepted}</b> · 답변 <b>{me.authored}/{me.next.rule.minAuthored}</b> · 채택률 <b>{me.acceptRate}/{me.next.rule.minRate}%</b>
            </div>
          ) : (
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--brand)' }}>최고 등급이에요! 커뮤니티의 든든한 답변자 🎉</div>
          )}
          <div style={{ marginTop: 10 }}>
            <Link to="/student/community/board" className="btn sm outline" style={{ textDecoration: 'none' }}>커뮤니티에서 답변하기 →</Link>
          </div>
        </Card>
      )}

      <h3 style={{ fontSize: 15, margin: '18px 0 8px' }}>랭킹 (상위 등급)</h3>
      {board === null ? <Spinner /> : board.length === 0 ? (
        <EmptyState>아직 승급자가 없어요. 커뮤니티 답변으로 첫 승급을 노려보세요.</EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {board.map((r, i) => (
            <Card key={i}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 26, textAlign: 'center', fontFamily: 'var(--j-font-mono)', fontWeight: 800, fontSize: 15, color: i < 3 ? tierColor(r.tier) : 'var(--caption)' }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{r.name}</span>
                    {r.role && <Badge kind="soft">{roleLabel(r.role)}</Badge>}
                    <Badge kind="soft">{r.label}</Badge>
                  </div>
                </div>
                <span style={{ fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>채택 {r.accepted} · {r.acceptRate}%</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
