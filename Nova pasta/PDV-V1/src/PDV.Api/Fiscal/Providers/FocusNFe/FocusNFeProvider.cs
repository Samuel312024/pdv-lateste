using PDV.Api.Common;
using PDV.Api.Domain;
using PDV.Api.Fiscal.DTOs;
using PDV.Api.Fiscal.Providers;

namespace PDV.Api.Fiscal.Providers.FocusNFe;

public class FocusNFeProvider(
    FiscalProviderContext context,
    IHttpClientFactory httpClientFactory) : ExternalFiscalProviderBase(context, httpClientFactory)
{
    public override FiscalProvider Kind => FiscalProvider.FocusNFe;
    public override string DisplayName => "Focus NFe";

    public override Task<EmitirNFeResult> EmitirNFeAsync(EmitirNFeRequest request)
        => throw new AppException("O provider Focus NFe ja esta previsto na arquitetura, mas a emissao REST completa dele sera ligada no proximo incremento. Para homologacao imediata nesta fase, selecione Nuvem Fiscal ou SefazDirect.");

    public override Task<ConsultarNFeResult> ConsultarNFeAsync(string referenciaOuId)
        => throw new AppException("A consulta do provider Focus NFe ainda nao foi habilitada nesta fase.");

    public override Task<CancelarNFeResult> CancelarNFeAsync(CancelarNFeRequest request)
        => throw new AppException("O cancelamento do provider Focus NFe ainda nao foi habilitado nesta fase.");

    public override async Task<StatusServicoResult> ConsultarStatusServicoAsync()
    {
        var baseUrl = NormalizeBaseUrl(Context.BaseUrl, Context.Ambiente == AmbienteFiscal.Homologacao
            ? "https://homologacao.focusnfe.com.br"
            : "https://api.focusnfe.com.br");
        using var client = CreateJsonClient(baseUrl);
        var token = EnsureToken();
        var credentials = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes($"{token}:"));
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", credentials);

        using var response = await client.GetAsync($"/v2/nfe/diagnostico-pdv-{DateTime.UtcNow:yyyyMMddHHmmss}");
        var body = await response.Content.ReadAsStringAsync();
        var disponivel = response.StatusCode is System.Net.HttpStatusCode.NotFound or System.Net.HttpStatusCode.OK;

        return new StatusServicoResult(
            disponivel,
            (int)response.StatusCode,
            disponivel
                ? "Token e endpoint da Focus NFe responderam. A integracao especifica deste provider permanece preparada para a proxima fase."
                : $"A Focus NFe nao respondeu como esperado: {body}",
            $"{baseUrl}/v2/nfe/{{referencia}}",
            null,
            body);
    }
}
