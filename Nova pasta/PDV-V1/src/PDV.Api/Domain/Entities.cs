namespace PDV.Api.Domain;

public class Empresa
{
    public Guid EmpresaId { get; set; }
    public string Nome { get; set; } = string.Empty;
    public string? NomeFantasia { get; set; }
    public string? Cnpj { get; set; }
    public string? InscricaoEstadual { get; set; }
    public bool InscricaoEstadualIsento { get; set; }
    public string? InscricaoMunicipal { get; set; }
    public string? CnaePrincipal { get; set; }
    public string? Telefone { get; set; }
    public string? EmailFiscal { get; set; }
    public string? Cep { get; set; }
    public string? Logradouro { get; set; }
    public string? Numero { get; set; }
    public string? Complemento { get; set; }
    public string? Bairro { get; set; }
    public string? Cidade { get; set; }
    public string? Uf { get; set; }
    public string? CodigoMunicipioIbge { get; set; }
    public string? CertificadoDigitalCaminho { get; set; }
    public string? CertificadoDigitalSenhaProtegida { get; set; }
    public EmpresaRegimeTributario RegimeTributario { get; set; } = EmpresaRegimeTributario.SimplesNacional;
    public AmbienteFiscal AmbienteNfe { get; set; } = AmbienteFiscal.Homologacao;
    public FiscalProvider ProviderFiscal { get; set; } = FiscalProvider.SefazDirect;
    public bool UsaIntegracaoDiretaSefaz { get; set; } = true;
    public string? TokenApiFiscalProtegido { get; set; }
    public string? ApiFiscalClientId { get; set; }
    public string? ApiFiscalClientSecretProtegido { get; set; }
    public string? UrlApiFiscal { get; set; }
    public CobrancaDigitalProvider CobrancaDigitalProvider { get; set; } = CobrancaDigitalProvider.Nenhum;
    public AmbienteFiscal AmbienteCobrancaDigital { get; set; } = AmbienteFiscal.Homologacao;
    public string? ApiCobrancaClientId { get; set; }
    public string? ApiCobrancaClientSecretProtegido { get; set; }
    public string? UrlApiCobranca { get; set; }
    public int DiasVencimentoCobranca { get; set; } = 3;
    public int SerieNfe { get; set; } = 1;
    public int ProximoNumeroNfe { get; set; } = 1;
    public bool Ativo { get; set; } = true;

    public ICollection<Usuario> Usuarios { get; set; } = [];
    public ICollection<TerminalPdv> TerminaisPdv { get; set; } = [];
    public ICollection<DepositoEstoque> DepositosEstoque { get; set; } = [];
}

public class TerminalPdv
{
    public Guid TerminalPdvId { get; set; }
    public Guid EmpresaId { get; set; }
    public string CodigoTerminal { get; set; } = string.Empty;
    public string NomeTerminal { get; set; } = string.Empty;
    public string? LojaNome { get; set; }
    public string? EstadoUf { get; set; }
    public int NumeroPdv { get; set; }
    public string PerfilInstalacao { get; set; } = string.Empty;
    public string PerfilImpressora { get; set; } = "TERMICA_80MM";
    public string PerfilScanner { get; set; } = "HIBRIDO";
    public string PerfilTeclado { get; set; } = "PADRAO_PDV";
    public bool ImpressaoAutomatica { get; set; } = true;
    public string? Observacao { get; set; }
    public string ChaveAtivacaoHash { get; set; } = string.Empty;
    public string ChaveAtivacaoMascara { get; set; } = string.Empty;
    public bool Ativo { get; set; } = true;
    public bool Ativado { get; set; }
    public string? DispositivoIdentificador { get; set; }
    public string? NomeHost { get; set; }
    public string? VersaoInstalador { get; set; }
    public string? VersaoAplicativo { get; set; }
    public string? UltimoIp { get; set; }
    public DateTime DataCadastro { get; set; } = DateTime.UtcNow;
    public DateTime ChaveGeradaEm { get; set; } = DateTime.UtcNow;
    public DateTime? AtivadoEm { get; set; }
    public DateTime? UltimaSincronizacaoEm { get; set; }

    public Empresa Empresa { get; set; } = null!;
}

public class Usuario
{
    public Guid UsuarioId { get; set; }
    public Guid EmpresaId { get; set; }
    public Guid PerfilId { get; set; }
    public Guid? ClienteId { get; set; }
    public string Nome { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? CodigoBarrasCracha { get; set; }
    public string SenhaHash { get; set; } = string.Empty;
    public bool Ativo { get; set; } = true;
    public bool UsarPermissoesCustomizadas { get; set; }
    public DateTime DataCadastro { get; set; } = DateTime.UtcNow;

    public Empresa Empresa { get; set; } = null!;
    public Perfil Perfil { get; set; } = null!;
    public Cliente? Cliente { get; set; }
    public ICollection<UsuarioPermissao> UsuarioPermissoes { get; set; } = [];
}

public class Perfil
{
    public Guid PerfilId { get; set; }
    public string Codigo { get; set; } = string.Empty;
    public string Nome { get; set; } = string.Empty;
    public bool Ativo { get; set; } = true;

