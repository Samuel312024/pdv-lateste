using PDV.Api.Domain;

namespace PDV.Api.DTOs;

public sealed record CobrancaDigitalDto(
    Guid CobrancaDigitalId,
    Guid EmpresaId,
    Guid? ClienteId,
    string? ClienteNome,
    Guid? VendaId,
    Guid? LancamentoFinanceiroId,
    string Provider,
    string Origem,
    string Status,
    string? StatusExterno,
    string Descricao,
    string? DocumentoReferencia,
    string? IdentificadorInterno,
    string? ChargeIdExterno,
    string? CustomIdExterno,
    decimal ValorOriginal,
    decimal? ValorPago,
    DateTime DataVencimento,
    DateTime? DataCriacaoProvider,
    DateTime? DataPagamento,
    DateTime DataCriacao,
    DateTime DataAtualizacao,
    string? PixCopiaECola,
    string? PixQrCodeImageUrl,
    string? LinhaDigitavel,
    string? LinkCobranca,
    string? LinkBoleto,
    string? LinkPdf,
    string? Observacao);

public sealed class CobrancaDigitalFiltroRequest
{
    public CobrancaDigitalOrigem? Origem { get; init; }
    public CobrancaDigitalStatus? Status { get; init; }
    public Guid? ClienteId { get; init; }
    public int Limite { get; init; } = 50;
}

public sealed record CriarCobrancaDigitalCheckoutRequest(
    Guid ClienteId,
    decimal Valor,
    string Descricao,
    string? DocumentoReferencia,
    FormaPagamento FormaPagamento);

public sealed record CriarCobrancaDigitalFinanceiroRequest(
    Guid ClienteId,
    string Descricao,
    string? DocumentoReferencia,
    DateTime? DataVencimento,
    decimal ValorOriginal,
    string? Observacao);
