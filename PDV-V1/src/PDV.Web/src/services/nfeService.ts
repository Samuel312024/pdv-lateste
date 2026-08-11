import { api, unwrapResponse } from './api';
import type { NotaFiscal, NotaFiscalResumo, NotaFiscalVendaDisponivel } from '../types';

export interface EmitirNotaFiscalPayload {
  observacoes: string | null;
}

export interface TransmitirNotaFiscalResponse {
  notaFiscal: NotaFiscal;
  mensagem: string;
  autorizada: boolean;
}

export const nfeService = {
  async list() {
    const response = await api.get('/notas-fiscais');
    return unwrapResponse<NotaFiscalResumo[]>(response);
  },
  async getById(id: string) {
    const response = await api.get(`/notas-fiscais/${id}`);
    return unwrapResponse<NotaFiscal>(response);
  },
  async listEligibleSales(term?: string) {
    const response = await api.get('/notas-fiscais/vendas-disponiveis', {
      params: term?.trim() ? { termo: term.trim() } : undefined
    });
    return unwrapResponse<NotaFiscalVendaDisponivel[]>(response);
  },
  async issueFromSale(vendaId: string, payload: EmitirNotaFiscalPayload) {
    const response = await api.post(`/notas-fiscais/emitir/venda/${vendaId}`, payload);
    return unwrapResponse<NotaFiscal>(response);
  },
  async transmit(id: string) {
    const response = await api.post(`/notas-fiscais/${id}/transmitir`);
    return unwrapResponse<TransmitirNotaFiscalResponse>(response);
  }
};
