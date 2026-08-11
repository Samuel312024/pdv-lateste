export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  errors: string[];
}

export interface UsuarioLogado {
  usuarioId: string;
  empresaId: string;
  clienteId: string | null;
  clienteNome: string | null;
  nome: string;
  email: string;
  perfil: string;
  permissoes: string[];
  isMaster: boolean;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  usuario: UsuarioLogado;
}

export interface PerfilOpcao {
  perfilId: string;
  codigo: string;
  nome: string;
  permissoes: string[];
}

export interface PermissaoOpcao {
  codigo: string;
  nome: string;
  grupo: string;
  descricao: string;
}

export type EmpresaRegimeTributario =
  | 'SimplesNacional'
  | 'SimplesExcessoSublimite'
  | 'RegimeNormal'
  | 'LucroPresumido'
  | 'LucroReal';
export type AmbienteFiscal = 'Homologacao' | 'Producao';
export type FiscalProvider = 'SefazDirect' | 'NuvemFiscal' | 'FocusNFe' | 'PlugNotas';
export type CobrancaDigitalProvider = 'Nenhum' | 'Efi';
export type PoliticaBaixaEstoqueLote = 'FIFO' | 'FEFO';
export type MovimentacaoEstoqueTipo =
  | 'Entrada'
  | 'Saida'
  | 'Ajuste'
  | 'CancelamentoVenda'
  | 'Reserva'
  | 'LiberacaoReserva'
  | 'Transferencia';
export type MovimentacaoEstoqueOrigem =
  | 'Venda'
  | 'Compra'
  | 'AjusteManual'
  | 'Cancelamento'
  | 'ReservaManual'
  | 'TransferenciaInterna'
  | 'ExpedicaoManual'
  | 'InventarioRotativo';
export type TransferenciaEstoqueStatus = 'Pendente' | 'Concluida' | 'Cancelada';

export interface FiscalCatalogoOpcao {
  codigo: string;
  descricao: string;
  detalhe: string | null;
  exigeCest: boolean;
  exigeContexto: boolean;
}

export interface FiscalNcm {
  codigo: string;
  descricao: string;
  cestPadraoCodigo: string | null;
  aliquotaIbpt: number | null;
  sujeitoSt: boolean;
  cadastroAutomatico: boolean;
  observacaoCadastro: string | null;
}

export interface EmpresaFiscal {
  empresaId: string;
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
  certificadoDigitalConfigurado: boolean;
  certificadoDigitalValidoAte: string | null;
  certificadoDigitalErroValidacao: string | null;
  regimeTributario: EmpresaRegimeTributario;
  ambienteNfe: AmbienteFiscal;
  providerFiscal: FiscalProvider;
  usaIntegracaoDiretaSefaz: boolean;
  apiFiscalClientId: string | null;
  apiFiscalClientSecretConfigurado: boolean;
  urlApiFiscal: string | null;
  tokenApiFiscalConfigurado: boolean;
  cobrancaDigitalProvider: CobrancaDigitalProvider;
  ambienteCobrancaDigital: AmbienteFiscal;
  apiCobrancaClientId: string | null;
  apiCobrancaClientSecretConfigurado: boolean;
  urlApiCobranca: string | null;
  diasVencimentoCobranca: number;
  cobrancaDigitalPronta: boolean;
  cobrancaDigitalPendencias: string[];
  serieNfe: number;
  proximoNumeroNfe: number;
  prontaParaNfe: boolean;
  pendenciasEmissao: string[];
}

export interface Usuario {
  usuarioId: string;
  empresaId: string;
  empresaNomeExibicao: string;
  perfilId: string;
  clienteId: string | null;
  clienteNome: string | null;
  perfilCodigo: string;
  perfilNome: string;
  nome: string;
  email: string;
  codigoBarrasCracha: string | null;
  ativo: boolean;
  isMaster: boolean;
  usarPermissoesCustomizadas: boolean;
  permissoesCustomizadas: string[];
  permissoesEfetivas: string[];
  dataCadastro: string;
}

export interface UsuarioClienteVinculo {
  clienteId: string;
  nome: string;
  documento: string | null;
  telefone: string | null;
  cidade: string | null;
  uf: string | null;
  ativo: boolean;
}

export interface UsuarioEntregador {
  usuarioId: string;
  nome: string;
  email: string;
  perfilCodigo: string;
  perfilNome: string;
  ativo: boolean;
}

