using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PDV.Api.Common;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Infrastructure;

namespace PDV.Api.Services;

public class CobrancaDigitalService(
    AppDbContext dbContext,
    CurrentUserService currentUser,
    EfiBillingGateway efiBillingGateway)
{
    public async Task<IReadOnlyCollection<CobrancaDigitalDto>> GetAllAsync(CobrancaDigitalFiltroRequest filtro)
    {
        var empresaId = currentUser.GetEmpresaId();
        var limite = Math.Clamp(filtro.Limite, 1, 100);
        var query = ApplyFilters(dbContext.CobrancasDigitais.AsNoTracking(), empresaId, filtro);

        var charges = await query
            .AsSplitQuery()
            .Include(item => item.Cliente)
            .OrderByDescending(item => item.DataCriacao)
            .Take(limite)
            .ToListAsync();

        return charges.Select(Map).ToArray();
    }

    public async Task<CobrancaDigitalDto> GetByIdAsync(Guid id, bool sincronizar = false, CancellationToken cancellationToken = default)
    {
        var empresaId = currentUser.GetEmpresaId();
        var charge = await dbContext.CobrancasDigitais
            .Include(item => item.Cliente)
            .Include(item => item.LancamentoFinanceiro)
            .FirstOrDefaultAsync(item => item.CobrancaDigitalId == id && item.EmpresaId == empresaId, cancellationToken)
            ?? throw new NotFoundException("Cobranca digital nao encontrada.");

        if (sincronizar)
        {
            await SincronizarAsync(charge, cancellationToken);
        }

        return Map(charge);
    }

    public async Task<CobrancaDigitalDto> CriarCheckoutAsync(
        CriarCobrancaDigitalCheckoutRequest request,
        CancellationToken cancellationToken = default)
    {
        if (request.Valor <= 0)
        {
            throw new AppException("Informe um valor valido para gerar a cobranca integrada.");
        }

        var empresa = await GetEmpresaAsync(cancellationToken);
        var cliente = await GetClienteDaEmpresaAsync(request.ClienteId, empresa.EmpresaId, cancellationToken);
        var customer = BuildGatewayCustomer(cliente);
        var chargeId = Guid.NewGuid();
        var internalId = $"CHK-{chargeId:N}";
        var dataVencimentoCheckout = request.FormaPagamento == FormaPagamento.CartaoCredito
            ? DateTime.UtcNow.Date.AddDays(Math.Max(1, empresa.DiasVencimentoCobranca))
            : DateTime.UtcNow.Date;
        var gatewayRequest = new EfiBillingChargeRequest(
            request.Descricao.Trim(),
            request.DocumentoReferencia,
            request.Valor,
            dataVencimentoCheckout,
            internalId,
            null,
            customer);
        var snapshot = request.FormaPagamento switch
        {
            FormaPagamento.Pix => await efiBillingGateway.CreateBolixAsync(empresa, gatewayRequest, cancellationToken),
            FormaPagamento.CartaoCredito => await efiBillingGateway.CreatePaymentLinkAsync(empresa, gatewayRequest, "credit_card", cancellationToken),
            _ => throw new AppException("Nesta fase, a cobranca integrada real esta disponivel para Pix e cartao de credito.")
        };
        var checkoutDescription = request.FormaPagamento == FormaPagamento.CartaoCredito
            ? "Cobrança criada no checkout do PDV para pagamento real por cartao de credito no link seguro da Efí."
            : "Cobrança criada no checkout do PDV para pagamento via QR Pix / boleto.";

        var charge = new CobrancaDigital
        {
            CobrancaDigitalId = chargeId,
            EmpresaId = empresa.EmpresaId,
            ClienteId = cliente.ClienteId,
            UsuarioId = currentUser.GetUserId(),
            Provider = CobrancaDigitalProvider.Efi,
            Origem = CobrancaDigitalOrigem.CheckoutVenda,
            Descricao = request.Descricao.Trim(),
            DocumentoReferencia = NormalizeNullable(request.DocumentoReferencia),
            IdentificadorInterno = internalId,
            Observacao = checkoutDescription,
            DataCriacao = DateTime.UtcNow
        };

        ApplySnapshot(charge, snapshot);
        charge.PayloadCriacaoJson = snapshot.RawJson;
        dbContext.CobrancasDigitais.Add(charge);
        AddLog("CriacaoCheckout", "Cobranca digital criada no checkout.", new
        {
            charge.CobrancaDigitalId,
            charge.ChargeIdExterno,
            charge.ValorOriginal,
            Cliente = cliente.ClienteId
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        charge.Cliente = cliente;
        return Map(charge);
    }

    public async Task<CobrancaDigitalDto> CriarFinanceiroAsync(
        CriarCobrancaDigitalFinanceiroRequest request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Descricao))
        {
            throw new AppException("Informe a descricao da cobranca digital.");
        }

        if (request.ValorOriginal <= 0)
        {
            throw new AppException("Informe um valor valido para a cobranca digital.");
        }

        var empresa = await GetEmpresaAsync(cancellationToken);
        var cliente = await GetClienteDaEmpresaAsync(request.ClienteId, empresa.EmpresaId, cancellationToken);
        var customer = BuildGatewayCustomer(cliente);
        var dataVencimento = (request.DataVencimento?.ToUniversalTime().Date ?? DateTime.UtcNow.Date.AddDays(Math.Max(1, empresa.DiasVencimentoCobranca)));
        var chargeId = Guid.NewGuid();
        var internalId = $"FIN-{chargeId:N}";
        var snapshot = await efiBillingGateway.CreateBolixAsync(
            empresa,
            new EfiBillingChargeRequest(
                request.Descricao.Trim(),
                request.DocumentoReferencia,
                request.ValorOriginal,
                dataVencimento,
                internalId,
                null,
                customer),
            cancellationToken);

        var usuarioId = currentUser.GetUserId();
        var now = DateTime.UtcNow;
        var lancamento = new LancamentoFinanceiro
        {
            LancamentoFinanceiroId = Guid.NewGuid(),
            EmpresaId = empresa.EmpresaId,
            Tipo = FinanceiroTipo.Receber,
            Origem = FinanceiroOrigem.CobrancaDigital,
            Status = FinanceiroStatus.Pendente,
            Descricao = request.Descricao.Trim(),
            DocumentoReferencia = NormalizeNullable(request.DocumentoReferencia),
            ClienteId = cliente.ClienteId,
            UsuarioId = usuarioId,
            DataCompetencia = now,
            DataVencimento = dataVencimento,
            DataLiquidacao = null,
            ValorOriginal = request.ValorOriginal,
            ValorDesconto = 0,
            ValorAcrescimo = 0,
            ValorFinal = request.ValorOriginal,
            ValorCusto = 0,
            Observacao = BuildFinanceiroObservation(request.Observacao, snapshot)
        };

        var charge = new CobrancaDigital
        {
            CobrancaDigitalId = chargeId,
            EmpresaId = empresa.EmpresaId,
            ClienteId = cliente.ClienteId,
            LancamentoFinanceiroId = lancamento.LancamentoFinanceiroId,
            UsuarioId = usuarioId,
            Provider = CobrancaDigitalProvider.Efi,
            Origem = CobrancaDigitalOrigem.Financeiro,
            Descricao = request.Descricao.Trim(),
            DocumentoReferencia = NormalizeNullable(request.DocumentoReferencia),
            IdentificadorInterno = internalId,
            Observacao = NormalizeNullable(request.Observacao),
            DataCriacao = now
        };

        ApplySnapshot(charge, snapshot);
        charge.PayloadCriacaoJson = snapshot.RawJson;
        if (charge.Status == CobrancaDigitalStatus.Paga)
        {
            LiquidarLancamentoSeNecessario(lancamento, charge);
        }
        dbContext.LancamentosFinanceiros.Add(lancamento);
        dbContext.CobrancasDigitais.Add(charge);
        AddLog("CriacaoFinanceiro", "Cobranca digital criada a partir do financeiro.", new
        {
            charge.CobrancaDigitalId,
            charge.ChargeIdExterno,
            charge.ValorOriginal,
            Lancamento = lancamento.LancamentoFinanceiroId
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        charge.Cliente = cliente;
        charge.LancamentoFinanceiro = lancamento;
        return Map(charge);
    }

    private async Task SincronizarAsync(CobrancaDigital charge, CancellationToken cancellationToken)
    {
        if (charge.Provider != CobrancaDigitalProvider.Efi || string.IsNullOrWhiteSpace(charge.ChargeIdExterno))
        {
            return;
        }

        var empresa = await GetEmpresaAsync(cancellationToken);
        var snapshot = await efiBillingGateway.GetChargeAsync(empresa, charge.ChargeIdExterno, cancellationToken);
        ApplySnapshot(charge, snapshot);

        if (charge.Status == CobrancaDigitalStatus.Paga && charge.LancamentoFinanceiro is not null)
        {
            LiquidarLancamentoSeNecessario(charge.LancamentoFinanceiro, charge);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private void LiquidarLancamentoSeNecessario(LancamentoFinanceiro lancamento, CobrancaDigital charge)
    {
        if (lancamento.Status == FinanceiroStatus.Liquidado || lancamento.Status == FinanceiroStatus.Cancelado)
        {
            return;
        }

        lancamento.Status = FinanceiroStatus.Liquidado;
        lancamento.DataLiquidacao = charge.DataPagamento ?? DateTime.UtcNow;
        lancamento.Observacao = AppendObservation(
            lancamento.Observacao,
            $"Cobrança digital {charge.ChargeIdExterno} confirmada como paga via Efí.");
    }

    private async Task<Empresa> GetEmpresaAsync(CancellationToken cancellationToken)
    {
        var empresaId = currentUser.GetEmpresaId();
        return await dbContext.Empresas
            .FirstOrDefaultAsync(item => item.EmpresaId == empresaId, cancellationToken)
            ?? throw new NotFoundException("Empresa nao encontrada.");
    }

    private static IQueryable<CobrancaDigital> ApplyFilters(
        IQueryable<CobrancaDigital> query,
        Guid empresaId,
        CobrancaDigitalFiltroRequest filtro)
    {
        query = query.Where(item => item.EmpresaId == empresaId);

        if (filtro.Origem.HasValue)
        {
            query = query.Where(item => item.Origem == filtro.Origem.Value);
        }

        if (filtro.Status.HasValue)
        {
            query = query.Where(item => item.Status == filtro.Status.Value);
        }

        if (filtro.ClienteId.HasValue)
        {
            query = query.Where(item => item.ClienteId == filtro.ClienteId.Value);
        }

        return query;
    }

    private static void ApplySnapshot(CobrancaDigital charge, EfiBillingChargeSnapshot snapshot)
    {
        charge.ChargeIdExterno = snapshot.ChargeId;
        charge.CustomIdExterno = snapshot.CustomId;
        charge.StatusExterno = snapshot.Status;
        charge.Status = MapStatus(snapshot.Status);
        charge.PixCopiaECola = snapshot.PixCopiaECola ?? charge.PixCopiaECola;
        charge.PixQrCodeImageUrl = snapshot.PixQrCodeImageUrl ?? charge.PixQrCodeImageUrl;
        charge.LinhaDigitavel = snapshot.LinhaDigitavel ?? charge.LinhaDigitavel;
        charge.LinkCobranca = snapshot.LinkCobranca ?? charge.LinkCobranca;
        charge.LinkBoleto = snapshot.LinkBoleto ?? charge.LinkBoleto;
        charge.LinkPdf = snapshot.LinkPdf ?? charge.LinkPdf;
        charge.ValorOriginal = snapshot.ValorOriginal;
        charge.ValorPago = snapshot.ValorPago;
        charge.DataVencimento = snapshot.DataVencimento;
        charge.DataCriacaoProvider = snapshot.DataCriacaoProvider ?? charge.DataCriacaoProvider;
        charge.DataPagamento = snapshot.DataPagamento;
        charge.DataAtualizacao = DateTime.UtcNow;
        charge.PayloadConsultaJson = snapshot.RawJson;
        charge.RetornoProviderJson = snapshot.RawJson;
    }

    private static CobrancaDigitalStatus MapStatus(string? externalStatus)
        => (externalStatus ?? string.Empty).Trim().ToLowerInvariant() switch
        {
            "paid" => CobrancaDigitalStatus.Paga,
            "settled" => CobrancaDigitalStatus.Paga,
            "approved" => CobrancaDigitalStatus.Paga,
            "identified" => CobrancaDigitalStatus.Paga,
            "waiting" => CobrancaDigitalStatus.Pendente,
            "new" => CobrancaDigitalStatus.Pendente,
            "unpaid" => CobrancaDigitalStatus.Pendente,
            "link" => CobrancaDigitalStatus.Pendente,
            "expired" => CobrancaDigitalStatus.Expirada,
            "canceled" => CobrancaDigitalStatus.Cancelada,
            "cancelled" => CobrancaDigitalStatus.Cancelada,
            _ => CobrancaDigitalStatus.Falha
        };

    private static CobrancaDigitalDto Map(CobrancaDigital item)
        => new(
            item.CobrancaDigitalId,
            item.EmpresaId,
            item.ClienteId,
            item.Cliente?.Nome,
            item.VendaId,
            item.LancamentoFinanceiroId,
            item.Provider.ToString(),
            item.Origem.ToString(),
            item.Status.ToString(),
            item.StatusExterno,
            item.Descricao,
            item.DocumentoReferencia,
            item.IdentificadorInterno,
            item.ChargeIdExterno,
            item.CustomIdExterno,
            item.ValorOriginal,
            item.ValorPago,
            item.DataVencimento,
            item.DataCriacaoProvider,
            item.DataPagamento,
            item.DataCriacao,
            item.DataAtualizacao,
            item.PixCopiaECola,
            item.PixQrCodeImageUrl,
            item.LinhaDigitavel,
            item.LinkCobranca,
            item.LinkBoleto,
            item.LinkPdf,
            item.Observacao);

    private static EfiBillingCustomer BuildGatewayCustomer(Cliente cliente)
    {
        var documento = OnlyDigits(cliente.Documento);
        if (documento.Length is not (11 or 14))
        {
            throw new AppException("O cliente precisa ter CPF ou CNPJ valido para gerar cobranca digital.");
        }

        if (string.IsNullOrWhiteSpace(cliente.Email))
        {
            throw new AppException("O cliente precisa ter e-mail cadastrado para gerar cobranca digital profissional.");
        }

        if (string.IsNullOrWhiteSpace(cliente.Telefone))
        {
            throw new AppException("O cliente precisa ter telefone com DDD para gerar cobranca digital.");
        }

        if (string.IsNullOrWhiteSpace(cliente.Logradouro) ||
            string.IsNullOrWhiteSpace(cliente.Numero) ||
            string.IsNullOrWhiteSpace(cliente.Bairro) ||
            string.IsNullOrWhiteSpace(cliente.Cidade) ||
            string.IsNullOrWhiteSpace(cliente.Uf) ||
            string.IsNullOrWhiteSpace(cliente.Cep))
        {
            throw new AppException("O cliente precisa ter endereco completo para gerar boleto/Pix com apoio de boleto.");
        }

        return new EfiBillingCustomer(
            cliente.Nome,
            documento,
            cliente.Email.Trim(),
            cliente.Telefone,
            cliente.Logradouro,
            cliente.Numero,
            cliente.Bairro,
            cliente.Cep,
            cliente.Cidade,
            cliente.Uf,
            cliente.Complemento);
    }

    private async Task<Cliente> GetClienteDaEmpresaAsync(Guid clienteId, Guid empresaId, CancellationToken cancellationToken)
        => await dbContext.Clientes
            .FirstOrDefaultAsync(item => item.ClienteId == clienteId && item.EmpresaId == empresaId && item.Ativo, cancellationToken)
            ?? throw new AppException("Selecione um cliente ativo da empresa para emitir a cobranca digital.");

    private void AddLog(string acao, string descricao, object dados)
    {
        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = currentUser.GetEmpresaId(),
            UsuarioId = currentUser.GetUserId(),
            Modulo = "CobrancasDigitais",
            Acao = acao,
            Descricao = descricao,
            IpAddress = currentUser.GetIpAddress(),
            Dados = JsonSerializer.Serialize(dados)
        });
    }

    private static string BuildFinanceiroObservation(string? observacao, EfiBillingChargeSnapshot snapshot)
    {
        var details = new StringBuilder("Conta a receber gerada por cobranca digital Efí.");
        if (!string.IsNullOrWhiteSpace(snapshot.ChargeId))
        {
            details.Append($" Charge {snapshot.ChargeId}.");
        }

        if (!string.IsNullOrWhiteSpace(observacao))
        {
            details.Append(' ').Append(observacao.Trim());
        }

        return details.ToString();
    }

    private static string? NormalizeNullable(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string AppendObservation(string? current, string addition)
        => string.IsNullOrWhiteSpace(current) ? addition : $"{current}{Environment.NewLine}{addition}";

    private static string OnlyDigits(string? value)
        => string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : new string(value.Where(char.IsAsciiDigit).ToArray());
}
