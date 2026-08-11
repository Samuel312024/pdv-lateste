import { api, unwrapResponse } from './api';

export interface CnpjLookupResult {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  segmento: string | null;
  cnaePrincipalCodigo: string | null;
  codigoMunicipioIbge: string | null;
  inscricaoEstadual: string | null;
  telefone: string | null;
  telefoneSecundario: string | null;
  email: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}

export const cnpjService = {
  async lookup(cnpj: string) {
    const response = await api.get(`/clientes/cnpj/${cnpj}`);
    return unwrapResponse<CnpjLookupResult>(response);
  }
};
