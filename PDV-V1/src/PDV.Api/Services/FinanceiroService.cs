using Microsoft.EntityFrameworkCore;
using PDV.Api.Common;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Infrastructure;

namespace PDV.Api.Services;

public class FinanceiroService(AppDbContext dbContext, CurrentUserService currentUser)
{
    public async Task<FinanceiroResumoDto> GetResumoAsync(FinanceiroFiltroRequest filtro)
    {
        var empresaId = currentUser.GetEmpresaId();
        var query = ApplyFilters(dbContext.LancamentosFinanceiros.AsNoTracking(), empresaId, filtro);

        var entradasLiquidadas = await query
            .Where(item => item.Tipo == FinanceiroTipo.Receber && item.Status == FinanceiroStatus.Liquidado)
            .SumAsync(item => (decimal?)item.ValorFinal) ?? 0;

        var saidasLiquidadas = await query
            .Where(item => item.Tipo == FinanceiroTipo.Pagar && item.Status == FinanceiroStatus.Liquidado)
            .SumAsync(item => (decimal?)item.ValorFinal) ?? 0;

        var contasReceberPendentes = await query
            .Where(item => item.Tipo == FinanceiroTipo.Receber && item.Status == FinanceiroStatus.Pendente)
            .SumAsync(item => (decimal?)item.ValorFinal) ?? 0;

        var contasPagarPendentes = await query
            .Where(item => item.Tipo == FinanceiroTipo.Pagar && item.Status == FinanceiroStatus.Pendente)
            .SumAsync(item => (decimal?)item.ValorFinal) ?? 0;

        var lucroEntradas = await query
            .Where(item => item.Tipo == FinanceiroTipo.Receber && item.Status == FinanceiroStatus.Liquidado)
            .SumAsync(item => (decimal?)(item.ValorFinal - item.ValorCusto)) ?? 0;

        var lucroSaidas = await query
            .Where(item => item.Tipo == FinanceiroTipo.Pagar && item.Status == FinanceiroStatus.Liquidado)
            .SumAsync(item => (decimal?)(item.ValorFinal - item.ValorCusto)) ?? 0;

        var lancamentosPendentes = await query.CountAsync(item => item.Status == FinanceiroStatus.Pendente);
        var lancamentosLiquidados = await query.CountAsync(item => item.Status == FinanceiroStatus.Liquidado);

        return new FinanceiroResumoDto(
            entradasLiquidadas,
            saidasLiquidadas,
            entradasLiquidadas - saidasLiquidadas,
            contasReceberPendentes,
            contasPagarPendentes,
            lucroEntradas - lucroSaidas,
            lancamentosPendentes,
            lancamentosLiquidados);
    }

    public async Task<IReadOnlyCollection<LancamentoFinanceiroDto>> GetLancamentosAsync(FinanceiroFiltroRequest filtro)
    {
        var empresaId = currentUser.GetEmpresaId();
        var lancamentos = await ApplyFilters(dbContext.LancamentosFinanceiros.AsNoTracking(), empresaId, filtro)
            .AsSplitQuery()
            .Include(item => item.Venda)
            .Include(item => item.Cliente)
            .Include(item => item.Fornecedor)
            .Include(item => item.Usuario)
            .OrderByDescending(item => item.DataCompetencia)
            .ThenByDescending(item => item.DataVencimento)
            .Take(200)
            .ToListAsync();

        return lancamentos.Select(Map).ToArray();
    }

    public async Task<LancamentoFinanceiroDto> CriarContaReceberAsync(CriarLancamentoFinanceiroRequest request)
        => await CreateManualAsync(request, FinanceiroTipo.Receber);

    public async Task<LancamentoFinanceiroDto> CriarContaPagarAsync(CriarLancamentoFinanceiroRequest request)
        => await CreateManualAsync(request, FinanceiroTipo.Pagar);