    public ICollection<PerfilPermissao> PerfilPermissoes { get; set; } = [];
}

public class Permissao
{
    public Guid PermissaoId { get; set; }
    public string Codigo { get; set; } = string.Empty;
    public string Nome { get; set; } = string.Empty;

    public ICollection<PerfilPermissao> PerfilPermissoes { get; set; } = [];
    public ICollection<UsuarioPermissao> UsuarioPermissoes { get; set; } = [];
}

public class PerfilPermissao
{
    public Guid PerfilId { get; set; }
    public Guid PermissaoId { get; set; }

    public Perfil Perfil { get; set; } = null!;
    public Permissao Permissao { get; set; } = null!;
}

public class UsuarioPermissao
{
    public Guid UsuarioId { get; set; }
    public Guid PermissaoId { get; set; }

    public Usuario Usuario { get; set; } = null!;
    public Permissao Permissao { get; set; } = null!;
}

public class Categoria
{
    public Guid CategoriaId { get; set; }
    public Guid EmpresaId { get; set; }
    public string Nome { get; set; } = string.Empty;
    public bool Ativo { get; set; } = true;
    public DateTime DataCadastro { get; set; } = DateTime.UtcNow;
}

public class Produto
{
    public Guid ProdutoId { get; set; }
    public Guid EmpresaId { get; set; }
    public Guid? CategoriaId { get; set; }
    public Guid? ClienteFornecedorId { get; set; }
    public string? CodigoBarras { get; set; }
    public string Nome { get; set; } = string.Empty;
    public string? Descricao { get; set; }
    public string? Marca { get; set; }
    public string? Ncm { get; set; }
    public string? Cest { get; set; }
    public string? OrigemFiscal { get; set; }
    public ProdutoPerfilFiscalPadrao? PerfilFiscalPadrao { get; set; }
    public string? CfopVendaPadrao { get; set; }
    public string? CfopVendaInterestadual { get; set; }
    public string? CfopCompraPadrao { get; set; }
    public string? CfopCompraInterestadual { get; set; }
    public string? Csosn { get; set; }
    public string? CstIcms { get; set; }
    public string? CstPis { get; set; }
    public string? CstCofins { get; set; }
    public string? BeneficioFiscalCodigo { get; set; }
    public string? CodigoAnp { get; set; }
    public string? UnidadeTributavel { get; set; }
    public string? ExTipi { get; set; }
    public decimal? AliquotaIcms { get; set; }
    public decimal? AliquotaIpi { get; set; }
    public decimal? AliquotaPis { get; set; }
    public decimal? AliquotaCofins { get; set; }
    public string? ImagemUrl { get; set; }
    public string? CatalogoResumo { get; set; }
    public bool DestaqueCatalogoComprador { get; set; }
    public decimal? PrecoPromocional { get; set; }
    public string? PromocaoTitulo { get; set; }
    public DateTime? PromocaoInicioUtc { get; set; }
    public DateTime? PromocaoFimUtc { get; set; }
    public string? CodigoProdutoFornecedor { get; set; }
    public string? UltimaNotaFiscalCompra { get; set; }
    public string? DadosExtrasJson { get; set; }
    public decimal PrecoVenda { get; set; }
    public decimal PrecoCusto { get; set; }
    public decimal EstoqueAtual { get; set; }
    public decimal EstoqueMinimo { get; set; }
    public string UnidadeMedida { get; set; } = "UN";
    public bool Ativo { get; set; } = true;
    public bool ControlaEstoque { get; set; } = true;
    public bool ControlaLote { get; set; }
    public PoliticaBaixaEstoqueLote PoliticaBaixaLote { get; set; } = PoliticaBaixaEstoqueLote.FEFO;
    public DateTime DataCadastro { get; set; } = DateTime.UtcNow;

    public Cliente? ClienteFornecedor { get; set; }
    public ICollection<ProdutoFornecedor> Fornecedores { get; set; } = [];
    public ICollection<ProdutoCodigo> Codigos { get; set; } = [];
    public ICollection<ProdutoLote> Lotes { get; set; } = [];
    public ICollection<EstoqueLote> EstoquesLote { get; set; } = [];
    public ICollection<EstoqueDeposito> EstoquesDeposito { get; set; } = [];
    public ICollection<ProdutoFiscalRegraAplicada> RegrasFiscaisAplicadas { get; set; } = [];
    public ICollection<FiscalRegraAplicadaLog> AuditoriasFiscais { get; set; } = [];
}

public class ProdutoFornecedor
{
    public Guid ProdutoFornecedorId { get; set; }
    public Guid EmpresaId { get; set; }
    public Guid ProdutoId { get; set; }
    public Guid ClienteFornecedorId { get; set; }
    public string? CodigoProdutoFornecedor { get; set; }
    public string? NomeProdutoFornecedor { get; set; }
    public decimal? PrecoCompra { get; set; }
    public decimal? QuantidadeMinima { get; set; }
    public int? PrazoEntregaDias { get; set; }
    public DateTime? UltimaCompraEm { get; set; }
    public decimal? UltimoPrecoPago { get; set; }
    public bool FornecedorPrincipal { get; set; }
    public bool Ativo { get; set; } = true;
    public DateTime DataCadastro { get; set; } = DateTime.UtcNow;

