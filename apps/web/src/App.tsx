import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { RealtimeNotifier } from './components/RealtimeNotifier';
import { SchoolRecordBlockModal } from './components/SchoolRecordGuard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { roleHome } from './auth/roleHome';
import { ADMIN_ROUTES, canAccessAdminRoute, type AdminRoute } from './auth/adminRoutes';
import { AppLayout } from './components/AppLayout';
import { AdminLayout } from './components/AdminLayout';
import { LoginPage } from './pages/LoginPage';
const DemoEntryPage = lazy(() => import('./pages/DemoEntryPage').then((m) => ({ default: m.DemoEntryPage })));
const SignupPage = lazy(() => import('./pages/SignupPage').then((m) => ({ default: m.SignupPage })));
const ConsultingApplyPage = lazy(() => import('./pages/ConsultingApplyPage').then((m) => ({ default: m.ConsultingApplyPage })));
const TeacherBookingsPage = lazy(() => import('./pages/TeacherBookingsPage').then((m) => ({ default: m.TeacherBookingsPage })));
const TeacherInboxPage = lazy(() => import('./pages/TeacherInboxPage').then((m) => ({ default: m.TeacherInboxPage })));
const NotePage = lazy(() => import('./pages/NotePage').then((m) => ({ default: m.NotePage })));
const SchedulePage = lazy(() => import('./pages/SchedulePage').then((m) => ({ default: m.SchedulePage })));
const TeacherEvalPage = lazy(() => import('./pages/TeacherEvalPage').then((m) => ({ default: m.TeacherEvalPage })));
const PayrollPage = lazy(() => import('./pages/PayrollPage').then((m) => ({ default: m.PayrollPage })));
const ReverseProposePage = lazy(() => import('./pages/ReverseProposePage').then((m) => ({ default: m.ReverseProposePage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const StudentNotesPage = lazy(() => import('./pages/StudentNotesPage').then((m) => ({ default: m.StudentNotesPage })));
const TeacherMaterialsPage = lazy(() => import('./pages/TeacherMaterialsPage').then((m) => ({ default: m.TeacherMaterialsPage })));
const TeacherLecturesPage = lazy(() => import('./pages/TeacherLecturesPage').then((m) => ({ default: m.TeacherLecturesPage })));
const TeacherQnaPage = lazy(() => import('./pages/TeacherQnaPage').then((m) => ({ default: m.TeacherQnaPage })));
const TeacherRecordsPage = lazy(() => import('./pages/TeacherRecordsPage').then((m) => ({ default: m.TeacherRecordsPage })));
const TeacherReportsPage = lazy(() => import('./pages/TeacherReportsPage').then((m) => ({ default: m.TeacherReportsPage })));
const AcademyManagePage = lazy(() => import('./pages/AcademyManagePage').then((m) => ({ default: m.AcademyManagePage })));
const StudentReportsPage = lazy(() => import('./pages/StudentReportsPage').then((m) => ({ default: m.StudentReportsPage })));
const TeacherProfilePage = lazy(() => import('./pages/TeacherProfilePage').then((m) => ({ default: m.TeacherProfilePage })));
const ClassroomPage = lazy(() => import('./pages/ClassroomPage').then((m) => ({ default: m.ClassroomPage })));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })));
const AdminPolicyPage = lazy(() => import('./pages/AdminPolicyPage').then((m) => ({ default: m.AdminPolicyPage })));
const HrStudentsPage = lazy(() => import('./pages/HrStudentsPage').then((m) => ({ default: m.HrStudentsPage })));
const HrTeachersPage = lazy(() => import('./pages/HrTeachersPage').then((m) => ({ default: m.HrTeachersPage })));
const HrStaffPage = lazy(() => import('./pages/HrStaffPage').then((m) => ({ default: m.HrStaffPage })));
const AdminInfraPage = lazy(() => import('./pages/AdminInfraPage').then((m) => ({ default: m.AdminInfraPage })));
const AdminRoomsPage = lazy(() => import('./pages/AdminRoomsPage').then((m) => ({ default: m.AdminRoomsPage })));
const AdminBlockPage = lazy(() => import('./pages/AdminBlockPage').then((m) => ({ default: m.AdminBlockPage })));
const AdminReportsPage = lazy(() => import('./pages/AdminReportsPage').then((m) => ({ default: m.AdminReportsPage })));
const AnnouncementsPage = lazy(() => import('./pages/AnnouncementsPage').then((m) => ({ default: m.AnnouncementsPage })));
const AdminOrgPage = lazy(() => import('./pages/AdminOrgPage').then((m) => ({ default: m.AdminOrgPage })));
const AdminMemberTypesPage = lazy(() => import('./pages/AdminMemberTypesPage').then((m) => ({ default: m.AdminMemberTypesPage })));
const AdminEvaluationPage = lazy(() => import('./pages/AdminEvaluationPage').then((m) => ({ default: m.AdminEvaluationPage })));
const AdminAnalyticsPage = lazy(() => import('./pages/AdminAnalyticsPage').then((m) => ({ default: m.AdminAnalyticsPage })));
const AdminStatsPage = lazy(() => import('./pages/AdminStatsPage').then((m) => ({ default: m.AdminStatsPage })));
const AdminDiagnosticPage = lazy(() => import('./pages/AdminDiagnosticPage').then((m) => ({ default: m.AdminDiagnosticPage })));
const AdminAssignmentPage = lazy(() => import('./pages/AdminAssignmentPage').then((m) => ({ default: m.AdminAssignmentPage })));
const EmbedSessionPage = lazy(() => import('./pages/EmbedSessionPage').then((m) => ({ default: m.EmbedSessionPage })));
const RoomStandalonePage = lazy(() => import('./pages/RoomStandalonePage').then((m) => ({ default: m.RoomStandalonePage })));
const RoomDemoLauncherPage = lazy(() => import('./pages/RoomDemoLauncherPage').then((m) => ({ default: m.RoomDemoLauncherPage })));
const MediaDemoPage = lazy(() => import('./pages/MediaDemoPage').then((m) => ({ default: m.MediaDemoPage })));
import { JanusLandingPage } from './pages/JanusLandingPage';
const PlacementPage = lazy(() => import('./pages/PlacementPage').then((m) => ({ default: m.PlacementPage })));
const StudentHomePage = lazy(() => import('./pages/StudentHomePage').then((m) => ({ default: m.StudentHomePage })));
const ServicesPage = lazy(() => import('./pages/ServicesPage').then((m) => ({ default: m.ServicesPage })));
const ServiceDetailPage = lazy(() => import('./pages/ServicesPage').then((m) => ({ default: m.ServiceDetailPage })));
const PlacementHubPage = lazy(() => import('./pages/PlacementHubPage').then((m) => ({ default: m.PlacementHubPage })));
const KairosPage = lazy(() => import('./pages/CalculatorPage').then((m) => ({ default: m.KairosPage })));
const AleaPage = lazy(() => import('./pages/CalculatorPage').then((m) => ({ default: m.AleaPage })));
const GapReportPage = lazy(() => import('./pages/GapReportPage').then((m) => ({ default: m.GapReportPage })));
const GuardianReportPage = lazy(() => import('./pages/GuardianReportPage').then((m) => ({ default: m.GuardianReportPage })));
const GuardianConsultReportsPage = lazy(() => import('./pages/GuardianConsultReportsPage').then((m) => ({ default: m.GuardianConsultReportsPage })));
const GuardianConsentPage = lazy(() => import('./pages/GuardianConsentPage').then((m) => ({ default: m.GuardianConsentPage })));
const AdminAuditPage = lazy(() => import('./pages/AdminAuditPage').then((m) => ({ default: m.AdminAuditPage })));
const AdminGuardianLinksPage = lazy(() => import('./pages/AdminGuardianLinksPage').then((m) => ({ default: m.AdminGuardianLinksPage })));
const AdminPayrollPage = lazy(() => import('./pages/AdminPayrollPage').then((m) => ({ default: m.AdminPayrollPage })));
const AdminScoresPage = lazy(() => import('./pages/AdminScoresPage').then((m) => ({ default: m.AdminScoresPage })));
const AdminSchoolRecordGuardPage = lazy(() => import('./pages/AdminSchoolRecordGuardPage').then((m) => ({ default: m.AdminSchoolRecordGuardPage })));
const AdminReversePage = lazy(() => import('./pages/AdminReversePage').then((m) => ({ default: m.AdminReversePage })));
const TeacherDashboardPage = lazy(() => import('./pages/TeacherDashboardPage').then((m) => ({ default: m.TeacherDashboardPage })));
import { StudentLayout } from './components/StudentLayout';
import { GuardianLayout } from './components/GuardianLayout';
import { GuardianPayPage } from './pages/GuardianPayPage';
import { ChatInboxPage } from './pages/ChatInboxPage';
import { AdminOpsSettingsPage } from './pages/AdminOpsSettingsPage';
const StudentBookingsPage = lazy(() => import('./pages/StudentBookingsPage').then((m) => ({ default: m.StudentBookingsPage })));
const StudentSearchPage = lazy(() => import('./pages/StudentSearchPage').then((m) => ({ default: m.StudentSearchPage })));
const AcademyFinderPage = lazy(() => import('./pages/AcademyFinderPage').then((m) => ({ default: m.AcademyFinderPage })));
const AcademyDetailPage = lazy(() => import('./pages/AcademyDetailPage').then((m) => ({ default: m.AcademyDetailPage })));
const GlobalSearchPage = lazy(() => import('./pages/GlobalSearchPage').then((m) => ({ default: m.GlobalSearchPage })));
const StudentCreditsPage = lazy(() => import('./pages/StudentCreditsPage').then((m) => ({ default: m.StudentCreditsPage })));
const StudentReversePage = lazy(() => import('./pages/StudentReversePage').then((m) => ({ default: m.StudentReversePage })));
const StudentAutomatchPage = lazy(() => import('./pages/StudentAutomatchPage').then((m) => ({ default: m.StudentAutomatchPage })));
const StudentRecordsPage = lazy(() => import('./pages/StudentRecordsPage').then((m) => ({ default: m.StudentRecordsPage })));
const StudentClassifyPage = lazy(() => import('./pages/StudentClassifyPage').then((m) => ({ default: m.StudentClassifyPage })));
const StudentClassroomPage = lazy(() => import('./pages/StudentClassroomPage').then((m) => ({ default: m.StudentClassroomPage })));
const StudentAutoAssignPage = lazy(() => import('./pages/StudentAutoAssignPage').then((m) => ({ default: m.StudentAutoAssignPage })));
const StudentQnaPage = lazy(() => import('./pages/StudentQnaPage').then((m) => ({ default: m.StudentQnaPage })));
const StudentCommunityPage = lazy(() => import('./pages/StudentCommunityPage').then((m) => ({ default: m.StudentCommunityPage })));
const CommunityBoardPage = lazy(() => import('./pages/CommunityBoardPage').then((m) => ({ default: m.CommunityBoardPage })));
const StudentScoresPage = lazy(() => import('./pages/StudentScoresPage').then((m) => ({ default: m.StudentScoresPage })));
const StudentScoreInputPage = lazy(() => import('./pages/StudentScoreInputPage').then((m) => ({ default: m.StudentScoreInputPage })));
const DiagnosticPage = lazy(() => import('./pages/DiagnosticPage').then((m) => ({ default: m.DiagnosticPage })));
const CurriculumPage = lazy(() => import('./pages/CurriculumPage').then((m) => ({ default: m.CurriculumPage })));
const AdminAcademicPage = lazy(() => import('./pages/AdminAcademicPage').then((m) => ({ default: m.AdminAcademicPage })));
const StudentAcademicPage = lazy(() => import('./pages/StudentAcademicPage').then((m) => ({ default: m.StudentAcademicPage })));
const StudentTasksPage = lazy(() => import('./pages/StudentTasksPage').then((m) => ({ default: m.StudentTasksPage })));
const StudentGoalPage = lazy(() => import('./pages/StudentGoalPage').then((m) => ({ default: m.StudentGoalPage })));
const StudentGapPage = lazy(() => import('./pages/StudentGapPage').then((m) => ({ default: m.StudentGapPage })));
const GuardianPlanPage = lazy(() => import('./pages/GuardianPlanPage').then((m) => ({ default: m.GuardianPlanPage })));
const LecturePage = lazy(() => import('./pages/LecturePage').then((m) => ({ default: m.LecturePage })));
const LegalDocPage = lazy(() => import('./pages/LegalDocPage').then((m) => ({ default: m.LegalDocPage })));
const LegalPage = lazy(() => import('./pages/LegalPage').then((m) => ({ default: m.LegalPage })));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const StudentMembershipPage = lazy(() => import('./pages/StudentMembershipPage').then((m) => ({ default: m.StudentMembershipPage })));
const StudentNotificationsPage = lazy(() => import('./pages/StudentNotificationsPage').then((m) => ({ default: m.StudentNotificationsPage })));
const StudentMaterialsPage = lazy(() => import('./pages/StudentMaterialsPage').then((m) => ({ default: m.StudentMaterialsPage })));
const AdminCategoriesPage = lazy(() => import('./pages/AdminCategoriesPage').then((m) => ({ default: m.AdminCategoriesPage })));
const AdminMembershipPage = lazy(() => import('./pages/AdminMembershipPage').then((m) => ({ default: m.AdminMembershipPage })));
const AdminEntitlementPage = lazy(() => import('./pages/AdminEntitlementPage').then((m) => ({ default: m.AdminEntitlementPage })));
const AdminSchedulesPage = lazy(() => import('./pages/AdminSchedulesPage').then((m) => ({ default: m.AdminSchedulesPage })));

