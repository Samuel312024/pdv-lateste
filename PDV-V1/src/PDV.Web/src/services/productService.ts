import { api, unwrapResponse } from './api';
import type {
  FiscalNcm,
  FiscalNcmImportacaoResultado,
  Produto,
  ProdutoCatalogoItem,
  ProdutoBaseExternaStatus,
  ProdutoCampoCustomizado,
  ProdutoCampoPadrao,
  ProdutoCatalogoExternoConsulta,
  ProdutoPesquisaPrecos,
  ProdutoImagemUpload,
  ProdutoCodigoTipo,
  ProdutoFiscalAssistenteContexto,
  ProdutoFiscalSugestaoNcm,
  PoliticaBaixaEstoqueLote,
  ProdutoPerfilFiscalPadrao
} from '../types';

export interface ProdutoCodigoAlternativoPayload {
  codigo: string;
  tipo: ProdutoCodigoTipo;
}

export interface ProdutoCampoCustomizadoPayload extends ProdutoCampoCustomizado {}

export interface ProdutoFornecedorPayload {
  clienteFornecedorId: string | null;
  codigoProdutoFornecedor: string | null;
  nomeProdutoFornecedor: string | null;
  precoCompra: number | null;
  quantidadeMinima: number | null;
  prazoEntregaDias: number | null;
  ultimaCompraEm: string | null;
  ultimoPrecoPago: number | null;
  fornecedorPrincipal: boolean;
  ativo: boolean;
}

export interface ProdutoCampoPadraoPayload {
  chave: string;
  valorPadrao: string | null;
}

export interface ProdutoFiscalSugestaoNcmPayload {
  ncm: string | null;
  descricaoNcm?: string | null;
  cest?: string | null;
  perfilFiscalPadrao?: ProdutoPerfilFiscalPadrao | null;
  origemFiscal?: string | null;
  beneficioFiscalCodigo?: string | null;
  codigoAnp?: string | null;
  unidadeMedida?: string | null;
  unidadeTributavel?: string | null;
  exTipi?: string | null;
}

export interface FiscalNcmCadastroRapidoPayload {
  codigo: string;
  descricao?: string | null;
  cestPadraoCodigo?: string | null;
  aliquotaIbpt?: number | null;
  sujeitoSt?: boolean | null;
}

export interface ProdutoPayload {
  categoriaId: string | null;
  clienteFornecedorId: string | null;
  codigoBarras: string | null;
  tipoCodigoPrincipal: ProdutoCodigoTipo | null;
  nome: string;
  descricao: string | null;
  marca: string | null;
  ncm: string | null;
  cest: string | null;
  origemFiscal: string | null;
  perfilFiscalPadrao: ProdutoPerfilFiscalPadrao | null;
  cfopVendaPadrao: string | null;
  cfopVendaInterestadual: string | null;
  cfopCompraPadrao: string | null;
  cfopCompraInterestadual: string | null;
  csosn: string | null;
  cstIcms: string | null;
  cstPis: string | null;
  cstCofins: string | null;
  beneficioFiscalCodigo: string | null;
  codigoAnp: string | null;
  unidadeTributavel: string | null;
  exTipi: string | null;
  aliquotaIcms: number | null;
  aliquotaIpi: number | null;
  aliquotaPis: number | null;
  aliquotaCofins: number | null;
  imagemUrl: string | null;
  catalogoResumo: string | null;
  destaqueCatalogoComprador: boolean;
  precoPromocional: number | null;
  promocaoTitulo: string | null;
  promocaoInicioUtc: string | null;
  promocaoFimUtc: string | null;
  codigoProdutoFornecedor: string | null;
  ultimaNotaFiscalCompra: string | null;
  precoVenda: number;
  precoCusto: number;
  estoqueAtual: number;
  estoqueMinimo: number;
  unidadeMedida: string;
  ativo: boolean;
  controlaEstoque: boolean;
  controlaLote: boolean;
  politicaBaixaLote: PoliticaBaixaEstoqueLote | null;
  codigosAlternativos: ProdutoCodigoAlternativoPayload[];
  camposCustomizados: ProdutoCampoCustomizadoPayload[];
  fornecedores: ProdutoFornecedorPayload[];
  justificativaFiscalManual?: string | null;
  confirmaPisCofinsDiferentes?: boolean;
}