    public Produto Produto { get; set; } = null!;
    public Cliente ClienteFornecedor { get; set; } = null!;
}

public class ProdutoCampoPadrao
{
    public Guid ProdutoCampoPadraoId { get; set; }
    public Guid EmpresaId { get; set; }
    public string Chave { get; set; } = string.Empty;
    public string? ValorPadrao { get; set; }
    public int Ordem { get; set; }
    public DateTime DataCadastro { get; set; } = DateTime.UtcNow;
}

public class ProdutoCodigo
{
    public Guid ProdutoCodigoId { get; set; }
    public Guid EmpresaId { get; set; }
    public Guid ProdutoId { get; set; }
    public string Codigo { get; set; } = string.Empty;
    public ProdutoCodigoTipo Tipo { get; set; } = ProdutoCodigoTipo.Ean;
    public bool Principal { get; set; }
    public bool Ativo { get; set; } = true;
    public DateTime DataCadastro { get; set; } = DateTime.UtcNow;

    public Produto Produto { get; set; } = null!;
}

public class ProdutoLote
{
    public Guid ProdutoLoteId { get; set; }
    public Guid EmpresaId { get; set; }
    public Guid ProdutoId { get; set; }
    public string CodigoLote { get; set; } = string.Empty;
    public DateTime? DataFabricacao { get; set; }
    public DateTime? DataValidade { get; set; }
    public string? Observacao { get; set; }
    public bool Ativo { get; set; } = true;
    public DateTime DataCadastro { get; set; } = DateTime.UtcNow;

    public Produto Produto { get; set; } = null!;
    public ICollection<EstoqueLote> Estoques { get; set; } = [];
}

public class EstoqueLote
{
    public Guid EstoqueLoteId { get; set; }
    public Guid EmpresaId { get; set; }
    public Guid ProdutoId { get; set; }
    public Guid ProdutoLoteId { get; set; }
    public decimal QuantidadeEntrada { get; set; }
    public decimal QuantidadeDisponivel { get; set; }
    public decimal? PrecoCustoUnitario { get; set; }
    public DateTime DataEntrada { get; set; } = DateTime.UtcNow;
    public string? DocumentoReferencia { get; set; }
    public Guid UsuarioId { get; set; }
    public bool Ativo { get; set; } = true;

    public Produto Produto { get; set; } = null!;
    public ProdutoLote ProdutoLote { get; set; } = null!;
    public Usuario Usuario { get; set; } = null!;
    public ICollection<MovimentacaoEstoqueLote> Movimentacoes { get; set; } = [];
}

public class MovimentacaoEstoqueLote
{
    public Guid MovimentacaoEstoqueLoteId { get; set; }
    public Guid EmpresaId { get; set; }
    public Guid MovimentacaoEstoqueId { get; set; }
    public Guid ProdutoId { get; set; }
    public Guid ProdutoLoteId { get; set; }
    public Guid EstoqueLoteId { get; set; }
    public decimal Quantidade { get; set; }
    public DateTime DataMovimentacao { get; set; } = DateTime.UtcNow;

    public MovimentacaoEstoque MovimentacaoEstoque { get; set; } = null!;
    public Produto Produto { get; set; } = null!;
    public ProdutoLote ProdutoLote { get; set; } = null!;
    public EstoqueLote EstoqueLote { get; set; } = null!;
}

public class DepositoEstoque
{
    public Guid DepositoEstoqueId { get; set; }
    public Guid EmpresaId { get; set; }
    public string Codigo { get; set; } = string.Empty;
    public string Nome { get; set; } = string.Empty;
    public string? Descricao { get; set; }
    public bool Padrao { get; set; }
    public bool PermiteVendaDireta { get; set; } = true;
    public bool Ativo { get; set; } = true;
    public DateTime DataCadastro { get; set; } = DateTime.UtcNow;

    public Empresa Empresa { get; set; } = null!;
    public ICollection<EstoqueDeposito> Estoques { get; set; } = [];
    public ICollection<TransferenciaEstoque> TransferenciasOrigem { get; set; } = [];
    public ICollection<TransferenciaEstoque> TransferenciasDestino { get; set; } = [];
}

public class EstoqueDeposito
{
    public Guid EstoqueDepositoId { get; set; }
    public Guid EmpresaId { get; set; }
    public Guid DepositoEstoqueId { get; set; }
    public Guid ProdutoId { get; set; }
    public decimal QuantidadeDisponivel { get; set; }
    public decimal QuantidadeReservada { get; set; }
    public bool Ativo { get; set; } = true;
    public DateTime DataAtualizacao { get; set; } = DateTime.UtcNow;

