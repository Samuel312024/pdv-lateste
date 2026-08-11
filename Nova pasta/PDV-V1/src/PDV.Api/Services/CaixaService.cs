using Microsoft.EntityFrameworkCore;
using PDV.Api.Common;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Infrastructure;

namespace PDV.Api.Services;

public class CaixaService(
    AppDbContext dbContext,
    CurrentUserService currentUser,
    LiberacaoGerenteService liberacaoGerenteService)
{
    public async Task<CaixaDto?> GetOpenAsync()
    {
        var caixa = await GetOpenEntityAsync(false);
        return caixa is null ? null : Map(caixa);
    }

    public async Task<CheckoutDisponibilidadeDto> GetCheckoutDisponibilidadeAsync()
    {
        var empresaId = currentUser.GetEmpresaId();
        var usuarioId = currentUser.GetUserId();

        var caixaUsuarioAberto = await dbContext.Caixas.AnyAsync(item =>
            item.EmpresaId == empresaId &&
            item.UsuarioId == usuarioId &&
            item.Status == CaixaStatus.Aberto);

        if (caixaUsuarioAberto)
        {
            return new CheckoutDisponibilidadeDto(true, "Caixa do usuario atual pronto para checkout.");
        }

        if (currentUser.HasPermission(Permissoes.RealizarPedidoCliente))
        {
            var caixaEmpresaAberto = await dbContext.Caixas.AnyAsync(item =>
                item.EmpresaId == empresaId &&
                item.Status == CaixaStatus.Aberto);

            return caixaEmpresaAberto
                ? new CheckoutDisponibilidadeDto(true, "Existe operacao de caixa aberta na empresa para receber pedidos do catalogo.")
                : new CheckoutDisponibilidadeDto(false, "A loja ainda nao abriu nenhum caixa operacional para receber pedidos do catalogo.");
        }

        return new CheckoutDisponibilidadeDto(false, "Nao existe caixa aberto para o usuario atual.");
    }

    public async Task<CaixaDto> AbrirAsync(AbrirCaixaRequest request)
    {
        EnsureOperationalAccess();
        await EnsureManagerOverrideForOpeningAsync(request.LiberacaoGerente);

        if (request.ValorInicial < 0)
        {
            throw new AppException("Valor inicial nao pode ser negativo.");
        }

        var empresaId = currentUser.GetEmpresaId();
        var usuarioId = currentUser.GetUserId();

        var alreadyOpen = await dbContext.Caixas.AnyAsync(item =>
            item.EmpresaId == empresaId &&
            item.UsuarioId == usuarioId &&
            item.Status == CaixaStatus.Aberto);

        if (alreadyOpen)
        {
            throw new AppException("O usuario ja possui um caixa aberto.");
        }

        var caixa = new Caixa
        {
            CaixaId = Guid.NewGuid(),
            EmpresaId = empresaId,
            UsuarioId = usuarioId,
            DataAbertura = DateTime.UtcNow,
            ValorInicial = request.ValorInicial,
            Status = CaixaStatus.Aberto
        };

        dbContext.Caixas.Add(caixa);
        AddLog("Abertura", $"Caixa {caixa.CaixaId} aberto com valor inicial de {request.ValorInicial:n2}.");
        await dbContext.SaveChangesAsync();

        return Map(caixa);
    }

    public async Task<CaixaDto> FecharAsync(FecharCaixaRequest request)
    {
        EnsureOperationalAccess();
        await EnsurePermissionOrManagerOverrideAsync(Permissoes.FecharCaixa, LiberacoesGerenciais.FecharCaixa, request.LiberacaoGerente);

        var caixa = await GetOpenEntityAsync(true)
            ?? throw new AppException("Nao existe caixa aberto para o usuario.");

        await RecalculateCaixaAsync(caixa);

        caixa.DataFechamento = DateTime.UtcNow;
        caixa.Status = CaixaStatus.Fechado;
        caixa.DiferencaInformada = request.ValorContadoDinheiro - GetValorEsperadoEmDinheiro(caixa);

        AddLog("Fechamento", $"Caixa {caixa.CaixaId} fechado.");
        if (!string.IsNullOrWhiteSpace(request.Observacao))
        {
            dbContext.LogsSistema.Add(new LogSistema
            {
                LogSistemaId = Guid.NewGuid(),
                EmpresaId = caixa.EmpresaId,
                UsuarioId = caixa.UsuarioId,
                Modulo = "Caixa",
                Acao = "ObservacaoFechamento",
                Descricao = request.Observacao.Trim(),
                IpAddress = currentUser.GetIpAddress()
            });
        }

        await dbContext.SaveChangesAsync();
        return Map(caixa);
    }

    public async Task<CaixaDto> SangriaAsync(MovimentoCaixaRequest request)
    {
        EnsureOperationalAccess();
        await EnsurePermissionOrManagerOverrideAsync(Permissoes.SangriaCaixa, LiberacoesGerenciais.SangriaCaixa, request.LiberacaoGerente);

        if (request.Valor <= 0)
        {
            throw new AppException("Valor da sangria deve ser maior que zero.");
        }

        var caixa = await GetOpenEntityAsync(true)
            ?? throw new AppException("Nao existe caixa aberto para o usuario.");

        caixa.ValorSangria += request.Valor;
        AddLog("Sangria", $"Sangria registrada no valor de {request.Valor:n2}.");
        await dbContext.SaveChangesAsync();

        return Map(caixa);
    }

    public async Task<CaixaDto> SuprimentoAsync(MovimentoCaixaRequest request)
    {
        EnsureOperationalAccess();
        await EnsurePermissionOrManagerOverrideAsync(Permissoes.SuprimentoCaixa, LiberacoesGerenciais.SuprimentoCaixa, request.LiberacaoGerente);

        if (request.Valor <= 0)
        {
            throw new AppException("Valor do suprimento deve ser maior que zero.");
        }

        var caixa = await GetOpenEntityAsync(true)
            ?? throw new AppException("Nao existe caixa aberto para o usuario.");

        caixa.ValorSuprimento += request.Valor;
        AddLog("Suprimento", $"Suprimento registrado no valor de {request.Valor:n2}.");
        await dbContext.SaveChangesAsync();

        return Map(caixa);
    }

    private async Task<Caixa?> GetOpenEntityAsync(bool trackChanges)
    {
        var empresaId = currentUser.GetEmpresaId();
        var usuarioId = currentUser.GetUserId();

        var query = dbContext.Caixas.Where(item =>
            item.EmpresaId == empresaId &&
            item.UsuarioId == usuarioId &&
            item.Status == CaixaStatus.Aberto);

        if (!trackChanges)
        {
            query = query.AsNoTracking();
        }

        return await query
            .OrderByDescending(item => item.DataAbertura)
            .FirstOrDefaultAsync();
    }

    private async Task RecalculateCaixaAsync(Caixa caixa)
    {
        var totalVendas = await dbContext.Vendas
            .Where(item => item.CaixaId == caixa.CaixaId && item.Status == VendaStatus.Finalizada)
            .SumAsync(item => (decimal?)item.Total) ?? 0;

        var pagamentos = await dbContext.VendaPagamentos
            .Where(item => item.Venda.CaixaId == caixa.CaixaId && item.Venda.Status == VendaStatus.Finalizada)
            .ToListAsync();

        caixa.ValorTotalVendas = totalVendas;
        caixa.ValorDinheiro = pagamentos
            .Where(item => item.FormaPagamento == FormaPagamento.Dinheiro)
            .Sum(item => item.ValorPago - item.Troco);
        caixa.ValorCartaoCredito = pagamentos
            .Where(item => item.FormaPagamento == FormaPagamento.CartaoCredito)
            .Sum(item => item.ValorPago);
        caixa.ValorCartaoDebito = pagamentos
            .Where(item => item.FormaPagamento == FormaPagamento.CartaoDebito)
            .Sum(item => item.ValorPago);
        caixa.ValorPix = pagamentos
            .Where(item => item.FormaPagamento == FormaPagamento.Pix)
            .Sum(item => item.ValorPago);
        caixa.ValorVoucher = pagamentos
            .Where(item => item.FormaPagamento == FormaPagamento.Voucher)
            .Sum(item => item.ValorPago);
    }

    private void AddLog(string acao, string descricao)
    {
        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = currentUser.GetEmpresaId(),
            UsuarioId = currentUser.GetUserId(),
            Modulo = "Caixa",
            Acao = acao,
            Descricao = descricao,
            IpAddress = currentUser.GetIpAddress()
        });
    }

    private async Task EnsurePermissionOrManagerOverrideAsync(string permission, string acaoGerencial, LiberacaoGerenteRequest? liberacaoGerente)
    {
        if (currentUser.IsMasterUser() || currentUser.HasPermission(permission))
        {
            return;
        }

        await liberacaoGerenteService.ValidarAsync(
            currentUser.GetEmpresaId(),
            currentUser.GetUserId(),
            liberacaoGerente,
            acaoGerencial);
    }

    private Task EnsureManagerOverrideForOpeningAsync(LiberacaoGerenteRequest? liberacaoGerente)
        => liberacaoGerenteService.ValidarAsync(
            currentUser.GetEmpresaId(),
            currentUser.GetUserId(),
            liberacaoGerente,
            LiberacoesGerenciais.AbrirCaixa);

    private void EnsureOperationalAccess()
    {
        if (currentUser.HasOperationalAccess())
        {
            return;
        }

        throw new ForbiddenAppException("Abertura e operacao de caixa exigem identificacao por cracha e senha do operador.");
    }

    private static CaixaDto Map(Caixa caixa)
        => new(
            caixa.CaixaId,
            caixa.EmpresaId,
            caixa.UsuarioId,
            caixa.DataAbertura,
            caixa.DataFechamento,
            caixa.ValorInicial,
            caixa.ValorDinheiro,
            caixa.ValorCartaoCredito,
            caixa.ValorCartaoDebito,
            caixa.ValorPix,
            caixa.ValorVoucher,
            caixa.ValorTotalVendas,
            caixa.ValorSangria,
            caixa.ValorSuprimento,
            caixa.DiferencaInformada,
            GetValorEsperadoEmDinheiro(caixa),
            caixa.Status.ToString());

    private static decimal GetValorEsperadoEmDinheiro(Caixa caixa)
        => caixa.ValorInicial + caixa.ValorDinheiro + caixa.ValorSuprimento - caixa.ValorSangria;
}
