using PDV.Api.Domain;

namespace PDV.Api.DTOs;

public sealed record DashboardResumoDto(
    decimal TotalVendidoHoje,
    decimal TotalVendidoMes,
    int NumeroVendasHoje,
    decimal TicketMedioMes,
    int ProdutosEstoqueBaixo,
    int VendasCanceladasMes);

public sealed record DashboardVendasPorDiaDto(DateOnly Dia, decimal Total);

public sealed record DashboardProdutosMaisVendidosDto(Guid ProdutoId, string ProdutoNome, decimal Quantidade);

public sealed record DashboardVendasPorPagamentoDto(FormaPagamento FormaPagamento, decimal Total);

public sealed record MonitorOperacionalResumoDto(
    int PdvsAbertos,
    int OperadoresOnline,
    int VendasNosPdvsAbertos,
    decimal ItensVendidosNosPdvsAbertos,
    decimal TotalVendidoNosPdvsAbertos,
    decimal TicketMedioNosPdvsAbertos,
    DateTime UltimaAtualizacaoUtc);

public sealed record MonitorOperacionalPdvDto(
    int PdvNumero,
    Guid CaixaId,
    Guid UsuarioId,
    string UsuarioNome,
    string UsuarioEmail,
    string Perfil,
    bool UsuarioAtivo,
    bool UsuarioSessaoAtiva,
    DateTime? UsuarioUltimaPresencaUtc,
    DateTime DataAbertura,
    int TempoAbertoMinutos,
    int QuantidadeVendas,
    decimal QuantidadeItens,
    decimal ValorTotalVendas,
    decimal TicketMedio,
    DateTime? UltimaVendaEm,
    decimal ValorDinheiro,
    decimal ValorPix,
    decimal ValorCartaoDebito,
    decimal ValorCartaoCredito,
    decimal ValorVoucher);

public sealed record MonitorOperacionalVendaDto(
    Guid VendaId,
    Guid CaixaId,
    int PdvNumero,
    string NumeroVenda,
    string UsuarioNome,
    DateTime DataVenda,
    decimal QuantidadeItens,
    decimal Total,
    string FormasPagamento);

public sealed record MonitorOperacionalSnapshotDto(
    MonitorOperacionalResumoDto Resumo,
    IReadOnlyCollection<MonitorOperacionalPdvDto> Pdvs,
    IReadOnlyCollection<MonitorOperacionalVendaDto> VendasRecentes);