    public DepositoEstoque DepositoEstoque { get; set; } = null!;
    public Produto Produto { get; set; } = null!;
}

public class TransferenciaEstoque
{
    public Guid TransferenciaEstoqueId { get; set; }
    public Guid EmpresaId { get; set; }
    public Guid ProdutoId { get; set; }
    public Guid DepositoOrigemId { get; set; }
    public Guid DepositoDestinoId { get; set; }
    public decimal Quantidade { get; set; }
    public TransferenciaEstoqueStatus Status { get; set; } = TransferenciaEstoqueStatus.Concluida;
    public string? DocumentoReferencia { get; set; }
    public string? Observacao { get; set; }
    public DateTime DataTransferencia { get; set; } = DateTime.UtcNow;
    public Guid UsuarioId { get; set; }

    public Produto Produto { get; set; } = null!;
    public DepositoEstoque DepositoOrigem { get; set; } = null!;
    public DepositoEstoque DepositoDestino { get; set; } = null!;
    public Usuario Usuario { get; set; } = null!;
}

public class FiscalNcm
{
    public Guid FiscalNcmId { get; set; }
    public string Codigo { get; set; } = string.Empty;
    public string Descricao { get; set; } = string.Empty;
    public string? DescricaoCompleta { get; set; }
    public string? AtoLegal { get; set; }
    public DateTime? DataInicio { get; set; }
    public DateTime? DataFim { get; set; }
    public bool Vigente { get; set; } = true;
    public DateTime? DataImportacao { get; set; }
    public Guid? UsuarioImportacao { get; set; }
    public string? CestPadraoCodigo { get; set; }
    public decimal? AliquotaIbpt { get; set; }
    public bool SujeitoSt { get; set; }
    public bool Ativo { get; set; } = true;
}

public class FiscalNcmOficial
{
    public Guid FiscalNcmOficialId { get; set; }
    public string Codigo { get; set; } = string.Empty;
    public string CodigoNormalizado { get; set; } = string.Empty;
    public string Descricao { get; set; } = string.Empty;
    public string? DescricaoConcatenada { get; set; }
    public DateTime? DataInicio { get; set; }
    public DateTime? DataFim { get; set; }
    public string? TipoAtoInicio { get; set; }
    public string? NumeroAtoInicio { get; set; }
    public string? AnoAtoInicio { get; set; }
    public bool EhItemFinal { get; set; }
    public bool Vigente { get; set; } = true;
    public DateTime DataImportacao { get; set; } = DateTime.UtcNow;
    public bool Ativo { get; set; } = true;
}

public class FiscalCest
{
    public Guid FiscalCestId { get; set; }
    public string Codigo { get; set; } = string.Empty;
    public string Descricao { get; set; } = string.Empty;
    public string? NcmCodigo { get; set; }
    public bool Ativo { get; set; } = true;
}

public class FiscalCfop
{
    public Guid FiscalCfopId { get; set; }
    public string Codigo { get; set; } = string.Empty;
    public string Descricao { get; set; } = string.Empty;
    public ProdutoPerfilFiscalPadrao? PerfilFiscalPadrao { get; set; }
    public bool Entrada { get; set; }
    public bool Saida { get; set; }
    public bool DentroEstado { get; set; }
    public bool ForaEstado { get; set; }
    public bool ExigeContexto { get; set; }
    public bool Ativo { get; set; } = true;
}

public class FiscalCsosn
{
    public Guid FiscalCsosnId { get; set; }
    public string Codigo { get; set; } = string.Empty;
    public string Descricao { get; set; } = string.Empty;
    public bool ExigeSt { get; set; }
    public bool DestacaIcmsProprio { get; set; }
    public bool Ativo { get; set; } = true;
}

public class FiscalCstIcms
{
    public Guid FiscalCstIcmsId { get; set; }
    public string Codigo { get; set; } = string.Empty;
    public string Descricao { get; set; } = string.Empty;
    public bool ExigeSt { get; set; }
    public bool DestacaIcmsProprio { get; set; }
    public bool Ativo { get; set; } = true;
}

public class FiscalCstPisCofins
{
    public Guid FiscalCstPisCofinsId { get; set; }
    public string Codigo { get; set; } = string.Empty;
    public string Descricao { get; set; } = string.Empty;
    public bool AliquotaZero { get; set; }
    public bool UsaAliquotaPadrao { get; set; }
    public bool Ativo { get; set; } = true;
}

public class FiscalAliquotaIcms
{
    public Guid FiscalAliquotaIcmsId { get; set; }
    public string UfOrigem { get; set; } = string.Empty;
    public string? UfDestino { get; set; }
    public string? NcmPrefixo { get; set; }
    public string? OrigemFiscalCodigo { get; set; }
    public string? CfopCodigo { get; set; }
    public string? RegimeTributario { get; set; }
    public bool? ConsumidorFinal { get; set; }
    public decimal Aliquota { get; set; }
    public int Prioridade { get; set; }
    public string Descricao { get; set; } = string.Empty;
    public bool Ativo { get; set; } = true;
}

public class FiscalBeneficio
{
    public Guid FiscalBeneficioId { get; set; }
    public string Codigo { get; set; } = string.Empty;
    public string Descricao { get; set; } = string.Empty;
    public string? Uf { get; set; }
    public string? NcmPrefixo { get; set; }
    public bool Ativo { get; set; } = true;
}

public class FiscalUfParametro
{
    public Guid FiscalUfParametroId { get; set; }
    public string Uf { get; set; } = string.Empty;
    public decimal AliquotaInternaIcms { get; set; }
    public decimal AliquotaInterestadual { get; set; }
    public decimal AliquotaFcp { get; set; }
    public decimal? AliquotaIssPadrao { get; set; }
    public string? Observacoes { get; set; }
    public bool Ativo { get; set; } = true;
}

public class ProdutoFiscalRegraAplicada
{
    public Guid ProdutoFiscalRegraAplicadaId { get; set; }
    public Guid EmpresaId { get; set; }
    public Guid ProdutoId { get; set; }
    public int Ordem { get; set; }
    public string Campo { get; set; } = string.Empty;
    public string? Codigo { get; set; }
    public string Descricao { get; set; } = string.Empty;
    public OrigemRegraFiscal OrigemRegra { get; set; } = OrigemRegraFiscal.SugestaoAutomatica;
    public DateTime DataAplicacao { get; set; } = DateTime.UtcNow;