export const productService = {
  async getFiscalAssistente() {
    const response = await api.get('/produtos/fiscal/assistente');
    return unwrapResponse<ProdutoFiscalAssistenteContexto>(response);
  },
  async searchFiscalNcms(termo?: string) {
    const response = await api.get('/produtos/fiscal/ncms', { params: { termo } });
    return unwrapResponse<FiscalNcm[]>(response);
  },
  async quickCreateFiscalNcm(payload: FiscalNcmCadastroRapidoPayload) {
    const response = await api.post('/produtos/fiscal/ncms/cadastro-rapido', payload);
    return unwrapResponse<FiscalNcm>(response);
  },
  async importFiscalNcmTable() {
    const response = await api.post('/fiscal/ncm/importar');
    return unwrapResponse<FiscalNcmImportacaoResultado>(response);
  },
  async getFiscalSuggestionByNcm(params: ProdutoFiscalSugestaoNcmPayload) {
    const response = await api.get('/produtos/fiscal/sugestao-ncm', { params });
    return unwrapResponse<ProdutoFiscalSugestaoNcm>(response);
  },
  async list(termo?: string, somenteAtivos?: boolean) {
    const response = await api.get('/produtos', {
      params: {
        termo,
        somenteAtivos
      }
    });
    return unwrapResponse<Produto[]>(response);
  },
  async listCatalog(termo?: string, somenteDisponiveis = false, visaoComprador = false) {
    const response = await api.get('/produtos/catalogo', {
      params: {
        termo,
        somenteDisponiveis: somenteDisponiveis || undefined,
        visaoComprador: visaoComprador || undefined
      }
    });
    return unwrapResponse<ProdutoCatalogoItem[]>(response);
  },
  async search(termo?: string) {
    const response = await api.get('/produtos/buscar', { params: { termo } });
    return unwrapResponse<Produto[]>(response);
  },
  async getByBarcode(codigo: string, incluirInativos = false) {
    const response = await api.get(`/produtos/codigo-barras/${codigo}`, {
      params: incluirInativos ? { incluirInativos: true } : undefined
    });
    return unwrapResponse<Produto>(response);
  },
  async getExternalCatalogStatus() {
    const response = await api.get('/produtos/base-externa/status');
    return unwrapResponse<ProdutoBaseExternaStatus>(response);
  },
  async lookupByGtin(gtin: string) {
    const response = await api.get(`/produtos/base-externa/gtin/${gtin}`);
    return unwrapResponse<ProdutoCatalogoExternoConsulta>(response);
  },
  async lookupByDescription(termo: string) {
    const response = await api.get('/produtos/base-externa/busca', {
      params: { termo }
    });
    return unwrapResponse<ProdutoCatalogoExternoConsulta>(response);
  },
  async compareExternalPrices(termo: string) {
    const response = await api.get('/produtos/base-externa/comparativo', {
      params: { termo }
    });
    return unwrapResponse<ProdutoPesquisaPrecos>(response);
  },
  async uploadProductImage(arquivo: File, termoBusca?: string | null) {
    const formData = new FormData();
    formData.append('arquivo', arquivo);
    if (termoBusca?.trim()) {
      formData.append('termoBusca', termoBusca.trim());
    }

    const response = await api.post('/produtos/imagem-upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return unwrapResponse<ProdutoImagemUpload>(response);
  },
  async listFieldTemplates() {
    const response = await api.get('/produtos/campos-padrao');
    return unwrapResponse<ProdutoCampoPadrao[]>(response);
  },
  async saveFieldTemplates(payload: ProdutoCampoPadraoPayload[]) {
    const response = await api.put('/produtos/campos-padrao', payload);
    return unwrapResponse<ProdutoCampoPadrao[]>(response);
  },
  async create(payload: ProdutoPayload) {
    const response = await api.post('/produtos', payload);
    return unwrapResponse<Produto>(response);
  },
  async update(id: string, payload: ProdutoPayload) {
    const response = await api.put(`/produtos/${id}`, payload);
    return unwrapResponse<Produto>(response);
  },
  async remove(id: string, permanente = false) {
    await api.delete(`/produtos/${id}`, { params: { permanente } });
  }
};
