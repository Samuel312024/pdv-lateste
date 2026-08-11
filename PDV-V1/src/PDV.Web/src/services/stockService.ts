import { api, unwrapResponse } from './api';
import type {
  ConferenciaEstoqueResultado,
  DepositoEstoqueResumo,
  EstoqueLote,
  EstoqueLoteAlerta,
  MovimentacaoEstoque,
  PosicaoEstoqueProduto,
  TransferenciaEstoque
} from '../types';

export interface AjusteEstoquePayload {
  produtoId: string;
  depositoEstoqueId: string | null;
  novoEstoque: number;
  motivo: string | null;
}

export interface RegistrarEntradaLotePayload {
  produtoId: string;
  codigoLote: string;
  quantidadeEntrada: number;
  dataEntrada: string;
  dataFabricacao: string | null;
  dataValidade: string | null;
  precoCustoUnitario: number | null;
  documentoReferencia: string | null;
  observacao: string | null;
}

export interface RegistrarRecebimentoEstoquePayload {
  produtoId: string;
  depositoEstoqueId: string | null;
  quantidadeEntrada: number;
  precoCustoUnitario: number | null;
  documentoReferencia: string | null;
  observacao: string | null;
}

export interface ReservarEstoquePayload {
  produtoId: string;
  depositoEstoqueId: string | null;
  quantidade: number;
  motivo: string | null;
}

export interface LiberarReservaEstoquePayload {
  produtoId: string;
  depositoEstoqueId: string | null;
  quantidade: number;
  motivo: string | null;
}

export interface TransferirEstoquePayload {
  produtoId: string;
  depositoOrigemId: string;
  depositoDestinoId: string;
  quantidade: number;
  documentoReferencia: string | null;
  observacao: string | null;
}

export interface RegistrarExpedicaoEstoquePayload {
  produtoId: string;
  depositoEstoqueId: string | null;
  quantidadeSaida: number;
  documentoReferencia: string | null;
  observacao: string | null;
}

export interface ConferirEstoquePayload {
  produtoId: string;
  depositoEstoqueId: string | null;
  quantidadeContada: number;
  documentoReferencia: string | null;
  observacao: string | null;
}

export const stockService = {
  async listDeposits() {
    const response = await api.get('/estoque/depositos');
    return unwrapResponse<DepositoEstoqueResumo[]>(response);
  },
  async getProductPosition(produtoId: string) {
    const response = await api.get(`/estoque/produtos/${produtoId}/depositos`);
    return unwrapResponse<PosicaoEstoqueProduto>(response);
  },
  async listProductLots(produtoId: string, apenasComSaldo = false) {
    const response = await api.get(`/estoque/produtos/${produtoId}/lotes`, {
      params: apenasComSaldo ? { apenasComSaldo: true } : undefined
    });
    return unwrapResponse<EstoqueLote[]>(response);
  },
  async listMovements(params?: {
    produtoId?: string | null;
    dataInicial?: string | null;
    dataFinal?: string | null;
  }) {
    const response = await api.get('/estoque/movimentacoes', {
      params: Object.fromEntries(
        Object.entries(params ?? {}).filter(([, value]) => value !== null && value !== undefined && value !== '')
      )
    });
    return unwrapResponse<MovimentacaoEstoque[]>(response);
  },
  async listLotAlerts(diasLimite = 30) {
    const response = await api.get('/estoque/lotes/alertas', {
      params: { diasLimite }
    });
    return unwrapResponse<EstoqueLoteAlerta[]>(response);
  },
  async adjustStock(payload: AjusteEstoquePayload) {
    const response = await api.post('/estoque/ajuste', payload);
    return unwrapResponse<MovimentacaoEstoque>(response);
  },
  async registerLotEntry(payload: RegistrarEntradaLotePayload) {
    const response = await api.post('/estoque/lotes/entrada', payload);
    return unwrapResponse<EstoqueLote>(response);
  },
  async registerReceipt(payload: RegistrarRecebimentoEstoquePayload) {
    const response = await api.post('/estoque/recebimentos', payload);
    return unwrapResponse<MovimentacaoEstoque>(response);
  },
  async reserveStock(payload: ReservarEstoquePayload) {
    const response = await api.post('/estoque/reservas', payload);
    return unwrapResponse<MovimentacaoEstoque>(response);
  },
  async releaseReservedStock(payload: LiberarReservaEstoquePayload) {
    const response = await api.post('/estoque/reservas/liberacao', payload);
    return unwrapResponse<MovimentacaoEstoque>(response);
  },
  async transferStock(payload: TransferirEstoquePayload) {
    const response = await api.post('/estoque/transferencias', payload);
    return unwrapResponse<TransferenciaEstoque>(response);
  },
  async registerShipment(payload: RegistrarExpedicaoEstoquePayload) {
    const response = await api.post('/estoque/expedicoes', payload);
    return unwrapResponse<MovimentacaoEstoque>(response);
  },
  async registerConference(payload: ConferirEstoquePayload) {
    const response = await api.post('/estoque/conferencias', payload);
    return unwrapResponse<ConferenciaEstoqueResultado>(response);
  }
};
