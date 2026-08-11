import { api, unwrapResponse } from './api';

export interface CepLookupResult {
  cep: string;
  logradouro: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string;
  uf: string;
  codigoMunicipioIbge: string | null;
}

export interface MunicipioLookupResult {
  municipioId: string;
  codigoIbge: string;
  nome: string;
  uf: string;
}

export const cepService = {
  async lookup(cep: string) {
    const response = await api.get(`/enderecos/cep/${cep}`);
    return unwrapResponse<CepLookupResult>(response);
  },
  async searchMunicipios(termo: string, uf?: string | null, limit = 20) {
    const response = await api.get('/enderecos/municipios', {
      params: {
        termo,
        uf: uf || undefined,
        limit
      }
    });
    return unwrapResponse<MunicipioLookupResult[]>(response);
  },
  async resolveMunicipio(params: { cidade?: string | null; uf?: string | null; codigoIbge?: string | null }) {
    const response = await api.get('/enderecos/municipios/resolver', {
      params: {
        cidade: params.cidade || undefined,
        uf: params.uf || undefined,
        codigoIbge: params.codigoIbge || undefined
      }
    });
    return unwrapResponse<MunicipioLookupResult | null>(response);
  }
};
