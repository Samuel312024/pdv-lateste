using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using PDV.Api.Common;
using PDV.Api.Fiscal.DTOs;

namespace PDV.Api.Fiscal.Providers.NuvemFiscal;

public class NuvemFiscalAuthService(IHttpClientFactory httpClientFactory, IMemoryCache memoryCache)
{
    private const string AuthUrl = "https://auth.nuvemfiscal.com.br/oauth/token";

    public async Task<string> GetAccessTokenAsync(FiscalProviderContext context, CancellationToken cancellationToken = default)
    {
        var clientId = context.ApiFiscalClientId?.Trim();
        var clientSecret = context.ApiFiscalClientSecret?.Trim();
        var hasOauthCredential = !string.IsNullOrWhiteSpace(clientId) || !string.IsNullOrWhiteSpace(clientSecret);

        if (hasOauthCredential)
        {
            if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            {
                throw new AppException("A configuracao da Nuvem Fiscal esta incompleta. Informe Client ID e Client Secret para o sistema gerar o token automaticamente.");
            }

            var cacheKey = $"nuvemfiscal-token:{context.EmpresaId:N}:{clientId}";
            if (memoryCache.TryGetValue<string>(cacheKey, out var cachedToken) && !string.IsNullOrWhiteSpace(cachedToken))
            {
                return cachedToken;
            }

            using var client = httpClientFactory.CreateClient("nuvemfiscal-auth");
            using var content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "client_credentials",
                ["client_id"] = clientId,
                ["client_secret"] = clientSecret,
                ["scope"] = "empresa nfe"
            });

            using var response = await client.PostAsync(AuthUrl, content, cancellationToken);
            var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                if (IsInvalidClient(responseBody))
                {
                    throw new AppException(
                        "Nao foi possivel obter o token da Nuvem Fiscal: credenciais invalidas. " +
                        "Confirme se o Client ID e o Client Secret pertencem a Nuvem Fiscal e ao ambiente correto " +
                        "(Sandbox para Homologacao, Producao para Producao).");
                }

                throw new AppException($"Nao foi possivel obter o token da Nuvem Fiscal: {Summarize(responseBody)}");
            }

            using var json = JsonDocument.Parse(responseBody);
            var accessToken = json.RootElement.TryGetProperty("access_token", out var accessTokenNode)
                ? accessTokenNode.GetString()
                : null;
            var expiresIn = json.RootElement.TryGetProperty("expires_in", out var expiresInNode) && expiresInNode.TryGetInt32(out var seconds)
                ? seconds
                : 3600;

            if (string.IsNullOrWhiteSpace(accessToken))
            {
                throw new AppException("A Nuvem Fiscal respondeu sem access_token ao solicitar a autenticacao OAuth.");
            }

            var cacheSeconds = Math.Max(60, expiresIn - 300);
            memoryCache.Set(cacheKey, accessToken, TimeSpan.FromSeconds(cacheSeconds));
            return accessToken;
        }

        if (!string.IsNullOrWhiteSpace(context.TokenApiFiscal))
        {
            return context.TokenApiFiscal.Trim();
        }

        throw new AppException("Informe o Client ID e o Client Secret da Nuvem Fiscal para o sistema gerar o token automaticamente.");
    }

    private static string Summarize(string? responseBody)
        => string.IsNullOrWhiteSpace(responseBody)
            ? "retorno vazio"
            : responseBody.Length <= 400 ? responseBody : responseBody[..400];

    private static bool IsInvalidClient(string? responseBody)
    {
        if (string.IsNullOrWhiteSpace(responseBody))
        {
            return false;
        }

        try
        {
            using var document = JsonDocument.Parse(responseBody);
            var error = document.RootElement.TryGetProperty("error", out var errorNode)
                ? errorNode.GetString()
                : null;
            return string.Equals(error, "invalid_client", StringComparison.OrdinalIgnoreCase);
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