export interface Produto {
  produtoId: string;
  empresaId: string;
  categoriaId: string | null;
  clienteFornecedorId: string | null;
  clienteFornecedorNome: string | null;
  clienteFornecedorDocumento: string | null;
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
  fornecedores: ProdutoFornecedor[];
  codigos: ProdutoCodigo[];
  camposCustomizados: ProdutoCampoCustomizado[];
  dataCadastro: string;
  estoqueBaixo: boolean;
}

export interface ProdutoCatalogoItem {
  produtoId: string;
  empresaId: string;
  categoriaId: string | null;
  categoriaNome: string | null;
  codigoBarras: string | null;
  nome: string;
  descricao: string | null;
  marca: string | null;
  imagemUrl: string | null;
  precoVenda: number;
  precoOriginal: number | null;
  promocaoAtiva: boolean;
  catalogoResumo: string | null;
  destaqueCatalogoComprador: boolean;
  precoPromocional: number | null;
  promocaoTitulo: string | null;
  percentualDesconto: number | null;
  unidadeMedida: string;
  controlaEstoque: boolean;
  estoqueAtual: number;
  estoqueMinimo: number;
  estoqueBaixo: boolean;
  disponivelParaVenda: boolean;
}

export interface EstoqueLote {
  estoqueLoteId: string;
  produtoId: string;
  produtoLoteId: string;
  codigoLote: string;
  quantidadeEntrada: number;
  quantidadeDisponivel: number;
  dataEntrada: string;
  dataFabricacao: string | null;
  dataValidade: string | null;
  precoCustoUnitario: number | null;
  documentoReferencia: string | null;
  observacao: string | null;
  vencido: boolean;
  proximoVencimento: boolean;
}

export interface EstoqueLoteAlerta {
  estoqueLoteId: string;
  produtoId: string;
  produtoNome: string;
  unidadeMedida: string;
  codigoLote: string;
  quantidadeDisponivel: number;
  dataValidade: string;
  diasParaVencer: number;
  vencido: boolean;
  proximoVencimento: boolean;
}

export interface MovimentacaoEstoque {
  movimentacaoEstoqueId: string;
  produtoId: string;
  produtoNome: string;
  tipo: MovimentacaoEstoqueTipo;
  quantidade: number;
  estoqueAnterior: number;
  estoqueAtual: number;
  estoqueReservadoAtual: number;
  origem: MovimentacaoEstoqueOrigem;
  referenciaId: string | null;
  dataMovimentacao: string;
  usuarioId: string;
  usuarioNome: string | null;
  depositoEstoqueId: string | null;
  depositoNome: string | null;
  depositoOrigemId: string | null;
  depositoOrigemNome: string | null;
  depositoDestinoId: string | null;
  depositoDestinoNome: string | null;
  observacao: string | null;
}

export interface DepositoEstoqueResumo {
  depositoEstoqueId: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  padrao: boolean;
  permiteVendaDireta: boolean;
  ativo: boolean;
  totalSkus: number;
  quantidadeDisponivelTotal: number;
  quantidadeReservadaTotal: number;
  quantidadeFisicaTotal: number;
  valorDisponivelCusto: number;
  valorReservadoCusto: number;
}

export interface EstoqueDepositoSaldo {
  estoqueDepositoId: string | null;
  depositoEstoqueId: string;
  depositoCodigo: string;
  depositoNome: string;
  depositoDescricao: string | null;
  depositoPadrao: boolean;
  permiteVendaDireta: boolean;
  quantidadeDisponivel: number;
  quantidadeReservada: number;
  quantidadeFisica: number;
}

export interface PosicaoEstoqueProduto {
  produtoId: string;
  produtoNome: string;
  unidadeMedida: string;
  quantidadeDisponivelTotal: number;
  quantidadeReservadaTotal: number;
  quantidadeFisicaTotal: number;
  depositos: EstoqueDepositoSaldo[];
}

export interface TransferenciaEstoque {
  transferenciaEstoqueId: string;
  produtoId: string;
  produtoNome: string;
  depositoOrigemId: string;
  depositoOrigemNome: string;
  depositoDestinoId: string;
  depositoDestinoNome: string;
  quantidade: number;
  status: TransferenciaEstoqueStatus;
  documentoReferencia: string | null;
  observacao: string | null;
  dataTransferencia: string;
  usuarioId: string;
  usuarioNome: string | null;
}

export interface ConferenciaEstoqueResultado {
  produtoId: string;
  produtoNome: string;
  unidadeMedida: string;
  depositoEstoqueId: string;
  depositoNome: string;
  quantidadeSistema: number;
  quantidadeContada: number;
  divergencia: number;
  ajusteAplicado: boolean;
  movimentacao: MovimentacaoEstoque | null;
  mensagem: string;
}

