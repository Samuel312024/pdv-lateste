namespace PDV.Api.DTOs;

public sealed record AbrirCaixaRequest(decimal ValorInicial, LiberacaoGerenteRequest? LiberacaoGerente);

public sealed record FecharCaixaRequest(decimal ValorContadoDinheiro, string? Observacao, LiberacaoGerenteRequest? LiberacaoGerente);

public sealed record MovimentoCaixaRequest(decimal Valor, string? Observacao, LiberacaoGerenteRequest? LiberacaoGerente);

public sealed record CaixaDto(
    Guid CaixaId,
    Guid EmpresaId,
    Guid UsuarioId,
    DateTime DataAbertura,
    DateTime? DataFechamento,
    decimal ValorInicial,
    decimal ValorDinheiro,
    decimal ValorCartaoCredito,
    decimal ValorCartaoDebito,
    decimal ValorPix,
    decimal ValorVoucher,
    decimal ValorTotalVendas,
    decimal ValorSangria,
    decimal ValorSuprimento,
    decimal? DiferencaInformada,
    decimal ValorEsperadoEmDinheiro,
    string Status);

public sealed record CheckoutDisponibilidadeDto(
    bool Disponivel,
    string Mensagem);
