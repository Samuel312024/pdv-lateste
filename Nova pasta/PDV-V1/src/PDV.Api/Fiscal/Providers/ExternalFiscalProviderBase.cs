using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using PDV.Api.Common;
using PDV.Api.Domain;
using PDV.Api.Fiscal.Contracts;
using PDV.Api.Fiscal.DTOs;

namespace PDV.Api.Fiscal.Providers;

public abstract class ExternalFiscalProviderBase(
    FiscalProviderContext context,
    IHttpClientFactory httpClientFactory) : IFiscalProvider
{
    protected static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };

    protected FiscalProviderContext Context { get; } = context;
    protected IHttpClientFactory HttpClientFactory { get; } = httpClientFactory;

    public abstract FiscalProvider Kind { get; }
    public abstract string DisplayName { get; }

    public abstract Task<EmitirNFeResult> EmitirNFeAsync(EmitirNFeRequest request);
    public abstract Task<ConsultarNFeResult> ConsultarNFeAsync(string referenciaOuId);
    public virtual Task<ConsultarNFeResult> SincronizarNFeAsync(string referenciaOuId)
        => throw new AppException($"O provider {DisplayName} ainda nao oferece sincronizacao de NF-e nesta etapa.");

    public abstract Task<CancelarNFeResult> CancelarNFeAsync(CancelarNFeRequest request);
    public virtual Task<FiscalEventoNFeResult> SolicitarCartaCorrecaoNFeAsync(CartaCorrecaoNFeRequest request)
        => throw new AppException($"O provider {DisplayName} ainda nao oferece carta de correcao de NF-e nesta etapa.");

    public virtual Task<EnviarEmailNFeResult> EnviarEmailNFeAsync(EnviarEmailNFeRequest request)
        => throw new AppException($"O provider {DisplayName} ainda nao oferece envio de XML/PDF por e-mail nesta etapa.");

    public virtual Task<BaixarNFeDocumentoResult> BaixarDocumentoNFeAsync(BaixarNFeDocumentoRequest request)
        => throw new AppException($"O provider {DisplayName} ainda nao oferece download de documentos da NF-e nesta etapa.");

    public virtual Task<InutilizarNFeResult> InutilizarNumeracaoNFeAsync(InutilizarNFeRequest request)
        => throw new AppException($"O provider {DisplayName} ainda nao oferece inutilizacao de numeracao da NF-e nesta etapa.");

    public abstract Task<StatusServicoResult> ConsultarStatusServicoAsync();

    protected HttpClient CreateJsonClient(string baseUrl)
    {
        var client = HttpClientFactory.CreateClient("fiscal-provider");
        client.BaseAddress = new Uri(baseUrl, UriKind.Absolute);
        client.DefaultRequestHeaders.Accept.Clear();
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return client;
    }

    protected static string SerializeJson(object? value)
        => JsonSerializer.Serialize(value, JsonOptions);

    protected static StringContent JsonContent(object value)
        => new(SerializeJson(value), Encoding.UTF8, "application/json");

    protected string EnsureToken()
        => string.IsNullOrWhiteSpace(Context.TokenApiFiscal)
            ? throw new AppException($"Configure o token da API fiscal para usar o provider {DisplayName}.")
            : Context.TokenApiFiscal.Trim();

    protected static string NormalizeBaseUrl(string? url, string fallback)
        => string.IsNullOrWhiteSpace(url) ? fallback : url.Trim().TrimEnd('/');

    protected static string BuildAbsoluteUrl(string baseUrl, string? relativeOrAbsolute)
    {
        if (string.IsNullOrWhiteSpace(relativeOrAbsolute))
        {
            return string.Empty;
        }

        if (Uri.TryCreate(relativeOrAbsolute, UriKind.Absolute, out var absolute))
        {
            return absolute.ToString();
        }

        return new Uri(new Uri(baseUrl.TrimEnd('/') + "/"), relativeOrAbsolute.TrimStart('/')).ToString();
    }

    protected async Task<string?> TryDownloadTextAsync(HttpClient client, string? url, CancellationToken cancellationToken = default)
    {
        var normalized = string.IsNullOrWhiteSpace(url) ? null : url.Trim();
        if (normalized is null)
        {
            return null;
        }

        try
        {
            using var response = await client.GetAsync(normalized, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            return await response.Content.ReadAsStringAsync(cancellationToken);
        }
        catch
        {
            return null;
        }
    }

    protected async Task<string?> TryDownloadBinaryAsBase64Async(HttpClient client, string? url, CancellationToken cancellationToken = default)
    {
        var normalized = string.IsNullOrWhiteSpace(url) ? null : url.Trim();
        if (normalized is null)
        {
            return null;
        }

        try
        {
            using var response = await client.GetAsync(normalized, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
            return bytes.Length == 0 ? null : Convert.ToBase64String(bytes);
        }
        catch
        {
            return null;
        }
    }

    protected static FiscalDocumentoStatus MapByCode(int? code)
        => code switch
        {
            100 or 150 => FiscalDocumentoStatus.Autorizada,
            >= 200 and < 300 => FiscalDocumentoStatus.Rejeitada,
            _ => FiscalDocumentoStatus.Pendente
        };

    protected static string? OnlyDigits(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var digits = new string(value.Where(char.IsDigit).ToArray());
        return digits.Length == 0 ? null : digits;
    }

    protected static string AmbienteLiteral(AmbienteFiscal ambiente)
        => ambiente == AmbienteFiscal.Homologacao ? "homologacao" : "producao";
}