export interface ProdutoCodigo {
  produtoCodigoId: string;
  codigo: string;
  tipo: ProdutoCodigoTipo;
  principal: boolean;
  ativo: boolean;
}

export interface ProdutoCampoCustomizado {
  chave: string;
  valor: string | null;
}

export interface ProdutoFornecedor {
  produtoFornecedorId: string;
  produtoId: string;
  clienteFornecedorId: string;
  clienteFornecedorNome: string;
  clienteFornecedorDocumento: string | null;
  codigoProdutoFornecedor: string | null;
  nomeProdutoFornecedor: string | null;
  precoCompra: number | null;
  quantidadeMinima: number | null;
  prazoEntregaDias: number | null;
  ultimaCompraEm: string | null;
  ultimoPrecoPago: number | null;
  fornecedorPrincipal: boolean;
  ativo: boolean;
  menorPreco: boolean;
  dataCadastro: string;
}

export interface ProdutoCampoPadrao {
  produtoCampoPadraoId: string;
  empresaId: string;
  chave: string;
  valorPadrao: string | null;
  ordem: number;
  dataCadastro: string;
}

export interface Cliente {
  clienteId: string;
  empresaId: string;
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
  dataCadastro: string;
}

export interface ClientePerfilCompradorResponse {
  cliente: Cliente;
  sessaoAtualizada: LoginResponse;
}

export interface Transportadora {
  transportadoraId: string;
  empresaId: string;
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
  dataCadastro: string;
}

export interface ClienteHistoricoResumo {
  totalComprado: number;
  quantidadeVendas: number;
  ticketMedio: number;
  ultimaCompra: string | null;
  vendasCanceladas: number;
}

export interface ClienteHistoricoVenda {
  vendaId: string;
  numeroVenda: string;
  dataVenda: string;
  status: VendaStatus;
  total: number;
  quantidadeItens: number;
  formasPagamento: string;
}

export interface ClienteHistoricoProdutoFornecedor {
  produtoId: string;
  nome: string;
  codigoBarras: string | null;
  codigoProdutoFornecedor: string | null;
  ultimaNotaFiscalCompra: string | null;
  precoCusto: number;
  estoqueAtual: number;
  ativo: boolean;
}

export interface ClienteHistorico {
  clienteId: string;
  nome: string;
  resumo: ClienteHistoricoResumo;
  vendasRecentes: ClienteHistoricoVenda[];
  produtosRelacionados: ClienteHistoricoProdutoFornecedor[];
}

export interface Caixa {
  caixaId: string;
  empresaId: string;
  usuarioId: string;
  dataAbertura: string;
  dataFechamento: string | null;
  valorInicial: number;
  valorDinheiro: number;
  valorCartaoCredito: number;
  valorCartaoDebito: number;
  valorPix: number;
  valorVoucher: number;
  valorTotalVendas: number;
  valorSangria: number;
  valorSuprimento: number;
  diferencaInformada: number | null;
  valorEsperadoEmDinheiro: number;
  status: string;
}

export interface CheckoutDisponibilidade {
  disponivel: boolean;
  mensagem: string;
}

export type FormaPagamento = 'Dinheiro' | 'CartaoCredito' | 'CartaoDebito' | 'Pix' | 'Voucher';
export type PagamentoCapturaModo = 'ManualAssistido' | 'Simulado' | 'Integrado';
export type PagamentoStatusTransacao = 'Pendente' | 'Aprovada' | 'Negada' | 'Cancelada' | 'Simulada';

export interface LiberacaoGerentePayload {
  acao: string;
  codigoBarrasCracha: string;
  senha: string;
  observacao: string | null;
}
export type AtendimentoPedidoTipo = 'Retirada' | 'Entrega';
export type PedidoStatus = 'Recebido' | 'EmPreparacao' | 'ProntoParaRetirada' | 'SaiuParaEntrega' | 'Entregue' | 'Cancelado';
export type ScannerTipoLeitura = 'Auto' | 'CodigoBarras' | 'QrCode';
export type ProdutoCodigoTipo = 'Ean' | 'Qr' | 'Interno';
export type ProdutoPerfilFiscalPadrao =
  | 'RevendaMercadoria'
  | 'ProducaoEstabelecimento'
  | 'Servico'
  | 'Industrializacao'
  | 'Bonificacao'
  | 'Devolucao'
  | 'Transferencia';
