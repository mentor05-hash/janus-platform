import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { RealtimeNotifier } from './components/RealtimeNotifier';
import { SchoolRecordBlockModal } from './components/SchoolRecordGuard';
import { roleHome } from './auth/roleHome';
import { AppLayout } from './components/AppLayout';
import { AdminLayout } from './components/AdminLayout';
import { LoginPage } from './pages/LoginPage';
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
const AdminPayrollPage = lazy(() => import('./pages/AdminPayrollPage').then((m) => ({ default: m.AdminPayrollPage })));
const AdminScoresPage = lazy(() => import('./pages/AdminScoresPage').then((m) => ({ default: m.AdminScoresPage })));
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
const StudentAutoAssignPage = lazy(() => import('./pages/StudentAutoAssignPage').then((m) => ({ default: m.StudentAutoAssignPage })));
const StudentQnaPage = lazy(() => import('./pages/StudentQnaPage').then((m) => ({ default: m.StudentQnaPage })));
const StudentCommunityPage = lazy(() => import('./pages/StudentCommunityPage').then((m) => ({ default: m.StudentCommunityPage })));
const CommunityBoardPage = lazy(() => import('./pages/CommunityBoardPage').then((m) => ({ default: m.CommunityBoardPage })));
const StudentScoresPage = lazy(() => import('./pages/StudentScoresPage').then((m) => ({ default: m.StudentScoresPage })));
const StudentScoreInputPage = lazy(() => import('./pages/StudentScoreInputPage').then((m) => ({ default: m.StudentScoreInputPage })));
const DiagnosticPage = lazy(() => import('./pages/DiagnosticPage').then((m) => ({ default: m.DiagnosticPage })));
const CurriculumPage = lazy(() => import('./pages/CurriculumPage').then((m) => ({ default: m.CurriculumPage })));
const LecturePage = lazy(() => import('./pages/LecturePage').then((m) => ({ default: m.LecturePage })));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage').then((m) => ({ default: m.LeaderboardPage })));
const LeagueRulesPage = lazy(() => import('./pages/LeagueRulesPage').then((m) => ({ default: m.LeagueRulesPage })));
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

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? roleHome(user.role) : '/login'} replace />;
}

export function App() {
  return (
    <>
    <RealtimeNotifier />
    <SchoolRecordBlockModal />
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
        <Route path="pay" element={<GuardianPayPage />} />
        <Route path="community" element={<CommunityBoardPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
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
        <Route path="dashboard" element={<AdminDashboardPage />} />
        <Route path="students" element={<HrStudentsPage />} />
        <Route path="hr-teachers" element={<HrTeachersPage />} />
        <Route path="hr-staff" element={<HrStaffPage />} />
        <Route path="reverse" element={<AdminReversePage />} />
        <Route path="policy" element={<AdminPolicyPage />} />
        <Route path="ops" element={<AdminOpsSettingsPage />} />
        <Route path="rooms" element={<AdminRoomsPage />} />
        <Route path="block" element={<AdminBlockPage />} />
        <Route path="infra" element={<AdminInfraPage />} />
        <Route path="reports" element={<AdminReportsPage />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
        <Route path="org" element={<AdminOrgPage />} />
        <Route path="categories" element={<AdminCategoriesPage />} />
        <Route path="schedules" element={<AdminSchedulesPage />} />
        <Route path="member-types" element={<AdminMemberTypesPage />} />
        <Route path="membership" element={<AdminMembershipPage />} />
        <Route path="entitlements" element={<AdminEntitlementPage />} />
        <Route path="placement/hub" element={<PlacementHubPage embedded />} />
        <Route path="evaluation" element={<AdminEvaluationPage />} />
        <Route path="assignment" element={<AdminAssignmentPage />} />
        <Route path="analytics" element={<AdminAnalyticsPage />} />
        <Route path="stats" element={<AdminStatsPage />} />
        <Route path="diagnostics" element={<AdminDiagnosticPage />} />
        <Route path="audit" element={<AdminAuditPage />} />
        <Route path="payroll" element={<AdminPayrollPage />} />
        <Route path="scores" element={<AdminScoresPage />} />
        <Route path="legal" element={<LegalPage />} />
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
        <Route path="league" element={<LeaderboardPage />} />
        <Route path="league/rules" element={<LeagueRulesPage />} />
        <Route path="scores" element={<StudentScoresPage />} />
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
        <Route path="legal" element={<LegalPage />} />
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
    </Suspense>
    </>
  );
}
