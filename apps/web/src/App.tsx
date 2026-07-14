import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { RealtimeNotifier } from './components/RealtimeNotifier';
import { roleHome } from './auth/roleHome';
import { AppLayout } from './components/AppLayout';
import { AdminLayout } from './components/AdminLayout';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { ConsultingApplyPage } from './pages/ConsultingApplyPage';
import { TeacherBookingsPage } from './pages/TeacherBookingsPage';
import { TeacherInboxPage } from './pages/TeacherInboxPage';
import { NotePage } from './pages/NotePage';
import { SchedulePage } from './pages/SchedulePage';
import { TeacherEvalPage } from './pages/TeacherEvalPage';
import { PayrollPage } from './pages/PayrollPage';
import { ReverseProposePage } from './pages/ReverseProposePage';
import { NotificationsPage } from './pages/NotificationsPage';
import { StudentNotesPage } from './pages/StudentNotesPage';
import { TeacherMaterialsPage } from './pages/TeacherMaterialsPage';
import { TeacherQnaPage } from './pages/TeacherQnaPage';
import { TeacherRecordsPage } from './pages/TeacherRecordsPage';
import { TeacherProfilePage } from './pages/TeacherProfilePage';
import { ClassroomPage } from './pages/ClassroomPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AdminPolicyPage } from './pages/AdminPolicyPage';
import { HrStudentsPage } from './pages/HrStudentsPage';
import { HrTeachersPage } from './pages/HrTeachersPage';
import { HrStaffPage } from './pages/HrStaffPage';
import { AdminInfraPage } from './pages/AdminInfraPage';
import { AdminRoomsPage } from './pages/AdminRoomsPage';
import { AdminBlockPage } from './pages/AdminBlockPage';
import { AdminReportsPage } from './pages/AdminReportsPage';
import { AnnouncementsPage } from './pages/AnnouncementsPage';
import { AdminOrgPage } from './pages/AdminOrgPage';
import { AdminMemberTypesPage } from './pages/AdminMemberTypesPage';
import { AdminEvaluationPage } from './pages/AdminEvaluationPage';
import { AdminAnalyticsPage } from './pages/AdminAnalyticsPage';
import { AdminAssignmentPage } from './pages/AdminAssignmentPage';
import { EmbedSessionPage } from './pages/EmbedSessionPage';
import { RoomStandalonePage } from './pages/RoomStandalonePage';
import { JanusLandingPage } from './pages/JanusLandingPage';
import { PlacementPage } from './pages/PlacementPage';
import { StudentHomePage } from './pages/StudentHomePage';
import { ServicesPage, ServiceDetailPage } from './pages/ServicesPage';
import { PlacementHubPage } from './pages/PlacementHubPage';
import { AdminAuditPage } from './pages/AdminAuditPage';
import { AdminPayrollPage } from './pages/AdminPayrollPage';
import { AdminScoresPage } from './pages/AdminScoresPage';
import { AdminReversePage } from './pages/AdminReversePage';
import { TeacherDashboardPage } from './pages/TeacherDashboardPage';
import { StudentLayout } from './components/StudentLayout';
import { StudentBookingsPage } from './pages/StudentBookingsPage';
import { StudentSearchPage } from './pages/StudentSearchPage';
import { StudentCreditsPage } from './pages/StudentCreditsPage';
import { StudentReversePage } from './pages/StudentReversePage';
import { StudentAutoAssignPage } from './pages/StudentAutoAssignPage';
import { StudentQnaPage } from './pages/StudentQnaPage';
import { StudentCommunityPage } from './pages/StudentCommunityPage';
import { StudentScoresPage } from './pages/StudentScoresPage';
import { LegalDocPage } from './pages/LegalDocPage';
import { LegalPage } from './pages/LegalPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { StudentMembershipPage } from './pages/StudentMembershipPage';
import { StudentNotificationsPage } from './pages/StudentNotificationsPage';
import { StudentMaterialsPage } from './pages/StudentMaterialsPage';
import { AdminCategoriesPage } from './pages/AdminCategoriesPage';
import { AdminMembershipPage } from './pages/AdminMembershipPage';
import { AdminSchedulesPage } from './pages/AdminSchedulesPage';

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
    <Routes>
      <Route path="/" element={<JanusLandingPage />} />
      <Route path="/placement" element={<PlacementPage />} />
      <Route path="/placement/hub" element={<PlacementHubPage />} />
      <Route path="/services" element={<ServicesPage />} />
      <Route path="/services/:slug" element={<ServiceDetailPage />} />
      {/* 구 잇올 랜딩·연계서비스는 신규 야누스 페이지로 대체 완료 → 리다이렉트(잇올 노출 차단) */}
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
        <Route path="bookings/:id/note" element={<NotePage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="evaluations" element={<TeacherEvalPage />} />
        <Route path="reverse" element={<ReverseProposePage />} />
        <Route path="qna" element={<TeacherQnaPage />} />
        <Route path="payroll" element={<PayrollPage />} />
        <Route path="materials" element={<TeacherMaterialsPage />} />
        <Route path="records" element={<TeacherRecordsPage />} />
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
        <Route path="evaluation" element={<AdminEvaluationPage />} />
        <Route path="assignment" element={<AdminAssignmentPage />} />
        <Route path="analytics" element={<AdminAnalyticsPage />} />
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
        <Route path="search" element={<StudentSearchPage />} />
        <Route path="bookings" element={<StudentBookingsPage />} />
        <Route path="materials" element={<StudentMaterialsPage />} />
        <Route path="qna" element={<StudentQnaPage />} />
        <Route path="community" element={<StudentCommunityPage />} />
        <Route path="scores" element={<StudentScoresPage />} />
        <Route path="membership" element={<StudentMembershipPage />} />
        <Route path="credits" element={<StudentCreditsPage />} />
        <Route path="notifications" element={<StudentNotificationsPage />} />
        <Route path="reverse" element={<StudentReversePage />} />
        <Route path="auto-assign" element={<StudentAutoAssignPage />} />
        <Route path="legal" element={<LegalPage />} />
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
    </>
  );
}
