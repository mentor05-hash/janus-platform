import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isHq } from '../auth/roleHome';
import { ThemeToggle } from './ThemeToggle';

const navCls = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-item active' : 'nav-item');

export function AdminLayout() {
  const { user, logout } = useAuth();
  const hq = isHq(user);
  const isMaster = user?.permLevel === 'L1';
  const isAdmin = user?.role === 'admin';
  // 권한레벨 정확 표기: 마스터/본사관리자/센터관리자 (HR 은 별도)
  const scopeLabel = user?.role === 'hr' ? 'HR' : (user?.adminTier ?? (hq ? '본사관리자' : '센터관리자'));
  const initial = (user?.name ?? '관').slice(0, 1);

  return (
    <div className="shell">
      <aside className="sidebar navy">
        <div className="sidebar-logo">
          <span className="mark">잇</span>
          <div>
            <div className="title">잇올 멘토링</div>
            <div className="center">{isMaster ? '마스터' : hq ? '본사' : '관리자'} · {scopeLabel}</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/admin/dashboard" className={navCls}>대시보드</NavLink>
          <NavLink to="/admin/students" className={navCls}>학생 등록·관리</NavLink>
          <NavLink to="/admin/hr-teachers" className={navCls}>선생님 등록·관리</NavLink>
          <NavLink to="/admin/hr-staff" className={navCls}>직원·권한</NavLink>
          <NavLink to="/admin/membership" className={navCls}>회원 등급·구독</NavLink>
          {isAdmin && (
            <>
              {!hq && <NavLink to="/admin/reverse" className={navCls}>역상담 대상</NavLink>}
              <NavLink to="/admin/policy" className={navCls}>정책 편집</NavLink>
              {/* 상담실·줌·차단은 센터 단위 — 본사(HQ)에는 숨김 */}
              {!hq && <NavLink to="/admin/rooms" className={navCls}>상담실 현황</NavLink>}
              {!hq && <NavLink to="/admin/block" className={navCls}>신청불가 시간</NavLink>}
              {!hq && <NavLink to="/admin/infra" className={navCls}>줌·상담실·차단</NavLink>}
              <NavLink to="/admin/reports" className={navCls}>신고</NavLink>
              <NavLink to="/admin/announcements" className={navCls}>공지</NavLink>
              <NavLink to="/admin/member-types" className={navCls}>회원 분류</NavLink>
              <NavLink to="/admin/schedules" className={navCls}>근무 일괄업로드</NavLink>
              <NavLink to="/admin/evaluation" className={navCls}>평가·순위</NavLink>
              <NavLink to="/admin/analytics" className={navCls}>센터 분석</NavLink>
              <NavLink to="/admin/audit" className={navCls}>감사 로그</NavLink>
              {/* 조직 관리는 본사 이상(전사) 전용 */}
              {hq && <NavLink to="/admin/org" className={navCls}>조직 관리</NavLink>}
              {hq && <NavLink to="/admin/categories" className={navCls}>카테고리 관리</NavLink>}
            </>
          )}
          <NavLink to="/admin/legal" className={navCls}>약관·개인정보</NavLink>
        </nav>
        <div className="sidebar-foot">
          <span className="avatar">{initial}</span>
          <div>
            <div className="who">{user?.name}</div>
            <div className="role">{user?.role}</div>
          </div>
          <button className="btn ghost sm logout" onClick={logout}>로그아웃</button>
        </div>
        <div style={{ padding: '0 16px 14px' }}><ThemeToggle /></div>
      </aside>
      <main className="shell-main">
        <div className="inner">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
