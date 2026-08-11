import { api, publicApi, unwrapResponse } from './api';
import type { ProdutoImagemUpload, ScannerLeitura, ScannerLog, ScannerSessaoCriada, ScannerSessaoPublica, ScannerTipoLeitura } from '../types';

export const scannerService = {
  async createSession(contexto: string, tipoLeitura: ScannerTipoLeitura = 'Auto') {
    const response = await api.post('/scanner-sessoes', { contexto, tipoLeitura });
    return unwrapResponse<ScannerSessaoCriada>(response);
  },
  async getReadings(sessaoId: string, afterSequence = 0) {
    const response = await api.get(`/scanner-sessoes/${sessaoId}/leituras`, { params: { afterSequence } });
    return unwrapResponse<ScannerLeitura[]>(response);
  },
  async getLogs(sessaoId: string, afterSequence = 0) {
    const response = await api.get(`/scanner-sessoes/${sessaoId}/logs`, { params: { afterSequence } });
    return unwrapResponse<ScannerLog[]>(response);
  },
  async closeSession(sessaoId: string) {
    await api.delete(`/scanner-sessoes/${sessaoId}`);
  },
  async getPublicSession(sessaoId: string, chaveAcesso: string) {
    const response = await publicApi.get(`/scanner-sessoes/${sessaoId}/publico`, { params: { chaveAcesso } });
    return unwrapResponse<ScannerSessaoPublica>(response);
  },
  async pushReading(sessaoId: string, chaveAcesso: string, payload: { codigo: string; formato?: string | null; origem?: string | null }) {
    const response = await publicApi.post(`/scanner-sessoes/${sessaoId}/leituras`, payload, { params: { chaveAcesso } });
    return unwrapResponse<ScannerLeitura>(response);
  },
  async pushLog(sessaoId: string, chaveAcesso: string, payload: { tipo: string; mensagem: string; origem?: string | null }) {
    const response = await publicApi.post(`/scanner-sessoes/${sessaoId}/logs`, payload, { params: { chaveAcesso } });
    return unwrapResponse<ScannerLog>(response);
  },
  async uploadProductImage(sessaoId: string, chaveAcesso: string, arquivo: File, termoBusca?: string | null) {
    const formData = new FormData();
    formData.append('arquivo', arquivo);
    if (termoBusca?.trim()) {
      formData.append('termoBusca', termoBusca.trim());
    }

    const response = await publicApi.post(`/scanner-sessoes/${sessaoId}/imagem-produto`, formData, {
      params: { chaveAcesso },
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return unwrapResponse<ProdutoImagemUpload>(response);
  }
};
