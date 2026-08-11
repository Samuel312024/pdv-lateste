using Microsoft.EntityFrameworkCore;
using PDV.Api.Common;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Infrastructure;

namespace PDV.Api.Services;

public class EstoqueService(AppDbContext dbContext, CurrentUserService currentUser)
{
    private const int ExpirationWarningDays = 30;

    public async Task<IReadOnlyCollection<MovimentacaoEstoqueDto>> GetMovimentacoesAsync(Guid? produtoId, DateTime? dataInicial, DateTime? dataFinal)
    {
        var empresaId = currentUser.GetEmpresaId();
        var query = dbContext.MovimentacoesEstoque
            .AsNoTracking()
            .Include(item => item.Produto)
            .Include(item => item.Usuario)
            .Include(item => item.DepositoEstoque)
            .Include(item => item.DepositoOrigem)
            .Include(item => item.DepositoDestino)
            .Where(item => item.EmpresaId == empresaId);

        if (produtoId.HasValue)
        {
            query = query.Where(item => item.ProdutoId == produtoId.Value);
        }

        if (dataInicial.HasValue)
        {
            query = query.Where(item => item.DataMovimentacao >= dataInicial.Value);
        }

        if (dataFinal.HasValue)
        {
            query = query.Where(item => item.DataMovimentacao <= dataFinal.Value);
        }

        var items = await query
            .OrderByDescending(item => item.DataMovimentacao)
            .Take(200)
            .ToListAsync();

        return items.Select(item => MapMovimentacao(item)).ToArray();
    }

    public async Task<IReadOnlyCollection<EstoqueLoteAlertaDto>> GetLotesComAlertaAsync(int diasLimite = ExpirationWarningDays)
    {
        var empresaId = currentUser.GetEmpresaId();
        var hoje = DateTime.UtcNow.Date;
        var limite = hoje.AddDays(Math.Max(0, diasLimite));

        var items = await dbContext.EstoquesLote
            .AsNoTracking()
            .Include(item => item.Produto)
            .Include(item => item.ProdutoLote)
            .Where(item =>
                item.EmpresaId == empresaId &&
                item.QuantidadeDisponivel > 0 &&
                item.ProdutoLote.DataValidade.HasValue &&
                item.ProdutoLote.DataValidade.Value.Date <= limite)
            .OrderBy(item => item.ProdutoLote.DataValidade)
            .ThenBy(item => item.Produto.Nome)
            .ThenBy(item => item.DataEntrada)
            .Take(100)
            .ToListAsync();

        return items.Select(MapLoteAlerta).ToArray();
    }

    public async Task<IReadOnlyCollection<DepositoEstoqueResumoDto>> GetDepositosResumoAsync()
    {
        var empresaId = currentUser.GetEmpresaId();
        await EnsureCompanyDepositsAsync(empresaId);

        var deposits = await dbContext.DepositosEstoque
            .AsNoTracking()
            .Where(item => item.EmpresaId == empresaId && item.Ativo)
            .OrderByDescending(item => item.Padrao)
            .ThenBy(item => item.Codigo)
            .ToListAsync();

        var balances = await dbContext.EstoquesDeposito
            .AsNoTracking()
            .Include(item => item.Produto)
            .Where(item => item.EmpresaId == empresaId)
            .ToListAsync();

        var balanceLookup = balances
            .GroupBy(item => item.DepositoEstoqueId)
            .ToDictionary(item => item.Key, item => item.ToArray());

        return deposits
            .Select(item =>
            {
                balanceLookup.TryGetValue(item.DepositoEstoqueId, out var depositBalances);
                var rows = depositBalances ?? [];
                var quantidadeDisponivel = rows.Sum(row => row.QuantidadeDisponivel);
                var quantidadeReservada = rows.Sum(row => row.QuantidadeReservada);
                return new DepositoEstoqueResumoDto(
                    item.DepositoEstoqueId,
                    item.Codigo,
                    item.Nome,
                    item.Descricao,
                    item.Padrao,
                    item.PermiteVendaDireta,
                    item.Ativo,
                    rows.Count(row => row.QuantidadeDisponivel > 0 || row.QuantidadeReservada > 0),
                    quantidadeDisponivel,
                    quantidadeReservada,
                    quantidadeDisponivel + quantidadeReservada,
                    rows.Sum(row => row.QuantidadeDisponivel * row.Produto.PrecoCusto),
                    rows.Sum(row => row.QuantidadeReservada * row.Produto.PrecoCusto));
            })
            .ToArray();
    }

    public async Task<PosicaoEstoqueProdutoDto> GetPosicaoProdutoAsync(Guid produtoId)
    {
        var produto = await GetProdutoEmpresaAtualAsync(produtoId, asNoTracking: true);
        await EnsureCompanyDepositsAsync(produto.EmpresaId);

        var deposits = await dbContext.DepositosEstoque
            .AsNoTracking()
            .Where(item => item.EmpresaId == produto.EmpresaId && item.Ativo)
            .OrderByDescending(item => item.Padrao)
            .ThenBy(item => item.Codigo)
            .ToListAsync();

        var balances = await dbContext.EstoquesDeposito
            .AsNoTracking()
            .Where(item => item.EmpresaId == produto.EmpresaId && item.ProdutoId == produto.ProdutoId)
            .ToListAsync();

        if (balances.Count == 0 && produto.ControlaEstoque)
        {
            var defaultDeposit = deposits.FirstOrDefault(item => item.Padrao) ?? deposits.FirstOrDefault();
            if (defaultDeposit is not null)
            {
                balances =
                [
                    new EstoqueDeposito
                    {
                        EstoqueDepositoId = Guid.Empty,
                        EmpresaId = produto.EmpresaId,
                        ProdutoId = produto.ProdutoId,
                        DepositoEstoqueId = defaultDeposit.DepositoEstoqueId,
                        QuantidadeDisponivel = produto.EstoqueAtual,
                        QuantidadeReservada = 0m,
                        Ativo = produto.EstoqueAtual > 0,
                        DataAtualizacao = DateTime.UtcNow
                    }
                ];
            }
        }

        var mappedDeposits = deposits
            .Select(deposit =>
            {
                var balance = balances.FirstOrDefault(item => item.DepositoEstoqueId == deposit.DepositoEstoqueId);
                var quantidadeDisponivel = balance?.QuantidadeDisponivel ?? 0m;
                var quantidadeReservada = balance?.QuantidadeReservada ?? 0m;
                return new EstoqueDepositoSaldoDto(
                    balance?.EstoqueDepositoId,
                    deposit.DepositoEstoqueId,
                    deposit.Codigo,
                    deposit.Nome,
                    deposit.Descricao,
                    deposit.Padrao,
                    deposit.PermiteVendaDireta,
                    quantidadeDisponivel,
                    quantidadeReservada,
                    quantidadeDisponivel + quantidadeReservada);
            })
            .ToArray();

        return new PosicaoEstoqueProdutoDto(
            produto.ProdutoId,
            produto.Nome,
            produto.UnidadeMedida,
            mappedDeposits.Sum(item => item.QuantidadeDisponivel),
            mappedDeposits.Sum(item => item.QuantidadeReservada),
            mappedDeposits.Sum(item => item.QuantidadeFisica),
            mappedDeposits);
    }

    public async Task<IReadOnlyCollection<EstoqueLoteDto>> GetLotesProdutoAsync(Guid produtoId, bool apenasComSaldo = false)
    {
        var produto = await GetProdutoEmpresaAtualAsync(produtoId, asNoTracking: true);
        if (!produto.ControlaLote)
        {
            return [];
        }

        var query = dbContext.EstoquesLote
            .AsNoTracking()
            .Include(item => item.ProdutoLote)
            .Where(item => item.EmpresaId == produto.EmpresaId && item.ProdutoId == produtoId);

        if (apenasComSaldo)
        {
            query = query.Where(item => item.QuantidadeDisponivel > 0);
        }

        var items = await query
            .OrderBy(item => item.ProdutoLote.DataValidade.HasValue ? 0 : 1)
            .ThenBy(item => item.ProdutoLote.DataValidade)
            .ThenBy(item => item.DataEntrada)
            .ToListAsync();

        return items.Select(MapEstoqueLote).ToArray();
    }

