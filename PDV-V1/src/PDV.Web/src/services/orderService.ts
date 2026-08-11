import { api, unwrapResponse } from './api';
import type { AtualizarPedidoEntregaPayload, AtualizarPedidoStatusPayload, PedidoDetalhe, PedidoEntrega, PedidoResumo } from '../types';

export const orderService = {
  async list(params?: { status?: string | null; atendimento?: string | null; termo?: string | null }) {
    const response = await api.get('/pedidos', { params });
    return unwrapResponse<PedidoResumo[]>(response);
  },
  async getById(id: string) {
    const response = await api.get(`/pedidos/${id}`);
    return unwrapResponse<PedidoDetalhe>(response);
  },
  async updateStatus(id: string, payload: AtualizarPedidoStatusPayload) {
    const response = await api.post(`/pedidos/${id}/status`, payload);
    return unwrapResponse<PedidoDetalhe>(response);
  },
  async updateDelivery(id: string, payload: AtualizarPedidoEntregaPayload) {
    const response = await api.post(`/entregas/${id}/configurar`, payload);
    return unwrapResponse<PedidoEntrega>(response);
  },
  async listMine() {
    const response = await api.get('/pedidos/meus');
    return unwrapResponse<PedidoResumo[]>(response);
  },
  async getMineById(id: string) {
    const response = await api.get(`/pedidos/meus/${id}`);
    return unwrapResponse<PedidoDetalhe>(response);
  },
  async listAssigned() {
    const response = await api.get('/pedidos/entregador');
    return unwrapResponse<PedidoResumo[]>(response);
  },
  async getAssignedById(id: string) {
    const response = await api.get(`/pedidos/entregador/${id}`);
    return unwrapResponse<PedidoDetalhe>(response);
  }
};