function Protected({ roles, children }: { roles?: string[]; children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 40 }}>불러오는 중…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={roleHome(user.role)} replace />;
  return children;
}

/** path → 화면. ADMIN_ROUTES 와 **키가 1:1** 이어야 한다(adminRoutes.test.ts 가 고정). */
const ADMIN_ELEMENTS: Record<string, JSX.Element> = {
  dashboard: <AdminDashboardPage />,
  students: <HrStudentsPage />,
  'hr-teachers': <HrTeachersPage />,
  'guardian-links': <AdminGuardianLinksPage />,
  'hr-staff': <HrStaffPage />,
  'member-types': <AdminMemberTypesPage />,
  academic: <AdminAcademicPage />,
  scores: <AdminScoresPage />,
  'placement/hub': <PlacementHubPage embedded />,
  membership: <AdminMembershipPage />,
  entitlements: <AdminEntitlementPage />,
  reverse: <AdminReversePage />,
  policy: <AdminPolicyPage />,
  ops: <AdminOpsSettingsPage />,
  rooms: <AdminRoomsPage />,
  block: <AdminBlockPage />,
  infra: <AdminInfraPage />,
  'sr-guard': <AdminSchoolRecordGuardPage />,
  reports: <AdminReportsPage />,
  announcements: <AnnouncementsPage />,
  schedules: <AdminSchedulesPage />,
  evaluation: <AdminEvaluationPage />,
  assignment: <AdminAssignmentPage />,
  analytics: <AdminAnalyticsPage />,
  stats: <AdminStatsPage />,
  diagnostics: <AdminDiagnosticPage />,
  payroll: <AdminPayrollPage />,
  audit: <AdminAuditPage />,
  org: <AdminOrgPage />,
  categories: <AdminCategoriesPage />,
  legal: <LegalPage />,
};

