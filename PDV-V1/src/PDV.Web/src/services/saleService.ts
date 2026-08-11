import { api, unwrapResponse } from './api';
import type { FinalizarPedidoRequest, FinalizarVendaItemRequest, FinalizarVendaPagamentoRequest, FinalizarVendaResponse, LiberacaoGerentePayload, Venda } from '../types';

export interface FinalizarVendaPayload {
  clienteId: string | null;
  itens: FinalizarVendaItemRequest[];
  pagamentos: FinalizarVendaPagamentoRequest[];
  emitirNfe: boolean;
  pedido: FinalizarPedidoRequest | null;
  liberacoesGerenciais?: LiberacaoGerentePayload[] | null;
}

export const saleService = {
  async finalize(payload: FinalizarVendaPayload) {
    const response = await api.post('/vendas/finalizar', payload);
    return unwrapResponse<FinalizarVendaResponse>(response);
  },
  async getById(id: string) {
    const response = await api.get(`/vendas/${id}`);
    return unwrapResponse<Venda>(response);
  }
};
