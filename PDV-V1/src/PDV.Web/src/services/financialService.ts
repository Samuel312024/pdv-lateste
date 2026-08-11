import { api, unwrapResponse } from './api';
import type { FinanceiroResumo, FinanceiroStatus, FinanceiroTipo, LancamentoFinanceiro } from '../types';

export interface FinanceiroFiltros {
  dataInicial?: string | null;
  dataFinal?: string | null;
  termo?: string | null;
  tipo?: FinanceiroTipo | '';
  status?: FinanceiroStatus | '';
  clienteId?: string | null;
}

export interface LancamentoFinanceiroPayload {
  descricao: string;
  documentoReferencia: string | null;
  clienteId: string | null;
  fornecedorId: string | null;
  dataCompetencia: string | null;
  dataVencimento: string | null;
  valorOriginal: number;
  valorDesconto: number;
  valorAcrescimo: number;
  observacao: string | null;
  liquidado: boolean;
}

export const financialService = {
  async resumo(filters: FinanceiroFiltros) {
    const response = await api.get('/financeiro/resumo', { params: normalizeParams(filters) });
    return unwrapResponse<FinanceiroResumo>(response);
  },
  async lancamentos(filters: FinanceiroFiltros) {
    const response = await api.get('/financeiro/lancamentos', { params: normalizeParams(filters) });
    return unwrapResponse<LancamentoFinanceiro[]>(response);
  },
  async criarContaReceber(payload: LancamentoFinanceiroPayload) {
    const response = await api.post('/financeiro/contas-receber', payload);
    return unwrapResponse<LancamentoFinanceiro>(response);
  },
  async criarContaPagar(payload: LancamentoFinanceiroPayload) {
    const response = await api.post('/financeiro/contas-pagar', payload);
    return unwrapResponse<LancamentoFinanceiro>(response);
  },
  async liquidar(id: string, observacao?: string | null) {
    const response = await api.post(`/financeiro/lancamentos/${id}/liquidar`, {
      dataLiquidacao: null,
      observacao: observacao ?? null
    });
    return unwrapResponse<LancamentoFinanceiro>(response);
  }
};

function normalizeParams(filters: FinanceiroFiltros) {
  return {
    dataInicial: filters.dataInicial || undefined,
    dataFinal: filters.dataFinal || undefined,
    termo: filters.termo || undefined,
    tipo: filters.tipo || undefined,
    status: filters.status || undefined,
    clienteId: filters.clienteId || undefined
  };
}
