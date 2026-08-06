import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { roleHome } from '../auth/roleHome';
import { Badge, Button, ErrorText } from '../components/ui';
import { APP_NAME } from '../branding.generated';
import { JanusLogo } from '../components/JanusLogo';

const DEMO_PW = 'dev-password!';
// 데모 모드에서만 노출. 실서비스 빌드(VITE_DEMO_MODE≠true)에선 라우트 자체가 /login 으로 튕긴다.
const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

type Member = { id: string; name: string; note: string };
type Group = { role: string; home: string; hint: string; members: Member[] };

// 데모 DB 시드 로스터(전 계정 공통 비번 dev-password!). 시드가 바뀌면 이 목록도 함께 고친다.
const GROUPS: Group[] = [
  {
    role: '학생',
    home: '/student',
    hint: '나의 관문 · 진단 · 학습플랜 · 예약/상담룸',
    members: [
      { id: 'student01', name: '학생더미', note: '무료(member) 티어 — 잠금·티저 화면 확인용' },
      { id: 'paid01', name: '유료회원1', note: '전체배치표 열람권' },
      { id: 'paid02', name: '유료회원2', note: '정시정밀 열람권' },
      { id: 'paid03', name: '유료회원3', note: '카이로스(정시 계산기)' },
      { id: 'paid04', name: '유료회원4', note: '카이로스 + 알레아' },
      { id: 'paidall', name: '유료회원ALL', note: '전체배치표 + 계산기 전부' },
    ],
  },
  {
    role: '선생님',
    home: '/app/bookings',
    hint: '예약(상담룸) · 근무 · 강의실 · Q&A · 정산',
    members: [
      { id: 'teacher01', name: '선생님더미', note: '기본 선생님 계정' },
      { id: 'teacher02', name: '김수학', note: '과목별 배정 확인용' },
      { id: 'teacher03', name: '이영어', note: '과목별 배정 확인용' },
      { id: 'teacher04', name: '박과탐', note: '과목별 배정 확인용' },
      { id: 'teacher05', name: '최국어', note: '과목별 배정 확인용' },
    ],
  },
  {
    role: '관리자',
    home: '/admin/dashboard',
    hint: '대시보드 · 상품 권한 · 학생/직원 · 감사 · 지표',
    members: [
      { id: 'admin01', name: '센터관리자', note: '센터 소속 — 자기 센터 범위' },
      { id: 'hq01', name: '본사관리자', note: '센터 미소속 — 전 센터 범위' },
      { id: 'master01', name: '마스터관리자', note: '최상위 권한' },
    ],
  },
  {
    role: 'HR',
    home: '/admin/dashboard',
    hint: '선생님·직원 인사 화면',
    members: [{ id: 'hr01', name: 'HR더미', note: '인사 전용 권한' }],
  },
  {
    role: '학부모',
    home: '/guardian/report',
    hint: '자녀 주간 리포트 · 상담 리포트 · 동의 · 결제',
    members: [{ id: 'guardian01', name: '학부모더미', note: '자녀 연결 상태 확인용' }],
  },
];

/** 회원별 자동 로그인 딥링크 — 이 주소를 열면 로그인 화면을 거치지 않고 바로 들어간다. */
function deepLink(id: string): string {
  return `${window.location.origin}/login?u=${encodeURIComponent(id)}&p=${encodeURIComponent(DEMO_PW)}`;
}

export function DemoEntryPage() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState('');
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');

  // 실서비스 빌드에서 이 주소로 들어오면 평범한 로그인 화면으로.
  if (!DEMO) return <Navigate to="/login" replace />;

  async function enter(m: Member) {
    setError('');
    setBusyId(m.id);
    try {
      const me = await login(m.id, DEMO_PW);
      navigate(roleHome(me.role), { replace: true });
    } catch (err) {
      setError(`${m.name}(${m.id}) 로그인 실패 — ${err instanceof ApiError ? err.message : '서버 응답 없음'}`);
    } finally {
      setBusyId('');
    }
  }

  async function copy(id: string) {
    try {
      await navigator.clipboard.writeText(deepLink(id));
      setCopied(id);
      setTimeout(() => setCopied(''), 1600);
    } catch {
      // 클립보드 차단 환경(구형 브라우저·비보안 출처) — 주소를 직접 선택해 복사하도록 노출.
      window.prompt('링크를 복사하세요', deepLink(id));
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '28px 16px 56px' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <JanusLogo size={38} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.01em' }}>
              회원을 고르면 바로 들어갑니다
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>
              {APP_NAME} 체험용 입구 — 아이디·비밀번호는 이미 채워져 있어요. 이름을 누르기만 하면 됩니다.
            </div>
          </div>
        </div>

        {/* 현재 로그인 상태 — 다른 회원으로 갈아타기 */}
        {user && (
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', marginTop: 14 }}>
            <span style={{ fontSize: 13, color: 'var(--ink-body)' }}>
              지금 <b>{user.name}</b>({user.role})으로 로그인돼 있어요. 아래에서 다른 회원을 누르면 그 회원으로 바뀝니다.
            </span>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <Button size="sm" variant="ghost" onClick={() => navigate(roleHome(user.role))}>내 화면으로</Button>
              <Button size="sm" variant="ghost" onClick={logout}>로그아웃</Button>
            </div>
          </div>
        )}

        <ErrorText>{error}</ErrorText>

        {/* 역할별 회원 목록 */}
        {GROUPS.map((g) => (
          <section key={g.role} style={{ marginTop: 22 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>{g.role}</h2>
              <span style={{ fontSize: 12, color: 'var(--caption)' }}>{g.hint}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--caption)' }}>진입 화면 {g.home}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
              {g.members.map((m) => {
                const on = user?.login_id === m.id;
                return (
                  <div key={m.id} className="card" style={{ padding: 14, borderColor: on ? 'var(--teal)' : undefined }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong style={{ fontSize: 15, color: 'var(--ink)' }}>{m.name}</strong>
                      {on && <Badge kind="new">접속 중</Badge>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 2px' }}>{m.note}</div>
                    <div style={{ fontSize: 11, color: 'var(--caption)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                      {m.id} / {DEMO_PW}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <Button size="sm" loading={busyId === m.id} onClick={() => enter(m)} style={{ flex: 1 }}>
                        바로 로그인
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => copy(m.id)}>
                        {copied === m.id ? '복사됨' : '링크 복사'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {/* 로그인 없이 둘러보는 공개 화면 */}
        <section style={{ marginTop: 26 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', margin: '0 0 10px' }}>로그인 없이 보는 화면</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              { to: '/', label: '야누스 메인' },
              { to: '/placement', label: '무료 배치표 미리보기' },
              { to: '/services', label: '서비스 소개' },
              { to: '/consulting/apply', label: '상담 신청' },
              { to: '/room/demo', label: '상담룸 체험(채팅·보드·음성)' },
              { to: '/login', label: '평범한 로그인 화면' },
            ].map((l) => (
              <Link key={l.to} to={l.to} className="btn ghost sm" style={{ textDecoration: 'none' }}>
                {l.label}
              </Link>
            ))}
          </div>
        </section>

        <p style={{ fontSize: 11, color: 'var(--caption)', marginTop: 26, lineHeight: 1.7 }}>
          체험용 계정과 더미 데이터입니다 — 실제 학생·학부모 정보가 아니며, 여기서 만든 내용은 데모 DB에만 남습니다.<br />
          이 입구는 데모 빌드(VITE_DEMO_MODE=true)에서만 열립니다. 실서비스 빌드에서는 로그인 화면으로 넘어갑니다.
        </p>
      </div>
    </div>
  );
}
