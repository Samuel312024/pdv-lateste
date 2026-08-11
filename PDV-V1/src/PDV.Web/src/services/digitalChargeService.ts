import { api, unwrapResponse } from './api';
import type { CobrancaDigital, CobrancaDigitalOrigem, CobrancaDigitalStatus } from '../types';
import type { FormaPagamento } from '../types';

export interface CobrancaDigitalFiltros {
  origem?: CobrancaDigitalOrigem | '';
  status?: CobrancaDigitalStatus | '';
  clienteId?: string | null;
  limite?: number;
}

export interface CriarCobrancaDigitalCheckoutPayload {
  clienteId: string;
  valor: number;
  descricao: string;
  documentoReferencia: string | null;
  formaPagamento: FormaPagamento;
}

export interface CriarCobrancaDigitalFinanceiroPayload {
  clienteId: string;
  descricao: string;
  documentoReferencia: string | null;
  dataVencimento: string | null;
  valorOriginal: number;
  observacao: string | null;
}

export const digitalChargeService = {
  async list(filters: CobrancaDigitalFiltros) {
    const response = await api.get('/cobrancas-digitais', {
      params: {
        origem: filters.origem || undefined,
        status: filters.status || undefined,
        clienteId: filters.clienteId || undefined,
        limite: filters.limite ?? undefined
      }
    });
    return unwrapResponse<CobrancaDigital[]>(response);
  },
  async getById(id: string, sincronizar = false) {
    const response = await api.get(`/cobrancas-digitais/${id}`, {
      params: {
        sincronizar: sincronizar || undefined
      }
    });
    return unwrapResponse<CobrancaDigital>(response);
  },
  async createCheckout(payload: CriarCobrancaDigitalCheckoutPayload) {
    const response = await api.post('/cobrancas-digitais/checkout', payload);
    return unwrapResponse<CobrancaDigital>(response);
  },
  async createFinance(payload: CriarCobrancaDigitalFinanceiroPayload) {
    const response = await api.post('/cobrancas-digitais/financeiro', payload);
    return unwrapResponse<CobrancaDigital>(response);
  }
};
