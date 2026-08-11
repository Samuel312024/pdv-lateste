import { api, unwrapResponse } from './api';
import type { Cliente, ClienteHistorico, ClientePerfilCompradorResponse } from '../types';

export interface ClientePayload {
  nome: string;
  documento: string | null;
  segmento: string | null;
  telefone: string | null;
  email: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  codigoMunicipioIbge: string | null;
  endereco: string | null;
  ehFornecedor: boolean;
  ativo: boolean;
}

export interface ClientePerfilCompradorPayload {
  nome: string | null;
  documento: string;
  telefone: string;
  email: string | null;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  codigoMunicipioIbge: string | null;
}

export const clientService = {
  async list(termo?: string) {
    const response = await api.get('/clientes', { params: { termo } });
    return unwrapResponse<Cliente[]>(response);
  },
  async create(payload: ClientePayload) {
    const response = await api.post('/clientes', payload);
    return unwrapResponse<Cliente>(response);
  },
  async saveBuyerProfile(payload: ClientePerfilCompradorPayload) {
    const response = await api.post('/clientes/perfil-comprador', payload);
    return unwrapResponse<ClientePerfilCompradorResponse>(response);
  },
  async history(id: string) {
    const response = await api.get(`/clientes/${id}/historico`);
    return unwrapResponse<ClienteHistorico>(response);
  },
  async update(id: string, payload: ClientePayload) {
    const response = await api.put(`/clientes/${id}`, payload);
    return unwrapResponse<Cliente>(response);
  },
  async remove(id: string, permanente = false) {
    await api.delete(`/clientes/${id}`, { params: { permanente } });
  }
};
