namespace PDV.Api.DTOs;

public sealed record ProdutoRequest(
    Guid? CategoriaId,
    Guid? ClienteFornecedorId,
    string? CodigoBarras,
    string Nome,
    string? Descricao,
    string? Marca,
    string? Ncm,
    string? Cest,
    string? OrigemFiscal,
    string? PerfilFiscalPadrao,
    string? CfopVendaPadrao,
    string? CfopVendaInterestadual,
    string? CfopCompraPadrao,
    string? CfopCompraInterestadual,
    string? Csosn,
    string? CstIcms,
    string? CstPis,
    string? CstCofins,
    string? BeneficioFiscalCodigo,
    string? CodigoAnp,
    string? UnidadeTributavel,
    string? ExTipi,
    decimal? AliquotaIcms,
    decimal? AliquotaIpi,
    decimal? AliquotaPis,
    decimal? AliquotaCofins,
    string? ImagemUrl,
    string? CatalogoResumo,
    bool DestaqueCatalogoComprador,
    decimal? PrecoPromocional,
    string? PromocaoTitulo,
    DateTime? PromocaoInicioUtc,
    DateTime? PromocaoFimUtc,
    string? CodigoProdutoFornecedor,
    string? UltimaNotaFiscalCompra,
    decimal PrecoVenda,
    decimal PrecoCusto,
    decimal EstoqueAtual,
    decimal EstoqueMinimo,
    string UnidadeMedida,
    bool Ativo,
    bool ControlaEstoque,
    bool ControlaLote = false,
    string? PoliticaBaixaLote = null,
    string? TipoCodigoPrincipal = null,
    IReadOnlyCollection<ProdutoCodigoAlternativoRequest>? CodigosAlternativos = null,
    IReadOnlyCollection<ProdutoCampoCustomizadoRequest>? CamposCustomizados = null,
    IReadOnlyCollection<ProdutoFornecedorRequest>? Fornecedores = null,
    string? JustificativaFiscalManual = null,
    bool ConfirmaPisCofinsDiferentes = false);

public sealed record ProdutoCodigoAlternativoRequest(
    string Codigo,
    string Tipo);

public sealed record ProdutoCampoCustomizadoRequest(
    string Chave,
    string? Valor);

public sealed record ProdutoFornecedorRequest(
    Guid? ClienteFornecedorId,
    string? CodigoProdutoFornecedor,
    string? NomeProdutoFornecedor,
    decimal? PrecoCompra,
    decimal? QuantidadeMinima,
    int? PrazoEntregaDias,
    DateTime? UltimaCompraEm,
    decimal? UltimoPrecoPago,
    bool FornecedorPrincipal,
    bool Ativo = true);

public sealed record ProdutoCodigoDto(
    Guid ProdutoCodigoId,
    string Codigo,
    string Tipo,
    bool Principal,
    bool Ativo);

public sealed record ProdutoCampoCustomizadoDto(
    string Chave,
    string? Valor);

public sealed record ProdutoFornecedorDto(
    Guid ProdutoFornecedorId,
    Guid ProdutoId,
    Guid ClienteFornecedorId,
    string ClienteFornecedorNome,
    string? ClienteFornecedorDocumento,
    string? CodigoProdutoFornecedor,
    string? NomeProdutoFornecedor,
    decimal? PrecoCompra,
    decimal? QuantidadeMinima,
    int? PrazoEntregaDias,
    DateTime? UltimaCompraEm,
    decimal? UltimoPrecoPago,
    bool FornecedorPrincipal,
    bool Ativo,
    bool MenorPreco,
    DateTime DataCadastro);

public sealed record ProdutoCampoPadraoRequest(
    string Chave,
    string? ValorPadrao);

public sealed record ProdutoCampoPadraoDto(
    Guid ProdutoCampoPadraoId,
    Guid EmpresaId,
    string Chave,
    string? ValorPadrao,
    int Ordem,
    DateTime DataCadastro);

public sealed record ProdutoRegraFiscalAplicadaDto(
    string Campo,
    string? Codigo,
    string Descricao,
    string OrigemRegra,
    int Ordem,
    DateTime DataAplicacao);

