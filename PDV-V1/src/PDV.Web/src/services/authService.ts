import { api, unwrapResponse } from './api';
import type { LoginResponse } from '../types';

export interface LoginPayload {
  email?: string | null;
  codigoBarrasCracha?: string | null;
  senha: string;
}

export const authService = {
  async login(payload: LoginPayload) {
    const response = await api.post('/auth/login', payload);
    return unwrapResponse<LoginResponse>(response);
  },
  async heartbeat() {
    await api.post('/auth/presenca/heartbeat');
  }
};
