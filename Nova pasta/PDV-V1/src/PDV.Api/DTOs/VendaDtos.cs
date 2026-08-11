using PDV.Api.Domain;

namespace PDV.Api.DTOs;

public sealed record FinalizarVendaItemRequest(Guid ProdutoId, decimal Quantidade, decimal Desconto);

public sealed record FinalizarVendaPagamentoRequest(
    FormaPagamento FormaPagamento,
    decimal ValorPago,
    PagamentoCapturaModo? CapturaModo,
    string? ProvedorOperacao,
    string? ReferenciaTransacao,
    string? CodigoAutorizacao,
    string? BandeiraCartao,
    string? UltimosDigitosCartao,
    int? Parcelas,
    string? ObservacaoOperacao);

public sealed record FinalizarPedidoRequest(
    AtendimentoPedidoTipo AtendimentoTipo,
    string? ContatoNome,
    string? ContatoTelefone,
    string? ObservacaoPedido);

public sealed record FinalizarVendaRequest(
    Guid? ClienteId,
    IReadOnlyCollection<FinalizarVendaItemRequest> Itens,
    IReadOnlyCollection<FinalizarVendaPagamentoRequest> Pagamentos,
    bool EmitirNfe,
    FinalizarPedidoRequest? Pedido,
    IReadOnlyCollection<LiberacaoGerenteRequest>? LiberacoesGerenciais);

public sealed record VendaItemDto(
    Guid VendaItemId,
    Guid ProdutoId,
    string ProdutoNome,
    decimal Quantidade,
    decimal ValorUnitario,
    decimal Desconto,
    decimal Total);

public sealed record VendaPagamentoDto(
    Guid VendaPagamentoId,
    FormaPagamento FormaPagamento,
    PagamentoCapturaModo CapturaModo,
    PagamentoStatusTransacao StatusTransacao,
    string? ProvedorOperacao,
    string? ReferenciaTransacao,
    string? CodigoAutorizacao,
    string? BandeiraCartao,
    string? UltimosDigitosCartao,
    int? Parcelas,
    string? ObservacaoOperacao,
    DateTime? DataCaptura,
    decimal ValorPago,
    decimal Troco);

public sealed record VendaDto(
    Guid VendaId,
    Guid EmpresaId,
    Guid CaixaId,
    Guid UsuarioId,
    Guid? ClienteId,
    string? ClienteNome,
    string NumeroVenda,
    DateTime DataVenda,
    decimal Subtotal,
    decimal DescontoTotal,
    decimal Total,
    string Status,
    bool EhPedido,
    string? AtendimentoTipo,
    string? PedidoStatus,
    string? CodigoAcompanhamento,
    string? ContatoNome,
    string? ContatoTelefone,
    string? ObservacaoPedido,
    string? EnderecoEntregaResumo,
    DateTime? DataUltimaAtualizacaoPedido,
    string? MotivoCancelamento,
    IReadOnlyCollection<VendaItemDto> Itens,
    IReadOnlyCollection<VendaPagamentoDto> Pagamentos);

public sealed record FinalizarVendaResponse(
    Guid VendaId,
    string NumeroVenda,
    decimal Total,
    decimal Troco,
    bool EhPedido,
    string? CodigoAcompanhamento,
    string? PedidoStatus,
    Guid? NotaFiscalId,
    string? NotaFiscalReferencia,
    string? NotaFiscalStatus,
    bool? NotaFiscalProntaParaTransmissao,
    IReadOnlyCollection<string>? NotaFiscalPendencias);

public sealed record CancelarVendaRequest(string Motivo);