export type FinanceiroTipo = 'Receber' | 'Pagar';
export type FinanceiroStatus = 'Pendente' | 'Liquidado' | 'Cancelado';
export type NotaFiscalStatus = 'Rascunho' | 'PendenteTransmissao' | 'Autorizada' | 'Rejeitada' | 'Cancelada';
export type NotaFiscalOrigem = 'Manual' | 'Pdv';
export type CobrancaDigitalOrigem = 'CheckoutVenda' | 'Financeiro';
export type CobrancaDigitalStatus = 'Pendente' | 'Paga' | 'Cancelada' | 'Expirada' | 'Falha';

export interface ProdutoBaseExternaStatus {
  disponivel: boolean;
  mensagem: string;
  provedor: string | null;
}

export interface ProdutoCatalogoExternoConsulta {
  encontrado: boolean;
  gtin: string;
  nome: string | null;
  descricao: string | null;
  marca: string | null;
  ncm: string | null;
  imagemUrl: string | null;
  precoMedio: number | null;
  unidadeSugerida: string | null;
  provedor: string;
  mensagem: string;
  fonteUrl: string | null;
  buscaUrl: string | null;
}

export interface ProdutoPesquisaPrecoFonte {
  provedor: string;
  codigo: string | null;
  nome: string;
  descricao: string | null;
  marca: string | null;
  ncm: string | null;
  imagemUrl: string | null;
  preco: number | null;
  unidadeSugerida: string;
  relevancia: number;
  fonteUrl: string | null;
  buscaUrl: string | null;
}

export interface ProdutoPesquisaPrecos {
  termo: string;
  mensagem: string;
  imagemUrl: string | null;
  menorPreco: number | null;
  maiorPreco: number | null;
  precoMedio: number | null;
  fonteMenorPreco: string | null;
  fontes: ProdutoPesquisaPrecoFonte[];
}

export interface ProdutoImagemUpload {
  imagemUrl: string;
  nomeArquivoOriginal: string;
  tamanhoBytes: number;
  termoBusca: string | null;
  termoBuscaOrigem: string | null;
  diagnosticoReconhecimento: string | null;
}

export interface ProdutoFiscalAssistenteContexto {
  regimeTributarioEmpresa: EmpresaRegimeTributario;
  usuarioAdministrador: boolean;
  perfisFiscais: FiscalCatalogoOpcao[];
  origensFiscais: FiscalCatalogoOpcao[];
  cfops: FiscalCatalogoOpcao[];
  csosns: FiscalCatalogoOpcao[];
  cstIcms: FiscalCatalogoOpcao[];
  cstPisCofins: FiscalCatalogoOpcao[];
  beneficiosFiscais: FiscalCatalogoOpcao[];
}

export interface ProdutoRegraFiscalAplicada {
  campo: string;
  codigo: string | null;
  descricao: string;
  origemRegra: string;
  ordem: number;
  dataAplicacao: string;
}

export interface ProdutoFiscalSugestaoNcm {
  ncm: string | null;
  descricaoNcm: string | null;
  ncmCriadoAutomaticamente: boolean;
  mensagemCadastroNcm: string | null;
  sujeitoSt: boolean;
  requerRevisaoSt: boolean;
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
  fiscalCompleto: boolean;
  pendencias: string[];
  regrasAplicadas: ProdutoRegraFiscalAplicada[];
}

export interface FiscalNcmImportacaoResultado {
  nomeArquivo: string;
  totalLinhas: number;
  criados: number;
  atualizados: number;
  ignorados: number;
  invalidos: number;
  avisos: string[];
}

export interface DashboardResumo {
  totalVendidoHoje: number;
  totalVendidoMes: number;
  numeroVendasHoje: number;
  ticketMedioMes: number;
  produtosEstoqueBaixo: number;
  vendasCanceladasMes: number;
}

export interface DashboardVendasPorDia {
  dia: string;
  total: number;
}

export interface DashboardProdutoMaisVendido {
  produtoId: string;
  produtoNome: string;
  quantidade: number;
}

export interface DashboardVendasPorPagamento {
  formaPagamento: FormaPagamento;
  total: number;
}

export interface MonitorOperacionalResumo {
  pdvsAbertos: number;
  operadoresOnline: number;
  vendasNosPdvsAbertos: number;
  itensVendidosNosPdvsAbertos: number;
  totalVendidoNosPdvsAbertos: number;
  ticketMedioNosPdvsAbertos: number;
  ultimaAtualizacaoUtc: string;
}