    public Produto Produto { get; set; } = null!;
}

public class FiscalRegraAplicadaLog
{
    public Guid FiscalRegraAplicadaLogId { get; set; }
    public Guid EmpresaId { get; set; }
    public Guid ProdutoId { get; set; }
    public Guid UsuarioId { get; set; }
    public string Campo { get; set; } = string.Empty;
    public string? ValorAnterior { get; set; }
    public string? ValorNovo { get; set; }
    public OrigemRegraFiscal OrigemRegra { get; set; } = OrigemRegraFiscal.Manual;
    public string? Justificativa { get; set; }
    public string? IpAddress { get; set; }
    public DateTime DataAlteracao { get; set; } = DateTime.UtcNow;

    public Produto Produto { get; set; } = null!;
    public Usuario Usuario { get; set; } = null!;
}

public class Municipio
{
    public Guid MunicipioId { get; set; }
    public string CodigoIbge { get; set; } = string.Empty;
    public string Nome { get; set; } = string.Empty;
    public string Uf { get; set; } = string.Empty;
    public string? CepInicial { get; set; }
    public string? CepFinal { get; set; }
    public bool Ativo { get; set; } = true;
}

public class Cliente
{
    public Guid ClienteId { get; set; }
    public Guid EmpresaId { get; set; }
    public string Nome { get; set; } = string.Empty;
    public string? Documento { get; set; }
    public string? Segmento { get; set; }
    public string? Telefone { get; set; }
    public string? Email { get; set; }
    public string? Cep { get; set; }
    public string? Logradouro { get; set; }
    public string? Numero { get; set; }
    public string? Complemento { get; set; }
    public string? Bairro { get; set; }
    public string? Cidade { get; set; }
    public string? Uf { get; set; }
    public string? CodigoMunicipioIbge { get; set; }
    public string? Endereco { get; set; }
    public bool EhFornecedor { get; set; }
    public bool Ativo { get; set; } = true;
    public DateTime DataCadastro { get; set; } = DateTime.UtcNow;
}

public class Fornecedor
{
    public Guid FornecedorId { get; set; }
    public Guid EmpresaId { get; set; }
    public string Nome { get; set; } = string.Empty;
    public string? Documento { get; set; }
    public string? Telefone { get; set; }
    public string? Email { get; set; }
    public bool Ativo { get; set; } = true;
    public DateTime DataCadastro { get; set; } = DateTime.UtcNow;
}

public class Caixa
{
    public Guid CaixaId { get; set; }
    public Guid EmpresaId { get; set; }
    public Guid UsuarioId { get; set; }
    public DateTime DataAbertura { get; set; } = DateTime.UtcNow;
    public DateTime? DataFechamento { get; set; }
    public decimal ValorInicial { get; set; }
    public decimal ValorDinheiro { get; set; }
    public decimal ValorCartaoCredito { get; set; }
    public decimal ValorCartaoDebito { get; set; }
    public decimal ValorPix { get; set; }
    public decimal ValorVoucher { get; set; }
    public decimal ValorTotalVendas { get; set; }
    public decimal ValorSangria { get; set; }
    public decimal ValorSuprimento { get; set; }
    public decimal? DiferencaInformada { get; set; }
    public CaixaStatus Status { get; set; } = CaixaStatus.Aberto;

