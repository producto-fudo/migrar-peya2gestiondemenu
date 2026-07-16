import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import SupportPage from '@/pages/SupportPage';

function PrivateRoute({ children, requireMode }: { children: React.ReactNode; requireMode?: 'normal' | 'support' }) {
  const { auth } = useAuth();
  if (!auth) return <Navigate to="/login" replace />;
  if (requireMode && auth.mode !== requireMode) {
    return <Navigate to={auth.mode === 'support' ? '/support' : '/'} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <PrivateRoute requireMode="normal">
              <DashboardPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/support"
          element={
            <PrivateRoute requireMode="support">
              <SupportPage />
            </PrivateRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
