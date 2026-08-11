using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using PDV.Api.Common;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.DTOs;

namespace PDV.Api.Services;

public class MunicipioCatalogService(
    AppDbContext dbContext,
    HttpClient httpClient,
    ILogger<MunicipioCatalogService> logger)
{
    private const int CodigoIbgeLength = 7;

    public async Task EnsureCatalogLoadedAsync(CancellationToken cancellationToken = default)
    {
        if (await dbContext.Municipios.AsNoTracking().AnyAsync(item => item.Ativo, cancellationToken))
        {
            return;
        }

        try
        {
            await ImportByUfAsync(null, cancellationToken);
        }
        catch (Exception exception) when (exception is AppException or HttpRequestException or TaskCanceledException)
        {
            logger.LogWarning(exception, "Nao foi possivel importar a base inicial de municipios do IBGE durante a inicializacao.");
        }
    }

    public async Task<IReadOnlyCollection<MunicipioLookupDto>> SearchAsync(
        string? termo,
        string? uf,
        int limit = 20,
        CancellationToken cancellationToken = default)
    {
        var normalizedUf = NormalizeUf(uf);
        var normalizedTerm = NormalizeNullable(termo);
        var comparableTerm = normalizedTerm is null ? null : NormalizeComparableText(normalizedTerm);
        var safeLimit = Math.Clamp(limit, 1, 50);

        if (normalizedUf is not null && !await HasUfDataAsync(normalizedUf, cancellationToken))
        {
            await ImportByUfAsync(normalizedUf, cancellationToken);
        }

        IQueryable<Municipio> query = dbContext.Municipios
            .AsNoTracking()
            .Where(item => item.Ativo);

        if (normalizedUf is not null)
        {
            query = query.Where(item => item.Uf == normalizedUf);
        }

        var municipios = await query
            .OrderBy(item => item.Nome)
            .ToListAsync(cancellationToken);

        return municipios
            .Where(item => comparableTerm is null || NormalizeComparableText(item.Nome).Contains(comparableTerm, StringComparison.Ordinal))
            .OrderBy(item => comparableTerm is null ? 3 : GetSearchRank(item.Nome, comparableTerm))
            .ThenBy(item => item.Nome)
            .Take(safeLimit)
            .Select(Map)
            .ToArray();
    }

    public async Task<MunicipioLookupDto?> ResolveAsync(
        string? cidade,
        string? uf,
        string? codigoIbge,
        CancellationToken cancellationToken = default)
    {
        var resolution = await ResolveForAddressAsync(cidade, uf, codigoIbge, cancellationToken);
        return resolution.IsValid ? resolution.Municipio : null;
    }

    public async Task<MunicipioResolutionDto> ResolveForAddressAsync(
        string? cidade,
        string? uf,
        string? codigoIbge,
        CancellationToken cancellationToken = default)
    {
        var normalizedCidade = NormalizeNullable(cidade);
        var normalizedUf = NormalizeUf(uf);
        var normalizedCodigoIbge = DigitsOnly(codigoIbge);
        var hasInput = normalizedCidade is not null || normalizedUf is not null || normalizedCodigoIbge is not null;

        if (!hasInput)
        {
            return new MunicipioResolutionDto(false, true, null, null);
        }

        if (normalizedCodigoIbge is not null && normalizedCodigoIbge.Length != CodigoIbgeLength)
        {
            return Invalid("Codigo IBGE do municipio deve conter 7 digitos.");
        }

        if (normalizedCodigoIbge is null && (normalizedCidade is null || normalizedUf is null))
        {
            return Invalid("Cidade e UF devem ser informadas juntas para localizar o municipio no IBGE.");
        }

        Municipio? municipio;
        if (normalizedCodigoIbge is not null)
        {
            municipio = await FindByCodigoAsync(normalizedCodigoIbge, cancellationToken);
            if (municipio is null)
            {
                await ImportByCodigoAsync(normalizedCodigoIbge, cancellationToken);
                municipio = await FindByCodigoAsync(normalizedCodigoIbge, cancellationToken);
            }

            if (municipio is null)
            {
                return Invalid($"Codigo IBGE {normalizedCodigoIbge} nao foi encontrado na base do IBGE.");
            }
        }
        else
        {
            if (!await HasUfDataAsync(normalizedUf!, cancellationToken))
            {
                await ImportByUfAsync(normalizedUf, cancellationToken);
            }

            municipio = await FindByNomeUfAsync(normalizedCidade!, normalizedUf!, cancellationToken);
            if (municipio is null)
            {
                return Invalid($"Municipio {normalizedCidade}/{normalizedUf} nao foi encontrado na base do IBGE.");
            }
        }

        if (normalizedUf is not null && !string.Equals(municipio.Uf, normalizedUf, StringComparison.OrdinalIgnoreCase))
        {
            return Invalid($"O codigo IBGE informado pertence a {municipio.Nome}/{municipio.Uf}, e nao a {normalizedUf}.");
        }

        if (normalizedCidade is not null && NormalizeComparableText(municipio.Nome) != NormalizeComparableText(normalizedCidade))
        {
            return Invalid($"O codigo IBGE informado pertence ao municipio {municipio.Nome}/{municipio.Uf}.");
        }

        return new MunicipioResolutionDto(true, true, Map(municipio), null);
    }

    private async Task<bool> HasUfDataAsync(string uf, CancellationToken cancellationToken)
        => await dbContext.Municipios
            .AsNoTracking()
            .AnyAsync(item => item.Ativo && item.Uf == uf, cancellationToken);

    private async Task<Municipio?> FindByCodigoAsync(string codigoIbge, CancellationToken cancellationToken)
        => await dbContext.Municipios
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.Ativo && item.CodigoIbge == codigoIbge, cancellationToken);

    private async Task<Municipio?> FindByNomeUfAsync(string cidade, string uf, CancellationToken cancellationToken)
    {
        var comparableCidade = NormalizeComparableText(cidade);
        var municipios = await dbContext.Municipios
            .AsNoTracking()
            .Where(item => item.Ativo && item.Uf == uf)
            .ToListAsync(cancellationToken);

        var exact = municipios.FirstOrDefault(item => NormalizeComparableText(item.Nome) == comparableCidade);
        if (exact is not null)
        {
            return exact;
        }

        var startsWith = municipios
            .Where(item => NormalizeComparableText(item.Nome).StartsWith(comparableCidade, StringComparison.Ordinal))
            .Take(2)
            .ToArray();

        return startsWith.Length == 1 ? startsWith[0] : null;
    }

    private async Task ImportByUfAsync(string? uf, CancellationToken cancellationToken)
    {
        var normalizedUf = NormalizeUf(uf);

        try
        {
            var route = normalizedUf is null
                ? "municipios?orderBy=nome"
                : $"estados/{normalizedUf}/municipios?orderBy=nome";

            var response = await httpClient.GetFromJsonAsync<IbgeMunicipioResponse[]>(route, cancellationToken);
            if (response is null || response.Length == 0)
            {
                throw new AppException("A base de municipios do IBGE nao retornou dados.", HttpStatusCode.BadGateway);
            }

            await UpsertMunicipiosAsync(response, cancellationToken);
        }
        catch (HttpRequestException exception)
        {
            throw new AppException("Nao foi possivel consultar a base de municipios do IBGE no momento.", exception.StatusCode ?? HttpStatusCode.BadGateway);
        }
        catch (TaskCanceledException)
        {
            throw new AppException("A consulta da base de municipios do IBGE excedeu o tempo limite.", HttpStatusCode.GatewayTimeout);
        }
    }

    private async Task ImportByCodigoAsync(string codigoIbge, CancellationToken cancellationToken)
    {
        try
        {
            var response = await httpClient.GetFromJsonAsync<IbgeMunicipioResponse>($"municipios/{codigoIbge}", cancellationToken);
            if (response is null)
            {
                throw new NotFoundException($"Codigo IBGE {codigoIbge} nao encontrado.");
            }

            await UpsertMunicipiosAsync([response], cancellationToken);
        }
        catch (HttpRequestException exception) when (exception.StatusCode == HttpStatusCode.NotFound)
        {
            throw new NotFoundException($"Codigo IBGE {codigoIbge} nao encontrado.");
        }
        catch (HttpRequestException exception)
        {
            throw new AppException("Nao foi possivel consultar a base de municipios do IBGE no momento.", exception.StatusCode ?? HttpStatusCode.BadGateway);
        }
        catch (TaskCanceledException)
        {
            throw new AppException("A consulta da base de municipios do IBGE excedeu o tempo limite.", HttpStatusCode.GatewayTimeout);
        }
    }

    private async Task UpsertMunicipiosAsync(IEnumerable<IbgeMunicipioResponse> response, CancellationToken cancellationToken)
    {
        var imported = response
            .Select(MapImportedMunicipio)
            .Where(item => item is not null)
            .Cast<ImportedMunicipio>()
            .GroupBy(item => item.CodigoIbge, StringComparer.Ordinal)
            .Select(group => group.First())
            .ToArray();

        if (imported.Length == 0)
        {
            return;
        }

        var codes = imported.Select(item => item.CodigoIbge).ToArray();
        var existing = await dbContext.Municipios
            .Where(item => codes.Contains(item.CodigoIbge))
            .ToDictionaryAsync(item => item.CodigoIbge, cancellationToken);

        foreach (var item in imported)
        {
            if (existing.TryGetValue(item.CodigoIbge, out var current))
            {
                current.Nome = item.Nome;
                current.Uf = item.Uf;
                current.CepInicial = item.CepInicial;
                current.CepFinal = item.CepFinal;
                current.Ativo = true;
                continue;
            }

            dbContext.Municipios.Add(new Municipio
            {
                MunicipioId = Guid.NewGuid(),
                CodigoIbge = item.CodigoIbge,
                Nome = item.Nome,
                Uf = item.Uf,
                CepInicial = item.CepInicial,
                CepFinal = item.CepFinal,
                Ativo = true
            });
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static ImportedMunicipio? MapImportedMunicipio(IbgeMunicipioResponse response)
    {
        var codigoIbge = response.Id.ToString("0000000", CultureInfo.InvariantCulture);
        var nome = NormalizeNullable(response.Nome);
        var uf = NormalizeUf(response.Microrregiao?.Mesorregiao?.Uf?.Sigla);

        if (string.IsNullOrWhiteSpace(nome) || string.IsNullOrWhiteSpace(uf))
        {
            return null;
        }

        return new ImportedMunicipio(codigoIbge, nome, uf, null, null);
    }

    private static MunicipioLookupDto Map(Municipio municipio)
        => new(
            municipio.MunicipioId,
            municipio.CodigoIbge,
            municipio.Nome,
            municipio.Uf);

    private static MunicipioResolutionDto Invalid(string message)
        => new(true, false, null, message);

    private static int GetSearchRank(string nome, string comparableTerm)
    {
        var comparableNome = NormalizeComparableText(nome);
        if (comparableNome == comparableTerm)
        {
            return 0;
        }

        if (comparableNome.StartsWith(comparableTerm, StringComparison.Ordinal))
        {
            return 1;
        }

        return 2;
    }

    private static string? NormalizeNullable(string? value)
        => string.IsNullOrWhiteSpace(value)
            ? null
            : string.Join(' ', value.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));

    private static string? NormalizeUf(string? value)
    {
        var normalized = NormalizeNullable(value);
        return normalized is null ? null : normalized.ToUpperInvariant();
    }

    private static string? DigitsOnly(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var digits = value.Where(char.IsAsciiDigit).ToArray();
        return digits.Length == 0 ? null : new string(digits);
    }

    private static string NormalizeComparableText(string value)
    {
        var builder = new StringBuilder(value.Length);
        foreach (var character in value.Normalize(NormalizationForm.FormD))
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(character);
            if (category == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            builder.Append(char.ToUpperInvariant(character));
        }

        return string.Join(' ', builder.ToString()
            .Normalize(NormalizationForm.FormC)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
    }

    private sealed record ImportedMunicipio(
        string CodigoIbge,
        string Nome,
        string Uf,
        string? CepInicial,
        string? CepFinal);

    private sealed class IbgeMunicipioResponse
    {
        [JsonPropertyName("id")]
        public int Id { get; init; }

        [JsonPropertyName("nome")]
        public string? Nome { get; init; }

        [JsonPropertyName("microrregiao")]
        public IbgeMicrorregiaoResponse? Microrregiao { get; init; }
    }

    private sealed class IbgeMicrorregiaoResponse
    {
        [JsonPropertyName("mesorregiao")]
        public IbgeMesorregiaoResponse? Mesorregiao { get; init; }
    }

    private sealed class IbgeMesorregiaoResponse
    {
        [JsonPropertyName("UF")]
        public IbgeUfResponse? Uf { get; init; }
    }

    private sealed class IbgeUfResponse
    {
        [JsonPropertyName("sigla")]
        public string? Sigla { get; init; }
    }
}