public sealed record ProdutoCatalogoItemDto(
    Guid ProdutoId,
    Guid EmpresaId,
    Guid? CategoriaId,
    string? CategoriaNome,
    string? CodigoBarras,
    string Nome,
    string? Descricao,
    string? Marca,
    string? ImagemUrl,
    decimal PrecoVenda,
    decimal? PrecoOriginal,
    bool PromocaoAtiva,
    string? CatalogoResumo,
    bool DestaqueCatalogoComprador,
    decimal? PrecoPromocional,
    string? PromocaoTitulo,
    decimal? PercentualDesconto,
    string UnidadeMedida,
    bool ControlaEstoque,
    decimal EstoqueAtual,
    decimal EstoqueMinimo,
    bool EstoqueBaixo,
    bool DisponivelParaVenda);

public sealed record ProdutoDto(
    Guid ProdutoId,
    Guid EmpresaId,
    Guid? CategoriaId,
    Guid? ClienteFornecedorId,
    string? ClienteFornecedorNome,
    string? ClienteFornecedorDocumento,
    string? CodigoBarras,
    string? TipoCodigoPrincipal,
    string Nome,
    string? Descricao,
    string? Marca,
    string? Ncm,
    string? Cest,
    string? OrigemFiscal,
    string? PerfilFiscalPadrao,
    string? CfopVendaPadrao,
    string? CfopVendaInterestadual,
    string? CfopCompraPadrao,
    string? CfopCompraInterestadual,
    string? Csosn,
    string? CstIcms,
    string? CstPis,
    string? CstCofins,
    string? BeneficioFiscalCodigo,
    string? CodigoAnp,
    string? UnidadeTributavel,
    string? ExTipi,
    decimal? AliquotaIcms,
    decimal? AliquotaIpi,
    decimal? AliquotaPis,
    decimal? AliquotaCofins,
    string? ImagemUrl,
    string? CatalogoResumo,
    bool DestaqueCatalogoComprador,
    decimal? PrecoPromocional,
    string? PromocaoTitulo,
    DateTime? PromocaoInicioUtc,
    DateTime? PromocaoFimUtc,
    string? CodigoProdutoFornecedor,
    string? UltimaNotaFiscalCompra,
    decimal PrecoVenda,
    decimal PrecoCusto,
    decimal EstoqueAtual,
    decimal EstoqueMinimo,
    string UnidadeMedida,
    bool Ativo,
    bool ControlaEstoque,
    bool ControlaLote,
    string? PoliticaBaixaLote,
    IReadOnlyCollection<ProdutoFornecedorDto> Fornecedores,
    IReadOnlyCollection<ProdutoCodigoDto> Codigos,
    IReadOnlyCollection<ProdutoCampoCustomizadoDto> CamposCustomizados,
    IReadOnlyCollection<ProdutoRegraFiscalAplicadaDto> RegrasFiscaisAplicadas,
    IReadOnlyCollection<string> PendenciasFiscais,
    bool FiscalCompleto,
    DateTime DataCadastro,
    bool EstoqueBaixo);

public sealed record ProdutoBaseExternaStatusDto(
    bool Disponivel,
    string Mensagem,
    string? Provedor);

public sealed record ProdutoCatalogoExternoConsultaDto(
    bool Encontrado,
    string Gtin,
    string? Nome,
    string? Descricao,
    string? Marca,
    string? Ncm,
    string? ImagemUrl,
    decimal? PrecoMedio,
    string? UnidadeSugerida,
    string Provedor,
    string Mensagem,
    string? FonteUrl,
    string? BuscaUrl);

public sealed record ProdutoPesquisaPrecoFonteDto(
    string Provedor,
    string? Codigo,
    string Nome,
    string? Descricao,
    string? Marca,
    string? Ncm,
    string? ImagemUrl,
    decimal? Preco,
    string UnidadeSugerida,
    int Relevancia,
    string? FonteUrl,
    string? BuscaUrl);

public sealed record ProdutoPesquisaPrecosDto(
    string Termo,
    string Mensagem,
    string? ImagemUrl,
    decimal? MenorPreco,
    decimal? MaiorPreco,
    decimal? PrecoMedio,
    string? FonteMenorPreco,
    IReadOnlyCollection<ProdutoPesquisaPrecoFonteDto> Fontes);

public sealed record ProdutoImagemUploadDto(
    string ImagemUrl,
    string NomeArquivoOriginal,
    long TamanhoBytes,
    string? TermoBusca,
    string? TermoBuscaOrigem,
    string? DiagnosticoReconhecimento);