export interface MonitorOperacionalPdv {
  pdvNumero: number;
  caixaId: string;
  usuarioId: string;
  usuarioNome: string;
  usuarioEmail: string;
  perfil: string;
  usuarioAtivo: boolean;
  usuarioSessaoAtiva: boolean;
  usuarioUltimaPresencaUtc: string | null;
  dataAbertura: string;
  tempoAbertoMinutos: number;
  quantidadeVendas: number;
  quantidadeItens: number;
  valorTotalVendas: number;
  ticketMedio: number;
  ultimaVendaEm: string | null;
  valorDinheiro: number;
  valorPix: number;
  valorCartaoDebito: number;
  valorCartaoCredito: number;
  valorVoucher: number;
}

export interface MonitorOperacionalVenda {
  vendaId: string;
  caixaId: string;
  pdvNumero: number;
  numeroVenda: string;
  usuarioNome: string;
  dataVenda: string;
  quantidadeItens: number;
  total: number;
  formasPagamento: string;
}

export interface MonitorOperacionalSnapshot {
  resumo: MonitorOperacionalResumo;
  pdvs: MonitorOperacionalPdv[];
  vendasRecentes: MonitorOperacionalVenda[];
}

export type VendaStatus = 'Aberta' | 'Finalizada' | 'Cancelada';

export interface NotaFiscalVendaDisponivel {
  vendaId: string;
  numeroVenda: string;
  dataVenda: string;
  destinatarioNome: string;
  destinatarioDocumento: string | null;
  total: number;
  quantidadeItens: number;
}

export interface NotaFiscalResumo {
  notaFiscalId: string;
  numero: number;
  serie: number;
  ambiente: AmbienteFiscal;
  status: NotaFiscalStatus;
  origem: NotaFiscalOrigem;
  numeroVenda: string | null;
  destinatarioNome: string;
  destinatarioDocumento: string | null;
  dataEmissao: string;
  valorTotal: number;
  prontaParaTransmissao: boolean;
  quantidadePendencias: number;
  chaveAcesso: string | null;
  codigoStatusSefaz: number | null;
  mensagemStatusSefaz: string | null;
  protocoloAutorizacao: string | null;
  dataAutorizacao: string | null;
}

export interface NotaFiscalEmitenteSnapshot {
  razaoSocial: string;
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
  regimeTributario: EmpresaRegimeTributario;
  ambienteNfe: AmbienteFiscal;
}

export interface NotaFiscalDestinatarioSnapshot {
  nome: string;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}

export interface NotaFiscalItem {
  notaFiscalItemId: string;
  produtoId: string;
  produtoNome: string;
  unidadeMedida: string;
  ncm: string | null;
  cest: string | null;
  origemFiscal: string | null;
  cfop: string | null;
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
  quantidade: number;
  valorUnitario: number;
  desconto: number;
  total: number;
}

export interface NotaFiscal {
  notaFiscalId: string;
  empresaId: string;
  vendaId: string | null;
  clienteId: string | null;
  usuarioId: string;
  numero: number;
  serie: number;
  ambiente: AmbienteFiscal;
  status: NotaFiscalStatus;
  origem: NotaFiscalOrigem;
  numeroVenda: string | null;
  dataEmissao: string;
  valorProdutos: number;
  valorDesconto: number;
  valorTotal: number;
  prontaParaTransmissao: boolean;
  chaveAcesso: string | null;
  codigoStatusSefaz: number | null;
  mensagemStatusSefaz: string | null;
  protocoloAutorizacao: string | null;
  dataTransmissao: string | null;
  dataAutorizacao: string | null;
  xmlEnvio: string | null;
  xmlRetorno: string | null;
  observacoes: string | null;
  pendencias: string[];
  emitente: NotaFiscalEmitenteSnapshot;
  destinatario: NotaFiscalDestinatarioSnapshot;
  itens: NotaFiscalItem[];
}

export interface RelatorioFiltroOpcao {
  id: string;
  nome: string;
}

export interface RelatorioFiltrosOpcoes {
  usuarios: RelatorioFiltroOpcao[];
  clientes: RelatorioFiltroOpcao[];
  produtos: RelatorioFiltroOpcao[];
}

export interface RelatorioResumo {
  totalVendido: number;
  quantidadeVendas: number;
  ticketMedio: number;
  vendasCanceladas: number;
  totalDinheiro: number;
  totalPix: number;
  totalCartaoCredito: number;
  totalCartaoDebito: number;
  totalVoucher: number;
}

