import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { TeacherBookingsPage } from './pages/TeacherBookingsPage';
import { NotePage } from './pages/NotePage';
import { SchedulePage } from './pages/SchedulePage';
import { PayrollPage } from './pages/PayrollPage';
import { ReverseProposePage } from './pages/ReverseProposePage';

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 40 }}>불러오는 중…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/app"
        element={
          <Protected>
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
      <Route path="*" element={<Navigate to="/app/bookings" replace />} />
    </Routes>
  );
}
