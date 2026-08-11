using Microsoft.EntityFrameworkCore;
using PDV.Api.Common;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Infrastructure;

namespace PDV.Api.Services;

public class FiscalCalculationService(
    AppDbContext dbContext,
    CurrentUserService currentUser,
    ProdutoFiscalService produtoFiscalService)
{
    private static readonly HashSet<string> CsosnComSt = ["201", "202", "203", "500"];
    private static readonly HashSet<string> CstIcmsComSt = ["10", "30", "60", "70"];

    public async Task<FiscalCalculoProdutoResponse> CalcularProdutoAsync(
        FiscalCalculoProdutoRequest request,
        CancellationToken cancellationToken = default)
    {
        if (request.Quantidade <= 0)
        {
            throw new AppException("Quantidade deve ser maior que zero para calcular os impostos.");
        }

        if (request.ValorUnitario < 0)
        {
            throw new AppException("Valor unitario nao pode ser negativo.");
        }

        var valorBruto = RoundMoney(request.Quantidade * request.ValorUnitario);
        if (request.Desconto < 0 || request.Desconto > valorBruto)
        {
            throw new AppException("Desconto fiscal deve ficar entre zero e o valor bruto da operacao.");
        }

        var empresaId = currentUser.GetEmpresaId();
        var empresa = await dbContext.Empresas
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.EmpresaId == empresaId, cancellationToken)
            ?? throw new NotFoundException("Empresa nao encontrada para o calculo fiscal.");

        var fiscal = await produtoFiscalService.ValidarAsync(
            empresa,
            request.Produto,
            currentUser.GetPerfil() == Perfis.Admin,
            cancellationToken);

        var ufOrigem = NormalizeUf(empresa.Uf)
            ?? throw new AppException("Configure a UF fiscal da empresa antes de usar o motor fiscal.");
        var ufDestino = NormalizeUf(request.UfDestino) ?? ufOrigem;
        var operacaoInterna = string.Equals(ufOrigem, ufDestino, StringComparison.OrdinalIgnoreCase);
        var valorLiquido = RoundMoney(valorBruto - request.Desconto);
        var pendencias = fiscal.Pendencias.ToList();
        var memoria = new List<string>
        {
            $"Base da operacao: {valorLiquido:0.00}.",
            $"Regime tributario da empresa: {empresa.RegimeTributario}.",
            operacaoInterna
                ? $"Operacao interna em {ufOrigem}."
                : $"Operacao interestadual de {ufOrigem} para {ufDestino}."
        };

        var parametrosUf = await dbContext.FiscalUfParametros
            .AsNoTracking()
            .Where(item => item.Ativo && (item.Uf == ufOrigem || item.Uf == ufDestino))
            .ToDictionaryAsync(item => item.Uf, cancellationToken);

        parametrosUf.TryGetValue(ufOrigem, out var parametroOrigem);
        parametrosUf.TryGetValue(ufDestino, out var parametroDestino);

        if (parametroOrigem is null)
        {
            pendencias.Add($"Nao existe parametrizacao fiscal cadastrada para a UF de origem {ufOrigem}.");
        }

        if (parametroDestino is null)
        {
            pendencias.Add($"Nao existe parametrizacao fiscal cadastrada para a UF de destino {ufDestino}.");
        }

        var cfopAplicado = request.OperacaoEntrada
            ? operacaoInterna ? fiscal.CfopCompraPadrao : fiscal.CfopCompraInterestadual
            : operacaoInterna ? fiscal.CfopVendaPadrao : fiscal.CfopVendaInterestadual;

        if (string.IsNullOrWhiteSpace(cfopAplicado))
        {
            pendencias.Add("Nao foi possivel determinar o CFOP da operacao para o calculo fiscal.");
        }
        else
        {
            memoria.Add($"CFOP aplicado no calculo: {cfopAplicado}.");
        }

        if (!string.IsNullOrWhiteSpace(fiscal.BeneficioFiscalCodigo))
        {
            memoria.Add($"Beneficio fiscal informado: {fiscal.BeneficioFiscalCodigo}.");
        }

        if (!string.IsNullOrWhiteSpace(fiscal.CodigoAnp))
        {
            memoria.Add($"Codigo ANP informado: {fiscal.CodigoAnp}.");
        }

        var impostos = new List<FiscalCalculoImpostoDto>();
        var icmsRate = fiscal.AliquotaIcms ?? ResolveIcmsFallbackRate(operacaoInterna, parametroOrigem);
        if (ShouldApplyIcms(fiscal) && icmsRate is not null)
        {
            impostos.Add(BuildTax("ICMS", valorLiquido, icmsRate, ResolveIcmsCode(fiscal), "ICMS proprio da operacao."));
            memoria.Add($"ICMS calculado com aliquota de {icmsRate:0.####}%.");
        }

        var ipiRate = fiscal.AliquotaIpi;
        if (ipiRate is not null)
        {
            impostos.Add(BuildTax("IPI", valorLiquido, ipiRate, fiscal.ExTipi, "IPI informado no cadastro fiscal do produto."));
            memoria.Add($"IPI considerado com aliquota de {ipiRate:0.####}%.");
        }

        if (fiscal.AliquotaPis is not null)
        {
            impostos.Add(BuildTax("PIS", valorLiquido, fiscal.AliquotaPis, fiscal.CstPis, "PIS conforme CST e regime tributario."));
            memoria.Add($"PIS calculado com aliquota de {fiscal.AliquotaPis:0.####}%.");
        }

        if (fiscal.AliquotaCofins is not null)
        {
            impostos.Add(BuildTax("COFINS", valorLiquido, fiscal.AliquotaCofins, fiscal.CstCofins, "COFINS conforme CST e regime tributario."));
            memoria.Add($"COFINS calculado com aliquota de {fiscal.AliquotaCofins:0.####}%.");
        }

        if (ShouldApplyIcmsSt(fiscal))
        {
            var icmsBaseRate = icmsRate ?? 0m;
            var icmsStRate = Math.Max((parametroDestino?.AliquotaInternaIcms ?? parametroOrigem?.AliquotaInternaIcms ?? icmsBaseRate) - icmsBaseRate, 0m);
            impostos.Add(BuildTax("ICMS-ST", valorLiquido, icmsStRate, ResolveIcmsCode(fiscal), "Estimativa inicial de ST pela diferenca entre a aliquota interna e o ICMS proprio."));
            memoria.Add($"ICMS-ST estimado com aliquota complementar de {icmsStRate:0.####}%.");
        }

        if (fiscal.PerfilFiscalPadrao == ProdutoPerfilFiscalPadrao.Servico && parametroDestino?.AliquotaIssPadrao is decimal aliquotaIss)
        {
            impostos.Add(BuildTax("ISS", valorLiquido, aliquotaIss, null, "ISS padrao da UF de destino para servicos."));
            memoria.Add($"ISS estimado com aliquota de {aliquotaIss:0.####}% para perfil de servico.");
        }

        if (!operacaoInterna && request.ConsumidorFinal && !request.ContribuinteIcms)
        {
            var aliquotaInterestadual = parametroOrigem?.AliquotaInterestadual ?? icmsRate ?? 0m;
            var aliquotaInternaDestino = parametroDestino?.AliquotaInternaIcms ?? icmsRate ?? 0m;
            var difalRate = Math.Max(aliquotaInternaDestino - aliquotaInterestadual, 0m);
            var fcpRate = parametroDestino?.AliquotaFcp ?? 0m;

            impostos.Add(BuildTax("DIFAL", valorLiquido, difalRate, null, "Estimativa do diferencial de aliquota para consumidor final."));
            impostos.Add(BuildTax("FCP", valorLiquido, fcpRate, null, "Estimativa do Fundo de Combate a Pobreza na UF de destino."));
            memoria.Add($"DIFAL estimado pela diferenca entre {aliquotaInternaDestino:0.####}% e {aliquotaInterestadual:0.####}%.");
            memoria.Add($"FCP estimado com aliquota de {fcpRate:0.####}%.");
        }
        else if (!operacaoInterna && request.ConsumidorFinal && request.ContribuinteIcms)
        {
            memoria.Add("Operacao marcada como consumidor final contribuinte de ICMS; DIFAL/FCP nao foram estimados nesta base inicial.");
        }

        return new FiscalCalculoProdutoResponse(
            pendencias.Count == 0,
            pendencias,
            empresa.RegimeTributario.ToString(),
            ufOrigem,
            ufDestino,
            cfopAplicado,
            valorBruto,
            request.Desconto,
            valorLiquido,
            impostos,
            memoria);
    }

    private static FiscalCalculoImpostoDto BuildTax(
        string imposto,
        decimal baseCalculo,
        decimal? aliquota,
        string? codigoTributacao,
        string descricao)
        => new(
            imposto,
            baseCalculo,
            aliquota,
            RoundMoney(baseCalculo * ((aliquota ?? 0m) / 100m)),
            codigoTributacao,
            descricao);

    private static string? ResolveIcmsCode(ProdutoFiscalValidationResult fiscal)
        => fiscal.Csosn ?? fiscal.CstIcms;

    private static bool ShouldApplyIcms(ProdutoFiscalValidationResult fiscal)
        => fiscal.PerfilFiscalPadrao != ProdutoPerfilFiscalPadrao.Servico;

    private static bool ShouldApplyIcmsSt(ProdutoFiscalValidationResult fiscal)
        => !string.IsNullOrWhiteSpace(fiscal.Cest)
            || (fiscal.Csosn is not null && CsosnComSt.Contains(fiscal.Csosn))
            || (fiscal.CstIcms is not null && CstIcmsComSt.Contains(fiscal.CstIcms));

    private static decimal? ResolveIcmsFallbackRate(bool operacaoInterna, FiscalUfParametro? parametroOrigem)
    {
        if (parametroOrigem is null)
        {
            return null;
        }

        return operacaoInterna
            ? parametroOrigem.AliquotaInternaIcms
            : parametroOrigem.AliquotaInterestadual;
    }

    private static string? NormalizeUf(string? value)
    {
        var normalized = value?.Trim().ToUpperInvariant();
        return normalized is { Length: 2 } ? normalized : null;
    }

    private static decimal RoundMoney(decimal value)
        => decimal.Round(value, 2, MidpointRounding.AwayFromZero);
}
