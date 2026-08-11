import { api, unwrapResponse } from './api';
import type { PerfilOpcao, PermissaoOpcao, Usuario, UsuarioClienteVinculo, UsuarioEntregador } from '../types';

export interface UsuarioPayload {
  perfilId: string;
  clienteId: string | null;
  nome: string;
  email: string;
  codigoBarrasCracha: string | null;
  senha: string | null;
  ativo: boolean;
  usarPermissoesCustomizadas: boolean;
  permissoesCustomizadas: string[];
}

export interface UsuarioCrachaSugestao {
  perfilId: string;
  perfilCodigo: string;
  perfilNome: string;
  codigoBarrasCracha: string;
  conteudoQrCode: string;
}

export const userService = {
  async list(termo?: string) {
    const response = await api.get('/usuarios', { params: { termo } });
    return unwrapResponse<Usuario[]>(response);
  },
  async listProfiles() {
    const response = await api.get('/usuarios/perfis');
    return unwrapResponse<PerfilOpcao[]>(response);
  },
  async listPermissions() {
    const response = await api.get('/usuarios/permissoes');
    return unwrapResponse<PermissaoOpcao[]>(response);
  },
  async listLinkableClients() {
    const response = await api.get('/usuarios/clientes-vinculo');
    return unwrapResponse<UsuarioClienteVinculo[]>(response);
  },
  async listDeliveryUsers() {
    const response = await api.get('/usuarios/entregadores');
    return unwrapResponse<UsuarioEntregador[]>(response);
  },
  async getBadgeSuggestion(perfilId: string) {
    const response = await api.get('/usuarios/sugestao-cracha', { params: { perfilId } });
    return unwrapResponse<UsuarioCrachaSugestao>(response);
  },
  async create(payload: UsuarioPayload) {
    const response = await api.post('/usuarios', payload);
    return unwrapResponse<Usuario>(response);
  },
  async update(id: string, payload: UsuarioPayload) {
    const response = await api.put(`/usuarios/${id}`, payload);
    return unwrapResponse<Usuario>(response);
  },
  async remove(id: string, permanente = false) {
    await api.delete(`/usuarios/${id}`, { params: { permanente } });
  }
};