/** 표의 roles·hqOnly·centerOnly 를 그대로 적용 — 메뉴 노출과 **같은 판정 함수**를 쓴다. */
function AdminGuard({ route, children }: { route: AdminRoute; children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 40 }}>불러오는 중…</div>;
  if (!user) return <Navigate to="/login" replace />;
  // 착지 화면(dashboard)까지 막히면 리다이렉트가 순환하므로 홈이 아니라 대시보드로 되돌린다.
  if (!canAccessAdminRoute(user, route)) return <Navigate to="/admin/dashboard" replace />;
  return children;
}

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? roleHome(user.role) : '/login'} replace />;
}

export function App() {
  const location = useLocation();
  return (
    <>
    <RealtimeNotifier />
    <SchoolRecordBlockModal />
    <ErrorBoundary resetKey={location.pathname}>
    <Suspense fallback={<div style={{ padding: 40, color: 'var(--muted)' }}>불러오는 중…</div>}>
    <Routes>
      <Route path="/" element={<JanusLandingPage />} />
      <Route path="/placement" element={<PlacementPage />} />
      <Route path="/placement/hub" element={<PlacementHubPage />} />
      {/* 계산기 이식(동일 출처 라우트) — 비로그인도 진입(free 티저), 로그인 시 janus_sso 로 해제 */}
      <Route path="/kairos" element={<KairosPage />} />
      <Route path="/alea" element={<AleaPage />} />
      <Route path="/placement/gap" element={<GapReportPage />} />
      <Route path="/services" element={<ServicesPage />} />
      <Route path="/services/:slug" element={<ServiceDetailPage />} />
      {/* 구 랜딩·연계서비스(레거시)는 신규 야누스 페이지로 대체 완료 → 리다이렉트(레거시 노출 차단) */}
      <Route path="/legacy" element={<Navigate to="/" replace />} />
      <Route path="/legacy/services" element={<Navigate to="/services" replace />} />
      <Route path="/legacy/services/:slug" element={<Navigate to="/services" replace />} />
      <Route path="/login" element={<LoginPage />} />
      {/* 체험 입구 — 회원을 고르면 아이디·비번 자동 입력 후 바로 로그인(데모 빌드 전용, 아니면 /login 으로) */}
      <Route path="/demo" element={<DemoEntryPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/consulting/apply" element={<ConsultingApplyPage />} />
      <Route path="/forgot" element={<ForgotPasswordPage />} />
      <Route path="/terms" element={<LegalDocPage which="terms" />} />
      <Route path="/privacy" element={<LegalDocPage which="privacy" />} />
      <Route path="/embed/session" element={<EmbedSessionPage />} />
      <Route path="/room" element={<RoomStandalonePage />} />
      <Route path="/room/demo" element={<RoomDemoLauncherPage />} />
      <Route path="/media/demo" element={<MediaDemoPage />} />

      {/* 학부모 — 전용 레이아웃(주간 리포트·커뮤니티·알림). bbf7fb3 회귀(내비 소실) 복원 */}
      <Route
        path="/guardian"
        element={
          <Protected roles={['guardian']}>
            <GuardianLayout />
          </Protected>
        }
      >
        <Route index element={<Navigate to="report" replace />} />
        <Route path="report" element={<GuardianReportPage />} />
        <Route path="consult-reports" element={<GuardianConsultReportsPage />} />
        <Route path="consent" element={<GuardianConsentPage />} />
        <Route path="plan" element={<GuardianPlanPage />} />
        <Route path="pay" element={<GuardianPayPage />} />
        <Route path="community" element={<CommunityBoardPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="legal" element={<LegalPage />} />
      </Route>

      <Route
        path="/app"
        element={
          <Protected roles={['teacher']}>
            <AppLayout />
          </Protected>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<TeacherDashboardPage />} />
        <Route path="inbox" element={<TeacherInboxPage />} />
        <Route path="bookings" element={<TeacherBookingsPage />} />
        <Route path="chats" element={<ChatInboxPage />} />
        <Route path="bookings/:id/note" element={<NotePage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="evaluations" element={<TeacherEvalPage />} />
        <Route path="reverse" element={<ReverseProposePage />} />
        <Route path="qna" element={<TeacherQnaPage />} />
        <Route path="community" element={<CommunityBoardPage />} />
        <Route path="placement/hub" element={<PlacementHubPage embedded />} />
        <Route path="payroll" element={<PayrollPage />} />
        <Route path="materials" element={<TeacherMaterialsPage />} />
        <Route path="lectures" element={<TeacherLecturesPage />} />
        <Route path="records" element={<TeacherRecordsPage />} />
        <Route path="reports" element={<TeacherReportsPage />} />
        <Route path="academy-manage" element={<AcademyManagePage />} />
        <Route path="profile" element={<TeacherProfilePage />} />
        <Route path="classes" element={<ClassroomPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="students/:studentId/notes" element={<StudentNotesPage />} />
        <Route path="legal" element={<LegalPage />} />
      </Route>

      <Route
        path="/admin"
        element={
          <Protected roles={['admin', 'hr']}>
            <AdminLayout />
          </Protected>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        {/* 라우트는 ADMIN_ROUTES 에서 생성한다(N36 → O128). 이전에는 여기(라우트)와
            AdminLayout(메뉴)이 서로 모르는 두 목록이라, 메뉴에서 숨긴 화면 20곳이 URL 직접
            입력으로는 그대로 열렸다. 이제 둘 다 같은 표에서 나오므로 갈라질 수 없고,
            표에 없는 화면은 라우트 자체가 생기지 않는다. 권한 판정도 canAccessAdminRoute 하나다. */}
        {ADMIN_ROUTES.map((r) => (
          <Route
            key={r.path}
            path={r.path}
            element={<AdminGuard route={r}>{ADMIN_ELEMENTS[r.path]}</AdminGuard>}
          />
        ))}
      </Route>

      <Route
        path="/student"
        element={
          <Protected roles={['student']}>
            <StudentLayout />
          </Protected>
        }
      >
        <Route index element={<StudentHomePage />} />
        <Route path="search-all" element={<GlobalSearchPage />} />
        <Route path="search" element={<StudentSearchPage />} />
        <Route path="bookings" element={<StudentBookingsPage />} />
        <Route path="chats" element={<ChatInboxPage />} />
        <Route path="reports" element={<StudentReportsPage />} />
        <Route path="materials" element={<StudentMaterialsPage />} />
        <Route path="qna" element={<StudentQnaPage />} />
        <Route path="community" element={<StudentCommunityPage />} />
        <Route path="community/board" element={<CommunityBoardPage />} />
        <Route path="scores" element={<StudentScoresPage />} />
        <Route path="academic" element={<StudentAcademicPage />} />
        <Route path="tasks" element={<StudentTasksPage />} />
        <Route path="goal" element={<StudentGoalPage />} />
        <Route path="gap" element={<StudentGapPage />} />
        <Route path="scores/input" element={<StudentScoreInputPage />} />
        <Route path="diagnostic" element={<DiagnosticPage />} />
        <Route path="curriculum" element={<CurriculumPage />} />
        <Route path="lectures" element={<LecturePage />} />
        <Route path="academies" element={<AcademyFinderPage />} />
        <Route path="academies/:id" element={<AcademyDetailPage />} />
        <Route path="placement/hub" element={<PlacementHubPage embedded />} />
        <Route path="placement/gap" element={<GapReportPage />} />
        <Route path="membership" element={<StudentMembershipPage />} />
        <Route path="credits" element={<StudentCreditsPage />} />
        <Route path="notifications" element={<StudentNotificationsPage />} />
        <Route path="reverse" element={<StudentReversePage />} />
        <Route path="auto-assign" element={<StudentAutoAssignPage />} />
        <Route path="automatch" element={<StudentAutomatchPage />} />
        <Route path="records" element={<StudentRecordsPage />} />
        <Route path="classify" element={<StudentClassifyPage />} />
        <Route path="classes" element={<StudentClassroomPage />} />
        <Route path="legal" element={<LegalPage />} />
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
    </Suspense>
    </ErrorBoundary>
    </>
  );
}
