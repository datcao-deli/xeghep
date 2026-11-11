import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './LandingPage';
import Dashboard from './Dashboard';
import DriverDashboard from './DriverDashboard';
import CustomerDashboard from './CustomerDashboard';
import { getSession } from './api';

function RoleRedirect() {
  const session = getSession();
  if (!session?.id) return <Navigate to="/login" replace />;
  if (session.role === 'admin') return <Navigate to="/dashboard" replace />;
  if (session.role === 'tai_xe') return <Navigate to="/driver" replace />;
  return <Navigate to="/customer" replace />;
}

function ProtectedAdmin({ children }) {
  const session = getSession();
  if (!session?.id) return <Navigate to="/login" replace />;
  if (session.role !== 'admin') {
    return <Navigate to={session.role === 'tai_xe' ? '/driver' : '/customer'} replace />;
  }
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LandingPage defaultAuthOpen={true} defaultAuthMode="login" />} />
        <Route path="/register" element={<LandingPage defaultAuthOpen={true} defaultAuthMode="register" />} />

        {/* 1. GIAO DIỆN QUẢN TRỊ VIÊN (ADMIN) */}
        <Route
          path="/dashboard"
          element={
            <ProtectedAdmin>
              <Dashboard />
            </ProtectedAdmin>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedAdmin>
              <Dashboard />
            </ProtectedAdmin>
          }
        />

        {/* 2. GIAO DIỆN TÀI XẾ (DRIVER) */}
        <Route path="/driver" element={<DriverDashboard />} />
        <Route path="/tai-xe" element={<DriverDashboard />} />

        {/* 3. GIAO DIỆN HÀNH KHÁCH (CUSTOMER) */}
        <Route path="/customer" element={<CustomerDashboard />} />
        <Route path="/khach-hang" element={<CustomerDashboard />} />

        {/* ĐIỀU HƯỚNG TƯƠNG THÍCH CŨ */}
        <Route path="/user-dashboard" element={<RoleRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;