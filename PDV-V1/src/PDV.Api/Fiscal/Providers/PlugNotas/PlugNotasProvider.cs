using PDV.Api.Common;
using PDV.Api.Domain;
using PDV.Api.Fiscal.DTOs;
using PDV.Api.Fiscal.Providers;

namespace PDV.Api.Fiscal.Providers.PlugNotas;

public class PlugNotasProvider(
    FiscalProviderContext context,
    IHttpClientFactory httpClientFactory) : ExternalFiscalProviderBase(context, httpClientFactory)
{
    public override FiscalProvider Kind => FiscalProvider.PlugNotas;
    public override string DisplayName => "PlugNotas";

    public override Task<EmitirNFeResult> EmitirNFeAsync(EmitirNFeRequest request)
        => throw new AppException("O provider PlugNotas ja esta previsto na arquitetura, mas a emissao REST completa dele sera ligada no proximo incremento. Para homologacao imediata nesta fase, selecione Nuvem Fiscal ou SefazDirect.");

    public override Task<ConsultarNFeResult> ConsultarNFeAsync(string referenciaOuId)
        => throw new AppException("A consulta do provider PlugNotas ainda nao foi habilitada nesta fase.");

    public override Task<CancelarNFeResult> CancelarNFeAsync(CancelarNFeRequest request)
        => throw new AppException("O cancelamento do provider PlugNotas ainda nao foi habilitado nesta fase.");

    public override async Task<StatusServicoResult> ConsultarStatusServicoAsync()
    {
        var baseUrl = NormalizeBaseUrl(Context.BaseUrl, Context.Ambiente == AmbienteFiscal.Homologacao
            ? "https://api.sandbox.plugnotas.com.br"
            : "https://api.plugnotas.com.br");
        using var client = CreateJsonClient(baseUrl);
        client.DefaultRequestHeaders.Add("x-api-key", EnsureToken());

        var now = DateTime.UtcNow.ToString("yyyy-MM-dd");
        using var response = await client.GetAsync($"/nfe/consulta/periodo?cpfCnpj={Context.Cnpj}&dataInicial={now}&dataFinal={now}");
        var body = await response.Content.ReadAsStringAsync();
        var disponivel = response.IsSuccessStatusCode;

        return new StatusServicoResult(
            disponivel,
            (int)response.StatusCode,
            disponivel
                ? "Token e endpoint do PlugNotas responderam. A integracao especifica deste provider permanece preparada para a proxima fase."
                : $"O PlugNotas nao respondeu como esperado: {body}",
            $"{baseUrl}/nfe/consulta/periodo",
            null,
            body);
    }
}