    public Usuario Usuario { get; set; } = null!;
    public ICollection<Venda> Vendas { get; set; } = [];
}

public class Venda
{
    public Guid VendaId { get; set; }
    public Guid EmpresaId { get; set; }
    public Guid CaixaId { get; set; }
    public Guid UsuarioId { get; set; }
    public Guid? ClienteId { get; set; }
    public string NumeroVenda { get; set; } = string.Empty;
    public DateTime DataVenda { get; set; } = DateTime.UtcNow;
    public decimal Subtotal { get; set; }
    public decimal DescontoTotal { get; set; }
    public decimal Total { get; set; }
    public VendaStatus Status { get; set; } = VendaStatus.Finalizada;
    public bool EhPedido { get; set; }
    public AtendimentoPedidoTipo? AtendimentoTipo { get; set; }
    public PedidoStatus? PedidoStatus { get; set; }
    public string? CodigoAcompanhamento { get; set; }
    public string? ContatoNome { get; set; }
    public string? ContatoTelefone { get; set; }
    public string? ObservacaoPedido { get; set; }
    public string? EnderecoEntregaSnapshotJson { get; set; }
    public DateTime? DataUltimaAtualizacaoPedido { get; set; }
    public Guid? TransportadoraId { get; set; }
    public Guid? EntregadorUsuarioId { get; set; }
    public string? NomeEntregador { get; set; }
    public string? TelefoneEntregador { get; set; }
    public string? EntregaCodigoAcesso { get; set; }
    public bool EntregaCompartilhamentoAtivo { get; set; }
    public decimal? EntregaUltimaLatitude { get; set; }
    public decimal? EntregaUltimaLongitude { get; set; }
    public decimal? EntregaPrecisaoMetros { get; set; }
    public decimal? EntregaVelocidadeKmh { get; set; }
    public decimal? EntregaDirecaoGraus { get; set; }
    public DateTime? EntregaUltimaAtualizacaoGps { get; set; }
    public string? MotivoCancelamento { get; set; }

    public Caixa Caixa { get; set; } = null!;
    public Usuario Usuario { get; set; } = null!;
    public Cliente? Cliente { get; set; }
    public Transportadora? Transportadora { get; set; }
    public Usuario? EntregadorUsuario { get; set; }
    public ICollection<VendaItem> Itens { get; set; } = [];
    public ICollection<VendaPagamento> Pagamentos { get; set; } = [];
    public ICollection<PedidoOcorrencia> OcorrenciasPedido { get; set; } = [];
    public ICollection<PedidoEntregaLocalizacao> LocalizacoesEntrega { get; set; } = [];
}

public class NotaFiscal
{
    public Guid NotaFiscalId { get; set; }
    public Guid EmpresaId { get; set; }
    public Guid? VendaId { get; set; }
    public Guid? ClienteId { get; set; }
    public Guid UsuarioId { get; set; }
    public int Numero { get; set; }
    public int Serie { get; set; }
    public AmbienteFiscal Ambiente { get; set; } = AmbienteFiscal.Homologacao;
    public NotaFiscalStatus Status { get; set; } = NotaFiscalStatus.Rascunho;
    public NotaFiscalOrigem Origem { get; set; } = NotaFiscalOrigem.Manual;
    public string? NumeroVenda { get; set; }
    public string DestinatarioNome { get; set; } = "Consumidor final";
    public string? DestinatarioDocumento { get; set; }
    public string EmitenteSnapshotJson { get; set; } = string.Empty;
    public string DestinatarioSnapshotJson { get; set; } = string.Empty;
    public string? PendenciasJson { get; set; }
    public string? Observacoes { get; set; }
    public decimal ValorProdutos { get; set; }
    public decimal ValorDesconto { get; set; }
    public decimal ValorTotal { get; set; }
    public bool ProntaParaTransmissao { get; set; }
    public FiscalProvider ProviderFiscal { get; set; } = FiscalProvider.SefazDirect;
    public string? ReferenciaFiscal { get; set; }
    public string? DocumentoFiscalId { get; set; }
    public string? ChaveAcesso { get; set; }
    public string? CodigoNumerico { get; set; }
    public string? LoteTransmissao { get; set; }
    public string? ReciboSefaz { get; set; }
    public string? ProtocoloAutorizacao { get; set; }
    public int? CodigoStatusSefaz { get; set; }
    public string? MensagemStatusSefaz { get; set; }
    public string? PayloadOriginalJson { get; set; }
    public string? PayloadProviderJson { get; set; }
    public string? RetornoProviderJson { get; set; }
    public string? DanfeUrl { get; set; }
    public string? DanfePdfBase64 { get; set; }
    public string? XmlEnvio { get; set; }
    public string? XmlRetorno { get; set; }
    public DateTime? DataTransmissao { get; set; }
    public DateTime? DataAutorizacao { get; set; }
    public DateTime DataEmissao { get; set; } = DateTime.UtcNow;

    public Venda? Venda { get; set; }
    public Cliente? Cliente { get; set; }
    public Usuario Usuario { get; set; } = null!;
    public ICollection<NotaFiscalItem> Itens { get; set; } = [];
}

public class NotaFiscalItem
{
    public Guid NotaFiscalItemId { get; set; }
    public Guid NotaFiscalId { get; set; }
    public Guid ProdutoId { get; set; }
    public string ProdutoNome { get; set; } = string.Empty;
    public string UnidadeMedida { get; set; } = "UN";
    public string? Ncm { get; set; }
    public string? Cest { get; set; }
    public string? OrigemFiscal { get; set; }
    public string? Cfop { get; set; }
    public string? Csosn { get; set; }
    public string? CstIcms { get; set; }
    public string? CstPis { get; set; }
    public string? CstCofins { get; set; }
    public string? BeneficioFiscalCodigo { get; set; }
    public string? CodigoAnp { get; set; }
    public string? UnidadeTributavel { get; set; }
    public string? ExTipi { get; set; }
    public decimal? AliquotaIcms { get; set; }
    public decimal? AliquotaIpi { get; set; }
    public decimal? AliquotaPis { get; set; }
    public decimal? AliquotaCofins { get; set; }
    public decimal Quantidade { get; set; }
    public decimal ValorUnitario { get; set; }
    public decimal Desconto { get; set; }
    public decimal Total { get; set; }

