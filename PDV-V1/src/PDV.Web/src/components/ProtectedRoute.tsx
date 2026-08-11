import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';

export function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Box sx={{ display: 'grid', minHeight: '100vh', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    const loginPath = location.pathname.startsWith('/comprador')
      ? '/comprador/login'
      : location.pathname.startsWith('/entregador')
        ? '/entregador/login'
        : location.pathname.startsWith('/caixa') || location.pathname.startsWith('/pdv')
          ? '/acesso-caixa'
        : '/login';
    return <Navigate to={loginPath} replace state={{ from: location }} />;
  }

  return <Outlet />;
}
