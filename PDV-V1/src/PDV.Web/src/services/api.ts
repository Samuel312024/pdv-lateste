import axios, { type AxiosResponse } from 'axios';
import type { ApiResponse, LoginResponse } from '../types';
import { clearCashierAccess } from '../utils/cashierAccess';

const SESSION_STORAGE_KEY = 'pdv-session';
const OPERATIONAL_SESSION_STORAGE_KEY = 'pdv-operational-session';

function readStoredSession(storage: Storage, storageKey: string) {
  const rawValue = storage.getItem(storageKey);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as LoginResponse;
  } catch {
    storage.removeItem(storageKey);
    return null;
  }
}

export function isOperationalPath(pathname = window.location.pathname) {
  return pathname.startsWith('/caixa') || pathname.startsWith('/pdv') || pathname.startsWith('/acesso-caixa');
}

export function readPrimarySession() {
  return readStoredSession(window.localStorage, SESSION_STORAGE_KEY);
}

export function readOperationalSession() {
  return readStoredSession(window.sessionStorage, OPERATIONAL_SESSION_STORAGE_KEY);
}

export function readEffectiveSession(pathname = window.location.pathname) {
  if (isOperationalPath(pathname)) {
    return readOperationalSession() ?? readPrimarySession();
  }

  return readPrimarySession();
}

export function writePrimarySession(session: LoginResponse) {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function writeOperationalSession(session: LoginResponse) {
  window.sessionStorage.setItem(OPERATIONAL_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearPrimarySession() {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function clearOperationalSession() {
  window.sessionStorage.removeItem(OPERATIONAL_SESSION_STORAGE_KEY);
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api'
});

export const publicApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api'
});

api.interceptors.request.use((config) => {
  const session = readEffectiveSession();
  if (session) {
    config.headers.Authorization = `Bearer ${session.token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearCashierAccess();
      if (isOperationalPath(window.location.pathname) && readOperationalSession()) {
        clearOperationalSession();
      } else {
        clearOperationalSession();
        clearPrimarySession();
      }
      const loginPath = window.location.pathname.startsWith('/comprador')
        ? '/comprador/login'
        : window.location.pathname.startsWith('/entregador')
          ? '/entregador/login'
          : window.location.pathname.startsWith('/caixa') || window.location.pathname.startsWith('/pdv')
            ? '/acesso-caixa'
            : '/login';
      if (window.location.pathname !== loginPath) {
        window.location.href = loginPath;
      }
    }

    return Promise.reject(error);
  }
);

export function unwrapResponse<T>(response: AxiosResponse<ApiResponse<T>>) {
  return response.data.data;
}

export { OPERATIONAL_SESSION_STORAGE_KEY, SESSION_STORAGE_KEY };
