import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Booking } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import type { Trend } from '../components/ScoreTrend';

// "나의 관문" 홈(O44) — 지금 위치(진단) → 다음 할 일 → 바로가기 3단.
// 기존 API 재조합만(신규 백엔드 없음). 어떤 상태에서도 다음 행동 카드 1개 이상 보장(막다른 화면 금지).
type QnaPost = { id: string; subject: string | null; status: string; created_at: string; answers?: { id: string }[] };

const KST = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit' });

const TILES = [
  { to: '/student/qna', icon: '💬', title: '질문 올리기', desc: '사진 한 장이면 충분해요' },
  { to: '/student/search', icon: '🔍', title: '선생님 찾기', desc: '상담·과외 매칭' },
  { to: '/student/scores', icon: '📈', title: '진단·배치', desc: '성적 추이와 배치 라인' },
  { to: '/student/materials', icon: '📂', title: '자료실', desc: '수업·상담 자료' },
  { to: '/student/community', icon: '🗣', title: '커뮤니티', desc: '함께 준비하는 사람들' },
  { to: '/student/membership', icon: '💳', title: '멤버십·크레딧', desc: '요금제와 잔액 관리' },
];

export function StudentHomePage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [posts, setPosts] = useState<QnaPost[] | null>(null);
  const [access, setAccess] = useState<{ showTrend: boolean; showPlacement: boolean } | null>(null);
  const [trend, setTrend] = useState<Trend | null>(null);

  useEffect(() => {
    api.get<Booking[]>('/bookings?role=student').then((r) => setBookings(Array.isArray(r) ? r : [])).catch(() => setBookings([]));
    api.get<QnaPost[]>('/qna/posts').then((r) => setPosts(Array.isArray(r) ? r : [])).catch(() => setPosts([]));
    api.get<{ showTrend: boolean; showPlacement: boolean }>('/me/scores/access').then(setAccess).catch(() => setAccess({ showTrend: false, showPlacement: false }));
    api.get<Trend>('/me/scores/trend').then(setTrend).catch(() => setTrend({ student: {}, points: [] }));
  }, []);

  const now = Date.now();
  const upcoming = (bookings ?? [])
    .filter((b) => b.start && new Date(b.start).getTime() > now && (b.status === 'new' || b.status === 'confirmed'))
    .sort((a, b) => new Date(a.start!).getTime() - new Date(b.start!).getTime())
    .slice(0, 3);
  const answered = (posts ?? []).filter((p) => (p.answers?.length ?? 0) > 0).slice(0, 2);
  const points = trend?.points?.length ?? 0;
  const hasDiag = !!access?.showTrend && points > 0;
  const loading = bookings === null || posts === null || access === null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{user?.name ? `${user.name}님의 관문` : '나의 관문'}</h2>
          <div className="sub">치열한 현재에서 안정된 미래로 — 오늘 열 문을 고르세요.</div>
        </div>
      </div>

      {/* 1. 지금 위치 */}
      <div className="home-sec">지금 위치</div>
      {access === null ? (
        <div className="skeleton" style={{ height: 74 }} />
      ) : hasDiag ? (
        <Link to="/student/scores" className="card todo-card">
          <span className="todo-ic" aria-hidden>📈</span>
          <span className="todo-body">
            <b>성적 {points}회차 기록됨{trend!.points[points - 1]?.period ? ` — 최근 ${trend!.points[points - 1].period}` : ''}</b>
            <span className="todo-sub">최근 추이와 예상 배치 라인을 확인하세요</span>
          </span>
          <span className="todo-go" aria-hidden>›</span>
        </Link>
      ) : (
        <Link to="/student/scores" className="card todo-card accent">
          <span className="todo-ic" aria-hidden>🚪</span>
          <span className="todo-body">
            <b>성적으로 진단받기</b>
            <span className="todo-sub">현재 위치와 목표까지의 격차를 데이터로 확인하는 첫 문입니다</span>
          </span>
          <span className="todo-go" aria-hidden>›</span>
        </Link>
      )}

      {/* 2. 다음 할 일 */}
      <div className="home-sec">다음 할 일</div>
      {loading ? (
        <div className="skeleton" style={{ height: 74 }} />
      ) : (
        <div className="todo-list">
          {upcoming.map((b) => (
            <Link key={b.id} to="/student/bookings" className="card todo-card">
              <span className="todo-ic" aria-hidden>📅</span>
              <span className="todo-body">
                <b>{KST(b.start!)} {b.consultType ?? '상담'}{b.subType ? ` · ${b.subType}` : ''}</b>
                <span className="todo-sub">{b.status === 'confirmed' ? '확정된 일정이에요 — 예약에서 입장하세요' : '신청 확인 중인 일정이에요'}</span>
              </span>
              <span className="todo-go" aria-hidden>›</span>
            </Link>
          ))}
          {answered.map((p) => (
            <Link key={p.id} to="/student/qna" className="card todo-card">
              <span className="todo-ic" aria-hidden>💬</span>
              <span className="todo-body">
                <b>{p.subject ?? '질문'}에 답변 {p.answers!.length}개 도착</b>
                <span className="todo-sub">답변을 확인하고 채택하거나 상담으로 이어가세요</span>
              </span>
              <span className="todo-go" aria-hidden>›</span>
            </Link>
          ))}
          {upcoming.length === 0 && answered.length === 0 && (
            <Link to="/student/qna" className="card todo-card accent">
              <span className="todo-ic" aria-hidden>💬</span>
              <span className="todo-body">
                <b>첫 질문 올리기</b>
                <span className="todo-sub">사진 한 장으로 질문하면 선생님 답변이 달립니다</span>
              </span>
              <span className="todo-go" aria-hidden>›</span>
            </Link>
          )}
        </div>
      )}

      {/* 3. 바로가기 — 새 서비스는 이 타일 그리드에만 추가(내비 불변) */}
      <div className="home-sec">바로가기</div>
      <div className="tile-grid">
        {TILES.map((t) => (
          <Link key={t.to} to={t.to} className="card tile">
            <span className="tile-ic" aria-hidden>{t.icon}</span>
            <b>{t.title}</b>
            <span className="tile-sub">{t.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
