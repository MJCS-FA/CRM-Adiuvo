import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { AppLoader } from '../components/ui';
import { useAuth } from '../hooks/useAuth';

export function ProtectedRoute() {
  const { isAuthenticated, isBooting } = useAuth();
  const location = useLocation();

  if (isBooting) {
    return <AppLoader tip="Loading session..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
