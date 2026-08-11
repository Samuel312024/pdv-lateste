import { api, publicApi, unwrapResponse } from './api';
import type {
  TerminalPerfilInstalacao,
  TerminalPerfilImpressora,
  TerminalPerfilScanner,
  TerminalPerfilTeclado,
  TerminalPdv,
  TerminalPdvAtivacaoResultado,
  TerminalPdvChaveRegenerada,
  TerminalPdvCriado
} from '../types';

export interface TerminalPdvPayload {
  nomeTerminal: string;
  lojaNome: string | null;
  estadoUf: string | null;
  numeroPdv: number;
  perfilInstalacao: TerminalPerfilInstalacao;
  perfilImpressora: TerminalPerfilImpressora;
  perfilScanner: TerminalPerfilScanner;
  perfilTeclado: TerminalPerfilTeclado;
  impressaoAutomatica: boolean;
  observacao: string | null;
}

export interface TerminalPdvStatusPayload {
  ativo: boolean;
}

export interface TerminalPdvAtivacaoPayload {
  codigoTerminal: string;
  chaveAtivacao: string;
  dispositivoIdentificador: string | null;
  nomeHost: string | null;
  versaoInstalador: string | null;
  versaoAplicativo: string | null;
}

export const terminalService = {
  async list() {
    const response = await api.get('/terminais');
    return unwrapResponse<TerminalPdv[]>(response);
  },
  async create(payload: TerminalPdvPayload) {
    const response = await api.post('/terminais', payload);
    return unwrapResponse<TerminalPdvCriado>(response);
  },
  async regenerateKey(terminalId: string) {
    const response = await api.post(`/terminais/${terminalId}/regenerar-chave`);
    return unwrapResponse<TerminalPdvChaveRegenerada>(response);
  },
  async updateStatus(terminalId: string, payload: TerminalPdvStatusPayload) {
    const response = await api.put(`/terminais/${terminalId}/status`, payload);
    return unwrapResponse<TerminalPdv>(response);
  },
  async activate(payload: TerminalPdvAtivacaoPayload) {
    const response = await publicApi.post('/terminais/ativar', payload);
    return unwrapResponse<TerminalPdvAtivacaoResultado>(response);
  }
};
