import { api, unwrapResponse } from './api';
import type { EmpresaFiscal } from '../types';

export interface EmpresaFiscalPayload {
  nome: string;
  nomeFantasia: string | null;
  cnpj: string | null;
  inscricaoEstadual: string | null;
  inscricaoEstadualIsento: boolean;
  inscricaoMunicipal: string | null;
  cnaePrincipal: string | null;
  telefone: string | null;
  emailFiscal: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  codigoMunicipioIbge: string | null;
  certificadoDigitalCaminho: string | null;
  senhaCertificadoDigital: string | null;
  regimeTributario: EmpresaFiscal['regimeTributario'];
  ambienteNfe: EmpresaFiscal['ambienteNfe'];
  providerFiscal: EmpresaFiscal['providerFiscal'];
  usaIntegracaoDiretaSefaz: boolean;
  apiFiscalClientId: string | null;
  apiFiscalClientSecret: string | null;
  urlApiFiscal: string | null;
  tokenApiFiscal: string | null;
  cobrancaDigitalProvider: EmpresaFiscal['cobrancaDigitalProvider'];
  ambienteCobrancaDigital: EmpresaFiscal['ambienteCobrancaDigital'];
  apiCobrancaClientId: string | null;
  apiCobrancaClientSecret: string | null;
  urlApiCobranca: string | null;
  diasVencimentoCobranca: number;
  serieNfe: number;
  proximoNumeroNfe: number;
}

export interface EmpresaFiscalCertificadoUpload {
  caminho: string;
  nomeArquivo: string;
  tamanhoBytes: number;
}

export interface EmpresaFiscalCertificadoTestePayload {
  caminho: string | null;
  senha: string | null;
}

export interface EmpresaFiscalCertificadoTeste {
  valido: boolean;
  mensagem: string;
  caminho: string | null;
  validoAte: string | null;
  provavelmenteCompativelIcpBrasilA1: boolean;
  certificadoDesenvolvimento: boolean;
  cnpjCertificado: string | null;
  cnpjConfereComEmpresa: boolean | null;
  diagnosticoCompatibilidade: string | null;
}

export interface EmpresaFiscalSefazDiagnostico {
  etapa: string;
  resumo: string;
  causaProvavel: string | null;
  tlsHandshakeSucesso: boolean;
  tlsProtocol: string | null;
  cipherSuite: string | null;
  httpStatusCode: number | null;
  respostaHtml: boolean;
  certificadoServidorAssunto: string | null;
  certificadoServidorEmissor: string | null;
  certificadoServidorThumbprint: string | null;
  certificadoServidorValidoAte: string | null;
  errosCertificadoServidor: string | null;
  certificadoClienteAssunto: string | null;
  certificadoClienteThumbprint: string | null;
  certificadoClienteValidoAte: string | null;
  usuarioExecucaoWindows: string | null;
  modoArmazenamentoChave: string | null;
  detalheTecnico: string | null;
}

export interface EmpresaFiscalSefazStatus {
  disponivel: boolean;
  codigoStatus: number | null;
  mensagem: string;
  providerFiscal: string;
  usaIntegracaoDiretaSefaz: boolean;
  ambiente: string;
  uf: string;
  url: string;
  dataRecebimento: string | null;
  consultadoEmUtc: string;
  diagnostico: EmpresaFiscalSefazDiagnostico | null;
}

export const companyService = {
  async getFiscal() {
    const response = await api.get('/empresa/fiscal');
    return unwrapResponse<EmpresaFiscal>(response);
  },
  async updateFiscal(payload: EmpresaFiscalPayload) {
    const response = await api.put('/empresa/fiscal', payload);
    return unwrapResponse<EmpresaFiscal>(response);
  },
  async uploadFiscalCertificate(arquivo: File) {
    const formData = new FormData();
    formData.append('arquivo', arquivo);

    const response = await api.post('/empresa/fiscal/certificado', formData);

    return unwrapResponse<EmpresaFiscalCertificadoUpload>(response);
  },
  async testFiscalCertificate(payload: EmpresaFiscalCertificadoTestePayload) {
    const response = await api.post('/empresa/fiscal/certificado/teste', payload);
    return unwrapResponse<EmpresaFiscalCertificadoTeste>(response);
  },
  async testSefazStatus() {
    const response = await api.post('/empresa/fiscal/sefaz/status');
    return unwrapResponse<EmpresaFiscalSefazStatus>(response);
  }
};