    public async Task<LancamentoFinanceiroDto> LiquidarAsync(Guid id, LiquidarLancamentoFinanceiroRequest request)
    {
        var empresaId = currentUser.GetEmpresaId();
        var usuarioId = currentUser.GetUserId();

        var lancamento = await dbContext.LancamentosFinanceiros
            .Include(item => item.Venda)
            .Include(item => item.Cliente)
            .Include(item => item.Fornecedor)
            .Include(item => item.Usuario)
            .FirstOrDefaultAsync(item => item.LancamentoFinanceiroId == id && item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Lancamento financeiro nao encontrado.");

        if (lancamento.Status == FinanceiroStatus.Cancelado)
        {
            throw new AppException("Lancamento cancelado nao pode ser liquidado.");
        }

        if (lancamento.Status == FinanceiroStatus.Liquidado)
        {
            throw new AppException("Lancamento ja esta liquidado.");
        }

        lancamento.Status = FinanceiroStatus.Liquidado;
        lancamento.DataLiquidacao = request.DataLiquidacao?.ToUniversalTime() ?? DateTime.UtcNow;
        if (!string.IsNullOrWhiteSpace(request.Observacao))
        {
            lancamento.Observacao = string.IsNullOrWhiteSpace(lancamento.Observacao)
                ? request.Observacao.Trim()
                : $"{lancamento.Observacao}{Environment.NewLine}{request.Observacao.Trim()}";
        }

        AddLog(
            "Liquidacao",
            $"Lancamento financeiro {lancamento.Descricao} liquidado.",
            new
            {
                lancamento.LancamentoFinanceiroId,
                lancamento.Tipo,
                UsuarioResponsavel = usuarioId
            });

        await dbContext.SaveChangesAsync();
        return Map(lancamento);
    }

    private async Task<LancamentoFinanceiroDto> CreateManualAsync(CriarLancamentoFinanceiroRequest request, FinanceiroTipo tipo)
    {
        var empresaId = currentUser.GetEmpresaId();
        var usuarioId = currentUser.GetUserId();

        var descricao = string.IsNullOrWhiteSpace(request.Descricao)
            ? throw new AppException("Descricao do lancamento financeiro e obrigatoria.")
            : request.Descricao.Trim();

        if (request.ValorOriginal <= 0)
        {
            throw new AppException("Valor original deve ser maior que zero.");
        }

        var desconto = request.ValorDesconto ?? 0;
        var acrescimo = request.ValorAcrescimo ?? 0;
        if (desconto < 0 || acrescimo < 0)
        {
            throw new AppException("Desconto e acrescimo devem ser validos.");
        }

        var valorFinal = request.ValorOriginal - desconto + acrescimo;
        if (valorFinal <= 0)
        {
            throw new AppException("Valor final do lancamento deve ser maior que zero.");
        }

        if (tipo == FinanceiroTipo.Receber && request.FornecedorId.HasValue)
        {
            throw new AppException("Conta a receber manual nao pode ser vinculada a fornecedor.");
        }

        if (tipo == FinanceiroTipo.Pagar && request.ClienteId.HasValue)
        {
            throw new AppException("Conta a pagar manual nao pode ser vinculada a cliente.");
        }

        Cliente? cliente = null;
        if (request.ClienteId.HasValue)
        {
            cliente = await dbContext.Clientes
                .FirstOrDefaultAsync(item => item.ClienteId == request.ClienteId.Value && item.EmpresaId == empresaId)
                ?? throw new AppException("Cliente informado nao pertence a empresa.");
        }

        Fornecedor? fornecedor = null;
        if (request.FornecedorId.HasValue)
        {
            fornecedor = await dbContext.Fornecedores
                .FirstOrDefaultAsync(item => item.FornecedorId == request.FornecedorId.Value && item.EmpresaId == empresaId)
                ?? throw new AppException("Fornecedor informado nao pertence a empresa.");
        }

        var dataCompetencia = request.DataCompetencia?.ToUniversalTime() ?? DateTime.UtcNow;
        var dataVencimento = request.DataVencimento?.ToUniversalTime() ?? dataCompetencia;

        var lancamento = new LancamentoFinanceiro
        {
            LancamentoFinanceiroId = Guid.NewGuid(),
            EmpresaId = empresaId,
            Tipo = tipo,
            Origem = FinanceiroOrigem.ContaManual,
            Status = request.Liquidado ? FinanceiroStatus.Liquidado : FinanceiroStatus.Pendente,
            Descricao = descricao,
            DocumentoReferencia = string.IsNullOrWhiteSpace(request.DocumentoReferencia) ? null : request.DocumentoReferencia.Trim(),
            ClienteId = cliente?.ClienteId,
            FornecedorId = fornecedor?.FornecedorId,
            UsuarioId = usuarioId,
            DataCompetencia = dataCompetencia,
            DataVencimento = dataVencimento,
            DataLiquidacao = request.Liquidado ? dataCompetencia : null,
            ValorOriginal = request.ValorOriginal,
            ValorDesconto = desconto,
            ValorAcrescimo = acrescimo,
            ValorFinal = valorFinal,
            ValorCusto = 0,
            Observacao = string.IsNullOrWhiteSpace(request.Observacao) ? null : request.Observacao.Trim()
        };

        dbContext.LancamentosFinanceiros.Add(lancamento);
        AddLog(
            "CriacaoManual",
            $"Lancamento financeiro manual criado: {descricao}.",
            new
            {
                lancamento.LancamentoFinanceiroId,
                lancamento.Tipo,
                lancamento.Status,
                lancamento.ValorFinal
            });

        await dbContext.SaveChangesAsync();

        lancamento.Cliente = cliente;
        lancamento.Fornecedor = fornecedor;
        return Map(lancamento);
    }

    private void AddLog(string acao, string descricao, object dados)
    {
        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = currentUser.GetEmpresaId(),
            UsuarioId = currentUser.GetUserId(),
            Modulo = "Financeiro",
            Acao = acao,
            Descricao = descricao,
            IpAddress = currentUser.GetIpAddress(),
            Dados = System.Text.Json.JsonSerializer.Serialize(dados)
        });
    }

    private static IQueryable<LancamentoFinanceiro> ApplyFilters(
        IQueryable<LancamentoFinanceiro> query,
        Guid empresaId,
        FinanceiroFiltroRequest filtro)
    {
        query = query.Where(item => item.EmpresaId == empresaId);

        if (filtro.DataInicial.HasValue)
        {
            var start = filtro.DataInicial.Value.Date;
            query = query.Where(item => item.DataCompetencia >= start);
        }

        if (filtro.DataFinal.HasValue)
        {
            var endExclusive = filtro.DataFinal.Value.Date.AddDays(1);
            query = query.Where(item => item.DataCompetencia < endExclusive);
        }

        if (!string.IsNullOrWhiteSpace(filtro.Termo))
        {
            var termoNormalizado = filtro.Termo.Trim();
            query = query.Where(item =>
                item.Descricao.Contains(termoNormalizado) ||
                (item.DocumentoReferencia != null && item.DocumentoReferencia.Contains(termoNormalizado)) ||
                (item.Observacao != null && item.Observacao.Contains(termoNormalizado)) ||
                (item.Cliente != null && item.Cliente.Nome.Contains(termoNormalizado)) ||
                (item.Fornecedor != null && item.Fornecedor.Nome.Contains(termoNormalizado)) ||
                (item.Venda != null && item.Venda.NumeroVenda.Contains(termoNormalizado)));
        }

        if (filtro.Tipo.HasValue)
        {
            query = query.Where(item => item.Tipo == filtro.Tipo.Value);
        }

        if (filtro.Status.HasValue)
        {
            query = query.Where(item => item.Status == filtro.Status.Value);
        }

        if (filtro.ClienteId.HasValue)
        {
            query = query.Where(item => item.ClienteId == filtro.ClienteId.Value);
        }

        if (filtro.FornecedorId.HasValue)
        {
            query = query.Where(item => item.FornecedorId == filtro.FornecedorId.Value);
        }

        if (filtro.UsuarioId.HasValue)
        {
            query = query.Where(item => item.UsuarioId == filtro.UsuarioId.Value);
        }

        return query;
    }

    private static LancamentoFinanceiroDto Map(LancamentoFinanceiro item)
        => new(
            item.LancamentoFinanceiroId,
            item.EmpresaId,
            item.Tipo.ToString(),
            item.Origem.ToString(),
            item.Status.ToString(),
            item.Descricao,
            item.DocumentoReferencia,
            item.VendaId,
            item.Venda?.NumeroVenda,
            item.ClienteId,
            item.Cliente?.Nome,
            item.FornecedorId,
            item.Fornecedor?.Nome,
            item.UsuarioId,
            item.Usuario?.Nome,
            item.CaixaId,
            item.DataCompetencia,
            item.DataVencimento,
            item.DataLiquidacao,
            item.ValorOriginal,
            item.ValorDesconto,
            item.ValorAcrescimo,
            item.ValorFinal,
            item.ValorCusto,
            item.Observacao);
}
