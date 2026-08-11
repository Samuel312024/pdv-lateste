using Microsoft.EntityFrameworkCore;
using PDV.Api.Common;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Infrastructure;
using System.Text.Json;

namespace PDV.Api.Services;

public class VendaService(
    AppDbContext dbContext,
    CurrentUserService currentUser,
    LiberacaoGerenteService liberacaoGerenteService,
    NotaFiscalService notaFiscalService,
    EstoqueService estoqueService,
    PedidoRealtimeNotifier pedidoRealtimeNotifier)
{
    public async Task<FinalizarVendaResponse> FinalizarAsync(FinalizarVendaRequest request)
    {
        EnsureOperationalAccess();

        var empresaId = currentUser.GetEmpresaId();
        var usuarioId = currentUser.GetUserId();
        var canSell = currentUser.HasPermission(Permissoes.RealizarVenda);
        var canPlaceCatalogOrders = currentUser.HasPermission(Permissoes.RealizarPedidoCliente);
        var liberacoesGerenciais = await liberacaoGerenteService.ValidarVariasAsync(
            empresaId,
            usuarioId,
            request.LiberacoesGerenciais);

        if (!canSell && !canPlaceCatalogOrders)
        {
            throw new ForbiddenAppException("O usuario nao possui permissao para concluir vendas nem pedidos pelo catalogo.");
        }

        if (request.Itens.Count == 0)
        {
            throw new AppException("Nao e permitido finalizar venda sem itens.");
        }

        var caixa = await ResolveCheckoutCaixaAsync(empresaId, usuarioId, canSell, canPlaceCatalogOrders);
        var usarPromocaoCatalogoComprador = !canSell && canPlaceCatalogOrders;
        var linkedClientId = currentUser.GetClienteId();
        var clienteId = request.ClienteId ?? linkedClientId;
        if (linkedClientId.HasValue && request.ClienteId.HasValue && request.ClienteId.Value != linkedClientId.Value)
        {
            throw new ForbiddenAppException("O comprador autenticado so pode fechar pedidos para o proprio cadastro.");
        }

        Cliente? cliente = null;
        if (clienteId.HasValue)
        {
            cliente = await dbContext.Clientes
                .FirstOrDefaultAsync(item =>
                    item.ClienteId == clienteId.Value &&
                    item.EmpresaId == empresaId &&
                    item.Ativo);

            if (cliente is null)
            {
                throw new AppException("Cliente informado nao pertence a empresa ou esta inativo.");
            }
        }

        if (request.Pedido is not null && cliente is null)
        {
            throw new AppException("Pedidos com retirada ou entrega precisam estar vinculados a um cliente ativo.");
        }

        var possuiLiberacaoDesconto = liberacoesGerenciais.ContainsKey(LiberacoesGerenciais.AplicarDescontoVenda);
        if (request.Itens.Any(item => item.Desconto > 0) &&
            !currentUser.HasPermission(Permissoes.AplicarDesconto) &&
            !possuiLiberacaoDesconto)
        {
            throw new ForbiddenAppException("Descontos nesta venda exigem a liberacao do gerente por cracha e senha.");
        }

        var itemRequests = request.Itens
            .GroupBy(item => item.ProdutoId)
            .Select(group => new
            {
                ProdutoId = group.Key,
                Quantidade = group.Sum(item => item.Quantidade),
                Desconto = group.Sum(item => item.Desconto)
            })
            .ToArray();

        if (itemRequests.Any(item => item.Quantidade <= 0 || item.Desconto < 0))
        {
            throw new AppException("Quantidade e desconto devem ser validos.");
        }

        var productIds = itemRequests.Select(item => item.ProdutoId).ToArray();
        var produtos = await dbContext.Produtos
            .Where(item => item.EmpresaId == empresaId && productIds.Contains(item.ProdutoId))
            .ToDictionaryAsync(item => item.ProdutoId);

        if (produtos.Count != productIds.Length)
        {
            throw new AppException("Um ou mais produtos informados nao pertencem a empresa.");
        }

        decimal subtotal = 0;
        decimal descontoTotal = 0;
        decimal custoTotal = 0;
        var vendaItens = new List<VendaItem>();
        foreach (var itemRequest in itemRequests)
        {
            var produto = produtos[itemRequest.ProdutoId];
            var valorUnitario = ResolveSalePrice(produto, usarPromocaoCatalogoComprador);
            if (!produto.Ativo)
            {
                throw new AppException($"O produto {produto.Nome} esta inativo e nao pode ser vendido.");
            }

            if (produto.ControlaEstoque && produto.EstoqueAtual < itemRequest.Quantidade)
            {
                throw new AppException($"Estoque insuficiente para o produto {produto.Nome}.");
            }

            var subtotalItem = valorUnitario * itemRequest.Quantidade;
            var totalItem = subtotalItem - itemRequest.Desconto;
            if (totalItem < 0)
            {
                throw new AppException($"O desconto do produto {produto.Nome} nao pode ser maior que o subtotal do item.");
            }

            subtotal += subtotalItem;
            descontoTotal += itemRequest.Desconto;
            custoTotal += produto.PrecoCusto * itemRequest.Quantidade;

            vendaItens.Add(new VendaItem
            {
                VendaItemId = Guid.NewGuid(),
                ProdutoId = produto.ProdutoId,
                Quantidade = itemRequest.Quantidade,
                ValorUnitario = valorUnitario,
                Desconto = itemRequest.Desconto,
                Total = totalItem
            });

            if (produto.ControlaEstoque)
            {
                await estoqueService.RegistrarSaidaVendaAsync(produto, itemRequest.Quantidade, Guid.Empty, cancellationToken: default);
            }
        }

        var total = subtotal - descontoTotal;
        if (total <= 0)
        {
            throw new AppException("O total da venda deve ser maior que zero.");
        }

        if (request.Pagamentos.Count == 0)
        {
            throw new AppException("Informe pelo menos uma forma de pagamento.");
        }

        if (request.Pagamentos.Any(item => item.ValorPago <= 0))
        {
            throw new AppException("Valores de pagamento devem ser maiores que zero.");
        }

        var possuiLiberacaoNfe = liberacoesGerenciais.ContainsKey(LiberacoesGerenciais.EmitirNfeVenda);
        if (request.EmitirNfe &&
            !currentUser.HasPermission(Permissoes.EmitirNotasFiscais) &&
            !possuiLiberacaoNfe)
        {
            throw new ForbiddenAppException("A emissao de NF-e nesta venda exige a liberacao do gerente por cracha e senha.");
        }

        var totalPago = request.Pagamentos.Sum(item => item.ValorPago);
        if (totalPago < total)
        {
            throw new AppException("O valor pago deve ser igual ou maior que o total da venda.");
        }

        var troco = totalPago - total;
        var totalDinheiroInformado = request.Pagamentos
            .Where(item => item.FormaPagamento == FormaPagamento.Dinheiro)
            .Sum(item => item.ValorPago);

        if (troco > 0 && totalDinheiroInformado <= 0)
        {
            throw new AppException("Troco so pode ser concedido quando houver pagamento em dinheiro.");
        }

        if (troco > totalDinheiroInformado)
        {
            throw new AppException("O troco nao pode ser maior que o valor pago em dinheiro.");
        }

        var pedidoConfigurado = request.Pedido is null
            ? null
            : BuildPedidoConfiguration(request.Pedido, cliente!);

        var numeroVenda = $"VEN-{DateTime.UtcNow:yyyyMMddHHmmss}-{Random.Shared.Next(100, 999)}";
        var venda = new Venda
        {
            VendaId = Guid.NewGuid(),
            EmpresaId = empresaId,
            CaixaId = caixa.CaixaId,
            UsuarioId = usuarioId,
            ClienteId = clienteId,
            NumeroVenda = numeroVenda,
            DataVenda = DateTime.UtcNow,
            Subtotal = subtotal,
            DescontoTotal = descontoTotal,
            Total = total,
            Status = VendaStatus.Finalizada,
            EhPedido = pedidoConfigurado is not null,
            AtendimentoTipo = pedidoConfigurado?.AtendimentoTipo,
            PedidoStatus = pedidoConfigurado?.PedidoStatus,
            CodigoAcompanhamento = pedidoConfigurado?.CodigoAcompanhamento,
            ContatoNome = pedidoConfigurado?.ContatoNome,
            ContatoTelefone = pedidoConfigurado?.ContatoTelefone,
            ObservacaoPedido = pedidoConfigurado?.ObservacaoPedido,
            EnderecoEntregaSnapshotJson = pedidoConfigurado?.EnderecoEntregaSnapshotJson,
            DataUltimaAtualizacaoPedido = pedidoConfigurado?.DataUltimaAtualizacaoPedido
        };

        foreach (var item in vendaItens)
        {
            item.VendaId = venda.VendaId;
            venda.Itens.Add(item);
        }

        var trocoRestante = troco;
        foreach (var pagamentoRequest in request.Pagamentos)
        {
            var captura = PreparePaymentCapture(pagamentoRequest);
            var trocoPagamento = 0m;
            if (trocoRestante > 0 && pagamentoRequest.FormaPagamento == FormaPagamento.Dinheiro)
            {
                trocoPagamento = trocoRestante;
                trocoRestante = 0;
            }

            venda.Pagamentos.Add(new VendaPagamento
            {
                VendaPagamentoId = Guid.NewGuid(),
                VendaId = venda.VendaId,
                FormaPagamento = pagamentoRequest.FormaPagamento,
                CapturaModo = captura.CapturaModo,
                StatusTransacao = captura.StatusTransacao,
                ProvedorOperacao = captura.ProvedorOperacao,
                ReferenciaTransacao = captura.ReferenciaTransacao,
                CodigoAutorizacao = captura.CodigoAutorizacao,
                BandeiraCartao = captura.BandeiraCartao,
                UltimosDigitosCartao = captura.UltimosDigitosCartao,
                Parcelas = captura.Parcelas,
                ObservacaoOperacao = captura.ObservacaoOperacao,
                PayloadOperacaoJson = captura.PayloadOperacaoJson,
                DataCaptura = captura.DataCaptura,
                ValorPago = pagamentoRequest.ValorPago,
                Troco = trocoPagamento
            });
        }

        foreach (var movimentacao in dbContext.ChangeTracker.Entries<MovimentacaoEstoque>()
                     .Where(entry =>
                         entry.State == EntityState.Added &&
                         entry.Entity.EmpresaId == empresaId &&
                         entry.Entity.ReferenciaId == Guid.Empty &&
                         entry.Entity.Origem == MovimentacaoEstoqueOrigem.Venda)
                     .Select(entry => entry.Entity))
        {
            movimentacao.ReferenciaId = venda.VendaId;
        }

        caixa.ValorTotalVendas += total;
        caixa.ValorDinheiro += venda.Pagamentos
            .Where(item => item.FormaPagamento == FormaPagamento.Dinheiro)
            .Sum(item => item.ValorPago - item.Troco);
        caixa.ValorCartaoCredito += venda.Pagamentos
            .Where(item => item.FormaPagamento == FormaPagamento.CartaoCredito)
            .Sum(item => item.ValorPago);
        caixa.ValorCartaoDebito += venda.Pagamentos
            .Where(item => item.FormaPagamento == FormaPagamento.CartaoDebito)
            .Sum(item => item.ValorPago);
        caixa.ValorPix += venda.Pagamentos
            .Where(item => item.FormaPagamento == FormaPagamento.Pix)
            .Sum(item => item.ValorPago);
        caixa.ValorVoucher += venda.Pagamentos
            .Where(item => item.FormaPagamento == FormaPagamento.Voucher)
            .Sum(item => item.ValorPago);

        dbContext.Vendas.Add(venda);

        if (pedidoConfigurado is not null)
        {
            dbContext.PedidoOcorrencias.Add(new PedidoOcorrencia
            {
                PedidoOcorrenciaId = Guid.NewGuid(),
                EmpresaId = empresaId,
                VendaId = venda.VendaId,
                UsuarioId = usuarioId,
                Status = pedidoConfigurado.PedidoStatus,
                Titulo = "Pedido recebido",
                Descricao = pedidoConfigurado.AtendimentoTipo == AtendimentoPedidoTipo.Entrega
                    ? "Pedido criado com entrega em domicilio e aguardando preparo."
                    : "Pedido criado para retirada e aguardando preparo.",
                VisivelParaCliente = true,
                DataOcorrencia = pedidoConfigurado.DataUltimaAtualizacaoPedido
            });
        }

        NotaFiscal? notaFiscal = null;
        if (request.EmitirNfe)
        {
            notaFiscal = await notaFiscalService.EmitirPorVendaInternaAsync(empresaId, usuarioId, venda, "NF-e gerada automaticamente no fechamento da venda.", NotaFiscalOrigem.Pdv);
        }

        dbContext.LancamentosFinanceiros.Add(new LancamentoFinanceiro
        {
            LancamentoFinanceiroId = Guid.NewGuid(),
            EmpresaId = empresaId,
            Tipo = FinanceiroTipo.Receber,
            Origem = FinanceiroOrigem.Venda,
            Status = FinanceiroStatus.Liquidado,
            Descricao = $"Venda {numeroVenda}",
            DocumentoReferencia = numeroVenda,
            VendaId = venda.VendaId,
            ClienteId = venda.ClienteId,
            UsuarioId = usuarioId,
            CaixaId = caixa.CaixaId,
            DataCompetencia = venda.DataVenda,
            DataVencimento = venda.DataVenda,
            DataLiquidacao = venda.DataVenda,
            ValorOriginal = total,
            ValorDesconto = descontoTotal,
            ValorAcrescimo = 0,
            ValorFinal = total,
            ValorCusto = custoTotal,
            Observacao = BuildFinanceiroObservacao(venda)
        });
        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = empresaId,
            UsuarioId = usuarioId,
            Modulo = "Vendas",
            Acao = "Finalizacao",
            Descricao = $"Venda {numeroVenda} finalizada com total de {total:n2}.",
            IpAddress = currentUser.GetIpAddress()
        });

        await dbContext.SaveChangesAsync();

        if (venda.EhPedido && venda.PedidoStatus.HasValue)
        {
            await pedidoRealtimeNotifier.NotifyAsync(
                venda.EmpresaId,
                new PedidoRealtimeEventoDto(
                    venda.VendaId,
                    venda.ClienteId,
                    venda.NumeroVenda,
                    venda.CodigoAcompanhamento ?? venda.NumeroVenda,
                    venda.PedidoStatus.Value.ToString(),
                    venda.DataUltimaAtualizacaoPedido ?? venda.DataVenda,
                    "Status",
                    null),
                venda.ClienteId);
        }

        var pendenciasNota = notaFiscal is null ? null : DeserializeNotaPendencias(notaFiscal.PendenciasJson);

        return new FinalizarVendaResponse(
            venda.VendaId,
            numeroVenda,
            total,
            troco,
            venda.EhPedido,
            venda.CodigoAcompanhamento,
            venda.PedidoStatus?.ToString(),
            notaFiscal?.NotaFiscalId,
            notaFiscal is null ? null : $"{notaFiscal.Serie}/{notaFiscal.Numero}",
            notaFiscal?.Status.ToString(),
            notaFiscal?.ProntaParaTransmissao,
            pendenciasNota);
    }

    public async Task<IReadOnlyCollection<VendaDto>> GetAllAsync()
    {
        var empresaId = currentUser.GetEmpresaId();
        var vendas = await QueryBase(empresaId)
            .OrderByDescending(item => item.DataVenda)
            .Take(100)
            .ToListAsync();

        return vendas.Select(Map).ToArray();
    }

    public async Task<VendaDto> GetByIdAsync(Guid id)
    {
        var empresaId = currentUser.GetEmpresaId();
        var venda = await QueryBase(empresaId)
            .FirstOrDefaultAsync(item => item.VendaId == id)
            ?? throw new NotFoundException("Venda nao encontrada.");

        return Map(venda);
    }

    public async Task<VendaDto> CancelarAsync(Guid id, CancelarVendaRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Motivo))
        {
            throw new AppException("Motivo do cancelamento e obrigatorio.");
        }

        var empresaId = currentUser.GetEmpresaId();
        var usuarioId = currentUser.GetUserId();
        var perfil = currentUser.GetPerfil();

        var venda = await dbContext.Vendas
            .Include(item => item.Caixa)
            .Include(item => item.Itens)
                .ThenInclude(item => item.Produto)
            .Include(item => item.Pagamentos)
            .FirstOrDefaultAsync(item => item.VendaId == id && item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Venda nao encontrada.");

        if (venda.Status == VendaStatus.Cancelada)
        {
            throw new AppException("Venda ja se encontra cancelada.");
        }

        if (venda.Caixa.Status == CaixaStatus.Fechado && perfil is not Perfis.Admin and not Perfis.Gerente)
        {
            throw new ForbiddenAppException("Apenas Admin ou Gerente podem cancelar venda de caixa fechado.");
        }

        venda.Status = VendaStatus.Cancelada;
        venda.MotivoCancelamento = request.Motivo.Trim();
        if (venda.EhPedido)
        {
            venda.PedidoStatus = PedidoStatus.Cancelado;
            venda.DataUltimaAtualizacaoPedido = DateTime.UtcNow;
        }

        foreach (var item in venda.Itens)
        {
            if (!item.Produto.ControlaEstoque)
            {
                continue;
            }

            await estoqueService.RegistrarRetornoVendaAsync(item.Produto, item.Quantidade, venda.VendaId);
        }

        venda.Caixa.ValorTotalVendas -= venda.Total;
        venda.Caixa.ValorDinheiro -= venda.Pagamentos
            .Where(item => item.FormaPagamento == FormaPagamento.Dinheiro)
            .Sum(item => item.ValorPago - item.Troco);
        venda.Caixa.ValorCartaoCredito -= venda.Pagamentos
            .Where(item => item.FormaPagamento == FormaPagamento.CartaoCredito)
            .Sum(item => item.ValorPago);
        venda.Caixa.ValorCartaoDebito -= venda.Pagamentos
            .Where(item => item.FormaPagamento == FormaPagamento.CartaoDebito)
            .Sum(item => item.ValorPago);
        venda.Caixa.ValorPix -= venda.Pagamentos
            .Where(item => item.FormaPagamento == FormaPagamento.Pix)
            .Sum(item => item.ValorPago);
        venda.Caixa.ValorVoucher -= venda.Pagamentos
            .Where(item => item.FormaPagamento == FormaPagamento.Voucher)
            .Sum(item => item.ValorPago);

        var lancamentoVenda = await dbContext.LancamentosFinanceiros
            .AsNoTracking()
            .Where(item =>
                item.EmpresaId == empresaId &&
                item.VendaId == venda.VendaId &&
                item.Tipo == FinanceiroTipo.Receber &&
                item.Origem == FinanceiroOrigem.Venda)
            .OrderByDescending(item => item.DataCompetencia)
            .FirstOrDefaultAsync();

        var custoReversao = lancamentoVenda?.ValorCusto
            ?? venda.Itens.Sum(item => item.Quantidade * item.Produto.PrecoCusto);

        dbContext.LancamentosFinanceiros.Add(new LancamentoFinanceiro
        {
            LancamentoFinanceiroId = Guid.NewGuid(),
            EmpresaId = empresaId,
            Tipo = FinanceiroTipo.Pagar,
            Origem = FinanceiroOrigem.CancelamentoVenda,
            Status = FinanceiroStatus.Liquidado,
            Descricao = $"Estorno da venda {venda.NumeroVenda}",
            DocumentoReferencia = venda.NumeroVenda,
            VendaId = venda.VendaId,
            ClienteId = venda.ClienteId,
            UsuarioId = usuarioId,
            CaixaId = venda.CaixaId,
            DataCompetencia = DateTime.UtcNow,
            DataVencimento = DateTime.UtcNow,
            DataLiquidacao = DateTime.UtcNow,
            ValorOriginal = venda.Total,
            ValorDesconto = 0,
            ValorAcrescimo = 0,
            ValorFinal = venda.Total,
            ValorCusto = custoReversao,
            Observacao = venda.MotivoCancelamento
        });

        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = empresaId,
            UsuarioId = usuarioId,
            Modulo = "Vendas",
            Acao = "Cancelamento",
            Descricao = $"Venda {venda.NumeroVenda} cancelada.",
            IpAddress = currentUser.GetIpAddress(),
            Dados = venda.MotivoCancelamento
        });

        if (venda.EhPedido && venda.PedidoStatus.HasValue)
        {
            dbContext.PedidoOcorrencias.Add(new PedidoOcorrencia
            {
                PedidoOcorrenciaId = Guid.NewGuid(),
                EmpresaId = empresaId,
                VendaId = venda.VendaId,
                UsuarioId = usuarioId,
                Status = PedidoStatus.Cancelado,
                Titulo = "Pedido cancelado",
                Descricao = venda.MotivoCancelamento,
                VisivelParaCliente = true,
                DataOcorrencia = venda.DataUltimaAtualizacaoPedido ?? DateTime.UtcNow
            });
        }

        var notasFiscais = await dbContext.NotasFiscais
            .Where(item =>
                item.EmpresaId == empresaId &&
                item.VendaId == venda.VendaId &&
                item.Status != NotaFiscalStatus.Cancelada)
            .ToListAsync();

        foreach (var notaFiscal in notasFiscais)
        {
            notaFiscal.Status = NotaFiscalStatus.Cancelada;
            notaFiscal.ProntaParaTransmissao = false;

            var pendencias = DeserializeNotaPendencias(notaFiscal.PendenciasJson).ToList();
            var mensagemCancelamento = $"Nota fiscal cancelada automaticamente porque a venda {venda.NumeroVenda} foi cancelada.";
            if (!pendencias.Any(item => string.Equals(item, mensagemCancelamento, StringComparison.OrdinalIgnoreCase)))
            {
                pendencias.Add(mensagemCancelamento);
            }

            notaFiscal.PendenciasJson = System.Text.Json.JsonSerializer.Serialize(pendencias);

            dbContext.LogsSistema.Add(new LogSistema
            {
                LogSistemaId = Guid.NewGuid(),
                EmpresaId = empresaId,
                UsuarioId = usuarioId,
                Modulo = "NotasFiscais",
                Acao = "Cancelamento",
                Descricao = $"NF-e serie {notaFiscal.Serie} numero {notaFiscal.Numero} cancelada pelo cancelamento da venda {venda.NumeroVenda}.",
                IpAddress = currentUser.GetIpAddress(),
                Dados = venda.MotivoCancelamento
            });
        }

        await dbContext.SaveChangesAsync();

        if (venda.EhPedido && venda.PedidoStatus.HasValue)
        {
            await pedidoRealtimeNotifier.NotifyAsync(
                venda.EmpresaId,
                new PedidoRealtimeEventoDto(
                    venda.VendaId,
                    venda.ClienteId,
                    venda.NumeroVenda,
                    venda.CodigoAcompanhamento ?? venda.NumeroVenda,
                    venda.PedidoStatus.Value.ToString(),
                    venda.DataUltimaAtualizacaoPedido ?? DateTime.UtcNow,
                    "Status",
                    null),
                venda.ClienteId);
        }

        return await GetByIdAsync(venda.VendaId);
    }

    private IQueryable<Venda> QueryBase(Guid empresaId)
        => dbContext.Vendas
            .AsSplitQuery()
            .Include(item => item.Itens)
                .ThenInclude(item => item.Produto)
            .Include(item => item.Pagamentos)
            .Include(item => item.Cliente)
            .Where(item => item.EmpresaId == empresaId);

    private static VendaDto Map(Venda venda)
        => new(
            venda.VendaId,
            venda.EmpresaId,
            venda.CaixaId,
            venda.UsuarioId,
            venda.ClienteId,
            venda.Cliente?.Nome,
            venda.NumeroVenda,
            venda.DataVenda,
            venda.Subtotal,
            venda.DescontoTotal,
            venda.Total,
            venda.Status.ToString(),
            venda.EhPedido,
            venda.AtendimentoTipo?.ToString(),
            venda.PedidoStatus?.ToString(),
            venda.CodigoAcompanhamento,
            venda.ContatoNome,
            venda.ContatoTelefone,
            venda.ObservacaoPedido,
            BuildAddressSummary(venda.EnderecoEntregaSnapshotJson),
            venda.DataUltimaAtualizacaoPedido,
            venda.MotivoCancelamento,
            venda.Itens.Select(item => new VendaItemDto(
                item.VendaItemId,
                item.ProdutoId,
                item.Produto.Nome,
                item.Quantidade,
                item.ValorUnitario,
                item.Desconto,
                item.Total)).ToArray(),
            venda.Pagamentos.Select(item => new VendaPagamentoDto(
                item.VendaPagamentoId,
                item.FormaPagamento,
                item.CapturaModo,
                item.StatusTransacao,
                item.ProvedorOperacao,
                item.ReferenciaTransacao,
                item.CodigoAutorizacao,
                item.BandeiraCartao,
                item.UltimosDigitosCartao,
                item.Parcelas,
                item.ObservacaoOperacao,
                item.DataCaptura,
                item.ValorPago,
                item.Troco)).ToArray());

    private static string BuildFinanceiroObservacao(Venda venda)
    {
        var pagamentos = string.Join(", ", venda.Pagamentos.Select(item =>
        {
            var valorLiquido = item.ValorPago - item.Troco;
            var captura = item.CapturaModo == PagamentoCapturaModo.Simulado ? " simulado" : string.Empty;
            return $"{item.FormaPagamento}{captura}: {valorLiquido:n2}";
        }));

        return string.IsNullOrWhiteSpace(pagamentos)
            ? "Gerado automaticamente pela finalizacao da venda."
            : $"Gerado automaticamente pela venda. Pagamentos: {pagamentos}.";
    }

    private static IReadOnlyCollection<string> DeserializeNotaPendencias(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }

        try
        {
            return System.Text.Json.JsonSerializer.Deserialize<string[]>(json) ?? [];
        }
        catch (System.Text.Json.JsonException)
        {
            return [];
        }
    }

    private async Task<Caixa> ResolveCheckoutCaixaAsync(Guid empresaId, Guid usuarioId, bool canSell, bool canPlaceCatalogOrders)
    {
        var caixaUsuario = await dbContext.Caixas
            .FirstOrDefaultAsync(item =>
                item.EmpresaId == empresaId &&
                item.UsuarioId == usuarioId &&
                item.Status == CaixaStatus.Aberto);

        if (caixaUsuario is not null)
        {
            return caixaUsuario;
        }

        if (canSell)
        {
            throw new AppException("Nao e permitido vender sem caixa aberto.");
        }

        if (!canPlaceCatalogOrders)
        {
            throw new ForbiddenAppException("O usuario nao possui permissao para concluir pedidos do catalogo.");
        }

        return await dbContext.Caixas
            .Where(item => item.EmpresaId == empresaId && item.Status == CaixaStatus.Aberto)
            .OrderBy(item => item.DataAbertura)
            .FirstOrDefaultAsync()
            ?? throw new AppException("A loja ainda nao abriu nenhum caixa operacional para receber pedidos do catalogo.");
    }

    private static PedidoConfigurado BuildPedidoConfiguration(FinalizarPedidoRequest request, Cliente cliente)
    {
        var contatoNome = NormalizeMaxLength(request.ContatoNome, 150, "Nome de contato") ?? cliente.Nome;
        var contatoTelefone = NormalizeMaxLength(request.ContatoTelefone, 20, "Telefone de contato") ?? cliente.Telefone;
        var observacaoPedido = NormalizeMaxLength(request.ObservacaoPedido, 500, "Observacao do pedido");
        var atualizadoEm = DateTime.UtcNow;

        string? enderecoEntregaSnapshotJson = null;
        if (request.AtendimentoTipo == AtendimentoPedidoTipo.Entrega)
        {
            if (string.IsNullOrWhiteSpace(cliente.Logradouro) ||
                string.IsNullOrWhiteSpace(cliente.Numero) ||
                string.IsNullOrWhiteSpace(cliente.Bairro) ||
                string.IsNullOrWhiteSpace(cliente.Cidade) ||
                string.IsNullOrWhiteSpace(cliente.Uf))
            {
                throw new AppException("Entrega em domicilio exige cliente com endereco completo no cadastro.");
            }

            enderecoEntregaSnapshotJson = JsonSerializer.Serialize(new EnderecoEntregaSnapshot(
                cliente.Cep,
                cliente.Logradouro,
                cliente.Numero,
                cliente.Complemento,
                cliente.Bairro,
                cliente.Cidade,
                cliente.Uf));
        }

        return new PedidoConfigurado(
            request.AtendimentoTipo,
            PedidoStatus.Recebido,
            GenerateTrackingCode(),
            contatoNome,
            contatoTelefone,
            observacaoPedido,
            enderecoEntregaSnapshotJson,
            atualizadoEm);
    }

    private static string GenerateTrackingCode()
        => $"PED-{Random.Shared.Next(100000, 999999)}";

    private static string? BuildAddressSummary(string? enderecoEntregaSnapshotJson)
    {
        if (string.IsNullOrWhiteSpace(enderecoEntregaSnapshotJson))
        {
            return null;
        }

        try
        {
            var snapshot = JsonSerializer.Deserialize<EnderecoEntregaSnapshot>(enderecoEntregaSnapshotJson);
            if (snapshot is null)
            {
                return null;
            }

            var headline = string.Join(", ", new[] { snapshot.Logradouro, snapshot.Numero }.Where(item => !string.IsNullOrWhiteSpace(item)));
            var region = string.Join(" · ", new[]
            {
                snapshot.Bairro,
                string.Join("/", new[] { snapshot.Cidade, snapshot.Uf }.Where(item => !string.IsNullOrWhiteSpace(item)))
            }.Where(item => !string.IsNullOrWhiteSpace(item)));

            return string.Join(" - ", new[] { headline, region }.Where(item => !string.IsNullOrWhiteSpace(item)));
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static PagamentoCapturaPreparada PreparePaymentCapture(FinalizarVendaPagamentoRequest request)
    {
        var dataCaptura = DateTime.UtcNow;
        var capturaModo = request.FormaPagamento == FormaPagamento.Dinheiro
            ? PagamentoCapturaModo.ManualAssistido
            : request.CapturaModo ?? PagamentoCapturaModo.ManualAssistido;
        if (capturaModo == PagamentoCapturaModo.Integrado)
        {
            throw new AppException("A integracao direta de pagamentos ainda nao esta habilitada. Use Manual assistido ou Simulado nesta fase.");
        }

        var referenciaTransacao = NormalizeMaxLength(request.ReferenciaTransacao, 100, "Referencia da transacao");
        var codigoAutorizacao = NormalizeMaxLength(request.CodigoAutorizacao, 60, "Codigo de autorizacao");
        var bandeiraCartao = NormalizeMaxLength(request.BandeiraCartao, 40, "Bandeira do cartao");
        var provedorOperacao = NormalizeMaxLength(request.ProvedorOperacao, 60, "Provedor da operacao");
        var observacaoOperacao = NormalizeMaxLength(request.ObservacaoOperacao, 200, "Observacao da operacao");
        var ultimosDigitosCartao = NormalizeLast4Digits(request.UltimosDigitosCartao);
        var parcelas = request.FormaPagamento == FormaPagamento.CartaoCredito
            ? NormalizeParcelas(request.Parcelas)
            : null;

        switch (request.FormaPagamento)
        {
            case FormaPagamento.Dinheiro:
                return new PagamentoCapturaPreparada(
                    PagamentoCapturaModo.ManualAssistido,
                    PagamentoStatusTransacao.Aprovada,
                    "CaixaPresencial",
                    referenciaTransacao,
                    codigoAutorizacao,
                    null,
                    null,
                    null,
                    observacaoOperacao,
                    BuildPayloadJson(request, PagamentoCapturaModo.ManualAssistido, "CaixaPresencial", dataCaptura),
                    dataCaptura);

            case FormaPagamento.Pix:
                if (capturaModo == PagamentoCapturaModo.ManualAssistido && string.IsNullOrWhiteSpace(referenciaTransacao))
                {
                    throw new AppException("Informe a referencia da transacao Pix, como txid, e2eId ou identificador do comprovante.");
                }

                break;

            case FormaPagamento.CartaoCredito:
            case FormaPagamento.CartaoDebito:
            case FormaPagamento.Voucher:
                if (capturaModo == PagamentoCapturaModo.ManualAssistido &&
                    string.IsNullOrWhiteSpace(referenciaTransacao) &&
                    string.IsNullOrWhiteSpace(codigoAutorizacao))
                {
                    throw new AppException($"Informe a referencia da transacao ou o codigo de autorizacao para {request.FormaPagamento}.");
                }

                break;
        }

        if (capturaModo == PagamentoCapturaModo.Simulado)
        {
            referenciaTransacao ??= BuildSimulatedReference(request.FormaPagamento, dataCaptura);
            provedorOperacao = "SimuladorInterno";
            observacaoOperacao ??= "Transacao simulada para operacao sem maquininha fisica.";
            if (request.FormaPagamento == FormaPagamento.CartaoCredito && parcelas is null)
            {
                parcelas = 1;
            }

            return new PagamentoCapturaPreparada(
                capturaModo,
                PagamentoStatusTransacao.Simulada,
                provedorOperacao,
                referenciaTransacao,
                codigoAutorizacao,
                bandeiraCartao,
                ultimosDigitosCartao,
                parcelas,
                observacaoOperacao,
                BuildPayloadJson(request, capturaModo, provedorOperacao, dataCaptura),
                dataCaptura);
        }

        if (request.FormaPagamento == FormaPagamento.CartaoCredito && parcelas is null)
        {
            parcelas = 1;
        }

        return new PagamentoCapturaPreparada(
            capturaModo,
            PagamentoStatusTransacao.Aprovada,
            string.IsNullOrWhiteSpace(provedorOperacao) ? "RegistroManual" : provedorOperacao,
            referenciaTransacao,
            codigoAutorizacao,
            bandeiraCartao,
            ultimosDigitosCartao,
            parcelas,
            observacaoOperacao,
            BuildPayloadJson(request, capturaModo, string.IsNullOrWhiteSpace(provedorOperacao) ? "RegistroManual" : provedorOperacao, dataCaptura),
            dataCaptura);
    }

    private static decimal ResolveSalePrice(Produto produto, bool usarPromocaoCatalogoComprador)
    {
        if (!usarPromocaoCatalogoComprador)
        {
            return produto.PrecoVenda;
        }

        if (!produto.PrecoPromocional.HasValue || produto.PrecoPromocional.Value <= 0 || produto.PrecoPromocional.Value >= produto.PrecoVenda)
        {
            return produto.PrecoVenda;
        }

        var now = DateTime.UtcNow;
        var iniciou = !produto.PromocaoInicioUtc.HasValue || produto.PromocaoInicioUtc.Value <= now;
        var naoExpirou = !produto.PromocaoFimUtc.HasValue || produto.PromocaoFimUtc.Value >= now;

        return iniciou && naoExpirou
            ? produto.PrecoPromocional.Value
            : produto.PrecoVenda;
    }

    private static string? NormalizeMaxLength(string? value, int maxLength, string fieldName)
    {
        var normalized = string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        if (normalized is not null && normalized.Length > maxLength)
        {
            throw new AppException($"{fieldName} deve ter no maximo {maxLength} caracteres.");
        }

        return normalized;
    }

    private static string? NormalizeLast4Digits(string? value)
    {
        var digits = string.IsNullOrWhiteSpace(value)
            ? null
            : new string(value.Where(char.IsAsciiDigit).ToArray());
        if (string.IsNullOrWhiteSpace(digits))
        {
            return null;
        }

        if (digits.Length != 4)
        {
            throw new AppException("Ultimos digitos do cartao devem conter exatamente 4 numeros.");
        }

        return digits;
    }

    private static int? NormalizeParcelas(int? value)
    {
        if (!value.HasValue)
        {
            return null;
        }

        if (value.Value is < 1 or > 24)
        {
            throw new AppException("Parcelas do cartao de credito devem estar entre 1 e 24.");
        }

        return value.Value;
    }

    private static string BuildSimulatedReference(FormaPagamento formaPagamento, DateTime dataCaptura)
        => $"SIM-{formaPagamento.ToString().ToUpperInvariant()}-{dataCaptura:yyyyMMddHHmmssfff}";

    private static string BuildPayloadJson(
        FinalizarVendaPagamentoRequest request,
        PagamentoCapturaModo capturaModo,
        string provedorOperacao,
        DateTime dataCaptura)
        => JsonSerializer.Serialize(new
        {
            request.FormaPagamento,
            request.ValorPago,
            CapturaModo = capturaModo,
            ProvedorOperacao = provedorOperacao,
            request.ReferenciaTransacao,
            request.CodigoAutorizacao,
            request.BandeiraCartao,
            request.UltimosDigitosCartao,
            request.Parcelas,
            request.ObservacaoOperacao,
            DataCapturaUtc = dataCaptura
        });

    private sealed record PagamentoCapturaPreparada(
        PagamentoCapturaModo CapturaModo,
        PagamentoStatusTransacao StatusTransacao,
        string ProvedorOperacao,
        string? ReferenciaTransacao,
        string? CodigoAutorizacao,
        string? BandeiraCartao,
        string? UltimosDigitosCartao,
        int? Parcelas,
        string? ObservacaoOperacao,
        string PayloadOperacaoJson,
        DateTime DataCaptura);

    private sealed record PedidoConfigurado(
        AtendimentoPedidoTipo AtendimentoTipo,
        PedidoStatus PedidoStatus,
        string CodigoAcompanhamento,
        string ContatoNome,
        string? ContatoTelefone,
        string? ObservacaoPedido,
        string? EnderecoEntregaSnapshotJson,
        DateTime DataUltimaAtualizacaoPedido);

    private sealed record EnderecoEntregaSnapshot(
        string? Cep,
        string? Logradouro,
        string? Numero,
        string? Complemento,
        string? Bairro,
        string? Cidade,
        string? Uf);

    private void EnsureOperationalAccess()
    {
        if (currentUser.HasOperationalAccess())
        {
            return;
        }

        throw new ForbiddenAppException("A operacao do PDV exige identificacao do operador por cracha e senha.");
    }
}
