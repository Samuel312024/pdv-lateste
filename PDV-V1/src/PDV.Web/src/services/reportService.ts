import { api, unwrapResponse } from './api';
import type {
  FormaPagamento,
  RelatorioCaixa,
  RelatorioEstoqueBaixo,
  RelatorioFiltrosOpcoes,
  RelatorioResumo,
  RelatorioVendaLinha,
  VendaStatus
} from '../types';

export interface RelatorioFiltros {
  dataInicial?: string | null;
  dataFinal?: string | null;
  usuarioId?: string | null;
  produtoId?: string | null;
  clienteId?: string | null;
  formaPagamento?: FormaPagamento | '' | null;
  statusVenda?: VendaStatus | '' | null;
}

function normalizeParams(filters: RelatorioFiltros) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== null && value !== undefined && value !== '')
  );
}

export const reportService = {
  async filtros() {
    const response = await api.get('/relatorios/filtros');
    return unwrapResponse<RelatorioFiltrosOpcoes>(response);
  },
  async resumo(filters: RelatorioFiltros) {
    const response = await api.get('/relatorios/resumo', { params: normalizeParams(filters) });
    return unwrapResponse<RelatorioResumo>(response);
  },
  async vendas(filters: RelatorioFiltros) {
    const response = await api.get('/relatorios/vendas', { params: normalizeParams(filters) });
    return unwrapResponse<RelatorioVendaLinha[]>(response);
  },
  async caixa(filters: RelatorioFiltros) {
    const response = await api.get('/relatorios/caixa', { params: normalizeParams(filters) });
    return unwrapResponse<RelatorioCaixa[]>(response);
  },
  async estoqueBaixo(filters: RelatorioFiltros) {
    const response = await api.get('/relatorios/estoque-baixo', { params: normalizeParams(filters) });
    return unwrapResponse<RelatorioEstoqueBaixo[]>(response);
  }
};