    public NotaFiscal NotaFiscal { get; set; } = null!;
    public Produto Produto { get; set; } = null!;
}

public class FiscalSefazUrl
{
    public Guid FiscalSefazUrlId { get; set; }
    public string Uf { get; set; } = string.Empty;
    public AmbienteFiscal Ambiente { get; set; } = AmbienteFiscal.Homologacao;
    public FiscalSefazServico Servico { get; set; } = FiscalSefazServico.StatusServico;
    public string Url { get; set; } = string.Empty;
    public bool Ativo { get; set; } = true;
}

public class VendaItem
{
    public Guid VendaItemId { get; set; }
    public Guid VendaId { get; set; }
    public Guid ProdutoId { get; set; }
    public decimal Quantidade { get; set; }
    public decimal ValorUnitario { get; set; }
    public decimal Desconto { get; set; }
    public decimal Total { get; set; }

    public Venda Venda { get; set; } = null!;
    public Produto Produto { get; set; } = null!;
}

public class VendaPagamento
{
    public Guid VendaPagamentoId { get; set; }
    public Guid VendaId { get; set; }
    public FormaPagamento FormaPagamento { get; set; }
    public PagamentoCapturaModo CapturaModo { get; set; } = PagamentoCapturaModo.ManualAssistido;
    public PagamentoStatusTransacao StatusTransacao { get; set; } = PagamentoStatusTransacao.Aprovada;
    public string? ProvedorOperacao { get; set; }
    public string? ReferenciaTransacao { get; set; }
    public string? CodigoAutorizacao { get; set; }
    public string? BandeiraCartao { get; set; }
    public string? UltimosDigitosCartao { get; set; }
    public int? Parcelas { get; set; }
    public string? ObservacaoOperacao { get; set; }
    public string? PayloadOperacaoJson { get; set; }
    public DateTime? DataCaptura { get; set; } = DateTime.UtcNow;
    public decimal ValorPago { get; set; }
    public decimal Troco { get; set; }

    public Venda Venda { get; set; } = null!;
}

public class PedidoOcorrencia
{
    public Guid PedidoOcorrenciaId { get; set; }
    public Guid EmpresaId { get; set; }
    public Guid VendaId { get; set; }
    public Guid? UsuarioId { get; set; }
    public PedidoStatus Status { get; set; }
    public string Titulo { get; set; } = string.Empty;
    public string? Descricao { get; set; }
    public bool VisivelParaCliente { get; set; } = true;
    public DateTime DataOcorrencia { get; set; } = DateTime.UtcNow;

    public Venda Venda { get; set; } = null!;
    public Usuario? Usuario { get; set; }
}

public class Transportadora
{
    public Guid TransportadoraId { get; set; }
    public Guid EmpresaId { get; set; }
    public string Nome { get; set; } = string.Empty;
    public string? NomeFantasia { get; set; }
    public string? Documento { get; set; }
    public string? InscricaoEstadual { get; set; }
    public string? Telefone { get; set; }
    public string? Email { get; set; }
    public string? Responsavel { get; set; }
    public string? Cep { get; set; }
    public string? Logradouro { get; set; }
    public string? Numero { get; set; }
    public string? Complemento { get; set; }
    public string? Bairro { get; set; }
    public string? Cidade { get; set; }
    public string? Uf { get; set; }
    public string? CodigoMunicipioIbge { get; set; }
    public string? Endereco { get; set; }
    public string? CorTemaHex { get; set; }
    public int? PrazoMedioEntregaMinutos { get; set; }
    public string? Observacao { get; set; }
    public bool Ativo { get; set; } = true;
    public DateTime DataCadastro { get; set; } = DateTime.UtcNow;

    public ICollection<Venda> Vendas { get; set; } = [];
}

public class PedidoEntregaLocalizacao
{
    public Guid PedidoEntregaLocalizacaoId { get; set; }
    public Guid EmpresaId { get; set; }
    public Guid VendaId { get; set; }
    public decimal Latitude { get; set; }
    public decimal Longitude { get; set; }
    public decimal? PrecisaoMetros { get; set; }
    public decimal? VelocidadeKmh { get; set; }
    public decimal? DirecaoGraus { get; set; }
    public DateTime DataCaptura { get; set; } = DateTime.UtcNow;
    public string Origem { get; set; } = "Entregador";
    public string? Observacao { get; set; }

