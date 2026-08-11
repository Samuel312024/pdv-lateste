using Microsoft.EntityFrameworkCore;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Infrastructure;

namespace PDV.Api.Services;

public class RelatorioService(AppDbContext dbContext, CurrentUserService currentUser)
{
    public async Task<RelatorioResumoDto> GetResumoAsync(RelatorioFiltroRequest filtro)
    {
        var empresaId = currentUser.GetEmpresaId();
        var vendasFiltradas = ApplyVendaFilters(dbContext.Vendas.AsNoTracking(), empresaId, filtro);

        var vendasFinalizadas = vendasFiltradas.Where(item => item.Status == VendaStatus.Finalizada);
        var totalVendido = await vendasFinalizadas.SumAsync(item => (decimal?)item.Total) ?? 0;
        var quantidadeVendas = await vendasFinalizadas.CountAsync();
        var vendasCanceladas = await vendasFiltradas.CountAsync(item => item.Status == VendaStatus.Cancelada);

        var vendaIds = await vendasFinalizadas
            .Select(item => item.VendaId)
            .ToArrayAsync();

        var pagamentosAgrupados = vendaIds.Length == 0
            ? new Dictionary<FormaPagamento, decimal>()
            : await dbContext.VendaPagamentos
                .AsNoTracking()
                .Where(item => vendaIds.Contains(item.VendaId))
                .GroupBy(item => item.FormaPagamento)
                .Select(group => new
                {
                    group.Key,
                    Total = group.Sum(item => item.ValorPago - item.Troco)
                })
                .ToDictionaryAsync(item => item.Key, item => item.Total);

        decimal GetTotal(FormaPagamento formaPagamento)
            => pagamentosAgrupados.TryGetValue(formaPagamento, out var total)
                ? total
                : 0;

        return new RelatorioResumoDto(
            totalVendido,
            quantidadeVendas,
            quantidadeVendas == 0 ? 0 : decimal.Round(totalVendido / quantidadeVendas, 2),
            vendasCanceladas,
            GetTotal(FormaPagamento.Dinheiro),
            GetTotal(FormaPagamento.Pix),
            GetTotal(FormaPagamento.CartaoCredito),
            GetTotal(FormaPagamento.CartaoDebito),
            GetTotal(FormaPagamento.Voucher));
    }

    public async Task<IReadOnlyCollection<RelatorioVendaLinhaDto>> GetVendasAsync(RelatorioFiltroRequest filtro)
    {
        var empresaId = currentUser.GetEmpresaId();
        var vendas = await ApplyVendaFilters(dbContext.Vendas.AsNoTracking(), empresaId, filtro)
            .AsSplitQuery()
            .Include(item => item.Usuario)
            .Include(item => item.Cliente)
            .Include(item => item.Itens)
            .Include(item => item.Pagamentos)
            .OrderByDescending(item => item.DataVenda)
            .ToListAsync();

        return vendas
            .Select(item => new RelatorioVendaLinhaDto(
                item.VendaId,
                item.NumeroVenda,
                item.DataVenda,
                item.Status.ToString(),
                item.UsuarioId,
                item.Usuario.Nome,
                item.ClienteId,
                item.Cliente?.Nome,
                item.Itens.Sum(vendaItem => vendaItem.Quantidade),
                item.Subtotal,
                item.DescontoTotal,
                item.Total,
                string.Join(", ", item.Pagamentos
                    .Select(pagamento => pagamento.FormaPagamento.ToString())
                    .Distinct()
                    .OrderBy(nome => nome)),
                item.Pagamentos
                    .Where(pagamento => pagamento.FormaPagamento == FormaPagamento.Dinheiro)
                    .Sum(pagamento => pagamento.ValorPago - pagamento.Troco),
                item.Pagamentos
                    .Where(pagamento => pagamento.FormaPagamento == FormaPagamento.Pix)
                    .Sum(pagamento => pagamento.ValorPago),
                item.Pagamentos
                    .Where(pagamento => pagamento.FormaPagamento == FormaPagamento.CartaoCredito)
                    .Sum(pagamento => pagamento.ValorPago),
                item.Pagamentos
                    .Where(pagamento => pagamento.FormaPagamento == FormaPagamento.CartaoDebito)
                    .Sum(pagamento => pagamento.ValorPago),
                item.Pagamentos
                    .Where(pagamento => pagamento.FormaPagamento == FormaPagamento.Voucher)
                    .Sum(pagamento => pagamento.ValorPago),
                item.Pagamentos.Sum(pagamento => pagamento.Troco)))
            .ToArray();
    }

