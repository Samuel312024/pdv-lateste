namespace PDV.Api.DTOs;

public sealed record FiscalCalculoProdutoRequest(
    ProdutoRequest Produto,
    decimal Quantidade,
    decimal ValorUnitario,
    decimal Desconto,
    string? UfDestino,
    bool ConsumidorFinal,
    bool ContribuinteIcms,
    bool OperacaoEntrada = false);

public sealed record FiscalCalculoImpostoDto(
    string Imposto,
    decimal BaseCalculo,
    decimal? Aliquota,
    decimal Valor,
    string? CodigoTributacao,
    string Descricao);

public sealed record FiscalCalculoProdutoResponse(
    bool FiscalCompleto,
    IReadOnlyCollection<string> Pendencias,
    string RegimeTributarioEmpresa,
    string UfOrigem,
    string UfDestino,
    string? CfopAplicado,
    decimal ValorBruto,
    decimal ValorDesconto,
    decimal ValorLiquido,
    IReadOnlyCollection<FiscalCalculoImpostoDto> Impostos,
    IReadOnlyCollection<string> MemoriaCalculo);
