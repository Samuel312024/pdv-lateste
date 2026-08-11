import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { authService, type LoginPayload } from '../services/authService';
import {
  clearOperationalSession,
  clearPrimarySession,
  isOperationalPath,
  readOperationalSession,
  readPrimarySession,
  writeOperationalSession,
  writePrimarySession
} from '../services/api';
import { orderRealtimeService } from '../services/orderRealtimeService';
import { scannerGlobalService } from '../services/scannerGlobalService';
import type { LoginResponse } from '../types';
import { clearCashierAccess } from '../utils/cashierAccess';

interface AuthContextValue {
  session: LoginResponse | null;
  isAuthenticated: boolean;
  isMasterUser: boolean;
  loading: boolean;
  login: (payload: LoginPayload) => Promise<LoginResponse>;
  logout: () => void;
  clearOperationalAccessSession: () => void;
  replaceSession: (nextSession: LoginResponse) => void;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const HEARTBEAT_INTERVAL_MS = 45_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [primarySession, setPrimarySession] = useState<LoginResponse | null>(null);
  const [operationalSession, setOperationalSession] = useState<LoginResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const session = isOperationalPath(location.pathname)
    ? operationalSession ?? primarySession
    : primarySession;
  const isMasterUser = (session?.usuario.isMaster ?? false) || session?.usuario.email === 'master@pdv.local';

  useEffect(() => {
    setPrimarySession(readPrimarySession());
    setOperationalSession(readOperationalSession());

    setLoading(false);
  }, []);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.storageArea === window.localStorage) {
        setPrimarySession(readPrimarySession());
      }
    }

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    scannerGlobalService.setTokenFactory(() => session?.token ?? null);
    orderRealtimeService.setTokenFactory(() => session?.token ?? null);
  }, [session]);

  useEffect(() => {
    if (!session?.token) {
      return;
    }

    let active = true;

    async function sendHeartbeat() {
      if (!active) {
        return;
      }

      try {
        await authService.heartbeat();
      } catch {
        // Ignore transient heartbeat failures to avoid noisy UX.
      }
    }

    void sendHeartbeat();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void sendHeartbeat();
      }
    };

    const handleFocus = () => {
      void sendHeartbeat();
    };

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void sendHeartbeat();
      }
    }, HEARTBEAT_INTERVAL_MS);

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [session?.token]);

  async function login(payload: LoginPayload) {
    const nextSession = await authService.login(payload);
    const isOperationalLogin = Boolean(payload.codigoBarrasCracha && !payload.email);

    if (isOperationalLogin) {
      writeOperationalSession(nextSession);
      setOperationalSession(nextSession);
      return nextSession;
    }

    clearOperationalSession();
    setOperationalSession(null);
    if (!payload.codigoBarrasCracha || payload.email) {
      clearCashierAccess();
    }
    writePrimarySession(nextSession);
    setPrimarySession(nextSession);
    return nextSession;
  }

  function logout() {
    void scannerGlobalService.disconnect(false);
    void orderRealtimeService.disconnect();

    if (isOperationalPath(location.pathname) && operationalSession) {
      clearOperationalAccessSession();
      return;
    }

    clearCashierAccess();
    clearOperationalSession();
    clearPrimarySession();
    setOperationalSession(null);
    setPrimarySession(null);
  }

  function clearOperationalAccessSession() {
    clearCashierAccess();
    clearOperationalSession();
    setOperationalSession(null);
  }

  function replaceSession(nextSession: LoginResponse) {
    if (isOperationalPath(location.pathname) && operationalSession) {
      writeOperationalSession(nextSession);
      setOperationalSession(nextSession);
      return;
    }

    writePrimarySession(nextSession);
    setPrimarySession(nextSession);
  }

  function hasPermission(permission: string) {
    return session?.usuario.permissoes.includes(permission) || false;
  }

  return (
        <AuthContext.Provider
      value={{
        session,
        isAuthenticated: Boolean(session?.token),
        isMasterUser,
        loading,
        login,
        logout,
        clearOperationalAccessSession,
        replaceSession,
        hasPermission
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  }

  return context;
}
