using PDV.Api.Domain;

namespace PDV.Api.DTOs;

public sealed record PedidoOcorrenciaDto(
    Guid PedidoOcorrenciaId,
    string Status,
    string Titulo,
    string? Descricao,
    bool VisivelParaCliente,
    DateTime DataOcorrencia,
    Guid? UsuarioId,
    string? UsuarioNome);

public sealed record PedidoEntregaLocalizacaoDto(
    decimal Latitude,
    decimal Longitude,
    decimal? PrecisaoMetros,
    decimal? VelocidadeKmh,
    decimal? DirecaoGraus,
    DateTime DataCaptura,
    string LinkMapa);

public sealed record PedidoEntregaDto(
    Guid? TransportadoraId,
    string? TransportadoraNome,
    string? TransportadoraCorTemaHex,
    Guid? EntregadorUsuarioId,
    string? EntregadorUsuarioNome,
    string? NomeEntregador,
    string? TelefoneEntregador,
    bool CompartilhamentoAtivo,
    DateTime? UltimaAtualizacaoGps,
    string? LinkPainelEntregador,
    PedidoEntregaLocalizacaoDto? LocalizacaoAtual);

public sealed record PedidoResumoDto(
    Guid VendaId,
    string NumeroVenda,
    string CodigoAcompanhamento,
    string StatusVenda,
    string PedidoStatus,
    string AtendimentoTipo,
    string ClienteNome,
    string? ClienteTelefone,
    decimal Total,
    int QuantidadeItens,
    DateTime DataVenda,
    DateTime? DataUltimaAtualizacao,
    string? EnderecoEntregaResumo,
    string? ObservacaoPedido,
    PedidoEntregaDto? Entrega);

public sealed record PedidoDetalheDto(
    Guid VendaId,
    Guid? ClienteId,
    string NumeroVenda,
    string CodigoAcompanhamento,
    string StatusVenda,
    string PedidoStatus,
    string AtendimentoTipo,
    string ClienteNome,
    string? ClienteDocumento,
    string? ClienteTelefone,
    decimal Subtotal,
    decimal DescontoTotal,
    decimal Total,
    DateTime DataVenda,
    DateTime? DataUltimaAtualizacao,
    string? ObservacaoPedido,
    string? EnderecoEntregaResumo,
    PedidoEntregaDto? Entrega,
    IReadOnlyCollection<VendaItemDto> Itens,
    IReadOnlyCollection<VendaPagamentoDto> Pagamentos,
    IReadOnlyCollection<PedidoOcorrenciaDto> Ocorrencias);

public sealed record AtualizarPedidoStatusRequest(
    PedidoStatus Status,
    string? Observacao);

public sealed record AtualizarPedidoEntregaRequest(
    Guid? TransportadoraId,
    Guid? EntregadorUsuarioId,
    string? NomeEntregador,
    string? TelefoneEntregador,
    bool CompartilhamentoAtivo);

public sealed record RegistrarEntregaLocalizacaoRequest(
    decimal Latitude,
    decimal Longitude,
    decimal? PrecisaoMetros,
    decimal? VelocidadeKmh,
    decimal? DirecaoGraus);

public sealed record PainelEntregaPublicoDto(
    Guid VendaId,
    string CodigoAcompanhamento,
    string PedidoStatus,
    string ClienteNome,
    string? EnderecoEntregaResumo,
    string? ObservacaoPedido,
    PedidoEntregaDto? Entrega);

public sealed record PedidoCheckoutDisponibilidadeDto(
    bool Disponivel,
    string Mensagem);

public sealed record PedidoRealtimeEventoDto(
    Guid VendaId,
    Guid? ClienteId,
    string NumeroVenda,
    string CodigoAcompanhamento,
    string PedidoStatus,
    DateTime AtualizadoEm,
    string TipoEvento,
    PedidoEntregaDto? Entrega);