    public async Task<MovimentacaoEstoqueDto> AjustarAsync(AjusteEstoqueRequest request)
    {
        if (request.NovoEstoque < 0)
        {
            throw new AppException("Novo estoque nao pode ser negativo.");
        }

        var empresaId = currentUser.GetEmpresaId();
        var usuarioId = currentUser.GetUserId();
        var produto = await dbContext.Produtos
            .FirstOrDefaultAsync(item => item.ProdutoId == request.ProdutoId && item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Produto nao encontrado.");

        if (!produto.ControlaEstoque)
        {
            throw new AppException("Este produto nao usa baixa automatica de estoque.");
        }

        if (produto.ControlaLote)
        {
            throw new AppException("Este produto usa controle por lote. Registre entrada por lote em vez de ajuste manual do estoque agregado.");
        }

        await EnsureCompanyDepositsAsync(empresaId);
        var deposito = await ResolveDepositoAsync(empresaId, request.DepositoEstoqueId);
        var balances = await LoadTrackedBalancesAsync(produto);
        var balance = CreateOrGetBalance(produto, deposito.DepositoEstoqueId, balances);

        var estoqueAnterior = produto.EstoqueAtual;
        var quantidadeAnteriorDeposito = balance.QuantidadeDisponivel;
        balance.QuantidadeDisponivel = RoundQuantity(request.NovoEstoque);
        balance.Ativo = balance.QuantidadeDisponivel > 0 || balance.QuantidadeReservada > 0;
        balance.DataAtualizacao = DateTime.UtcNow;

        var totals = RecalculateTotals(produto, balances);
        var movimentacao = new MovimentacaoEstoque
        {
            MovimentacaoEstoqueId = Guid.NewGuid(),
            EmpresaId = empresaId,
            ProdutoId = produto.ProdutoId,
            Tipo = MovimentacaoEstoqueTipo.Ajuste,
            Quantidade = RoundQuantity(balance.QuantidadeDisponivel - quantidadeAnteriorDeposito),
            EstoqueAnterior = estoqueAnterior,
            EstoqueAtual = totals.Disponivel,
            EstoqueReservadoAtual = totals.Reservado,
            Origem = MovimentacaoEstoqueOrigem.AjusteManual,
            UsuarioId = usuarioId,
            DepositoEstoqueId = deposito.DepositoEstoqueId,
            Observacao = NormalizeMaxLength(request.Motivo, 250, "Motivo do ajuste")
        };

        dbContext.MovimentacoesEstoque.Add(movimentacao);
        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = empresaId,
            UsuarioId = usuarioId,
            Modulo = "Estoque",
            Acao = "Ajuste",
            Descricao = $"Saldo disponivel do produto {produto.Nome} ajustado no deposito {deposito.Nome}.",
            IpAddress = currentUser.GetIpAddress(),
            Dados = System.Text.Json.JsonSerializer.Serialize(new
            {
                produto.ProdutoId,
                produto.Nome,
                Deposito = deposito.Nome,
                EstoqueAnterior = estoqueAnterior,
                EstoqueAtual = totals.Disponivel,
                request.Motivo
            })
        });
        await dbContext.SaveChangesAsync();
        await LoadMovementReferencesAsync(movimentacao);

