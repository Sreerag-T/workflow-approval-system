import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';

/** Redirects to /login when unauthenticated, and to the dashboard when the role is not allowed. */
export default function ProtectedRoute({ roles }) {
  const { token, user } = useSelector((s) => s.auth);
  const location = useLocation();
  if (!token || !user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
