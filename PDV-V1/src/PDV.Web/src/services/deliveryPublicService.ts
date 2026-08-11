import { publicApi, unwrapResponse } from './api';
import type { PainelEntregaPublico, RegistrarEntregaLocalizacaoPayload } from '../types';

export const deliveryPublicService = {
  async getPanel(codigoAcesso: string) {
    const response = await publicApi.get(`/entregas/publico/${codigoAcesso}`);
    return unwrapResponse<PainelEntregaPublico>(response);
  },
  async sendLocation(codigoAcesso: string, payload: RegistrarEntregaLocalizacaoPayload) {
    const response = await publicApi.post(`/entregas/publico/${codigoAcesso}/localizacao`, payload);
    return unwrapResponse<PainelEntregaPublico>(response);
  }
};
