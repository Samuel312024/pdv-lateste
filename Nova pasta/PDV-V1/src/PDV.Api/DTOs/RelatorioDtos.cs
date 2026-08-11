using PDV.Api.Domain;

namespace PDV.Api.DTOs;

public sealed class RelatorioFiltroRequest
{
    public DateTime? DataInicial { get; init; }
    public DateTime? DataFinal { get; init; }
    public Guid? UsuarioId { get; init; }
    public Guid? ProdutoId { get; init; }
    public Guid? ClienteId { get; init; }
    public FormaPagamento? FormaPagamento { get; init; }
    public VendaStatus? StatusVenda { get; init; }
}

public sealed record RelatorioResumoDto(
    decimal TotalVendido,
    int QuantidadeVendas,
    decimal TicketMedio,
    int VendasCanceladas,
    decimal TotalDinheiro,
    decimal TotalPix,
    decimal TotalCartaoCredito,
    decimal TotalCartaoDebito,
    decimal TotalVoucher);

public sealed record RelatorioVendaLinhaDto(
    Guid VendaId,
    string NumeroVenda,
    DateTime DataVenda,
    string Status,
    Guid UsuarioId,
    string UsuarioNome,
    Guid? ClienteId,
    string? ClienteNome,
    decimal QuantidadeItens,
    decimal Subtotal,
    decimal DescontoTotal,
    decimal Total,
    string FormasPagamento,
    decimal ValorDinheiro,
    decimal ValorPix,
    decimal ValorCartaoCredito,
    decimal ValorCartaoDebito,
    decimal ValorVoucher,
    decimal TrocoTotal);

public sealed record RelatorioCaixaDto(
    Guid CaixaId,
    Guid UsuarioId,
    string UsuarioNome,
    DateTime DataAbertura,
    DateTime? DataFechamento,
    string Status,
    decimal ValorInicial,
    decimal ValorTotalVendas,
    decimal ValorDinheiro,
    decimal ValorCartaoCredito,
    decimal ValorCartaoDebito,
    decimal ValorPix,
    decimal ValorVoucher,
    decimal ValorSangria,
    decimal ValorSuprimento,
    decimal? DiferencaInformada,
    decimal ValorEsperadoEmDinheiro);

public sealed record RelatorioEstoqueBaixoDto(
    Guid ProdutoId,
    string Nome,
    string? CodigoBarras,
    decimal EstoqueAtual,
    decimal EstoqueMinimo,
    string UnidadeMedida);

public sealed record RelatorioFiltroOpcaoDto(Guid Id, string Nome);

public sealed record RelatorioFiltrosOpcoesDto(
    IReadOnlyCollection<RelatorioFiltroOpcaoDto> Usuarios,
    IReadOnlyCollection<RelatorioFiltroOpcaoDto> Clientes,
    IReadOnlyCollection<RelatorioFiltroOpcaoDto> Produtos);
