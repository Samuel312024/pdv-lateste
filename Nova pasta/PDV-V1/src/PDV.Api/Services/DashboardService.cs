using Microsoft.EntityFrameworkCore;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Infrastructure;

namespace PDV.Api.Services;

public class DashboardService(
    AppDbContext dbContext,
    CurrentUserService currentUser,
    UserPresenceService userPresenceService)
{
    public async Task<DashboardResumoDto> GetResumoAsync()
    {
        var empresaId = currentUser.GetEmpresaId();
        var now = DateTime.UtcNow;
        var todayStart = now.Date;
        var monthStart = new DateTime(now.Year, now.Month, 1);

        var vendas = dbContext.Vendas.Where(item => item.EmpresaId == empresaId);
        var vendasFinalizadas = vendas.Where(item => item.Status == VendaStatus.Finalizada);

        var totalHoje = await vendasFinalizadas
            .Where(item => item.DataVenda >= todayStart)
            .SumAsync(item => (decimal?)item.Total) ?? 0;

        var totalMes = await vendasFinalizadas
            .Where(item => item.DataVenda >= monthStart)
            .SumAsync(item => (decimal?)item.Total) ?? 0;

        var numeroVendasHoje = await vendasFinalizadas.CountAsync(item => item.DataVenda >= todayStart);
        var numeroVendasMes = await vendasFinalizadas.CountAsync(item => item.DataVenda >= monthStart);

        var produtosEstoqueBaixo = await dbContext.Produtos.CountAsync(item =>
            item.EmpresaId == empresaId &&
            item.Ativo &&
            item.ControlaEstoque &&
            item.EstoqueAtual <= item.EstoqueMinimo);

        var vendasCanceladasMes = await vendas.CountAsync(item =>
            item.Status == VendaStatus.Cancelada &&
            item.DataVenda >= monthStart);

        return new DashboardResumoDto(
            totalHoje,
            totalMes,
            numeroVendasHoje,
            numeroVendasMes == 0 ? 0 : decimal.Round(totalMes / numeroVendasMes, 2),
            produtosEstoqueBaixo,
            vendasCanceladasMes);
    }

    public async Task<IReadOnlyCollection<DashboardVendasPorDiaDto>> GetVendasPorDiaAsync(int dias = 7)
    {
        var empresaId = currentUser.GetEmpresaId();
        var startDate = DateTime.UtcNow.Date.AddDays(-dias + 1);

        var result = await dbContext.Vendas
            .Where(item =>
                item.EmpresaId == empresaId &&
                item.Status == VendaStatus.Finalizada &&
                item.DataVenda >= startDate)
            .GroupBy(item => item.DataVenda.Date)
            .Select(group => new
            {
                Dia = group.Key,
                Total = group.Sum(item => item.Total)
            })
            .OrderBy(item => item.Dia)
            .ToListAsync();

        return result.Select(item => new DashboardVendasPorDiaDto(DateOnly.FromDateTime(item.Dia), item.Total)).ToArray();
    }

    public async Task<IReadOnlyCollection<DashboardProdutosMaisVendidosDto>> GetProdutosMaisVendidosAsync(int top = 5)
    {
        var empresaId = currentUser.GetEmpresaId();
        var monthStart = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1);

        var result = await (
            from vendaItem in dbContext.VendaItens.AsNoTracking()
            join venda in dbContext.Vendas.AsNoTracking() on vendaItem.VendaId equals venda.VendaId
            join produto in dbContext.Produtos.AsNoTracking() on vendaItem.ProdutoId equals produto.ProdutoId
            where venda.EmpresaId == empresaId &&
                  venda.Status == VendaStatus.Finalizada &&
                  venda.DataVenda >= monthStart
            group vendaItem by new { vendaItem.ProdutoId, produto.Nome } into groupedItems
            select new
            {
                groupedItems.Key.ProdutoId,
                ProdutoNome = groupedItems.Key.Nome,
                Quantidade = groupedItems.Sum(item => item.Quantidade)
            })
            .OrderByDescending(item => item.Quantidade)
            .ThenBy(item => item.ProdutoNome)
            .Take(top)
            .ToListAsync();

        return result
            .Select(item => new DashboardProdutosMaisVendidosDto(
                item.ProdutoId,
                item.ProdutoNome,
                item.Quantidade))
            .ToArray();
    }

    public async Task<IReadOnlyCollection<DashboardVendasPorPagamentoDto>> GetVendasPorPagamentoAsync()
    {
        var empresaId = currentUser.GetEmpresaId();
        var monthStart = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1);

        var result = await dbContext.VendaPagamentos
            .Where(item =>
                item.Venda.EmpresaId == empresaId &&
                item.Venda.Status == VendaStatus.Finalizada &&
                item.Venda.DataVenda >= monthStart)
            .GroupBy(item => item.FormaPagamento)
            .Select(group => new DashboardVendasPorPagamentoDto(
                group.Key,
                group.Sum(item => item.ValorPago - item.Troco)))
            .ToListAsync();

        return result;
    }

    public async Task<MonitorOperacionalSnapshotDto> GetMonitorOperacionalAsync()
    {
        var empresaId = currentUser.GetEmpresaId();
        var updatedAt = DateTime.UtcNow;

        var caixasAbertos = await dbContext.Caixas
            .AsNoTracking()
            .Include(item => item.Usuario)
                .ThenInclude(item => item.Perfil)
            .Where(item =>
                item.EmpresaId == empresaId &&
                item.Status == CaixaStatus.Aberto)
            .OrderBy(item => item.DataAbertura)
            .ThenBy(item => item.Usuario.Nome)
            .ToListAsync();

        if (caixasAbertos.Count == 0)
        {
            return new MonitorOperacionalSnapshotDto(
                new MonitorOperacionalResumoDto(0, 0, 0, 0, 0, 0, updatedAt),
                [],
                []);
        }

        var caixaOrder = caixasAbertos
            .Select((caixa, index) => new { caixa.CaixaId, PdvNumero = index + 1 })
            .ToDictionary(item => item.CaixaId, item => item.PdvNumero);

        var caixaIds = caixasAbertos
            .Select(item => item.CaixaId)
            .ToArray();
        var presenceByUser = userPresenceService.GetPresenceMap(empresaId, updatedAt);

        var vendasBase = dbContext.Vendas
            .AsNoTracking()
            .Where(item =>
                item.EmpresaId == empresaId &&
                item.Status == VendaStatus.Finalizada &&
                caixaIds.Contains(item.CaixaId));

        var vendasPorCaixa = await vendasBase
            .GroupBy(item => item.CaixaId)
            .Select(group => new
            {
                CaixaId = group.Key,
                QuantidadeVendas = group.Count(),
                ValorTotalVendas = group.Sum(item => item.Total),
                UltimaVendaEm = group.Max(item => (DateTime?)item.DataVenda)
            })
            .ToDictionaryAsync(item => item.CaixaId);

        var itensPorCaixa = await (
                from item in dbContext.VendaItens.AsNoTracking()
                join venda in vendasBase on item.VendaId equals venda.VendaId
                group item by venda.CaixaId
                into groupedItems
                select new
                {
                    CaixaId = groupedItems.Key,
                    QuantidadeItens = groupedItems.Sum(entry => entry.Quantidade)
                })
            .ToDictionaryAsync(item => item.CaixaId, item => item.QuantidadeItens);

        var pagamentosPorCaixa = await (
                from pagamento in dbContext.VendaPagamentos.AsNoTracking()
                join venda in vendasBase on pagamento.VendaId equals venda.VendaId
                group pagamento by venda.CaixaId
                into groupedPayments
                select new
                {
                    CaixaId = groupedPayments.Key,
                    ValorDinheiro = groupedPayments
                        .Where(item => item.FormaPagamento == FormaPagamento.Dinheiro)
                        .Sum(item => item.ValorPago - item.Troco),
                    ValorPix = groupedPayments
                        .Where(item => item.FormaPagamento == FormaPagamento.Pix)
                        .Sum(item => item.ValorPago),
                    ValorCartaoDebito = groupedPayments
                        .Where(item => item.FormaPagamento == FormaPagamento.CartaoDebito)
                        .Sum(item => item.ValorPago),
                    ValorCartaoCredito = groupedPayments
                        .Where(item => item.FormaPagamento == FormaPagamento.CartaoCredito)
                        .Sum(item => item.ValorPago),
                    ValorVoucher = groupedPayments
                        .Where(item => item.FormaPagamento == FormaPagamento.Voucher)
                        .Sum(item => item.ValorPago)
                })
            .ToDictionaryAsync(item => item.CaixaId);

        var vendasRecentes = await vendasBase
            .AsSplitQuery()
            .Include(item => item.Itens)
            .Include(item => item.Pagamentos)
            .Include(item => item.Usuario)
            .OrderByDescending(item => item.DataVenda)
            .Take(20)
            .ToListAsync();

        var pdvs = caixasAbertos
            .Select(caixa =>
            {
                vendasPorCaixa.TryGetValue(caixa.CaixaId, out var vendasResumo);
                itensPorCaixa.TryGetValue(caixa.CaixaId, out var quantidadeItens);
                pagamentosPorCaixa.TryGetValue(caixa.CaixaId, out var pagamentosResumo);

                var quantidadeVendas = vendasResumo?.QuantidadeVendas ?? 0;
                var valorTotalVendas = vendasResumo?.ValorTotalVendas ?? 0;
                var ticketMedio = quantidadeVendas == 0
                    ? 0
                    : decimal.Round(valorTotalVendas / quantidadeVendas, 2);
                presenceByUser.TryGetValue(caixa.UsuarioId, out var userPresence);
                var usuarioSessaoAtiva = caixa.Usuario.Ativo && (userPresence?.Online ?? false);

                return new MonitorOperacionalPdvDto(
                    caixaOrder[caixa.CaixaId],
                    caixa.CaixaId,
                    caixa.UsuarioId,
                    caixa.Usuario.Nome,
                    caixa.Usuario.Email,
                    caixa.Usuario.Perfil.Nome,
                    caixa.Usuario.Ativo,
                    usuarioSessaoAtiva,
                    userPresence?.LastSeenUtc,
                    caixa.DataAbertura,
                    Math.Max(0, (int)Math.Floor((updatedAt - caixa.DataAbertura).TotalMinutes)),
                    quantidadeVendas,
                    quantidadeItens,
                    valorTotalVendas,
                    ticketMedio,
                    vendasResumo?.UltimaVendaEm,
                    pagamentosResumo?.ValorDinheiro ?? 0,
                    pagamentosResumo?.ValorPix ?? 0,
                    pagamentosResumo?.ValorCartaoDebito ?? 0,
                    pagamentosResumo?.ValorCartaoCredito ?? 0,
                    pagamentosResumo?.ValorVoucher ?? 0);
            })
            .ToArray();

        var vendasRecentesDto = vendasRecentes
            .Select(venda => new MonitorOperacionalVendaDto(
                venda.VendaId,
                venda.CaixaId,
                caixaOrder[venda.CaixaId],
                venda.NumeroVenda,
                venda.Usuario.Nome,
                venda.DataVenda,
                venda.Itens.Sum(item => item.Quantidade),
                venda.Total,
                string.Join(", ", venda.Pagamentos
                    .Select(item => item.FormaPagamento.ToString())
                    .Distinct()
                    .OrderBy(item => item))))
            .ToArray();

        var quantidadeTotalVendas = pdvs.Sum(item => item.QuantidadeVendas);
        var totalVendido = pdvs.Sum(item => item.ValorTotalVendas);
        var resumo = new MonitorOperacionalResumoDto(
            pdvs.Length,
            pdvs.Count(item => item.UsuarioSessaoAtiva),
            quantidadeTotalVendas,
            pdvs.Sum(item => item.QuantidadeItens),
            totalVendido,
            quantidadeTotalVendas == 0 ? 0 : decimal.Round(totalVendido / quantidadeTotalVendas, 2),
            updatedAt);

        return new MonitorOperacionalSnapshotDto(resumo, pdvs, vendasRecentesDto);
    }
}
