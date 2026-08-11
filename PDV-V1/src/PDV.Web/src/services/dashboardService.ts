import { api, unwrapResponse } from './api';
import type {
  DashboardProdutoMaisVendido,
  DashboardResumo,
  DashboardVendasPorDia,
  DashboardVendasPorPagamento,
  MonitorOperacionalSnapshot
} from '../types';

export const dashboardService = {
  async resumo() {
    const response = await api.get('/dashboard/resumo');
    return unwrapResponse<DashboardResumo>(response);
  },
  async vendasPorDia() {
    const response = await api.get('/dashboard/vendas-por-dia');
    return unwrapResponse<DashboardVendasPorDia[]>(response);
  },
  async produtosMaisVendidos() {
    const response = await api.get('/dashboard/produtos-mais-vendidos');
    return unwrapResponse<DashboardProdutoMaisVendido[]>(response);
  },
  async vendasPorFormaPagamento() {
    const response = await api.get('/dashboard/vendas-por-forma-pagamento');
    return unwrapResponse<DashboardVendasPorPagamento[]>(response);
  },
  async monitorOperacional() {
    const response = await api.get('/dashboard/monitor-operacional');
    return unwrapResponse<MonitorOperacionalSnapshot>(response);
  }
};
