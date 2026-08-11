import type { LoginResponse, UsuarioLogado } from '../types';

const CASHIER_ACCESS_STORAGE_KEY = 'pdv-cashier-access';

interface CashierAccessState {
  usuarioId: string;
  empresaId: string;
  grantedAt: string;
}

function resolveUser(sessionOrUser: LoginResponse | UsuarioLogado | null | undefined) {
  if (!sessionOrUser) {
    return null;
  }

  return 'usuario' in sessionOrUser ? sessionOrUser.usuario : sessionOrUser;
}

function readCashierAccessState(): CashierAccessState | null {
  const rawValue = sessionStorage.getItem(CASHIER_ACCESS_STORAGE_KEY) ?? localStorage.getItem(CASHIER_ACCESS_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as CashierAccessState;
    if (!parsed.usuarioId || !parsed.empresaId) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function markCashierAccess(sessionOrUser: LoginResponse | UsuarioLogado) {
  const user = resolveUser(sessionOrUser);
  if (!user) {
    return;
  }

  const nextState: CashierAccessState = {
    usuarioId: user.usuarioId,
    empresaId: user.empresaId,
    grantedAt: new Date().toISOString()
  };

  localStorage.removeItem(CASHIER_ACCESS_STORAGE_KEY);
  sessionStorage.setItem(CASHIER_ACCESS_STORAGE_KEY, JSON.stringify(nextState));
}

export function clearCashierAccess() {
  sessionStorage.removeItem(CASHIER_ACCESS_STORAGE_KEY);
  localStorage.removeItem(CASHIER_ACCESS_STORAGE_KEY);
}

export function hasCashierAccess(sessionOrUser: LoginResponse | UsuarioLogado | null | undefined) {
  const user = resolveUser(sessionOrUser);
  const state = readCashierAccessState();

  return Boolean(
    user &&
    state &&
    state.usuarioId === user.usuarioId &&
    state.empresaId === user.empresaId
  );
}
