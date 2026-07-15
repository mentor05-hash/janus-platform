/* 학생 "나의 관문" 대시보드(/student) — 시안 janus_dashboard_v1 신규 구현.
 * 프레임(시안): ① 지금 위치(진단 상태) → ② 다음 할 일 → ③ 바로가기(내 서비스).
 * 진단(배치표·janus_score) 백엔드 연동 전 — 상태 카드는 '진단 전' 고정 + 예시 안내. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';

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

type DiagRow = { score: number; correct: number; total: number; submitted_at: string };
type Plan = { headline: string; items: { subject: string; unit: string; rate: number }[] };

export function StudentHomePage() {
  const { user } = useAuth();
  const [diag, setDiag] = useState<DiagRow | null | undefined>(undefined); // undefined=로딩, null=없음
  const [plan, setPlan] = useState<Plan | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    api.get<{ attempts: DiagRow[] }>('/diagnostics/me').then((r) => setDiag(r.attempts[0] ?? null)).catch(() => setDiag(null));
    api.get<Plan>('/curriculum/me').then(setPlan).catch(() => setPlan(null));
    api.get<Array<{ read_at: string | null }>>('/notifications').then((r) => setUnread((Array.isArray(r) ? r : []).filter((n) => !n.read_at).length)).catch(() => {});
  }, []);

  const hasDiag = !!diag;
  const topWeak = plan?.items?.[0];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>나의 관문</h2>
          <div className="sub">{user?.name ? `${user.name}님, ` : ''}지금 위치 → 다음 할 일 → 바로가기</div>
        </div>
      </div>

      {/* ① 지금 위치 — 진단 상태(동적) */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={{ width: 46, height: 46, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: 'var(--j-blue)', background: 'var(--j-blue-soft)' }}>◱</span>
        <div style={{ flex: 1, minWidth: 220 }}>
          {hasDiag ? (
            <>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--ink)' }}>최근 실력진단 {diag!.score}점 <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)' }}>({diag!.correct}/{diag!.total})</span></div>
              <div style={{ fontSize: 13, color: 'var(--ink-body)', marginTop: 3, lineHeight: 1.6 }}>
                {topWeak ? <>가장 약한 유형은 <b>{topWeak.subject}·{topWeak.unit}({topWeak.rate}%)</b>. 학습 플랜에서 이번 주 우선순위를 확인하세요.</> : '약점 없이 잘하고 있어요! 다른 과목도 진단해보세요.'}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--ink)' }}>아직 진단 전입니다</div>
              <div style={{ fontSize: 13, color: 'var(--ink-body)', marginTop: 3, lineHeight: 1.6 }}>
                실력진단으로 약점을 찾고, 성적진단으로 배치표를 열어보세요. 지금 시작할 수 있어요.
              </div>
            </>
          )}
        </div>
        <Link to={hasDiag ? '/student/curriculum' : '/student/diagnostic'} className="btn" style={{ textDecoration: 'none' }}>{hasDiag ? '학습 플랜 보기' : '실력진단 시작'}</Link>
      </div>

      {/* 위젯 — 진단·플랜·알림 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 4 }}>
        <Link to="/student/diagnostic" className="card" style={{ textDecoration: 'none', padding: 16 }}>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 6 }}>🎯 실력진단</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{diag === undefined ? '…' : hasDiag ? `${diag!.score}점` : '진단 전'}</div>
          <div style={{ fontSize: 12, color: 'var(--brand)', marginTop: 4 }}>{hasDiag ? '다시 진단 →' : '지금 시작 →'}</div>
        </Link>
        <Link to="/student/curriculum" className="card" style={{ textDecoration: 'none', padding: 16 }}>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 6 }}>📋 학습 플랜</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.4 }}>{plan?.items?.length ? `우선순위 ${plan.items.length}개` : '플랜 없음'}</div>
          <div style={{ fontSize: 12, color: 'var(--brand)', marginTop: 4 }}>보기 →</div>
        </Link>
        <Link to="/student/notifications" className="card" style={{ textDecoration: 'none', padding: 16 }}>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 6 }}>🔔 알림</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: unread > 0 ? 'var(--danger, #dc2626)' : 'var(--ink)' }}>{unread > 0 ? `${unread}건` : '없음'}</div>
          <div style={{ fontSize: 12, color: 'var(--brand)', marginTop: 4 }}>{unread > 0 ? '읽지 않은 알림 →' : '알림함 →'}</div>
        </Link>
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
