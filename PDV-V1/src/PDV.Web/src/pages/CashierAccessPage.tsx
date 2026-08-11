import { Navigate, useLocation } from 'react-router-dom';
import { CashierAccessPanel } from '../components/cashier/CashierAccessPanel';
import { useAuth } from '../contexts/AuthContext';
import { hasCashierAccess } from '../utils/cashierAccess';

export function CashierAccessPage() {
  const { session } = useAuth();
  const location = useLocation();

  const returnTo = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
  const successPath = returnTo === '/pdv' || returnTo === '/caixa' ? returnTo : '/caixa';

  if (session && hasCashierAccess(session)) {
    return <Navigate to={successPath} replace />;
  }

  return (
    <CashierAccessPanel
      accessPath={successPath === '/pdv' ? '/pdv' : '/caixa'}
      successPath={successPath}
    />
  );
}
