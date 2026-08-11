namespace PDV.Api.DTOs;

public sealed record LiberacaoGerenteRequest(
    string Acao,
    string CodigoBarrasCracha,
    string Senha,
    string? Observacao);
