namespace PDV.Api.DTOs;

public sealed record FiscalCatalogoOpcaoDto(
    string Codigo,
    string Descricao,
    string? Detalhe,
    bool ExigeCest = false,
    bool ExigeContexto = false);

public sealed record FiscalNcmDto(
    string Codigo,
    string Descricao,
    string? CestPadraoCodigo,
    decimal? AliquotaIbpt,
    bool SujeitoSt,
    bool CadastroAutomatico = false,
    string? ObservacaoCadastro = null);

public sealed record FiscalNcmOficialDto(
    string Codigo,
    string CodigoNormalizado,
    string Descricao,
    string? DescricaoConcatenada,
    DateTime? DataInicio,
    DateTime? DataFim,
    string? TipoAtoInicio,
    string? NumeroAtoInicio,
    string? AnoAtoInicio,
    bool EhItemFinal,
    bool Vigente,
    bool Ativo);

public sealed record FiscalCestDto(
    string Codigo,
    string Descricao,
    string? NcmCodigo);

public sealed record ProdutoFiscalAssistenteContextoDto(
    string RegimeTributarioEmpresa,
    bool UsuarioAdministrador,
    IReadOnlyCollection<FiscalCatalogoOpcaoDto> PerfisFiscais,
    IReadOnlyCollection<FiscalCatalogoOpcaoDto> OrigensFiscais,
    IReadOnlyCollection<FiscalCatalogoOpcaoDto> Cfops,
    IReadOnlyCollection<FiscalCatalogoOpcaoDto> Csosns,
    IReadOnlyCollection<FiscalCatalogoOpcaoDto> CstIcms,
    IReadOnlyCollection<FiscalCatalogoOpcaoDto> CstPisCofins,
    IReadOnlyCollection<FiscalCatalogoOpcaoDto> BeneficiosFiscais);

public sealed class ProdutoFiscalSugestaoNcmRequest
{
    public string? Ncm { get; set; }
    public string? DescricaoNcm { get; set; }
    public string? Cest { get; set; }
    public string? PerfilFiscalPadrao { get; set; }
    public string? OrigemFiscal { get; set; }
    public string? BeneficioFiscalCodigo { get; set; }
    public string? CodigoAnp { get; set; }
    public string? UnidadeMedida { get; set; }
    public string? UnidadeTributavel { get; set; }
    public string? ExTipi { get; set; }
}

public sealed record ProdutoFiscalSugestaoNcmDto(
    string? Ncm,
    string? DescricaoNcm,
    bool NcmCriadoAutomaticamente,
    string? MensagemCadastroNcm,
    bool SujeitoSt,
    bool RequerRevisaoSt,
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
    bool FiscalCompleto,
    IReadOnlyCollection<string> Pendencias,
    IReadOnlyCollection<ProdutoRegraFiscalAplicadaDto> RegrasAplicadas);

public sealed record FiscalNcmCadastroRapidoRequest(
    string Codigo,
    string? Descricao,
    string? CestPadraoCodigo,
    decimal? AliquotaIbpt,
    bool? SujeitoSt);

public sealed record FiscalNcmImportacaoResultadoDto(
    string NomeArquivo,
    int TotalLinhas,
    int Criados,
    int Atualizados,
    int Ignorados,
    int Invalidos,
    IReadOnlyCollection<string> Avisos);
