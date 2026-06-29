import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { roleHome } from './auth/roleHome';
import { AppLayout } from './components/AppLayout';
import { AdminLayout } from './components/AdminLayout';
import { LoginPage } from './pages/LoginPage';
import { TeacherBookingsPage } from './pages/TeacherBookingsPage';
import { NotePage } from './pages/NotePage';
import { SchedulePage } from './pages/SchedulePage';
import { PayrollPage } from './pages/PayrollPage';
import { ReverseProposePage } from './pages/ReverseProposePage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AdminPolicyPage } from './pages/AdminPolicyPage';
import { HrStudentsPage } from './pages/HrStudentsPage';
import { AdminInfraPage } from './pages/AdminInfraPage';
import { AdminReportsPage } from './pages/AdminReportsPage';

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
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/app"
        element={
          <Protected roles={['teacher']}>
            <AppLayout />
          </Protected>
        }
      >
        <Route index element={<Navigate to="bookings" replace />} />
        <Route path="bookings" element={<TeacherBookingsPage />} />
        <Route path="bookings/:id/note" element={<NotePage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="reverse" element={<ReverseProposePage />} />
        <Route path="payroll" element={<PayrollPage />} />
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
        <Route path="policy" element={<AdminPolicyPage />} />
        <Route path="infra" element={<AdminInfraPage />} />
        <Route path="reports" element={<AdminReportsPage />} />
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
