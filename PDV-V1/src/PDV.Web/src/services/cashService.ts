import { api, unwrapResponse } from './api';
import type { Caixa, CheckoutDisponibilidade, LiberacaoGerentePayload } from '../types';

export const cashService = {
  async getOpen() {
    const response = await api.get('/caixa/aberto');
    return unwrapResponse<Caixa | null>(response);
  },
  async getCheckoutAvailability() {
    const response = await api.get('/caixa/checkout-disponivel');
    return unwrapResponse<CheckoutDisponibilidade>(response);
  },
  async open(valorInicial: number, liberacaoGerente?: LiberacaoGerentePayload | null) {
    const response = await api.post('/caixa/abrir', { valorInicial, liberacaoGerente: liberacaoGerente ?? null });
    return unwrapResponse<Caixa>(response);
  },
  async close(valorContadoDinheiro: number, observacao?: string, liberacaoGerente?: LiberacaoGerentePayload | null) {
    const response = await api.post('/caixa/fechar', { valorContadoDinheiro, observacao: observacao ?? null, liberacaoGerente: liberacaoGerente ?? null });
    return unwrapResponse<Caixa>(response);
  },
  async sangria(valor: number, observacao?: string, liberacaoGerente?: LiberacaoGerentePayload | null) {
    const response = await api.post('/caixa/sangria', { valor, observacao: observacao ?? null, liberacaoGerente: liberacaoGerente ?? null });
    return unwrapResponse<Caixa>(response);
  },
  async suprimento(valor: number, observacao?: string, liberacaoGerente?: LiberacaoGerentePayload | null) {
    const response = await api.post('/caixa/suprimento', { valor, observacao: observacao ?? null, liberacaoGerente: liberacaoGerente ?? null });
    return unwrapResponse<Caixa>(response);
  }
};
