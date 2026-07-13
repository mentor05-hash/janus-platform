/* 학생 "나의 관문" 대시보드(/student) — 시안 janus_dashboard_v1 신규 구현.
 * 프레임(시안): ① 지금 위치(진단 상태) → ② 다음 할 일 → ③ 바로가기(내 서비스).
 * 진단(배치표·janus_score) 백엔드 연동 전 — 상태 카드는 '진단 전' 고정 + 예시 안내. */
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const NEXT_ACTIONS = [
  { icon: '◱', color: 'var(--j-blue)', bg: 'var(--j-blue-soft)', title: '진단 받기', desc: '성적 입력 → 배치표·격차 리포트', to: '/placement', cta: '시작 →', gold: true },
  { icon: '✦', color: 'var(--j-ai)', bg: 'var(--j-ai-soft)', title: '질문 올리기', desc: 'AI 초안 즉시 · 선생님 검토', to: '/student/qna', cta: '질문 →' },
  { icon: '◇', color: 'var(--j-gold-ink)', bg: 'var(--j-gold-soft)', title: '선생님 찾기', desc: '상담·과외 1:1 매칭', to: '/student/search', cta: '둘러보기 →' },
];

const SHORTCUTS = [
  { icon: '▤', label: '내 예약', to: '/student/bookings' },
  { icon: '✎', label: 'Q&A', to: '/student/qna' },
  { icon: '◱', label: '성적', to: '/student/scores' },
  { icon: '👥', label: '커뮤니티', to: '/student/community' },
  { icon: '◈', label: '멤버십', to: '/student/membership' },
  { icon: '🔔', label: '알림', to: '/student/notifications' },
];

export function StudentHomePage() {
  const { user } = useAuth();

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>나의 관문</h2>
          <div className="sub">{user?.name ? `${user.name}님, ` : ''}지금 위치 → 다음 할 일 → 바로가기</div>
        </div>
      </div>

      {/* ① 지금 위치 — 진단 상태 */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={{ width: 46, height: 46, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: 'var(--j-blue)', background: 'var(--j-blue-soft)' }}>◱</span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--ink)' }}>아직 진단 전입니다</div>
          <div style={{ fontSize: 13, color: 'var(--ink-body)', marginTop: 3, lineHeight: 1.6 }}>
            성적을 입력하면 <b>안정·적정·소신·상향</b> 4구간 배치표와 격차 리포트가 열립니다. 성적 없이 예시로 먼저 둘러볼 수도 있어요.
          </div>
        </div>
        <Link to="/placement" className="btn" style={{ textDecoration: 'none' }}>예시로 둘러보기</Link>
      </div>

      {/* ② 다음 할 일 */}
      <div style={{ fontFamily: 'var(--j-font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '.14em', color: 'var(--muted)', textTransform: 'uppercase', margin: '18px 0 10px' }}>
        다음 할 일
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {NEXT_ACTIONS.map((a) => (
          <Link key={a.title} to={a.to} className="card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 8, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: a.color, background: a.bg }}>{a.icon}</span>
              <b style={{ fontSize: 15, color: 'var(--ink)' }}>{a.title}</b>
            </div>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{a.desc}</span>
            {/* 골드 = 화면당 1개(핵심 전환: 진단) */}
            <span style={{ fontSize: 13, fontWeight: 800, color: a.gold ? 'var(--j-gold-ink)' : a.color }}>{a.cta}</span>
          </Link>
        ))}
      </div>

      {/* ③ 바로가기 — 내 서비스 */}
      <div style={{ fontFamily: 'var(--j-font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '.14em', color: 'var(--muted)', textTransform: 'uppercase', margin: '20px 0 10px' }}>
        바로가기
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
        {SHORTCUTS.map((s) => (
          <Link key={s.label} to={s.to} className="card" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 9, padding: '13px 15px' }}>
            <span style={{ fontSize: 15 }}>{s.icon}</span>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{s.label}</span>
            <span style={{ marginLeft: 'auto', color: 'var(--j-arrow-muted)', fontWeight: 700 }}>›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
