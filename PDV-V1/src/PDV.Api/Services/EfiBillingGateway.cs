using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using PDV.Api.Common;
using PDV.Api.Domain;

namespace PDV.Api.Services;

public sealed record EfiBillingCustomer(
    string Nome,
    string Documento,
    string Email,
    string Telefone,
    string Logradouro,
    string Numero,
    string Bairro,
    string Cep,
    string Cidade,
    string Uf,
    string? Complemento);

public sealed record EfiBillingChargeRequest(
    string Descricao,
    string? DocumentoReferencia,
    decimal Valor,
    DateTime DataVencimento,
    string? IdentificadorInterno,
    string? NotificationUrl,
    EfiBillingCustomer Cliente);

public sealed record EfiBillingChargeSnapshot(
    string ChargeId,
    string Status,
    decimal ValorOriginal,
    decimal? ValorPago,
    DateTime DataVencimento,
    DateTime? DataCriacaoProvider,
    DateTime? DataPagamento,
    string? PixCopiaECola,
    string? PixQrCodeImageUrl,
    string? LinhaDigitavel,
    string? LinkCobranca,
    string? LinkBoleto,
    string? LinkPdf,
    string? CustomId,
    string RawJson);

public class EfiBillingGateway(
    IHttpClientFactory httpClientFactory,
    IMemoryCache memoryCache,
    NfeCertificateService secretService)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public async Task ValidateConfigurationAsync(Empresa empresa, CancellationToken cancellationToken = default)
        => _ = await GetAccessTokenAsync(empresa, cancellationToken);

    public async Task<EfiBillingChargeSnapshot> CreateBolixAsync(
        Empresa empresa,
        EfiBillingChargeRequest request,
        CancellationToken cancellationToken = default)
    {
        var client = httpClientFactory.CreateClient("efi-billing");
        var accessToken = await GetAccessTokenAsync(empresa, cancellationToken);
        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, BuildUri(empresa, "/v1/charge/one-step"));
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        var payload = BuildCreateChargePayload(request);
        httpRequest.Content = new StringContent(JsonSerializer.Serialize(payload, JsonOptions), Encoding.UTF8, "application/json");

        using var response = await client.SendAsync(httpRequest, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        await EnsureSuccessAsync(response, content, empresa, "gerar a cobranca digital");
        return ParseChargeSnapshot(content);
    }

    public async Task<EfiBillingChargeSnapshot> CreatePaymentLinkAsync(
        Empresa empresa,
        EfiBillingChargeRequest request,
        string paymentMethod,
        CancellationToken cancellationToken = default)
    {
        var normalizedPaymentMethod = NormalizePaymentLinkMethod(paymentMethod);
        var client = httpClientFactory.CreateClient("efi-billing");
        var accessToken = await GetAccessTokenAsync(empresa, cancellationToken);
        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, BuildUri(empresa, "/v1/charge/one-step/link"));
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        var payload = BuildCreatePaymentLinkPayload(request, normalizedPaymentMethod);
        httpRequest.Content = new StringContent(JsonSerializer.Serialize(payload, JsonOptions), Encoding.UTF8, "application/json");

        using var response = await client.SendAsync(httpRequest, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        await EnsureSuccessAsync(response, content, empresa, "gerar o link seguro de cobranca");
        return ParseChargeSnapshot(content);
    }

    public async Task<EfiBillingChargeSnapshot> GetChargeAsync(
        Empresa empresa,
        string chargeId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(chargeId))
        {
            throw new AppException("A cobranca digital nao possui charge_id externo para consulta.");
        }

        var client = httpClientFactory.CreateClient("efi-billing");
        var accessToken = await GetAccessTokenAsync(empresa, cancellationToken);
        using var httpRequest = new HttpRequestMessage(HttpMethod.Get, BuildUri(empresa, $"/v1/charge/{chargeId.Trim()}"));
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var response = await client.SendAsync(httpRequest, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        await EnsureSuccessAsync(response, content, empresa, "consultar a cobranca digital");
        return ParseChargeSnapshot(content);
    }

    private async Task<string> GetAccessTokenAsync(Empresa empresa, CancellationToken cancellationToken)
    {
        EnsureConfigured(empresa);
        var clientId = empresa.ApiCobrancaClientId!.Trim();
        var cacheKey = $"efi-billing:{empresa.EmpresaId:N}:{empresa.AmbienteCobrancaDigital}:{clientId}";
        if (memoryCache.TryGetValue<string>(cacheKey, out var cachedToken) && !string.IsNullOrWhiteSpace(cachedToken))
        {
            return cachedToken;
        }

        var clientSecret = secretService.UnprotectSecret(empresa.ApiCobrancaClientSecretProtegido)
            ?? throw new AppException("O Client Secret da cobranca digital nao esta configurado.");

        var client = httpClientFactory.CreateClient("efi-billing");
        using var request = new HttpRequestMessage(HttpMethod.Post, BuildUri(empresa, "/v1/authorize"));
        var basicAuth = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{clientId}:{clientSecret}"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", basicAuth);
        request.Content = new StringContent("{\"grant_type\":\"client_credentials\"}", Encoding.UTF8, "application/json");

        using var response = await client.SendAsync(request, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        await EnsureSuccessAsync(response, content, empresa, "autenticar a aplicacao");

        using var document = JsonDocument.Parse(content);
        var accessToken = document.RootElement.GetProperty("access_token").GetString();
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            throw new AppException("A Efí nao retornou access_token para a cobranca digital.");
        }

        var expiresIn = document.RootElement.TryGetProperty("expires_in", out var expiresElement) && expiresElement.TryGetInt32(out var seconds)
            ? seconds
            : 600;
        var ttl = TimeSpan.FromSeconds(Math.Max(60, expiresIn - 30));
        memoryCache.Set(cacheKey, accessToken, ttl);
        return accessToken;
    }

    private static object BuildCreateChargePayload(EfiBillingChargeRequest request)
    {
        var customer = BuildCustomerPayload(request.Cliente);
        var metadata = new Dictionary<string, object?>();
        if (!string.IsNullOrWhiteSpace(request.IdentificadorInterno))
        {
            metadata["custom_id"] = Truncate(request.IdentificadorInterno, 80);
        }

        if (!string.IsNullOrWhiteSpace(request.NotificationUrl))
        {
            metadata["notification_url"] = request.NotificationUrl.Trim();
        }

        var payload = new Dictionary<string, object?>
        {
            ["items"] = new[]
            {
                new
                {
                    name = Truncate(request.Descricao, 200),
                    value = ToCents(request.Valor),
                    amount = 1
                }
            },
            ["payment"] = new
            {
                banking_billet = new
                {
                    customer,
                    expire_at = request.DataVencimento.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    message = BuildChargeMessage(request.Descricao, request.DocumentoReferencia)
                }
            }
        };

        if (metadata.Count > 0)
        {
            payload["metadata"] = metadata;
        }

        return payload;
    }

    private static object BuildCreatePaymentLinkPayload(EfiBillingChargeRequest request, string paymentMethod)
    {
        var metadata = new Dictionary<string, object?>();
        if (!string.IsNullOrWhiteSpace(request.IdentificadorInterno))
        {
            metadata["custom_id"] = Truncate(request.IdentificadorInterno, 80);
        }

        if (!string.IsNullOrWhiteSpace(request.NotificationUrl))
        {
            metadata["notification_url"] = request.NotificationUrl.Trim();
        }

        var payload = new Dictionary<string, object?>
        {
            ["items"] = new[]
            {
                new
                {
                    name = Truncate(request.Descricao, 200),
                    value = ToCents(request.Valor),
                    amount = 1
                }
            },
            ["customer"] = new
            {
                email = request.Cliente.Email.Trim()
            },
            ["settings"] = new
            {
                payment_method = paymentMethod,
                expire_at = request.DataVencimento.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                request_delivery_address = false,
                message = Truncate(BuildChargeMessage(request.Descricao, request.DocumentoReferencia), 80)
            }
        };

        if (metadata.Count > 0)
        {
            payload["metadata"] = metadata;
        }

        return payload;
    }

    private static object BuildCustomerPayload(EfiBillingCustomer cliente)
    {
        var digits = OnlyDigits(cliente.Documento);
        var phoneDigits = NormalizePhone(cliente.Telefone);
        var address = new
        {
            street = Truncate(cliente.Logradouro, 200),
            number = Truncate(cliente.Numero, 20),
            neighborhood = Truncate(cliente.Bairro, 80),
            zipcode = OnlyDigits(cliente.Cep),
            city = Truncate(cliente.Cidade, 80),
            complement = string.IsNullOrWhiteSpace(cliente.Complemento) ? string.Empty : Truncate(cliente.Complemento, 120),
            state = Truncate(cliente.Uf.ToUpperInvariant(), 2)
        };

        return digits.Length switch
        {
            11 => new
            {
                name = Truncate(cliente.Nome, 255),
                cpf = digits,
                email = cliente.Email.Trim(),
                phone_number = phoneDigits,
                address
            },
            14 => new
            {
                email = cliente.Email.Trim(),
                phone_number = phoneDigits,
                juridical_person = new
                {
                    corporate_name = Truncate(cliente.Nome, 255),
                    cnpj = digits
                },
                address
            },
            _ => throw new AppException("O documento do cliente precisa ser um CPF ou CNPJ valido para emitir a cobranca digital.")
        };
    }

    private static EfiBillingChargeSnapshot ParseChargeSnapshot(string content)
    {
        using var document = JsonDocument.Parse(content);
        var root = document.RootElement;
        var data = root.TryGetProperty("data", out var dataElement) ? dataElement : root;

        var payment = data.TryGetProperty("payment", out var paymentElement) && paymentElement.ValueKind == JsonValueKind.Object
            ? paymentElement
            : default;
        var paymentMethodNode = TryGetProperty(payment, "banking_billet");
        var pixNode = TryGetProperty(data, "pix")
            ?? TryGetProperty(payment, "pix")
            ?? TryGetProperty(paymentMethodNode, "pix");
        var pdfNode = TryGetProperty(data, "pdf")
            ?? TryGetProperty(paymentMethodNode, "pdf");

        var chargeId = ReadString(data, "charge_id")
            ?? throw new AppException("A Efí nao retornou charge_id para a cobranca digital.");
        var status = ReadString(data, "status") ?? "unknown";
        var rawTotalCents = ReadDecimal(data, "total")
            ?? ReadDecimal(payment, "paid_value")
            ?? 0;
        var paidCents = ReadDecimal(payment, "paid_value");
        var dueDate = ReadDate(data, "expire_at")
            ?? ReadDate(paymentMethodNode, "expire_at")
            ?? ReadDate(TryGetProperty(data, "settings"), "expire_at")
            ?? DateTime.UtcNow;

        return new EfiBillingChargeSnapshot(
            chargeId,
            status,
            rawTotalCents / 100m,
            paidCents.HasValue ? paidCents.Value / 100m : null,
            dueDate,
            ReadDate(data, "created_at"),
            ReadDate(payment, "paid_at") ?? ReadDate(payment, "received_by_bank_at"),
            ReadString(pixNode, "qrcode"),
            ReadString(pixNode, "qrcode_image"),
            ReadString(data, "barcode") ?? ReadString(paymentMethodNode, "barcode"),
            ReadString(data, "payment_url")
                ?? ReadString(data, "link")
                ?? ReadString(paymentMethodNode, "link"),
            ReadString(data, "billet_link"),
            ReadString(pdfNode, "charge"),
            ReadString(data, "custom_id"),
            content);
    }

    private static Task EnsureSuccessAsync(HttpResponseMessage response, string content, Empresa empresa, string operation)
    {
        if (response.IsSuccessStatusCode)
        {
            return Task.CompletedTask;
        }

        var providerMessage = TryReadProviderError(content);
        if (response.StatusCode == HttpStatusCode.Unauthorized)
        {
            var ambiente = empresa.AmbienteCobrancaDigital == AmbienteFiscal.Producao ? "producao" : "homologacao";
            var guidance = $" Confira se o Client ID e o Client Secret pertencem ao ambiente de {ambiente} e se a aplicacao da Efí esta com a API de Emissoes/Cobrancas habilitada para esse ambiente.";
            throw new AppException(
                string.IsNullOrWhiteSpace(providerMessage)
                    ? $"A Efí recusou a operacao ao {operation} com HTTP 401.{guidance}"
                    : $"A Efí recusou a operacao ao {operation}: {providerMessage}.{guidance}");
        }

        throw new AppException(
            string.IsNullOrWhiteSpace(providerMessage)
                ? $"A Efí recusou a operacao ao {operation} com HTTP {(int)response.StatusCode}."
                : $"A Efí recusou a operacao ao {operation}: {providerMessage}");
    }

    private static string? TryReadProviderError(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(content);
            var root = document.RootElement;
            if (root.ValueKind == JsonValueKind.Array && root.GetArrayLength() > 0)
            {
                var first = root[0];
                var nome = ReadString(first, "nome");
                var mensagem = ReadString(first, "mensagem");
                return string.Join(": ", new[] { nome, mensagem }.Where(item => !string.IsNullOrWhiteSpace(item)));
            }

            var error = ReadString(root, "error");
            var description = ReadString(root, "error_description");
            var nomeDireto = ReadString(root, "nome");
            var mensagemDireta = ReadString(root, "mensagem");
            return string.Join(": ", new[] { nomeDireto ?? error, mensagemDireta ?? description }.Where(item => !string.IsNullOrWhiteSpace(item)));
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static void EnsureConfigured(Empresa empresa)
    {
        if (empresa.CobrancaDigitalProvider != CobrancaDigitalProvider.Efi)
        {
            throw new AppException("A cobranca digital da empresa nao esta habilitada para a Efí.");
        }

        if (string.IsNullOrWhiteSpace(empresa.ApiCobrancaClientId))
        {
            throw new AppException("Configure o Client ID da cobranca digital antes de gerar Pix ou boleto.");
        }

        if (string.IsNullOrWhiteSpace(empresa.ApiCobrancaClientSecretProtegido))
        {
            throw new AppException("Configure o Client Secret da cobranca digital antes de gerar Pix ou boleto.");
        }
    }

    private static string BuildUri(Empresa empresa, string path)
    {
        var configuredBaseUrl = empresa.UrlApiCobranca?.Trim();
        if (!string.IsNullOrWhiteSpace(configuredBaseUrl))
        {
            return $"{configuredBaseUrl.TrimEnd('/')}{path}";
        }

        var baseUrl = empresa.AmbienteCobrancaDigital == AmbienteFiscal.Producao
            ? "https://cobrancas.api.efipay.com.br"
            : "https://cobrancas-h.api.efipay.com.br";
        return $"{baseUrl}{path}";
    }

    private static string BuildChargeMessage(string descricao, string? documentoReferencia)
    {
        var lines = new List<string>
        {
            Truncate(descricao, 100)
        };

        if (!string.IsNullOrWhiteSpace(documentoReferencia))
        {
            lines.Add(Truncate($"Referencia: {documentoReferencia.Trim()}", 100));
        }

        lines.Add("Pague pelo QR Pix ou pela linha digitavel.");
        return string.Join('\n', lines);
    }

    private static string NormalizePaymentLinkMethod(string value)
        => value.Trim().ToLowerInvariant() switch
        {
            "credit_card" => "credit_card",
            "banking_billet" => "banking_billet",
            "all" => "all",
            _ => throw new AppException("Metodo de pagamento da Efí invalido para o link integrado.")
        };

    private static string NormalizePhone(string value)
    {
        var digits = OnlyDigits(value);
        if (digits.StartsWith("55", StringComparison.Ordinal) && digits.Length is 12 or 13)
        {
            digits = digits[2..];
        }

        if (digits.Length is 10 or 11)
        {
            return digits;
        }

        throw new AppException("O telefone do cliente precisa ter DDD e numero validos para emitir a cobranca digital.");
    }

    private static string OnlyDigits(string? value)
        => string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : new string(value.Where(char.IsAsciiDigit).ToArray());

    private static int ToCents(decimal value)
    {
        if (value <= 0)
        {
            throw new AppException("O valor da cobranca digital deve ser maior que zero.");
        }

        return decimal.ToInt32(decimal.Round(value * 100m, 0, MidpointRounding.AwayFromZero));
    }

    private static string Truncate(string? value, int maxLength)
    {
        var normalized = string.IsNullOrWhiteSpace(value) ? string.Empty : value.Trim();
        return normalized.Length <= maxLength ? normalized : normalized[..maxLength];
    }

    private static JsonElement? TryGetProperty(JsonElement? element, string propertyName)
    {
        if (!element.HasValue || element.Value.ValueKind == JsonValueKind.Undefined || element.Value.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        return element.Value.TryGetProperty(propertyName, out var property) ? property : null;
    }

    private static string? ReadString(JsonElement? element, string propertyName)
    {
        if (!element.HasValue || element.Value.ValueKind == JsonValueKind.Null || element.Value.ValueKind == JsonValueKind.Undefined)
        {
            return null;
        }

        if (!element.Value.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        return property.ValueKind switch
        {
            JsonValueKind.String => property.GetString(),
            JsonValueKind.Number => property.GetRawText(),
            _ => null
        };
    }

    private static decimal? ReadDecimal(JsonElement? element, string propertyName)
    {
        var raw = ReadString(element, propertyName);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        return decimal.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : null;
    }

    private static DateTime? ReadDate(JsonElement? element, string propertyName)
    {
        var raw = ReadString(element, propertyName);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        return DateTime.TryParse(
            raw,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
            out var parsed)
            ? parsed
            : null;
    }
}
