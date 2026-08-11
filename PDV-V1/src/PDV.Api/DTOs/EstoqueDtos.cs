using PDV.Api.Domain;

namespace PDV.Api.DTOs;

public sealed record AjusteEstoqueRequest(
    Guid ProdutoId,
    Guid? DepositoEstoqueId,
    decimal NovoEstoque,
    string? Motivo);

public sealed record RegistrarEntradaLoteRequest(
    Guid ProdutoId,
    string CodigoLote,
    decimal QuantidadeEntrada,
    DateTime DataEntrada,
    DateTime? DataFabricacao,
    DateTime? DataValidade,
    decimal? PrecoCustoUnitario,
    string? DocumentoReferencia,
    string? Observacao);

public sealed record RegistrarRecebimentoEstoqueRequest(
    Guid ProdutoId,
    Guid? DepositoEstoqueId,
    decimal QuantidadeEntrada,
    decimal? PrecoCustoUnitario,
    string? DocumentoReferencia,
    string? Observacao);

public sealed record ReservarEstoqueRequest(
    Guid ProdutoId,
    Guid? DepositoEstoqueId,
    decimal Quantidade,
    string? Motivo);

public sealed record LiberarReservaEstoqueRequest(
    Guid ProdutoId,
    Guid? DepositoEstoqueId,
    decimal Quantidade,
    string? Motivo);

public sealed record TransferirEstoqueRequest(
    Guid ProdutoId,
    Guid DepositoOrigemId,
    Guid DepositoDestinoId,
    decimal Quantidade,
    string? DocumentoReferencia,
    string? Observacao);

public sealed record RegistrarExpedicaoEstoqueRequest(
    Guid ProdutoId,
    Guid? DepositoEstoqueId,
    decimal QuantidadeSaida,
    string? DocumentoReferencia,
    string? Observacao);

public sealed record ConferirEstoqueRequest(
    Guid ProdutoId,
    Guid? DepositoEstoqueId,
    decimal QuantidadeContada,
    string? DocumentoReferencia,
    string? Observacao);

public sealed record MovimentacaoEstoqueDto(
    Guid MovimentacaoEstoqueId,
    Guid ProdutoId,
    string ProdutoNome,
    MovimentacaoEstoqueTipo Tipo,
    decimal Quantidade,
    decimal EstoqueAnterior,
    decimal EstoqueAtual,
    decimal EstoqueReservadoAtual,
    MovimentacaoEstoqueOrigem Origem,
    Guid? ReferenciaId,
    DateTime DataMovimentacao,
    Guid UsuarioId,
    string? UsuarioNome,
    Guid? DepositoEstoqueId,
    string? DepositoNome,
    Guid? DepositoOrigemId,
    string? DepositoOrigemNome,
    Guid? DepositoDestinoId,
    string? DepositoDestinoNome,
    string? Observacao);

public sealed record EstoqueLoteDto(
    Guid EstoqueLoteId,
    Guid ProdutoId,
    Guid ProdutoLoteId,
    string CodigoLote,
    decimal QuantidadeEntrada,
    decimal QuantidadeDisponivel,
    DateTime DataEntrada,
    DateTime? DataFabricacao,
    DateTime? DataValidade,
    decimal? PrecoCustoUnitario,
    string? DocumentoReferencia,
    string? Observacao,
    bool Vencido,
    bool ProximoVencimento);

public sealed record EstoqueLoteAlertaDto(
    Guid EstoqueLoteId,
    Guid ProdutoId,
    string ProdutoNome,
    string UnidadeMedida,
    string CodigoLote,
    decimal QuantidadeDisponivel,
    DateTime DataValidade,
    int DiasParaVencer,
    bool Vencido,
    bool ProximoVencimento);

public sealed record DepositoEstoqueResumoDto(
    Guid DepositoEstoqueId,
    string Codigo,
    string Nome,
    string? Descricao,
    bool Padrao,
    bool PermiteVendaDireta,
    bool Ativo,
    int TotalSkus,
    decimal QuantidadeDisponivelTotal,
    decimal QuantidadeReservadaTotal,
    decimal QuantidadeFisicaTotal,
    decimal ValorDisponivelCusto,
    decimal ValorReservadoCusto);

public sealed record EstoqueDepositoSaldoDto(
    Guid? EstoqueDepositoId,
    Guid DepositoEstoqueId,
    string DepositoCodigo,
    string DepositoNome,
    string? DepositoDescricao,
    bool DepositoPadrao,
    bool PermiteVendaDireta,
    decimal QuantidadeDisponivel,
    decimal QuantidadeReservada,
    decimal QuantidadeFisica);

public sealed record PosicaoEstoqueProdutoDto(
    Guid ProdutoId,
    string ProdutoNome,
    string UnidadeMedida,
    decimal QuantidadeDisponivelTotal,
    decimal QuantidadeReservadaTotal,
    decimal QuantidadeFisicaTotal,
    IReadOnlyCollection<EstoqueDepositoSaldoDto> Depositos);

public sealed record TransferenciaEstoqueDto(
    Guid TransferenciaEstoqueId,
    Guid ProdutoId,
    string ProdutoNome,
    Guid DepositoOrigemId,
    string DepositoOrigemNome,
    Guid DepositoDestinoId,
    string DepositoDestinoNome,
    decimal Quantidade,
    TransferenciaEstoqueStatus Status,
    string? DocumentoReferencia,
    string? Observacao,
    DateTime DataTransferencia,
    Guid UsuarioId,
    string? UsuarioNome);

public sealed record ConferenciaEstoqueResultadoDto(
    Guid ProdutoId,
    string ProdutoNome,
    string UnidadeMedida,
    Guid DepositoEstoqueId,
    string DepositoNome,
    decimal QuantidadeSistema,
    decimal QuantidadeContada,
    decimal Divergencia,
    bool AjusteAplicado,
    MovimentacaoEstoqueDto? Movimentacao,
    string Mensagem);
