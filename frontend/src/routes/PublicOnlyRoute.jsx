import { Navigate, Outlet } from 'react-router-dom';
import { AppLoader } from '../components/ui';
import { useAuth } from '../hooks/useAuth';

export function PublicOnlyRoute() {
  const { isAuthenticated, isBooting } = useAuth();

  if (isBooting) {
    return <AppLoader tip="Loading session..." />;
  }

  if (isAuthenticated) {
    return <Navigate to="/directorio" replace />;
  }

  return <Outlet />;
}