        return MapMovimentacao(movimentacao, produto.Nome);
    }

    public async Task<EstoqueLoteDto> RegistrarEntradaLoteAsync(RegistrarEntradaLoteRequest request)
    {
        if (request.QuantidadeEntrada <= 0)
        {
            throw new AppException("Quantidade de entrada do lote deve ser maior que zero.");
        }

        var empresaId = currentUser.GetEmpresaId();
        var usuarioId = currentUser.GetUserId();
        var produto = await dbContext.Produtos
            .FirstOrDefaultAsync(item => item.ProdutoId == request.ProdutoId && item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Produto nao encontrado.");

        if (!produto.ControlaEstoque)
        {
            throw new AppException("O produto precisa controlar estoque para receber entradas por lote.");
        }

        if (!produto.ControlaLote)
        {
            throw new AppException("Ative o controle por lote no produto antes de registrar entradas por lote.");
        }

        await EnsureCompanyDepositsAsync(empresaId);
        var depositoPadrao = await ResolveDepositoAsync(empresaId, null);

        var codigoLote = NormalizeLoteCode(request.CodigoLote);
        var dataEntrada = NormalizeDate(request.DataEntrada, "Data de entrada");
        var dataFabricacao = NormalizeOptionalDate(request.DataFabricacao);
        var dataValidade = NormalizeOptionalDate(request.DataValidade);
        if (dataFabricacao.HasValue && dataValidade.HasValue && dataValidade.Value.Date < dataFabricacao.Value.Date)
        {
            throw new AppException("Data de validade nao pode ser anterior a data de fabricacao.");
        }

        var documentoReferencia = NormalizeMaxLength(request.DocumentoReferencia, 80, "Documento de referencia");
        var observacao = NormalizeMaxLength(request.Observacao, 250, "Observacao do lote");
        var precoCustoUnitario = NormalizeNullableMoney(request.PrecoCustoUnitario, "Preco de custo do lote");

        var lote = await dbContext.ProdutoLotes
            .FirstOrDefaultAsync(item =>
                item.EmpresaId == empresaId &&
                item.ProdutoId == produto.ProdutoId &&
                item.CodigoLote == codigoLote);

        if (lote is null)
        {
            lote = new ProdutoLote
            {
                ProdutoLoteId = Guid.NewGuid(),
                EmpresaId = empresaId,
                ProdutoId = produto.ProdutoId,
                CodigoLote = codigoLote,
                DataFabricacao = dataFabricacao,
                DataValidade = dataValidade,
                Observacao = observacao,
                Ativo = true,
                DataCadastro = DateTime.UtcNow
            };

            dbContext.ProdutoLotes.Add(lote);
        }
        else
        {
            ValidateExistingLoteConsistency(lote, dataFabricacao, dataValidade);
            lote.Ativo = true;
            if (lote.Observacao is null && observacao is not null)
            {
                lote.Observacao = observacao;
            }
        }

        var entrada = new EstoqueLote
        {
            EstoqueLoteId = Guid.NewGuid(),
            EmpresaId = empresaId,
            ProdutoId = produto.ProdutoId,
            ProdutoLoteId = lote.ProdutoLoteId,
            QuantidadeEntrada = RoundQuantity(request.QuantidadeEntrada),
            QuantidadeDisponivel = RoundQuantity(request.QuantidadeEntrada),
            PrecoCustoUnitario = precoCustoUnitario,
            DataEntrada = dataEntrada,
            DocumentoReferencia = documentoReferencia,
            UsuarioId = usuarioId,
            Ativo = true
        };

        var balances = await LoadTrackedBalancesAsync(produto);
        var depositoBalance = CreateOrGetBalance(produto, depositoPadrao.DepositoEstoqueId, balances);

        var estoqueAnterior = produto.EstoqueAtual;
        depositoBalance.QuantidadeDisponivel = RoundQuantity(depositoBalance.QuantidadeDisponivel + request.QuantidadeEntrada);
        depositoBalance.Ativo = true;
        depositoBalance.DataAtualizacao = DateTime.UtcNow;
        if (precoCustoUnitario.HasValue && precoCustoUnitario.Value >= 0)
        {
            produto.PrecoCusto = precoCustoUnitario.Value;
        }
        var totals = RecalculateTotals(produto, balances);

        var movimentacao = new MovimentacaoEstoque
        {
            MovimentacaoEstoqueId = Guid.NewGuid(),
            EmpresaId = empresaId,
            ProdutoId = produto.ProdutoId,
            Tipo = MovimentacaoEstoqueTipo.Entrada,
            Quantidade = RoundQuantity(request.QuantidadeEntrada),
            EstoqueAnterior = estoqueAnterior,
            EstoqueAtual = totals.Disponivel,
            EstoqueReservadoAtual = totals.Reservado,
            Origem = MovimentacaoEstoqueOrigem.Compra,
            ReferenciaId = entrada.EstoqueLoteId,
            UsuarioId = usuarioId,
            DataMovimentacao = DateTime.UtcNow,
            DepositoEstoqueId = depositoPadrao.DepositoEstoqueId,
            Observacao = documentoReferencia
        };

        dbContext.EstoquesLote.Add(entrada);
        dbContext.MovimentacoesEstoque.Add(movimentacao);
        dbContext.MovimentacoesEstoqueLote.Add(new MovimentacaoEstoqueLote
        {
            MovimentacaoEstoqueLoteId = Guid.NewGuid(),
            EmpresaId = empresaId,
            MovimentacaoEstoqueId = movimentacao.MovimentacaoEstoqueId,
            ProdutoId = produto.ProdutoId,
            ProdutoLoteId = lote.ProdutoLoteId,
            EstoqueLoteId = entrada.EstoqueLoteId,
            Quantidade = RoundQuantity(request.QuantidadeEntrada),
            DataMovimentacao = movimentacao.DataMovimentacao
        });
        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = empresaId,
            UsuarioId = usuarioId,
            Modulo = "Estoque",
            Acao = "EntradaLote",
            Descricao = $"Entrada de lote {codigoLote} registrada para o produto {produto.Nome} no deposito {depositoPadrao.Nome}.",
            IpAddress = currentUser.GetIpAddress(),
            Dados = System.Text.Json.JsonSerializer.Serialize(new
            {
                produto.ProdutoId,
                produto.Nome,
                Deposito = depositoPadrao.Nome,
                Lote = codigoLote,
                request.QuantidadeEntrada,
                entrada.DataEntrada,
                lote.DataFabricacao,
                lote.DataValidade,
                entrada.DocumentoReferencia
            })
        });

        await dbContext.SaveChangesAsync();
        await dbContext.Entry(entrada).Reference(item => item.ProdutoLote).LoadAsync();
        return MapEstoqueLote(entrada);
    }

    public async Task<MovimentacaoEstoqueDto> RegistrarRecebimentoAsync(RegistrarRecebimentoEstoqueRequest request)
    {
        if (request.QuantidadeEntrada <= 0)
        {
            throw new AppException("Quantidade de recebimento deve ser maior que zero.");
        }

        var empresaId = currentUser.GetEmpresaId();
        var usuarioId = currentUser.GetUserId();
        var produto = await dbContext.Produtos
            .FirstOrDefaultAsync(item => item.ProdutoId == request.ProdutoId && item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Produto nao encontrado.");

        if (!produto.ControlaEstoque)
        {
            throw new AppException("Este produto nao usa controle de estoque.");
        }

        if (produto.ControlaLote)
        {
            throw new AppException("Para itens com rastreabilidade, use o recebimento por lote.");
        }

        await EnsureCompanyDepositsAsync(empresaId);
        var deposito = await ResolveDepositoAsync(empresaId, request.DepositoEstoqueId);
        var balances = await LoadTrackedBalancesAsync(produto);
        var balance = CreateOrGetBalance(produto, deposito.DepositoEstoqueId, balances);
        var quantidadeRecebida = RoundQuantity(request.QuantidadeEntrada);
        var custoRecebido = NormalizeNullableMoney(request.PrecoCustoUnitario, "Preco de custo do recebimento");
        var documentoReferencia = NormalizeMaxLength(request.DocumentoReferencia, 80, "Documento de referencia");
        var observacao = BuildOperationObservation(documentoReferencia, request.Observacao, "Observacao do recebimento");

        var estoqueAnterior = produto.EstoqueAtual;
        balance.QuantidadeDisponivel = RoundQuantity(balance.QuantidadeDisponivel + quantidadeRecebida);
        balance.Ativo = true;
        balance.DataAtualizacao = DateTime.UtcNow;

        if (custoRecebido.HasValue && custoRecebido.Value >= 0)
        {
            produto.PrecoCusto = custoRecebido.Value;
        }

        var totals = RecalculateTotals(produto, balances);
        var movimentacao = new MovimentacaoEstoque
        {
            MovimentacaoEstoqueId = Guid.NewGuid(),
            EmpresaId = empresaId,
            ProdutoId = produto.ProdutoId,
            Tipo = MovimentacaoEstoqueTipo.Entrada,
            Quantidade = quantidadeRecebida,
            EstoqueAnterior = estoqueAnterior,
            EstoqueAtual = totals.Disponivel,
            EstoqueReservadoAtual = totals.Reservado,
            Origem = MovimentacaoEstoqueOrigem.Compra,
            UsuarioId = usuarioId,
            DataMovimentacao = DateTime.UtcNow,
            DepositoEstoqueId = deposito.DepositoEstoqueId,
            Observacao = observacao
        };

        dbContext.MovimentacoesEstoque.Add(movimentacao);
        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = empresaId,
            UsuarioId = usuarioId,
            Modulo = "Estoque",
            Acao = "Recebimento",
            Descricao = $"Recebimento registrado para o produto {produto.Nome} no deposito {deposito.Nome}.",
            IpAddress = currentUser.GetIpAddress(),
            Dados = System.Text.Json.JsonSerializer.Serialize(new
            {
                produto.ProdutoId,
                produto.Nome,
                Deposito = deposito.Nome,
                Quantidade = quantidadeRecebida,
                Custo = custoRecebido,
                Documento = documentoReferencia
            })
        });

        await dbContext.SaveChangesAsync();
        await LoadMovementReferencesAsync(movimentacao);
        return MapMovimentacao(movimentacao, produto.Nome);
    }

    public async Task<MovimentacaoEstoqueDto> RegistrarExpedicaoAsync(RegistrarExpedicaoEstoqueRequest request)
    {
        if (request.QuantidadeSaida <= 0)
        {
            throw new AppException("Quantidade de expedicao deve ser maior que zero.");
        }

        var empresaId = currentUser.GetEmpresaId();
        var usuarioId = currentUser.GetUserId();
        var produto = await dbContext.Produtos
            .FirstOrDefaultAsync(item => item.ProdutoId == request.ProdutoId && item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Produto nao encontrado.");

        if (!produto.ControlaEstoque)
        {
            throw new AppException("Este produto nao usa controle de estoque.");
        }

        await EnsureCompanyDepositsAsync(empresaId);
        var deposito = await ResolveDepositoAsync(empresaId, request.DepositoEstoqueId);
        var balances = await LoadTrackedBalancesAsync(produto);
        var balance = CreateOrGetBalance(produto, deposito.DepositoEstoqueId, balances);
        var quantidadeSaida = RoundQuantity(request.QuantidadeSaida);
        if (balance.QuantidadeDisponivel < quantidadeSaida)
        {
            throw new AppException($"O deposito {deposito.Nome} nao possui saldo disponivel suficiente para expedir {produto.Nome}.");
        }

        if (produto.EstoqueAtual < quantidadeSaida)
        {
            throw new AppException($"Estoque insuficiente para expedir o produto {produto.Nome}.");
        }

        var documentoReferencia = NormalizeMaxLength(request.DocumentoReferencia, 80, "Documento de referencia");
        var observacao = BuildOperationObservation(documentoReferencia, request.Observacao, "Observacao da expedicao");

        var estoqueAnterior = produto.EstoqueAtual;
        balance.QuantidadeDisponivel = RoundQuantity(balance.QuantidadeDisponivel - quantidadeSaida);
        balance.Ativo = balance.QuantidadeDisponivel > 0 || balance.QuantidadeReservada > 0;
        balance.DataAtualizacao = DateTime.UtcNow;
        var totals = RecalculateTotals(produto, balances);

        var movimentacao = new MovimentacaoEstoque
        {
            MovimentacaoEstoqueId = Guid.NewGuid(),
            EmpresaId = empresaId,
            ProdutoId = produto.ProdutoId,
            Tipo = MovimentacaoEstoqueTipo.Saida,
            Quantidade = quantidadeSaida,
            EstoqueAnterior = estoqueAnterior,
            EstoqueAtual = totals.Disponivel,
            EstoqueReservadoAtual = totals.Reservado,
            Origem = MovimentacaoEstoqueOrigem.ExpedicaoManual,
            UsuarioId = usuarioId,
            DataMovimentacao = DateTime.UtcNow,
            DepositoEstoqueId = deposito.DepositoEstoqueId,
            Observacao = observacao
        };

        dbContext.MovimentacoesEstoque.Add(movimentacao);

        if (produto.ControlaLote)
        {
            var allocations = await AllocateLotesForSaleAsync(produto, quantidadeSaida, CancellationToken.None);
            foreach (var allocation in allocations)
            {
                allocation.Entry.QuantidadeDisponivel = RoundQuantity(allocation.Entry.QuantidadeDisponivel - allocation.Quantity);
                allocation.Entry.Ativo = allocation.Entry.QuantidadeDisponivel > 0;

                dbContext.MovimentacoesEstoqueLote.Add(new MovimentacaoEstoqueLote
                {
                    MovimentacaoEstoqueLoteId = Guid.NewGuid(),
                    EmpresaId = empresaId,
                    MovimentacaoEstoqueId = movimentacao.MovimentacaoEstoqueId,
                    ProdutoId = produto.ProdutoId,
                    ProdutoLoteId = allocation.Entry.ProdutoLoteId,
                    EstoqueLoteId = allocation.Entry.EstoqueLoteId,
                    Quantidade = allocation.Quantity,
                    DataMovimentacao = movimentacao.DataMovimentacao
                });
            }
        }

        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = empresaId,
            UsuarioId = usuarioId,
            Modulo = "Estoque",
            Acao = "Expedicao",
            Descricao = $"Expedicao registrada para o produto {produto.Nome} no deposito {deposito.Nome}.",
            IpAddress = currentUser.GetIpAddress(),
            Dados = System.Text.Json.JsonSerializer.Serialize(new
            {
                produto.ProdutoId,
                produto.Nome,
                Deposito = deposito.Nome,
                Quantidade = quantidadeSaida,
                Documento = documentoReferencia
            })
        });

        await dbContext.SaveChangesAsync();
        await LoadMovementReferencesAsync(movimentacao);
        return MapMovimentacao(movimentacao, produto.Nome);
    }

    public async Task<ConferenciaEstoqueResultadoDto> ConferirAsync(ConferirEstoqueRequest request)
    {
        if (request.QuantidadeContada < 0)
        {
            throw new AppException("Quantidade contada nao pode ser negativa.");
        }

        var empresaId = currentUser.GetEmpresaId();
        var usuarioId = currentUser.GetUserId();
        var produto = await dbContext.Produtos
            .FirstOrDefaultAsync(item => item.ProdutoId == request.ProdutoId && item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Produto nao encontrado.");

        if (!produto.ControlaEstoque)
        {
            throw new AppException("Este produto nao usa controle de estoque.");
        }

        await EnsureCompanyDepositsAsync(empresaId);
        var deposito = await ResolveDepositoAsync(empresaId, request.DepositoEstoqueId);
        var balances = await LoadTrackedBalancesAsync(produto);
        var balance = CreateOrGetBalance(produto, deposito.DepositoEstoqueId, balances);
        var quantidadeSistema = RoundQuantity(balance.QuantidadeDisponivel + balance.QuantidadeReservada);
        var quantidadeContada = RoundQuantity(request.QuantidadeContada);
        var divergencia = RoundQuantity(quantidadeContada - quantidadeSistema);
        var documentoReferencia = NormalizeMaxLength(request.DocumentoReferencia, 80, "Documento de referencia");
        var observacao = BuildOperationObservation(documentoReferencia, request.Observacao, "Observacao da conferencia");

        if (quantidadeContada < balance.QuantidadeReservada)
        {
            throw new AppException($"A contagem fisica nao pode ficar abaixo do saldo reservado no deposito {deposito.Nome}.");
        }

        if (divergencia == 0)
        {
            dbContext.LogsSistema.Add(new LogSistema
            {
                LogSistemaId = Guid.NewGuid(),
                EmpresaId = empresaId,
                UsuarioId = usuarioId,
                Modulo = "Estoque",
                Acao = "ConferenciaSemDivergencia",
                Descricao = $"Conferencia sem divergencia registrada para o produto {produto.Nome} no deposito {deposito.Nome}.",
                IpAddress = currentUser.GetIpAddress(),
                Dados = System.Text.Json.JsonSerializer.Serialize(new
                {
                    produto.ProdutoId,
                    produto.Nome,
                    Deposito = deposito.Nome,
                    QuantidadeSistema = quantidadeSistema,
                    QuantidadeContada = quantidadeContada,
                    Documento = documentoReferencia
                })
            });
            await dbContext.SaveChangesAsync();

            return new ConferenciaEstoqueResultadoDto(
                produto.ProdutoId,
                produto.Nome,
                produto.UnidadeMedida,
                deposito.DepositoEstoqueId,
                deposito.Nome,
                quantidadeSistema,
                quantidadeContada,
                0m,
                false,
                null,
                "Conferencia registrada sem divergencia. Nenhum ajuste foi necessario.");
        }

        var estoqueAnterior = produto.EstoqueAtual;
        balance.QuantidadeDisponivel = RoundQuantity(quantidadeContada - balance.QuantidadeReservada);
        balance.Ativo = balance.QuantidadeDisponivel > 0 || balance.QuantidadeReservada > 0;
        balance.DataAtualizacao = DateTime.UtcNow;
        var totals = RecalculateTotals(produto, balances);

        var movimentacao = new MovimentacaoEstoque
        {
            MovimentacaoEstoqueId = Guid.NewGuid(),
            EmpresaId = empresaId,
            ProdutoId = produto.ProdutoId,
            Tipo = MovimentacaoEstoqueTipo.Ajuste,
            Quantidade = divergencia,
            EstoqueAnterior = estoqueAnterior,
            EstoqueAtual = totals.Disponivel,
            EstoqueReservadoAtual = totals.Reservado,
            Origem = MovimentacaoEstoqueOrigem.InventarioRotativo,
            UsuarioId = usuarioId,
            DataMovimentacao = DateTime.UtcNow,
            DepositoEstoqueId = deposito.DepositoEstoqueId,
            Observacao = observacao
        };

        dbContext.MovimentacoesEstoque.Add(movimentacao);

        if (produto.ControlaLote)
        {
            if (divergencia > 0)
            {
                var lote = await CreateOrReuseConferenceTechnicalLoteAsync(produto, documentoReferencia);
                var entrada = new EstoqueLote
                {
                    EstoqueLoteId = Guid.NewGuid(),
                    EmpresaId = empresaId,
                    ProdutoId = produto.ProdutoId,
                    ProdutoLoteId = lote.ProdutoLoteId,
                    QuantidadeEntrada = divergencia,
                    QuantidadeDisponivel = divergencia,
                    PrecoCustoUnitario = produto.PrecoCusto > 0 ? produto.PrecoCusto : null,
                    DataEntrada = DateTime.UtcNow,
                    DocumentoReferencia = documentoReferencia ?? "CONFERENCIA",
                    UsuarioId = usuarioId,
                    Ativo = true
                };

                dbContext.EstoquesLote.Add(entrada);
                dbContext.MovimentacoesEstoqueLote.Add(new MovimentacaoEstoqueLote
                {
                    MovimentacaoEstoqueLoteId = Guid.NewGuid(),
                    EmpresaId = empresaId,
                    MovimentacaoEstoqueId = movimentacao.MovimentacaoEstoqueId,
                    ProdutoId = produto.ProdutoId,
                    ProdutoLoteId = lote.ProdutoLoteId,
                    EstoqueLoteId = entrada.EstoqueLoteId,
                    Quantidade = divergencia,
                    DataMovimentacao = movimentacao.DataMovimentacao
                });
            }
            else
            {
                var quantidadeBaixa = Math.Abs(divergencia);
                var allocations = await AllocateLotesForSaleAsync(produto, quantidadeBaixa, CancellationToken.None);
                foreach (var allocation in allocations)
                {
                    allocation.Entry.QuantidadeDisponivel = RoundQuantity(allocation.Entry.QuantidadeDisponivel - allocation.Quantity);
                    allocation.Entry.Ativo = allocation.Entry.QuantidadeDisponivel > 0;

                    dbContext.MovimentacoesEstoqueLote.Add(new MovimentacaoEstoqueLote
                    {
                        MovimentacaoEstoqueLoteId = Guid.NewGuid(),
                        EmpresaId = empresaId,
                        MovimentacaoEstoqueId = movimentacao.MovimentacaoEstoqueId,
                        ProdutoId = produto.ProdutoId,
                        ProdutoLoteId = allocation.Entry.ProdutoLoteId,
                        EstoqueLoteId = allocation.Entry.EstoqueLoteId,
                        Quantidade = allocation.Quantity,
                        DataMovimentacao = movimentacao.DataMovimentacao
                    });
                }
            }
        }

        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = empresaId,
            UsuarioId = usuarioId,
            Modulo = "Estoque",
            Acao = "ConferenciaComDivergencia",
            Descricao = $"Conferencia com ajuste registrada para o produto {produto.Nome} no deposito {deposito.Nome}.",
            IpAddress = currentUser.GetIpAddress(),
            Dados = System.Text.Json.JsonSerializer.Serialize(new
            {
                produto.ProdutoId,
                produto.Nome,
                Deposito = deposito.Nome,
                QuantidadeSistema = quantidadeSistema,
                QuantidadeContada = quantidadeContada,
                Divergencia = divergencia,
                Documento = documentoReferencia
            })
        });

        await dbContext.SaveChangesAsync();
        await LoadMovementReferencesAsync(movimentacao);

        return new ConferenciaEstoqueResultadoDto(
            produto.ProdutoId,
            produto.Nome,
            produto.UnidadeMedida,
            deposito.DepositoEstoqueId,
            deposito.Nome,
            quantidadeSistema,
            quantidadeContada,
            divergencia,
            true,
            MapMovimentacao(movimentacao, produto.Nome),
            divergencia > 0
                ? "Conferencia registrada com sobra fisica. O ajuste entrou no estoque."
                : "Conferencia registrada com falta fisica. O ajuste baixou o estoque.");
    }

    public async Task<MovimentacaoEstoqueDto> ReservarAsync(ReservarEstoqueRequest request)
    {
        return await ExecuteReservaAsync(
            request.ProdutoId,
            request.DepositoEstoqueId,
            request.Quantidade,
            request.Motivo,
            MovimentacaoEstoqueTipo.Reserva,
            MovimentacaoEstoqueOrigem.ReservaManual,
            reservar: true);
    }

    public async Task<MovimentacaoEstoqueDto> LiberarReservaAsync(LiberarReservaEstoqueRequest request)
    {
        return await ExecuteReservaAsync(
            request.ProdutoId,
            request.DepositoEstoqueId,
            request.Quantidade,
            request.Motivo,
            MovimentacaoEstoqueTipo.LiberacaoReserva,
            MovimentacaoEstoqueOrigem.ReservaManual,
            reservar: false);
    }

    public async Task<TransferenciaEstoqueDto> TransferirAsync(TransferirEstoqueRequest request)
    {
        if (request.Quantidade <= 0)
        {
            throw new AppException("Quantidade de transferencia deve ser maior que zero.");
        }

        if (request.DepositoOrigemId == request.DepositoDestinoId)
        {
            throw new AppException("Selecione depositos diferentes para a transferencia interna.");
        }

        var empresaId = currentUser.GetEmpresaId();
        var usuarioId = currentUser.GetUserId();
        var produto = await dbContext.Produtos
            .FirstOrDefaultAsync(item => item.ProdutoId == request.ProdutoId && item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Produto nao encontrado.");

        if (!produto.ControlaEstoque)
        {
            throw new AppException("Transferencias internas exigem produtos com controle de estoque ativo.");
        }

        if (produto.ControlaLote)
        {
            throw new AppException("Transferencia interna para itens controlados por lote ainda exige rastreabilidade por lote. Use o deposito padrao enquanto essa etapa nao for detalhada por lote.");
        }

        await EnsureCompanyDepositsAsync(empresaId);
        var depositoOrigem = await ResolveDepositoAsync(empresaId, request.DepositoOrigemId);
        var depositoDestino = await ResolveDepositoAsync(empresaId, request.DepositoDestinoId);
        var balances = await LoadTrackedBalancesAsync(produto);
        var origem = CreateOrGetBalance(produto, depositoOrigem.DepositoEstoqueId, balances);
        var destino = CreateOrGetBalance(produto, depositoDestino.DepositoEstoqueId, balances);

        if (origem.QuantidadeDisponivel < request.Quantidade)
        {
            throw new AppException($"O deposito {depositoOrigem.Nome} nao possui saldo disponivel suficiente para a transferencia.");
        }

        var estoqueAnterior = produto.EstoqueAtual;
        origem.QuantidadeDisponivel = RoundQuantity(origem.QuantidadeDisponivel - request.Quantidade);
        origem.Ativo = origem.QuantidadeDisponivel > 0 || origem.QuantidadeReservada > 0;
        origem.DataAtualizacao = DateTime.UtcNow;

        destino.QuantidadeDisponivel = RoundQuantity(destino.QuantidadeDisponivel + request.Quantidade);
        destino.Ativo = true;
        destino.DataAtualizacao = DateTime.UtcNow;

        var totals = RecalculateTotals(produto, balances);
        var observacao = NormalizeMaxLength(request.Observacao, 250, "Observacao da transferencia");
        var documentoReferencia = NormalizeMaxLength(request.DocumentoReferencia, 80, "Documento de referencia");

        var transferencia = new TransferenciaEstoque
        {
            TransferenciaEstoqueId = Guid.NewGuid(),
            EmpresaId = empresaId,
            ProdutoId = produto.ProdutoId,
            DepositoOrigemId = depositoOrigem.DepositoEstoqueId,
            DepositoDestinoId = depositoDestino.DepositoEstoqueId,
            Quantidade = RoundQuantity(request.Quantidade),
            Status = TransferenciaEstoqueStatus.Concluida,
            DocumentoReferencia = documentoReferencia,
            Observacao = observacao,
            DataTransferencia = DateTime.UtcNow,
            UsuarioId = usuarioId
        };

        var movimentacao = new MovimentacaoEstoque
        {
            MovimentacaoEstoqueId = Guid.NewGuid(),
            EmpresaId = empresaId,
            ProdutoId = produto.ProdutoId,
            Tipo = MovimentacaoEstoqueTipo.Transferencia,
            Quantidade = RoundQuantity(request.Quantidade),
            EstoqueAnterior = estoqueAnterior,
            EstoqueAtual = totals.Disponivel,
            EstoqueReservadoAtual = totals.Reservado,
            Origem = MovimentacaoEstoqueOrigem.TransferenciaInterna,
            ReferenciaId = transferencia.TransferenciaEstoqueId,
            UsuarioId = usuarioId,
            DataMovimentacao = transferencia.DataTransferencia,
            DepositoOrigemId = depositoOrigem.DepositoEstoqueId,
            DepositoDestinoId = depositoDestino.DepositoEstoqueId,
            Observacao = observacao ?? documentoReferencia
        };

        dbContext.TransferenciasEstoque.Add(transferencia);
        dbContext.MovimentacoesEstoque.Add(movimentacao);
        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = empresaId,
            UsuarioId = usuarioId,
            Modulo = "Estoque",
            Acao = "TransferenciaInterna",
            Descricao = $"Transferencia interna do produto {produto.Nome} de {depositoOrigem.Nome} para {depositoDestino.Nome}.",
            IpAddress = currentUser.GetIpAddress(),
            Dados = System.Text.Json.JsonSerializer.Serialize(new
            {
                produto.ProdutoId,
                produto.Nome,
                DepositoOrigem = depositoOrigem.Nome,
                DepositoDestino = depositoDestino.Nome,
                request.Quantidade,
                request.DocumentoReferencia,
                request.Observacao
            })
        });

        await dbContext.SaveChangesAsync();
        var usuarioNome = await dbContext.Usuarios
            .AsNoTracking()
            .Where(item => item.UsuarioId == usuarioId)
            .Select(item => item.Nome)
            .FirstOrDefaultAsync();

        return new TransferenciaEstoqueDto(
            transferencia.TransferenciaEstoqueId,
            produto.ProdutoId,
            produto.Nome,
            depositoOrigem.DepositoEstoqueId,
            depositoOrigem.Nome,
            depositoDestino.DepositoEstoqueId,
            depositoDestino.Nome,
            transferencia.Quantidade,
            transferencia.Status,
            transferencia.DocumentoReferencia,
            transferencia.Observacao,
            transferencia.DataTransferencia,
            usuarioId,
            usuarioNome);
    }

    public async Task RegistrarSaidaVendaAsync(Produto produto, decimal quantidade, Guid referenciaId, CancellationToken cancellationToken = default)
    {
        if (!produto.ControlaEstoque)
        {
            return;
        }

        if (quantidade <= 0)
        {
            throw new AppException("Quantidade de baixa deve ser maior que zero.");
        }

        await EnsureCompanyDepositsAsync(produto.EmpresaId, cancellationToken);
        var depositoPadrao = await ResolveDepositoAsync(produto.EmpresaId, null, cancellationToken);
        var balances = await LoadTrackedBalancesAsync(produto, cancellationToken);
        var depositBalance = CreateOrGetBalance(produto, depositoPadrao.DepositoEstoqueId, balances);

        if (depositBalance.QuantidadeDisponivel < quantidade)
        {
            throw new AppException($"O deposito padrao {depositoPadrao.Nome} nao possui saldo disponivel suficiente para o produto {produto.Nome}.");
        }

        if (produto.EstoqueAtual < quantidade)
        {
            throw new AppException($"Estoque insuficiente para o produto {produto.Nome}.");
        }

        var empresaId = currentUser.GetEmpresaId();
        var usuarioId = currentUser.GetUserId();
        var estoqueAnterior = produto.EstoqueAtual;
        depositBalance.QuantidadeDisponivel = RoundQuantity(depositBalance.QuantidadeDisponivel - quantidade);
        depositBalance.Ativo = depositBalance.QuantidadeDisponivel > 0 || depositBalance.QuantidadeReservada > 0;
        depositBalance.DataAtualizacao = DateTime.UtcNow;

        var totals = RecalculateTotals(produto, balances);
        var movimentacao = new MovimentacaoEstoque
        {
            MovimentacaoEstoqueId = Guid.NewGuid(),
            EmpresaId = empresaId,
            ProdutoId = produto.ProdutoId,
            Tipo = MovimentacaoEstoqueTipo.Saida,
            Quantidade = RoundQuantity(quantidade),
            EstoqueAnterior = estoqueAnterior,
            EstoqueAtual = totals.Disponivel,
            EstoqueReservadoAtual = totals.Reservado,
            Origem = MovimentacaoEstoqueOrigem.Venda,
            ReferenciaId = referenciaId,
            UsuarioId = usuarioId,
            DataMovimentacao = DateTime.UtcNow,
            DepositoEstoqueId = depositoPadrao.DepositoEstoqueId
        };

        dbContext.MovimentacoesEstoque.Add(movimentacao);

        if (!produto.ControlaLote)
        {
            return;
        }

        var allocations = await AllocateLotesForSaleAsync(produto, quantidade, cancellationToken);
        foreach (var allocation in allocations)
        {
            allocation.Entry.QuantidadeDisponivel = RoundQuantity(allocation.Entry.QuantidadeDisponivel - allocation.Quantity);
            allocation.Entry.Ativo = allocation.Entry.QuantidadeDisponivel > 0;

            dbContext.MovimentacoesEstoqueLote.Add(new MovimentacaoEstoqueLote
            {
                MovimentacaoEstoqueLoteId = Guid.NewGuid(),
                EmpresaId = empresaId,
                MovimentacaoEstoqueId = movimentacao.MovimentacaoEstoqueId,
                ProdutoId = produto.ProdutoId,
                ProdutoLoteId = allocation.Entry.ProdutoLoteId,
                EstoqueLoteId = allocation.Entry.EstoqueLoteId,
                Quantidade = allocation.Quantity,
                DataMovimentacao = movimentacao.DataMovimentacao
            });
        }
    }

    public async Task RegistrarRetornoVendaAsync(Produto produto, decimal quantidade, Guid referenciaId, CancellationToken cancellationToken = default)
    {
        if (!produto.ControlaEstoque)
        {
            return;
        }

        if (quantidade <= 0)
        {
            throw new AppException("Quantidade de retorno deve ser maior que zero.");
        }

        await EnsureCompanyDepositsAsync(produto.EmpresaId, cancellationToken);
        var depositoPadrao = await ResolveDepositoAsync(produto.EmpresaId, null, cancellationToken);
        var balances = await LoadTrackedBalancesAsync(produto, cancellationToken);
        var depositBalance = CreateOrGetBalance(produto, depositoPadrao.DepositoEstoqueId, balances);

        var empresaId = currentUser.GetEmpresaId();
        var usuarioId = currentUser.GetUserId();
        var estoqueAnterior = produto.EstoqueAtual;
        depositBalance.QuantidadeDisponivel = RoundQuantity(depositBalance.QuantidadeDisponivel + quantidade);
        depositBalance.Ativo = true;
        depositBalance.DataAtualizacao = DateTime.UtcNow;

        var totals = RecalculateTotals(produto, balances);
        var movimentacao = new MovimentacaoEstoque
        {
            MovimentacaoEstoqueId = Guid.NewGuid(),
            EmpresaId = empresaId,
            ProdutoId = produto.ProdutoId,
            Tipo = MovimentacaoEstoqueTipo.CancelamentoVenda,
            Quantidade = RoundQuantity(quantidade),
            EstoqueAnterior = estoqueAnterior,
            EstoqueAtual = totals.Disponivel,
            EstoqueReservadoAtual = totals.Reservado,
            Origem = MovimentacaoEstoqueOrigem.Cancelamento,
            ReferenciaId = referenciaId,
            UsuarioId = usuarioId,
            DataMovimentacao = DateTime.UtcNow,
            DepositoEstoqueId = depositoPadrao.DepositoEstoqueId
        };

        dbContext.MovimentacoesEstoque.Add(movimentacao);

        if (!produto.ControlaLote)
        {
            return;
        }

        var saidaLotes = await dbContext.MovimentacoesEstoqueLote
            .AsNoTracking()
            .Include(item => item.MovimentacaoEstoque)
            .Where(item =>
                item.EmpresaId == empresaId &&
                item.ProdutoId == produto.ProdutoId &&
                item.MovimentacaoEstoque.ReferenciaId == referenciaId &&
                item.MovimentacaoEstoque.Origem == MovimentacaoEstoqueOrigem.Venda &&
                item.MovimentacaoEstoque.Tipo == MovimentacaoEstoqueTipo.Saida)
            .OrderBy(item => item.DataMovimentacao)
            .ToListAsync(cancellationToken);

        if (saidaLotes.Count == 0)
        {
            await RegistrarRetornoEmLoteFallbackAsync(produto, quantidade, movimentacao, cancellationToken);
            return;
        }

        var entradaIds = saidaLotes
            .Select(item => item.EstoqueLoteId)
            .Distinct()
            .ToArray();

        var entradas = await dbContext.EstoquesLote
            .Where(item => entradaIds.Contains(item.EstoqueLoteId))
            .ToDictionaryAsync(item => item.EstoqueLoteId, cancellationToken);

        var restored = 0m;
        foreach (var saidaLote in saidaLotes)
        {
            if (!entradas.TryGetValue(saidaLote.EstoqueLoteId, out var entrada))
            {
                continue;
            }

            entrada.QuantidadeDisponivel = RoundQuantity(entrada.QuantidadeDisponivel + saidaLote.Quantidade);
            entrada.Ativo = true;
            restored = RoundQuantity(restored + saidaLote.Quantidade);

            dbContext.MovimentacoesEstoqueLote.Add(new MovimentacaoEstoqueLote
            {
                MovimentacaoEstoqueLoteId = Guid.NewGuid(),
                EmpresaId = empresaId,
                MovimentacaoEstoqueId = movimentacao.MovimentacaoEstoqueId,
                ProdutoId = produto.ProdutoId,
                ProdutoLoteId = saidaLote.ProdutoLoteId,
                EstoqueLoteId = saidaLote.EstoqueLoteId,
                Quantidade = saidaLote.Quantidade,
                DataMovimentacao = movimentacao.DataMovimentacao
            });
        }

        var diferenca = RoundQuantity(quantidade - restored);
        if (diferenca > 0)
        {
            await RegistrarRetornoEmLoteFallbackAsync(produto, diferenca, movimentacao, cancellationToken);
        }
    }

    private async Task<MovimentacaoEstoqueDto> ExecuteReservaAsync(
        Guid produtoId,
        Guid? depositoEstoqueId,
        decimal quantidade,
        string? motivo,
        MovimentacaoEstoqueTipo tipo,
        MovimentacaoEstoqueOrigem origem,
        bool reservar)
    {
        if (quantidade <= 0)
        {
            throw new AppException("Quantidade deve ser maior que zero.");
        }

        var empresaId = currentUser.GetEmpresaId();
        var usuarioId = currentUser.GetUserId();
        var produto = await dbContext.Produtos
            .FirstOrDefaultAsync(item => item.ProdutoId == produtoId && item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Produto nao encontrado.");

        if (!produto.ControlaEstoque)
        {
            throw new AppException("Reservas exigem produtos com controle de estoque ativo.");
        }

        await EnsureCompanyDepositsAsync(empresaId);
        var deposito = await ResolveDepositoAsync(empresaId, depositoEstoqueId);
        var balances = await LoadTrackedBalancesAsync(produto);
        var balance = CreateOrGetBalance(produto, deposito.DepositoEstoqueId, balances);

        if (reservar && balance.QuantidadeDisponivel < quantidade)
        {
            throw new AppException($"O deposito {deposito.Nome} nao possui saldo disponivel suficiente para reservar.");
        }

        if (!reservar && balance.QuantidadeReservada < quantidade)
        {
            throw new AppException($"O deposito {deposito.Nome} nao possui reserva suficiente para liberar essa quantidade.");
        }

        var estoqueAnterior = produto.EstoqueAtual;
        if (reservar)
        {
            balance.QuantidadeDisponivel = RoundQuantity(balance.QuantidadeDisponivel - quantidade);
            balance.QuantidadeReservada = RoundQuantity(balance.QuantidadeReservada + quantidade);
        }
        else
        {
            balance.QuantidadeReservada = RoundQuantity(balance.QuantidadeReservada - quantidade);
            balance.QuantidadeDisponivel = RoundQuantity(balance.QuantidadeDisponivel + quantidade);
        }

        balance.Ativo = balance.QuantidadeDisponivel > 0 || balance.QuantidadeReservada > 0;
        balance.DataAtualizacao = DateTime.UtcNow;

        var totals = RecalculateTotals(produto, balances);
        var observacao = NormalizeMaxLength(motivo, 250, reservar ? "Motivo da reserva" : "Motivo da liberacao");

        var movimentacao = new MovimentacaoEstoque
        {
            MovimentacaoEstoqueId = Guid.NewGuid(),
            EmpresaId = empresaId,
            ProdutoId = produto.ProdutoId,
            Tipo = tipo,
            Quantidade = RoundQuantity(quantidade),
            EstoqueAnterior = estoqueAnterior,
            EstoqueAtual = totals.Disponivel,
            EstoqueReservadoAtual = totals.Reservado,
            Origem = origem,
            UsuarioId = usuarioId,
            DepositoEstoqueId = deposito.DepositoEstoqueId,
            Observacao = observacao
        };

        dbContext.MovimentacoesEstoque.Add(movimentacao);
        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = empresaId,
            UsuarioId = usuarioId,
            Modulo = "Estoque",
            Acao = reservar ? "Reserva" : "LiberacaoReserva",
            Descricao = $"{(reservar ? "Reserva" : "Liberacao")} registrada para o produto {produto.Nome} no deposito {deposito.Nome}.",
            IpAddress = currentUser.GetIpAddress(),
            Dados = System.Text.Json.JsonSerializer.Serialize(new
            {
                produto.ProdutoId,
                produto.Nome,
                Deposito = deposito.Nome,
                Quantidade = quantidade,
                Motivo = motivo
            })
        });
        await dbContext.SaveChangesAsync();
        await LoadMovementReferencesAsync(movimentacao);

        return MapMovimentacao(movimentacao, produto.Nome);
    }

    private async Task<List<LoteAllocation>> AllocateLotesForSaleAsync(
        Produto produto,
        decimal quantidade,
        CancellationToken cancellationToken)
    {
        var lotesDisponiveis = await dbContext.EstoquesLote
            .Include(item => item.ProdutoLote)
            .Where(item =>
                item.EmpresaId == produto.EmpresaId &&
                item.ProdutoId == produto.ProdutoId &&
                item.QuantidadeDisponivel > 0)
            .ToListAsync(cancellationToken);

        var orderedEntries = OrderEntriesForConsumption(lotesDisponiveis, produto.PoliticaBaixaLote).ToList();
        var saldoTotal = orderedEntries.Sum(item => item.QuantidadeDisponivel);
        if (saldoTotal < quantidade)
        {
            throw new AppException($"Estoque por lote insuficiente para o produto {produto.Nome}. Registre novas entradas antes de concluir a venda.");
        }

        var allocations = new List<LoteAllocation>();
        var remaining = quantidade;
        foreach (var entry in orderedEntries)
        {
            if (remaining <= 0)
            {
                break;
            }

            var consumed = Math.Min(entry.QuantidadeDisponivel, remaining);
            if (consumed <= 0)
            {
                continue;
            }

            allocations.Add(new LoteAllocation(entry, consumed));
            remaining -= consumed;
        }

        if (remaining > 0)
        {
            throw new AppException($"Nao foi possivel distribuir a baixa pelos lotes do produto {produto.Nome}.");
        }

        return allocations;
    }

    private static IEnumerable<EstoqueLote> OrderEntriesForConsumption(
        IEnumerable<EstoqueLote> entries,
        PoliticaBaixaEstoqueLote policy)
    {
        return policy switch
        {
            PoliticaBaixaEstoqueLote.FIFO => entries
                .OrderBy(item => item.DataEntrada)
                .ThenBy(item => item.ProdutoLote.DataCadastro)
                .ThenBy(item => item.ProdutoLote.CodigoLote),
            _ => entries
                .OrderBy(item => item.ProdutoLote.DataValidade.HasValue ? 0 : 1)
                .ThenBy(item => item.ProdutoLote.DataValidade)
                .ThenBy(item => item.DataEntrada)
                .ThenBy(item => item.ProdutoLote.CodigoLote)
        };
    }

    private async Task RegistrarRetornoEmLoteFallbackAsync(
        Produto produto,
        decimal quantidade,
        MovimentacaoEstoque movimentacao,
        CancellationToken cancellationToken)
    {
        if (quantidade <= 0)
        {
            return;
        }

        var empresaId = currentUser.GetEmpresaId();
        var usuarioId = currentUser.GetUserId();
        var codigoLote = $"RET-{movimentacao.ReferenciaId?.ToString("N")[..8] ?? "SEMREF"}";
        var lote = await dbContext.ProdutoLotes
            .FirstOrDefaultAsync(item =>
                item.EmpresaId == empresaId &&
                item.ProdutoId == produto.ProdutoId &&
                item.CodigoLote == codigoLote,
                cancellationToken);

        if (lote is null)
        {
            lote = new ProdutoLote
            {
                ProdutoLoteId = Guid.NewGuid(),
                EmpresaId = empresaId,
                ProdutoId = produto.ProdutoId,
                CodigoLote = codigoLote,
                Observacao = "Lote tecnico criado automaticamente para retorno de cancelamento sem origem de lote rastreada.",
                Ativo = true,
                DataCadastro = DateTime.UtcNow
            };
            dbContext.ProdutoLotes.Add(lote);
        }

        var entrada = new EstoqueLote
        {
            EstoqueLoteId = Guid.NewGuid(),
            EmpresaId = empresaId,
            ProdutoId = produto.ProdutoId,
            ProdutoLoteId = lote.ProdutoLoteId,
            QuantidadeEntrada = RoundQuantity(quantidade),
            QuantidadeDisponivel = RoundQuantity(quantidade),
            DataEntrada = DateTime.UtcNow,
            DocumentoReferencia = "RETORNO AUTOMATICO",
            UsuarioId = usuarioId,
            Ativo = true
        };

        dbContext.EstoquesLote.Add(entrada);
        dbContext.MovimentacoesEstoqueLote.Add(new MovimentacaoEstoqueLote
        {
            MovimentacaoEstoqueLoteId = Guid.NewGuid(),
            EmpresaId = empresaId,
            MovimentacaoEstoqueId = movimentacao.MovimentacaoEstoqueId,
            ProdutoId = produto.ProdutoId,
            ProdutoLoteId = lote.ProdutoLoteId,
            EstoqueLoteId = entrada.EstoqueLoteId,
            Quantidade = RoundQuantity(quantidade),
            DataMovimentacao = movimentacao.DataMovimentacao
        });
    }

    private async Task<ProdutoLote> CreateOrReuseConferenceTechnicalLoteAsync(
        Produto produto,
        string? documentoReferencia)
    {
        var empresaId = currentUser.GetEmpresaId();
        var codigoLote = $"CONF-{DateTime.UtcNow:yyyyMMdd}";
        var lote = await dbContext.ProdutoLotes
            .FirstOrDefaultAsync(item =>
                item.EmpresaId == empresaId &&
                item.ProdutoId == produto.ProdutoId &&
                item.CodigoLote == codigoLote);

        if (lote is not null)
        {
            lote.Ativo = true;
            return lote;
        }

        lote = new ProdutoLote
        {
            ProdutoLoteId = Guid.NewGuid(),
            EmpresaId = empresaId,
            ProdutoId = produto.ProdutoId,
            CodigoLote = codigoLote,
            Observacao = NormalizeMaxLength(
                $"{(documentoReferencia is not null ? $"Doc. {documentoReferencia}. " : string.Empty)}Lote tecnico de conferencia criado para ajustar divergencia fisica.",
                250,
                "Observacao da conferencia"),
            Ativo = true,
            DataCadastro = DateTime.UtcNow
        };

        dbContext.ProdutoLotes.Add(lote);
        return lote;
    }

    private static string? BuildOperationObservation(string? documentoReferencia, string? observacao, string fieldLabel)
    {
        var normalizedObservation = NormalizeMaxLength(observacao, 250, fieldLabel);
        if (string.IsNullOrWhiteSpace(documentoReferencia))
        {
            return normalizedObservation;
        }

        var composed = string.IsNullOrWhiteSpace(normalizedObservation)
            ? $"Doc. {documentoReferencia}"
            : $"Doc. {documentoReferencia} · {normalizedObservation}";

        return NormalizeMaxLength(composed, 250, fieldLabel);
    }

    private async Task EnsureCompanyDepositsAsync(Guid empresaId, CancellationToken cancellationToken = default)
    {
        var deposits = await dbContext.DepositosEstoque
            .Where(item => item.EmpresaId == empresaId)
            .OrderBy(item => item.Codigo)
            .ToListAsync(cancellationToken);

        var changed = false;
        if (deposits.Count == 0)
        {
            dbContext.DepositosEstoque.AddRange(
                CreateDeposit(empresaId, "LOJA-01", "Operacao PDV", "Deposito padrao que alimenta diretamente a venda no PDV.", padrao: true, permiteVendaDireta: true),
                CreateDeposit(empresaId, "RET-01", "Retaguarda", "Reserva tecnica para abastecimento interno, contagem e pulmao de estoque.", padrao: false, permiteVendaDireta: false),
                CreateDeposit(empresaId, "QAR-01", "Quarentena e avaria", "Area tecnica para itens bloqueados, avariados ou aguardando conferencia.", padrao: false, permiteVendaDireta: false));
            changed = true;
        }
        else if (!deposits.Any(item => item.Padrao && item.Ativo))
        {
            var firstActive = deposits.FirstOrDefault(item => item.Ativo) ?? deposits[0];
            firstActive.Padrao = true;
            changed = true;
        }

        if (changed)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
    }

    private static DepositoEstoque CreateDeposit(
        Guid empresaId,
        string codigo,
        string nome,
        string descricao,
        bool padrao,
        bool permiteVendaDireta)
        => new()
        {
            DepositoEstoqueId = Guid.NewGuid(),
            EmpresaId = empresaId,
            Codigo = codigo,
            Nome = nome,
            Descricao = descricao,
            Padrao = padrao,
            PermiteVendaDireta = permiteVendaDireta,
            Ativo = true,
            DataCadastro = DateTime.UtcNow
        };

    private async Task<DepositoEstoque> ResolveDepositoAsync(Guid empresaId, Guid? depositoId, CancellationToken cancellationToken = default)
    {
        if (depositoId.HasValue)
        {
            return await dbContext.DepositosEstoque
                .FirstOrDefaultAsync(item =>
                    item.EmpresaId == empresaId &&
                    item.DepositoEstoqueId == depositoId.Value &&
                    item.Ativo,
                    cancellationToken)
                ?? throw new NotFoundException("Deposito nao encontrado.");
        }

        return await dbContext.DepositosEstoque
            .Where(item => item.EmpresaId == empresaId && item.Ativo)
            .OrderByDescending(item => item.Padrao)
            .ThenBy(item => item.Codigo)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new AppException("Nenhum deposito ativo encontrado para a empresa.");
    }

    private async Task<List<EstoqueDeposito>> LoadTrackedBalancesAsync(Produto produto, CancellationToken cancellationToken = default)
    {
        var balances = await dbContext.EstoquesDeposito
            .Where(item => item.EmpresaId == produto.EmpresaId && item.ProdutoId == produto.ProdutoId)
            .ToListAsync(cancellationToken);

        if (balances.Count == 0 && produto.ControlaEstoque)
        {
            var depositoPadrao = await ResolveDepositoAsync(produto.EmpresaId, null, cancellationToken);
            var seededBalance = new EstoqueDeposito
            {
                EstoqueDepositoId = Guid.NewGuid(),
                EmpresaId = produto.EmpresaId,
                DepositoEstoqueId = depositoPadrao.DepositoEstoqueId,
                ProdutoId = produto.ProdutoId,
                QuantidadeDisponivel = RoundQuantity(produto.EstoqueAtual),
                QuantidadeReservada = 0m,
                Ativo = produto.EstoqueAtual > 0,
                DataAtualizacao = DateTime.UtcNow
            };

            dbContext.EstoquesDeposito.Add(seededBalance);
            balances.Add(seededBalance);
        }

        return balances;
    }

    private EstoqueDeposito CreateOrGetBalance(Produto produto, Guid depositoEstoqueId, List<EstoqueDeposito> balances)
    {
        var balance = balances.FirstOrDefault(item => item.DepositoEstoqueId == depositoEstoqueId);
        if (balance is not null)
        {
            return balance;
        }

        balance = new EstoqueDeposito
        {
            EstoqueDepositoId = Guid.NewGuid(),
            EmpresaId = produto.EmpresaId,
            DepositoEstoqueId = depositoEstoqueId,
            ProdutoId = produto.ProdutoId,
            QuantidadeDisponivel = 0m,
            QuantidadeReservada = 0m,
            Ativo = false,
            DataAtualizacao = DateTime.UtcNow
        };

        dbContext.EstoquesDeposito.Add(balance);
        balances.Add(balance);
        return balance;
    }

    private static StockTotals RecalculateTotals(Produto produto, IEnumerable<EstoqueDeposito> balances)
    {
        var disponivel = RoundQuantity(balances.Sum(item => item.QuantidadeDisponivel));
        var reservado = RoundQuantity(balances.Sum(item => item.QuantidadeReservada));
        produto.EstoqueAtual = disponivel;
        return new StockTotals(disponivel, reservado);
    }

    private async Task LoadMovementReferencesAsync(MovimentacaoEstoque movimentacao)
    {
        await dbContext.Entry(movimentacao).Reference(item => item.Usuario).LoadAsync();
        await dbContext.Entry(movimentacao).Reference(item => item.DepositoEstoque).LoadAsync();
        await dbContext.Entry(movimentacao).Reference(item => item.DepositoOrigem).LoadAsync();
        await dbContext.Entry(movimentacao).Reference(item => item.DepositoDestino).LoadAsync();
    }

    private async Task<Produto> GetProdutoEmpresaAtualAsync(Guid produtoId, bool asNoTracking)
    {
        var empresaId = currentUser.GetEmpresaId();
        var query = dbContext.Produtos.Where(item => item.ProdutoId == produtoId && item.EmpresaId == empresaId);
        if (asNoTracking)
        {
            query = query.AsNoTracking();
        }

        return await query.FirstOrDefaultAsync()
            ?? throw new NotFoundException("Produto nao encontrado.");
    }

    private static decimal RoundQuantity(decimal value)
        => Math.Round(value, 3, MidpointRounding.AwayFromZero);

    private static string NormalizeLoteCode(string? codigoLote)
    {
        var normalized = codigoLote?.Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new AppException("Codigo do lote e obrigatorio.");
        }

        if (normalized.Length > 60)
        {
            throw new AppException("Codigo do lote deve ter no maximo 60 caracteres.");
        }

        return normalized;
    }

    private static DateTime NormalizeDate(DateTime value, string fieldName)
    {
        if (value == default)
        {
            throw new AppException($"{fieldName} e obrigatoria.");
        }

        return value.Date;
    }

    private static DateTime? NormalizeOptionalDate(DateTime? value)
        => value?.Date;

    private static string? NormalizeMaxLength(string? value, int maxLength, string fieldName)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var normalized = value.Trim();
        if (normalized.Length > maxLength)
        {
            throw new AppException($"{fieldName} deve ter no maximo {maxLength} caracteres.");
        }

        return normalized;
    }

    private static decimal? NormalizeNullableMoney(decimal? value, string fieldName)
    {
        if (!value.HasValue)
        {
            return null;
        }

        if (value.Value < 0)
        {
            throw new AppException($"{fieldName} nao pode ser negativo.");
        }

        return Math.Round(value.Value, 2, MidpointRounding.AwayFromZero);
    }

    private static void ValidateExistingLoteConsistency(ProdutoLote lote, DateTime? dataFabricacao, DateTime? dataValidade)
    {
        if (lote.DataFabricacao.HasValue && dataFabricacao.HasValue && lote.DataFabricacao.Value.Date != dataFabricacao.Value.Date)
        {
            throw new AppException($"O lote {lote.CodigoLote} ja existe com outra data de fabricacao.");
        }

        if (lote.DataValidade.HasValue && dataValidade.HasValue && lote.DataValidade.Value.Date != dataValidade.Value.Date)
        {
            throw new AppException($"O lote {lote.CodigoLote} ja existe com outra data de validade.");
        }

        if (!lote.DataFabricacao.HasValue && dataFabricacao.HasValue)
        {
            lote.DataFabricacao = dataFabricacao;
        }

        if (!lote.DataValidade.HasValue && dataValidade.HasValue)
        {
            lote.DataValidade = dataValidade;
        }
    }

    private static MovimentacaoEstoqueDto MapMovimentacao(MovimentacaoEstoque item, string? produtoNome = null)
        => new(
            item.MovimentacaoEstoqueId,
            item.ProdutoId,
            produtoNome ?? item.Produto.Nome,
            item.Tipo,
            item.Quantidade,
            item.EstoqueAnterior,
            item.EstoqueAtual,
            item.EstoqueReservadoAtual,
            item.Origem,
            item.ReferenciaId,
            item.DataMovimentacao,
            item.UsuarioId,
            item.Usuario?.Nome,
            item.DepositoEstoqueId,
            item.DepositoEstoque?.Nome,
            item.DepositoOrigemId,
            item.DepositoOrigem?.Nome,
            item.DepositoDestinoId,
            item.DepositoDestino?.Nome,
            item.Observacao);

    private static EstoqueLoteDto MapEstoqueLote(EstoqueLote item)
    {
        var hoje = DateTime.UtcNow.Date;
        var validade = item.ProdutoLote.DataValidade?.Date;
        var vencido = validade.HasValue && validade.Value < hoje;
        var proximoVencimento = validade.HasValue && !vencido && validade.Value <= hoje.AddDays(ExpirationWarningDays);

        return new EstoqueLoteDto(
            item.EstoqueLoteId,
            item.ProdutoId,
            item.ProdutoLoteId,
            item.ProdutoLote.CodigoLote,
            item.QuantidadeEntrada,
            item.QuantidadeDisponivel,
            item.DataEntrada,
            item.ProdutoLote.DataFabricacao,
            item.ProdutoLote.DataValidade,
            item.PrecoCustoUnitario,
            item.DocumentoReferencia,
            item.ProdutoLote.Observacao,
            vencido,
            proximoVencimento);
    }

    private static EstoqueLoteAlertaDto MapLoteAlerta(EstoqueLote item)
    {
        var hoje = DateTime.UtcNow.Date;
        var validade = item.ProdutoLote.DataValidade?.Date
            ?? throw new AppException("Lote sem validade nao pode ser mapeado como alerta.");
        var vencido = validade < hoje;
        var diasParaVencer = (int)(validade - hoje).TotalDays;

        return new EstoqueLoteAlertaDto(
            item.EstoqueLoteId,
            item.ProdutoId,
            item.Produto.Nome,
            item.Produto.UnidadeMedida,
            item.ProdutoLote.CodigoLote,
            item.QuantidadeDisponivel,
            validade,
            diasParaVencer,
            vencido,
            !vencido && diasParaVencer <= ExpirationWarningDays);
    }

    private sealed record LoteAllocation(EstoqueLote Entry, decimal Quantity);

    private sealed record StockTotals(decimal Disponivel, decimal Reservado);
}