export interface RelatorioVendaLinha {
  vendaId: string;
  numeroVenda: string;
  dataVenda: string;
  status: VendaStatus;
  usuarioId: string;
  usuarioNome: string;
  clienteId: string | null;
  clienteNome: string | null;
  quantidadeItens: number;
  subtotal: number;
  descontoTotal: number;
  total: number;
  formasPagamento: string;
  valorDinheiro: number;
  valorPix: number;
  valorCartaoCredito: number;
  valorCartaoDebito: number;
  valorVoucher: number;
  trocoTotal: number;
}

export interface RelatorioCaixa {
  caixaId: string;
  usuarioId: string;
  usuarioNome: string;
  dataAbertura: string;
  dataFechamento: string | null;
  status: string;
  valorInicial: number;
  valorTotalVendas: number;
  valorDinheiro: number;
  valorCartaoCredito: number;
  valorCartaoDebito: number;
  valorPix: number;
  valorVoucher: number;
  valorSangria: number;
  valorSuprimento: number;
  diferencaInformada: number | null;
  valorEsperadoEmDinheiro: number;
}

export interface RelatorioEstoqueBaixo {
  produtoId: string;
  nome: string;
  codigoBarras: string | null;
  estoqueAtual: number;
  estoqueMinimo: number;
  unidadeMedida: string;
}

export interface FinalizarVendaItemRequest {
  produtoId: string;
  quantidade: number;
  desconto: number;
}

export interface FinalizarVendaPagamentoRequest {
  formaPagamento: FormaPagamento;
  valorPago: number;
  capturaModo: PagamentoCapturaModo | null;
  provedorOperacao: string | null;
  referenciaTransacao: string | null;
  codigoAutorizacao: string | null;
  bandeiraCartao: string | null;
  ultimosDigitosCartao: string | null;
  parcelas: number | null;
  observacaoOperacao: string | null;
}

export interface FinalizarPedidoRequest {
  atendimentoTipo: AtendimentoPedidoTipo;
  contatoNome: string | null;
  contatoTelefone: string | null;
  observacaoPedido: string | null;
}

export interface VendaItem {
  vendaItemId: string;
  produtoId: string;
  produtoNome: string;
  quantidade: number;
  valorUnitario: number;
  desconto: number;
  total: number;
}

export interface VendaPagamento {
  vendaPagamentoId: string;
  formaPagamento: FormaPagamento;
  capturaModo: PagamentoCapturaModo;
  statusTransacao: PagamentoStatusTransacao;
  provedorOperacao: string | null;
  referenciaTransacao: string | null;
  codigoAutorizacao: string | null;
  bandeiraCartao: string | null;
  ultimosDigitosCartao: string | null;
  parcelas: number | null;
  observacaoOperacao: string | null;
  dataCaptura: string | null;
  valorPago: number;
  troco: number;
}

export interface Venda {
  vendaId: string;
  empresaId: string;
  caixaId: string;
  usuarioId: string;
  clienteId: string | null;
  clienteNome: string | null;
  numeroVenda: string;
  dataVenda: string;
  subtotal: number;
  descontoTotal: number;
  total: number;
  status: VendaStatus;
  ehPedido: boolean;
  atendimentoTipo: AtendimentoPedidoTipo | null;
  pedidoStatus: PedidoStatus | null;
  codigoAcompanhamento: string | null;
  contatoNome: string | null;
  contatoTelefone: string | null;
  observacaoPedido: string | null;
  enderecoEntregaResumo: string | null;
  dataUltimaAtualizacaoPedido: string | null;
  motivoCancelamento: string | null;
  itens: VendaItem[];
  pagamentos: VendaPagamento[];
}

export interface FinalizarVendaResponse {
  vendaId: string;
  numeroVenda: string;
  total: number;
  troco: number;
  ehPedido: boolean;
  codigoAcompanhamento: string | null;
  pedidoStatus: PedidoStatus | null;
  notaFiscalId: string | null;
  notaFiscalReferencia: string | null;
  notaFiscalStatus: NotaFiscalStatus | null;
  notaFiscalProntaParaTransmissao: boolean | null;
  notaFiscalPendencias: string[] | null;
}

export interface PedidoOcorrencia {
  pedidoOcorrenciaId: string;
  status: PedidoStatus;
  titulo: string;
  descricao: string | null;
  visivelParaCliente: boolean;
  dataOcorrencia: string;
  usuarioId: string | null;
  usuarioNome: string | null;
}

export interface PedidoEntregaLocalizacao {
  latitude: number;
  longitude: number;
  precisaoMetros: number | null;
  velocidadeKmh: number | null;
  direcaoGraus: number | null;
  dataCaptura: string;
  linkMapa: string;
}