    public Venda Venda { get; set; } = null!;
}

public class MovimentacaoEstoque
{
    public Guid MovimentacaoEstoqueId { get; set; }
    public Guid EmpresaId { get; set; }
    public Guid ProdutoId { get; set; }
    public MovimentacaoEstoqueTipo Tipo { get; set; }
    public decimal Quantidade { get; set; }
    public decimal EstoqueAnterior { get; set; }
    public decimal EstoqueAtual { get; set; }
    public decimal EstoqueReservadoAtual { get; set; }
    public MovimentacaoEstoqueOrigem Origem { get; set; }
    public Guid? ReferenciaId { get; set; }
    public Guid? DepositoEstoqueId { get; set; }
    public Guid? DepositoOrigemId { get; set; }
    public Guid? DepositoDestinoId { get; set; }
    public string? Observacao { get; set; }
    public DateTime DataMovimentacao { get; set; } = DateTime.UtcNow;
    public Guid UsuarioId { get; set; }

    public Produto Produto { get; set; } = null!;
    public Usuario Usuario { get; set; } = null!;
    public DepositoEstoque? DepositoEstoque { get; set; }
    public DepositoEstoque? DepositoOrigem { get; set; }
    public DepositoEstoque? DepositoDestino { get; set; }
    public ICollection<MovimentacaoEstoqueLote> Lotes { get; set; } = [];
}

public class LancamentoFinanceiro
{
    public Guid LancamentoFinanceiroId { get; set; }
    public Guid EmpresaId { get; set; }
    public FinanceiroTipo Tipo { get; set; }
    public FinanceiroOrigem Origem { get; set; }
    public FinanceiroStatus Status { get; set; } = FinanceiroStatus.Pendente;
    public string Descricao { get; set; } = string.Empty;
    public string? DocumentoReferencia { get; set; }
    public Guid? VendaId { get; set; }
    public Guid? ClienteId { get; set; }
    public Guid? FornecedorId { get; set; }
    public Guid? UsuarioId { get; set; }
    public Guid? CaixaId { get; set; }
    public DateTime DataCompetencia { get; set; } = DateTime.UtcNow;
    public DateTime DataVencimento { get; set; } = DateTime.UtcNow;
    public DateTime? DataLiquidacao { get; set; }
    public decimal ValorOriginal { get; set; }
    public decimal ValorDesconto { get; set; }
    public decimal ValorAcrescimo { get; set; }
    public decimal ValorFinal { get; set; }
    public decimal ValorCusto { get; set; }
    public string? Observacao { get; set; }

    public Venda? Venda { get; set; }
    public Cliente? Cliente { get; set; }
    public Fornecedor? Fornecedor { get; set; }
    public Usuario? Usuario { get; set; }
    public Caixa? Caixa { get; set; }
}

public class CobrancaDigital
{
    public Guid CobrancaDigitalId { get; set; }
    public Guid EmpresaId { get; set; }
    public Guid? ClienteId { get; set; }
    public Guid? VendaId { get; set; }
    public Guid? LancamentoFinanceiroId { get; set; }
    public Guid? UsuarioId { get; set; }
    public CobrancaDigitalProvider Provider { get; set; } = CobrancaDigitalProvider.Efi;
    public CobrancaDigitalOrigem Origem { get; set; } = CobrancaDigitalOrigem.Financeiro;
    public CobrancaDigitalStatus Status { get; set; } = CobrancaDigitalStatus.Pendente;
    public string Descricao { get; set; } = string.Empty;
    public string? DocumentoReferencia { get; set; }
    public string? IdentificadorInterno { get; set; }
    public string? ChargeIdExterno { get; set; }
    public string? CustomIdExterno { get; set; }
    public string? StatusExterno { get; set; }
    public string? PixCopiaECola { get; set; }
    public string? PixQrCodeImageUrl { get; set; }
    public string? LinhaDigitavel { get; set; }
    public string? LinkCobranca { get; set; }
    public string? LinkBoleto { get; set; }
    public string? LinkPdf { get; set; }
    public decimal ValorOriginal { get; set; }
    public decimal? ValorPago { get; set; }
    public DateTime DataVencimento { get; set; }
    public DateTime? DataCriacaoProvider { get; set; }
    public DateTime? DataPagamento { get; set; }
    public DateTime DataCriacao { get; set; } = DateTime.UtcNow;
    public DateTime DataAtualizacao { get; set; } = DateTime.UtcNow;
    public string? PayloadCriacaoJson { get; set; }
    public string? PayloadConsultaJson { get; set; }
    public string? RetornoProviderJson { get; set; }
    public string? Observacao { get; set; }

    public Cliente? Cliente { get; set; }
    public Venda? Venda { get; set; }
    public LancamentoFinanceiro? LancamentoFinanceiro { get; set; }
    public Usuario? Usuario { get; set; }
}

public class LogSistema
{
    public Guid LogSistemaId { get; set; }
    public Guid? EmpresaId { get; set; }
    public Guid? UsuarioId { get; set; }
    public string Modulo { get; set; } = string.Empty;
    public string Acao { get; set; } = string.Empty;
    public string Descricao { get; set; } = string.Empty;
    public string? Dados { get; set; }
    public string? IpAddress { get; set; }
    public DateTime DataCriacao { get; set; } = DateTime.UtcNow;
}
