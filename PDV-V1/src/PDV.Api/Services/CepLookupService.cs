using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using PDV.Api.Common;
using PDV.Api.DTOs;

namespace PDV.Api.Services;

public class CepLookupService(HttpClient httpClient, MunicipioCatalogService municipioCatalogService)
{
    public async Task<CepLookupDto> BuscarAsync(string cep, CancellationToken cancellationToken = default)
    {
        var normalizedCep = NormalizeCep(cep);
        if (normalizedCep.Length != 8)
        {
            throw new AppException("CEP deve conter 8 digitos.");
        }

        try
        {
            var response = await httpClient.GetFromJsonAsync<ViaCepResponse>($"ws/{normalizedCep}/json/", cancellationToken);
            if (response is null || response.Erro || string.IsNullOrWhiteSpace(response.Localidade) || string.IsNullOrWhiteSpace(response.Uf))
            {
                throw new NotFoundException("CEP nao encontrado.");
            }

            MunicipioLookupDto? municipio = null;
            try
            {
                municipio = await municipioCatalogService.ResolveAsync(
                    response.Localidade,
                    response.Uf,
                    null,
                    cancellationToken);
            }
            catch (AppException)
            {
                municipio = null;
            }

            return new CepLookupDto(
                FormatCep(normalizedCep),
                NormalizeNullable(response.Logradouro),
                NormalizeNullable(response.Complemento),
                NormalizeNullable(response.Bairro),
                response.Localidade.Trim(),
                response.Uf.Trim().ToUpperInvariant(),
                municipio?.CodigoIbge);
        }
        catch (AppException)
        {
            throw;
        }
        catch (HttpRequestException)
        {
            throw new AppException("Nao foi possivel consultar o CEP no momento.", HttpStatusCode.BadGateway);
        }
        catch (TaskCanceledException)
        {
            throw new AppException("A consulta do CEP excedeu o tempo limite.", HttpStatusCode.GatewayTimeout);
        }
    }

    private static string NormalizeCep(string? value)
        => string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : new string(value.Where(char.IsAsciiDigit).ToArray());

    private static string? NormalizeNullable(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string FormatCep(string cep)
        => $"{cep[..5]}-{cep[5..]}";

    private sealed class ViaCepResponse
    {
        [JsonPropertyName("cep")]
        public string? Cep { get; init; }

        [JsonPropertyName("logradouro")]
        public string? Logradouro { get; init; }

        [JsonPropertyName("complemento")]
        public string? Complemento { get; init; }

        [JsonPropertyName("bairro")]
        public string? Bairro { get; init; }

        [JsonPropertyName("localidade")]
        public string? Localidade { get; init; }

        [JsonPropertyName("uf")]
        public string? Uf { get; init; }

        [JsonPropertyName("erro")]
        public bool Erro { get; init; }
    }
}