export interface PedidoEntrega {
  transportadoraId: string | null;
  transportadoraNome: string | null;
  transportadoraCorTemaHex: string | null;
  entregadorUsuarioId: string | null;
  entregadorUsuarioNome: string | null;
  nomeEntregador: string | null;
  telefoneEntregador: string | null;
  compartilhamentoAtivo: boolean;
  ultimaAtualizacaoGps: string | null;
  linkPainelEntregador: string | null;
  localizacaoAtual: PedidoEntregaLocalizacao | null;
}

export interface PedidoResumo {
  vendaId: string;
  numeroVenda: string;
  codigoAcompanhamento: string;
  statusVenda: VendaStatus;
  pedidoStatus: PedidoStatus;
  atendimentoTipo: AtendimentoPedidoTipo;
  clienteNome: string;
  clienteTelefone: string | null;
  total: number;
  quantidadeItens: number;
  dataVenda: string;
  dataUltimaAtualizacao: string | null;
  enderecoEntregaResumo: string | null;
  observacaoPedido: string | null;
  entrega: PedidoEntrega | null;
}

export interface PedidoDetalhe {
  vendaId: string;
  clienteId: string | null;
  numeroVenda: string;
  codigoAcompanhamento: string;
  statusVenda: VendaStatus;
  pedidoStatus: PedidoStatus;
  atendimentoTipo: AtendimentoPedidoTipo;
  clienteNome: string;
  clienteDocumento: string | null;
  clienteTelefone: string | null;
  subtotal: number;
  descontoTotal: number;
  total: number;
  dataVenda: string;
  dataUltimaAtualizacao: string | null;
  observacaoPedido: string | null;
  enderecoEntregaResumo: string | null;
  entrega: PedidoEntrega | null;
  itens: VendaItem[];
  pagamentos: VendaPagamento[];
  ocorrencias: PedidoOcorrencia[];
}

export interface AtualizarPedidoStatusPayload {
  status: PedidoStatus;
  observacao: string | null;
}

export interface AtualizarPedidoEntregaPayload {
  transportadoraId: string | null;
  entregadorUsuarioId: string | null;
  nomeEntregador: string | null;
  telefoneEntregador: string | null;
  compartilhamentoAtivo: boolean;
}

export interface RegistrarEntregaLocalizacaoPayload {
  latitude: number;
  longitude: number;
  precisaoMetros: number | null;
  velocidadeKmh: number | null;
  direcaoGraus: number | null;
}

export interface PainelEntregaPublico {
  vendaId: string;
  codigoAcompanhamento: string;
  pedidoStatus: PedidoStatus;
  clienteNome: string;
  enderecoEntregaResumo: string | null;
  observacaoPedido: string | null;
  entrega: PedidoEntrega | null;
}

export interface PedidoRealtimeEvento {
  vendaId: string;
  clienteId: string | null;
  numeroVenda: string;
  codigoAcompanhamento: string;
  pedidoStatus: PedidoStatus;
  atualizadoEm: string;
  tipoEvento: 'Status' | 'Entrega' | 'Localizacao' | string;
  entrega: PedidoEntrega | null;
}

export interface ScannerSessaoCriada {
  sessaoId: string;
  chaveAcesso: string;
  contexto: string;
  tipoLeitura: ScannerTipoLeitura;
  expiraEmUtc: string;
  permitePdvAnonimo: boolean;
}

export interface ScannerLeitura {
  sequencia: number;
  codigo: string;
  formato: string | null;
  origem: string | null;
  dataLeituraUtc: string;
}

export interface ScannerLog {
  sequencia: number;
  tipo: string;
  mensagem: string;
  origem: string | null;
  dataEventoUtc: string;
}

export interface ScannerSessaoPublica {
  sessaoId: string;
  contexto: string;
  tipoLeitura: ScannerTipoLeitura;
  expiraEmUtc: string;
  permitePdvAnonimo: boolean;
}

export interface ScannerCodigoEscaneadoEvento {
  sessaoId: string;
  sequencia: number;
  codigoBarras: string;
  formato: string | null;
  origem: string | null;
  dataLeituraUtc: string;
}

export interface ScannerStatusConexao {
  sessaoId: string;
  contexto: string;
  tipoLeitura: ScannerTipoLeitura;
  papel: string;
  mensagem: string;
  pdvConectado: boolean;
  mobileConectado: boolean;
  conexoesPdv: number;
  conexoesMobile: number;
  dataEventoUtc: string;
}

export type ScannerRealtimeConnectionState = 'desconectado' | 'conectando' | 'conectado' | 'reconectando';

