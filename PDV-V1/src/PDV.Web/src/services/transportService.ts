import { api, unwrapResponse } from './api';
import type { Transportadora } from '../types';

export interface TransportadoraPayload {
  nome: string;
  nomeFantasia: string | null;
  documento: string | null;
  inscricaoEstadual: string | null;
  telefone: string | null;
  email: string | null;
  responsavel: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  codigoMunicipioIbge: string | null;
  endereco: string | null;
  corTemaHex: string | null;
  prazoMedioEntregaMinutos: number | null;
  observacao: string | null;
  ativo: boolean;
}

export const transportService = {
  async list(incluirInativas = true) {
    const response = await api.get('/transportadoras', {
      params: incluirInativas ? { incluirInativas: true } : undefined
    });
    return unwrapResponse<Transportadora[]>(response);
  },
  async create(payload: TransportadoraPayload) {
    const response = await api.post('/transportadoras', payload);
    return unwrapResponse<Transportadora>(response);
  },
  async update(id: string, payload: TransportadoraPayload) {
    const response = await api.put(`/transportadoras/${id}`, payload);
    return unwrapResponse<Transportadora>(response);
  },
  async archive(id: string) {
    await api.delete(`/transportadoras/${id}`);
  }
};
