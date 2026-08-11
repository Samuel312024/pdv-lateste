import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ScannerCodigoEscaneadoEvento, ScannerSessaoCriada, ScannerSessaoPublica, ScannerStatusConexao, ScannerTipoLeitura } from '../types';
import { isBuyerUser } from '../utils/featureAccess';
import { useAuth } from './AuthContext';
import { scannerGlobalService, type ScannerCodeSubscriptionOptions, type ScannerSessionState } from '../services/scannerGlobalService';

interface ScannerSessionContextValue extends ScannerSessionState {
  startDesktopSession: (contexto: string, tipoLeitura?: ScannerTipoLeitura) => Promise<ScannerSessaoCriada>;
  connectMobileSession: (sessaoId: string, chaveAcesso: string) => Promise<ScannerSessaoPublica>;
  disconnectScanner: (closeSession?: boolean) => Promise<void>;
  sendCode: (codigoBarras: string, formato?: string | null) => Promise<void>;
  subscribeToCodes: (
    listener: (event: ScannerCodigoEscaneadoEvento) => void,
    options?: ScannerCodeSubscriptionOptions
  ) => () => void;
  subscribeToStatus: (listener: (status: ScannerStatusConexao | null) => void) => () => void;
}

const ScannerSessionContext = createContext<ScannerSessionContextValue | undefined>(undefined);

export function ScannerSessionProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [state, setState] = useState<ScannerSessionState>(() => scannerGlobalService.getState());
  const hideScannerForBuyer = isBuyerUser(session);

  useEffect(() => {
    scannerGlobalService.setTokenFactory(() => session?.token ?? null);
  }, [session?.token]);

  useEffect(() => {
    if (hideScannerForBuyer) {
      void scannerGlobalService.disconnect(false);
      return;
    }

    if (!session?.token) {
      return;
    }

    const tryResume = () => {
      void scannerGlobalService.resumePersistedDesktopSession();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        tryResume();
      }
    };

    tryResume();
    window.addEventListener('focus', tryResume);
    window.addEventListener('online', tryResume);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', tryResume);
      window.removeEventListener('online', tryResume);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hideScannerForBuyer, session?.token]);

  useEffect(() => {
    return scannerGlobalService.subscribeToState(setState);
  }, []);

  const actions = useMemo(
    () => ({
      startDesktopSession: (contexto: string, tipoLeitura?: ScannerTipoLeitura) =>
        scannerGlobalService.startDesktopSession(contexto, tipoLeitura),
      connectMobileSession: (sessaoId: string, chaveAcesso: string) =>
        scannerGlobalService.connectMobileSession(sessaoId, chaveAcesso),
      disconnectScanner: (closeSession = false) => scannerGlobalService.disconnect(closeSession),
      sendCode: (codigoBarras: string, formato?: string | null) => scannerGlobalService.sendCode(codigoBarras, formato),
      subscribeToCodes: (
        listener: (event: ScannerCodigoEscaneadoEvento) => void,
        options?: ScannerCodeSubscriptionOptions
      ) => scannerGlobalService.subscribeToCodes(listener, options),
      subscribeToStatus: (listener: (status: ScannerStatusConexao | null) => void) =>
        scannerGlobalService.subscribeToState((nextState) => listener(nextState.status))
    }),
    []
  );

  const value = useMemo<ScannerSessionContextValue>(
    () => ({
      ...state,
      ...actions
    }),
    [actions, state]
  );

  return <ScannerSessionContext.Provider value={value}>{children}</ScannerSessionContext.Provider>;
}

export function useScannerSession() {
  const context = useContext(ScannerSessionContext);
  if (!context) {
    throw new Error('useScannerSession deve ser usado dentro de ScannerSessionProvider.');
  }

  return context;
}