export interface FinanceiroResumo {
  entradasLiquidadas: number;
  saidasLiquidadas: number;
  saldoPeriodo: number;
  contasReceberPendentes: number;
  contasPagarPendentes: number;
  lucroBrutoVendas: number;
  lancamentosPendentes: number;
  lancamentosLiquidados: number;
}

export interface LancamentoFinanceiro {
  lancamentoFinanceiroId: string;
  empresaId: string;
  tipo: FinanceiroTipo;
  origem: string;
  status: FinanceiroStatus;
  descricao: string;
  documentoReferencia: string | null;
  vendaId: string | null;
  numeroVenda: string | null;
  clienteId: string | null;
  clienteNome: string | null;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  usuarioId: string | null;
  usuarioNome: string | null;
  caixaId: string | null;
  dataCompetencia: string;
  dataVencimento: string;
  dataLiquidacao: string | null;
  valorOriginal: number;
  valorDesconto: number;
  valorAcrescimo: number;
  valorFinal: number;
  valorCusto: number;
  observacao: string | null;
}

export interface CobrancaDigital {
  cobrancaDigitalId: string;
  empresaId: string;
  clienteId: string | null;
  clienteNome: string | null;
  vendaId: string | null;
  lancamentoFinanceiroId: string | null;
  provider: CobrancaDigitalProvider | string;
  origem: CobrancaDigitalOrigem;
  status: CobrancaDigitalStatus;
  statusExterno: string | null;
  descricao: string;
  documentoReferencia: string | null;
  identificadorInterno: string | null;
  chargeIdExterno: string | null;
  customIdExterno: string | null;
  valorOriginal: number;
  valorPago: number | null;
  dataVencimento: string;
  dataCriacaoProvider: string | null;
  dataPagamento: string | null;
  dataCriacao: string;
  dataAtualizacao: string;
  pixCopiaECola: string | null;
  pixQrCodeImageUrl: string | null;
  linhaDigitavel: string | null;
  linkCobranca: string | null;
  linkBoleto: string | null;
  linkPdf: string | null;
  observacao: string | null;
}

export type TerminalPerfilInstalacao = 'PRD' | 'HML' | 'HML_PERIFERICOS_MOCK' | 'HML_COMPLETO_MOCK';
export type TerminalPerfilImpressora = 'NAVEGADOR_PADRAO' | 'TERMICA_80MM' | 'TERMICA_58MM';
export type TerminalPerfilScanner = 'TECLADO_USB' | 'CAMERA_CELULAR' | 'HIBRIDO';
export type TerminalPerfilTeclado = 'PADRAO_PDV' | 'ABNT2' | 'TOUCH';

export interface TerminalPdv {
  terminalPdvId: string;
  empresaId: string;
  codigoTerminal: string;
  nomeTerminal: string;
  lojaNome: string | null;
  estadoUf: string | null;
  numeroPdv: number;
  perfilInstalacao: TerminalPerfilInstalacao | string;
  perfilImpressora: TerminalPerfilImpressora | string;
  perfilScanner: TerminalPerfilScanner | string;
  perfilTeclado: TerminalPerfilTeclado | string;
  impressaoAutomatica: boolean;
  observacao: string | null;
  chaveAtivacaoMascara: string;
  ativo: boolean;
  ativado: boolean;
  dispositivoIdentificador: string | null;
  nomeHost: string | null;
  versaoInstalador: string | null;
  versaoAplicativo: string | null;
  ultimoIp: string | null;
  dataCadastro: string;
  chaveGeradaEm: string;
  ativadoEm: string | null;
  ultimaSincronizacaoEm: string | null;
}

export interface TerminalPdvCriado {
  terminal: TerminalPdv;
  chaveAtivacao: string;
}

export interface TerminalPdvChaveRegenerada {
  terminalPdvId: string;
  codigoTerminal: string;
  chaveAtivacao: string;
  chaveAtivacaoMascara: string;
  chaveGeradaEm: string;
}

export interface TerminalPdvAtivacaoResultado {
  codigoTerminal: string;
  nomeTerminal: string;
  lojaNome: string | null;
  estadoUf: string | null;
  numeroPdv: number;
  perfilInstalacao: TerminalPerfilInstalacao | string;
  perfilImpressora: TerminalPerfilImpressora | string;
  perfilScanner: TerminalPerfilScanner | string;
  perfilTeclado: TerminalPerfilTeclado | string;
  impressaoAutomatica: boolean;
  ativo: boolean;
  ativado: boolean;
  ativadoEm: string | null;
  ultimaSincronizacaoEm: string;
}