    public async Task<IReadOnlyCollection<RelatorioCaixaDto>> GetCaixasAsync(RelatorioFiltroRequest filtro)
    {
        var empresaId = currentUser.GetEmpresaId();
        var query = dbContext.Caixas
            .AsNoTracking()
            .Include(item => item.Usuario)
            .Where(item => item.EmpresaId == empresaId);

        if (filtro.UsuarioId.HasValue)
        {
            query = query.Where(item => item.UsuarioId == filtro.UsuarioId.Value);
        }

        if (filtro.DataInicial.HasValue)
        {
            var dataInicial = filtro.DataInicial.Value.Date;
            query = query.Where(item => item.DataAbertura >= dataInicial);
        }

        if (filtro.DataFinal.HasValue)
        {
            var dataFinalExclusiva = filtro.DataFinal.Value.Date.AddDays(1);
            query = query.Where(item => item.DataAbertura < dataFinalExclusiva);
        }

        var caixas = await query
            .OrderByDescending(item => item.DataAbertura)
            .ToListAsync();

        return caixas
            .Select(item => new RelatorioCaixaDto(
                item.CaixaId,
                item.UsuarioId,
                item.Usuario.Nome,
                item.DataAbertura,
                item.DataFechamento,
                item.Status.ToString(),
                item.ValorInicial,
                item.ValorTotalVendas,
                item.ValorDinheiro,
                item.ValorCartaoCredito,
                item.ValorCartaoDebito,
                item.ValorPix,
                item.ValorVoucher,
                item.ValorSangria,
                item.ValorSuprimento,
                item.DiferencaInformada,
                item.ValorInicial + item.ValorDinheiro + item.ValorSuprimento - item.ValorSangria))
            .ToArray();
    }

    public async Task<IReadOnlyCollection<RelatorioEstoqueBaixoDto>> GetEstoqueBaixoAsync(RelatorioFiltroRequest filtro)
    {
        var empresaId = currentUser.GetEmpresaId();
        var query = dbContext.Produtos
            .AsNoTracking()
            .Where(item =>
                item.EmpresaId == empresaId &&
                item.Ativo &&
                item.ControlaEstoque &&
                item.EstoqueAtual <= item.EstoqueMinimo);

        if (filtro.ProdutoId.HasValue)
        {
            query = query.Where(item => item.ProdutoId == filtro.ProdutoId.Value);
        }

        var produtos = await query
            .OrderBy(item => item.EstoqueAtual)
            .ThenBy(item => item.Nome)
            .ToListAsync();

        return produtos
            .Select(item => new RelatorioEstoqueBaixoDto(
                item.ProdutoId,
                item.Nome,
                item.CodigoBarras,
                item.EstoqueAtual,
                item.EstoqueMinimo,
                item.UnidadeMedida))
            .ToArray();
    }

    public async Task<RelatorioFiltrosOpcoesDto> GetFiltrosOpcoesAsync()
    {
        var empresaId = currentUser.GetEmpresaId();

        var usuarios = await dbContext.Usuarios
            .AsNoTracking()
            .Where(item => item.EmpresaId == empresaId && item.Ativo)
            .OrderBy(item => item.Nome)
            .Select(item => new RelatorioFiltroOpcaoDto(item.UsuarioId, item.Nome))
            .ToListAsync();

        var clientes = await dbContext.Clientes
            .AsNoTracking()
            .Where(item => item.EmpresaId == empresaId && item.Ativo)
            .OrderBy(item => item.Nome)
            .Select(item => new RelatorioFiltroOpcaoDto(item.ClienteId, item.Nome))
            .ToListAsync();

        var produtos = await dbContext.Produtos
            .AsNoTracking()
            .Where(item => item.EmpresaId == empresaId && item.Ativo)
            .OrderBy(item => item.Nome)
            .Select(item => new RelatorioFiltroOpcaoDto(item.ProdutoId, item.Nome))
            .ToListAsync();

        return new RelatorioFiltrosOpcoesDto(usuarios, clientes, produtos);
    }

    private static IQueryable<Venda> ApplyVendaFilters(IQueryable<Venda> query, Guid empresaId, RelatorioFiltroRequest filtro)
    {
        query = query.Where(item => item.EmpresaId == empresaId);

        if (filtro.DataInicial.HasValue)
        {
            var dataInicial = filtro.DataInicial.Value.Date;
            query = query.Where(item => item.DataVenda >= dataInicial);
        }

        if (filtro.DataFinal.HasValue)
        {
            var dataFinalExclusiva = filtro.DataFinal.Value.Date.AddDays(1);
            query = query.Where(item => item.DataVenda < dataFinalExclusiva);
        }

        if (filtro.UsuarioId.HasValue)
        {
            query = query.Where(item => item.UsuarioId == filtro.UsuarioId.Value);
        }

        if (filtro.ProdutoId.HasValue)
        {
            query = query.Where(item => item.Itens.Any(vendaItem => vendaItem.ProdutoId == filtro.ProdutoId.Value));
        }

        if (filtro.ClienteId.HasValue)
        {
            query = query.Where(item => item.ClienteId == filtro.ClienteId.Value);
        }

        if (filtro.FormaPagamento.HasValue)
        {
            query = query.Where(item => item.Pagamentos.Any(pagamento => pagamento.FormaPagamento == filtro.FormaPagamento.Value));
        }

        if (filtro.StatusVenda.HasValue)
        {
            query = query.Where(item => item.Status == filtro.StatusVenda.Value);
        }

        return query;
    }
}
