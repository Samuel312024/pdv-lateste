using PDV.Api.Domain;

namespace PDV.Api.DTOs;

public sealed class FinanceiroFiltroRequest
{
    public DateTime? DataInicial { get; init; }
    public DateTime? DataFinal { get; init; }
    public string? Termo { get; init; }
    public FinanceiroTipo? Tipo { get; init; }
    public FinanceiroStatus? Status { get; init; }
    public Guid? ClienteId { get; init; }
    public Guid? FornecedorId { get; init; }
    public Guid? UsuarioId { get; init; }
}

public sealed record FinanceiroResumoDto(
    decimal EntradasLiquidadas,
    decimal SaidasLiquidadas,
    decimal SaldoPeriodo,
    decimal ContasReceberPendentes,
    decimal ContasPagarPendentes,
    decimal LucroBrutoVendas,
    int LancamentosPendentes,
    int LancamentosLiquidados);

public sealed record LancamentoFinanceiroDto(
    Guid LancamentoFinanceiroId,
    Guid EmpresaId,
    string Tipo,
    string Origem,
    string Status,
    string Descricao,
    string? DocumentoReferencia,
    Guid? VendaId,
    string? NumeroVenda,
    Guid? ClienteId,
    string? ClienteNome,
    Guid? FornecedorId,
    string? FornecedorNome,
    Guid? UsuarioId,
    string? UsuarioNome,
    Guid? CaixaId,
    DateTime DataCompetencia,
    DateTime DataVencimento,
    DateTime? DataLiquidacao,
    decimal ValorOriginal,
    decimal ValorDesconto,
    decimal ValorAcrescimo,
    decimal ValorFinal,
    decimal ValorCusto,
    string? Observacao);

public sealed record CriarLancamentoFinanceiroRequest(
    string Descricao,
    string? DocumentoReferencia,
    Guid? ClienteId,
    Guid? FornecedorId,
    DateTime? DataCompetencia,
    DateTime? DataVencimento,
    decimal ValorOriginal,
    decimal? ValorDesconto,
    decimal? ValorAcrescimo,
    string? Observacao,
    bool Liquidado);

public sealed record LiquidarLancamentoFinanceiroRequest(
    DateTime? DataLiquidacao,
    string? Observacao);
