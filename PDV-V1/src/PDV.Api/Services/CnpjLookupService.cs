using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using PDV.Api.Common;
using PDV.Api.DTOs;

namespace PDV.Api.Services;

public class CnpjLookupService(HttpClient httpClient, ILogger<CnpjLookupService> logger)
{
    public async Task<CnpjLookupDto> BuscarAsync(string cnpj, CancellationToken cancellationToken = default)
    {
        var normalizedCnpj = NormalizeDigits(cnpj);
        if (normalizedCnpj.Length != 14)
        {
            throw new AppException("CNPJ deve conter 14 digitos.");
        }

        try
        {
            var response = await BuscarBrasilApiAsync(normalizedCnpj, cancellationToken);
            return await ComplementarDadosFiscaisAsync(response, normalizedCnpj, cancellationToken);
        }
        catch (AppException)
        {
            throw;
        }
        catch (HttpRequestException exception) when (ShouldFallback(exception.StatusCode))
        {
            logger.LogWarning(exception, "Consulta de CNPJ na BrasilAPI falhou para {Cnpj}. Tentando fallback em publica.cnpj.ws.", normalizedCnpj);
            return await BuscarPublicaCnpjWsAsync(normalizedCnpj, cancellationToken);
        }
        catch (HttpRequestException exception) when (exception.StatusCode == HttpStatusCode.NotFound)
        {
            logger.LogInformation("CNPJ {Cnpj} nao encontrado na BrasilAPI. Tentando fallback em publica.cnpj.ws.", normalizedCnpj);
            return await BuscarPublicaCnpjWsAsync(normalizedCnpj, cancellationToken);
        }
        catch (HttpRequestException exception)
        {
            logger.LogWarning(exception, "Falha HTTP ao consultar CNPJ {Cnpj}. Tentando fallback em publica.cnpj.ws.", normalizedCnpj);
            return await BuscarPublicaCnpjWsAsync(normalizedCnpj, cancellationToken);
        }
        catch (TaskCanceledException exception)
        {
            logger.LogWarning(exception, "Timeout na consulta BrasilAPI para CNPJ {Cnpj}. Tentando fallback em publica.cnpj.ws.", normalizedCnpj);
            return await BuscarPublicaCnpjWsAsync(normalizedCnpj, cancellationToken);
        }
    }

    private async Task<CnpjLookupDto> BuscarBrasilApiAsync(string normalizedCnpj, CancellationToken cancellationToken)
    {
        var response = await httpClient.GetFromJsonAsync<BrasilApiCnpjResponse>(normalizedCnpj, cancellationToken);
        var razaoSocial = NormalizeNullable(response?.RazaoSocial);
        if (string.IsNullOrWhiteSpace(razaoSocial))
        {
            throw new NotFoundException("CNPJ nao encontrado.");
        }

        var telefonePrincipal = PickPhone(response?.DddTelefone1, response?.DddTelefone2);
        var telefoneSecundario = PickSecondaryPhone(response?.DddTelefone1, response?.DddTelefone2, telefonePrincipal);

        return new CnpjLookupDto(
            FormatCnpj(normalizedCnpj),
            razaoSocial,
            NormalizeNullable(response?.NomeFantasia),
            NormalizeNullable(response?.CnaeFiscalDescricao),
            NormalizeJsonScalar(response?.CnaeFiscal),
            NormalizeJsonScalar(response?.CodigoMunicipioIbge),
            NormalizeNullable(response?.InscricaoEstadual),
            FormatPhone(telefonePrincipal),
            FormatPhone(telefoneSecundario),
            NormalizeEmail(response?.Email),
            FormatCep(response?.Cep),
            BuildLogradouro(response?.DescricaoTipoDeLogradouro, response?.Logradouro),
            NormalizeNullable(response?.Numero),
            NormalizeNullable(response?.Complemento),
            NormalizeNullable(response?.Bairro),
            NormalizeNullable(response?.Municipio),
            NormalizeUf(response?.Uf));
    }

    private async Task<CnpjLookupDto> BuscarPublicaCnpjWsAsync(string normalizedCnpj, CancellationToken cancellationToken)
    {
        try
        {
            var response = await httpClient.GetFromJsonAsync<PublicaCnpjWsResponse>($"https://publica.cnpj.ws/cnpj/{normalizedCnpj}", cancellationToken);
            var razaoSocial = NormalizeNullable(response?.RazaoSocial);
            var estabelecimento = response?.Estabelecimento;

            if (string.IsNullOrWhiteSpace(razaoSocial) || estabelecimento is null)
            {
                throw new NotFoundException("CNPJ nao encontrado.");
            }

            var telefonePrincipal = JoinPhone(estabelecimento.Ddd1, estabelecimento.Telefone1);
            var telefoneSecundario = JoinPhone(estabelecimento.Ddd2, estabelecimento.Telefone2);

            return new CnpjLookupDto(
                FormatCnpj(NormalizeDigits(estabelecimento.Cnpj) is { Length: 14 } estabelecimentoCnpj ? estabelecimentoCnpj : normalizedCnpj),
                razaoSocial,
                NormalizeNullable(estabelecimento.NomeFantasia),
                NormalizeNullable(estabelecimento.AtividadePrincipal?.Descricao),
                NormalizeNullable(estabelecimento.AtividadePrincipal?.Id),
                estabelecimento.Cidade?.IbgeId?.ToString(),
                PickInscricaoEstadual(estabelecimento.InscricoesEstaduais, estabelecimento.Estado?.Sigla),
                FormatPhone(telefonePrincipal),
                FormatPhone(telefoneSecundario),
                NormalizeEmail(estabelecimento.Email),
                FormatCep(estabelecimento.Cep),
                BuildLogradouro(estabelecimento.TipoLogradouro, estabelecimento.Logradouro),
                NormalizeNullable(estabelecimento.Numero),
                NormalizeNullable(estabelecimento.Complemento),
                NormalizeNullable(estabelecimento.Bairro),
                NormalizeNullable(estabelecimento.Cidade?.Nome),
                NormalizeUf(estabelecimento.Estado?.Sigla));
        }
        catch (AppException)
        {
            throw;
        }
        catch (HttpRequestException exception) when (exception.StatusCode == HttpStatusCode.NotFound)
        {
            throw new NotFoundException("CNPJ nao encontrado.");
        }
        catch (HttpRequestException exception)
        {
            logger.LogError(exception, "Falha HTTP no fallback publica.cnpj.ws para CNPJ {Cnpj}.", normalizedCnpj);
            throw new AppException("Nao foi possivel consultar o CNPJ no momento.", HttpStatusCode.BadGateway);
        }
        catch (TaskCanceledException exception)
        {
            logger.LogError(exception, "Timeout no fallback publica.cnpj.ws para CNPJ {Cnpj}.", normalizedCnpj);
            throw new AppException("A consulta do CNPJ excedeu o tempo limite.", HttpStatusCode.GatewayTimeout);
        }
    }

    private async Task<CnpjLookupDto> ComplementarDadosFiscaisAsync(CnpjLookupDto primaryResult, string normalizedCnpj, CancellationToken cancellationToken)
    {
        if (!NeedsFiscalComplement(primaryResult))
        {
            return primaryResult;
        }

        try
        {
            var complemento = await BuscarPublicaCnpjWsAsync(normalizedCnpj, cancellationToken);
            return Merge(primaryResult, complemento);
        }
        catch (NotFoundException)
        {
            logger.LogInformation("Consulta complementar de dados fiscais nao encontrou o CNPJ {Cnpj} na publica.cnpj.ws. Mantendo dados da consulta principal.", normalizedCnpj);
            return primaryResult;
        }
        catch (AppException exception) when (exception is not NotFoundException)
        {
            logger.LogWarning(exception, "Nao foi possivel complementar os dados fiscais do CNPJ {Cnpj} via publica.cnpj.ws. Mantendo dados da consulta principal.", normalizedCnpj);
            return primaryResult;
        }
        catch (HttpRequestException exception)
        {
            logger.LogWarning(exception, "Falha HTTP ao complementar dados fiscais do CNPJ {Cnpj}. Mantendo dados da consulta principal.", normalizedCnpj);
            return primaryResult;
        }
        catch (TaskCanceledException exception)
        {
            logger.LogWarning(exception, "Timeout ao complementar dados fiscais do CNPJ {Cnpj}. Mantendo dados da consulta principal.", normalizedCnpj);
            return primaryResult;
        }
    }

    private static bool ShouldFallback(HttpStatusCode? statusCode)
        => statusCode is HttpStatusCode.TooManyRequests or HttpStatusCode.Forbidden or HttpStatusCode.BadGateway or HttpStatusCode.ServiceUnavailable or HttpStatusCode.GatewayTimeout;

    private static bool NeedsFiscalComplement(CnpjLookupDto result)
        => string.IsNullOrWhiteSpace(result.CnaePrincipalCodigo)
            || string.IsNullOrWhiteSpace(result.CodigoMunicipioIbge)
            || string.IsNullOrWhiteSpace(result.InscricaoEstadual);

    private static string NormalizeDigits(string? value)
        => string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : new string(value.Where(char.IsAsciiDigit).ToArray());

    private static string? NormalizeNullable(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? NormalizeJsonScalar(JsonElement? value)
    {
        if (!value.HasValue)
        {
            return null;
        }

        return value.Value.ValueKind switch
        {
            JsonValueKind.Number => value.Value.GetRawText(),
            JsonValueKind.String => NormalizeNullable(value.Value.GetString()),
            _ => null
        };
    }

    private static string? BuildLogradouro(string? tipoLogradouro, string? logradouro)
        => NormalizeNullable(string.Join(' ', new[] { NormalizeNullable(tipoLogradouro), NormalizeNullable(logradouro) }.Where(value => value is not null)));

    private static string? NormalizeEmail(string? value)
    {
        var email = NormalizeNullable(value);
        return email?.ToLowerInvariant();
    }

    private static string? NormalizeUf(string? value)
    {
        var uf = NormalizeNullable(value);
        return string.IsNullOrWhiteSpace(uf) ? null : uf.ToUpperInvariant();
    }

    private static string FormatCnpj(string cnpj)
        => $"{cnpj[..2]}.{cnpj[2..5]}.{cnpj[5..8]}/{cnpj[8..12]}-{cnpj[12..]}";

    private static string? FormatCep(string? cep)
    {
        var digits = NormalizeDigits(cep);
        return digits.Length == 8 ? $"{digits[..5]}-{digits[5..]}" : null;
    }

    private static string? FormatPhone(string? phone)
    {
        var digits = NormalizeDigits(phone);
        if (digits.Length == 10)
        {
            return $"({digits[..2]}) {digits[2..6]}-{digits[6..]}";
        }

        if (digits.Length == 11)
        {
            return $"({digits[..2]}) {digits[2..7]}-{digits[7..]}";
        }

        return null;
    }

    private static string? PickPhone(params string?[] values)
        => values
            .Select(NormalizeDigits)
            .FirstOrDefault(value => value.Length is 10 or 11);

    private static string? PickSecondaryPhone(string? firstValue, string? secondValue, string? primaryPhone)
        => new[] { firstValue, secondValue }
            .Select(NormalizeDigits)
            .Where(value => value.Length is 10 or 11)
            .FirstOrDefault(value => !string.Equals(value, primaryPhone, StringComparison.Ordinal));

    private static string? JoinPhone(string? ddd, string? phone)
    {
        var digits = $"{NormalizeDigits(ddd)}{NormalizeDigits(phone)}";
        return digits.Length is 10 or 11 ? digits : null;
    }

    private static string? PickInscricaoEstadual(IReadOnlyCollection<PublicaCnpjWsInscricaoEstadualResponse>? inscricoes, string? ufPrincipal)
    {
        if (inscricoes is null || inscricoes.Count == 0)
        {
            return null;
        }

        var uf = NormalizeUf(ufPrincipal);
        var preferred = inscricoes.FirstOrDefault(item =>
            item.Ativo &&
            string.Equals(NormalizeUf(item.Estado?.Sigla), uf, StringComparison.OrdinalIgnoreCase));

        preferred ??= inscricoes.FirstOrDefault(item => item.Ativo);
        preferred ??= inscricoes.FirstOrDefault();

        return NormalizeNullable(preferred?.InscricaoEstadual);
    }

    private static CnpjLookupDto Merge(CnpjLookupDto primaryResult, CnpjLookupDto complemento)
        => new(
            primaryResult.Cnpj,
            primaryResult.RazaoSocial,
            complemento.NomeFantasia ?? primaryResult.NomeFantasia,
            complemento.Segmento ?? primaryResult.Segmento,
            complemento.CnaePrincipalCodigo ?? primaryResult.CnaePrincipalCodigo,
            complemento.CodigoMunicipioIbge ?? primaryResult.CodigoMunicipioIbge,
            complemento.InscricaoEstadual ?? primaryResult.InscricaoEstadual,
            primaryResult.Telefone ?? complemento.Telefone,
            primaryResult.TelefoneSecundario ?? complemento.TelefoneSecundario,
            primaryResult.Email ?? complemento.Email,
            primaryResult.Cep ?? complemento.Cep,
            primaryResult.Logradouro ?? complemento.Logradouro,
            primaryResult.Numero ?? complemento.Numero,
            primaryResult.Complemento ?? complemento.Complemento,
            primaryResult.Bairro ?? complemento.Bairro,
            primaryResult.Cidade ?? complemento.Cidade,
            primaryResult.Uf ?? complemento.Uf);

    private sealed class BrasilApiCnpjResponse
    {
        [JsonPropertyName("razao_social")]
        public string? RazaoSocial { get; init; }

        [JsonPropertyName("nome_fantasia")]
        public string? NomeFantasia { get; init; }

        [JsonPropertyName("cnae_fiscal_descricao")]
        public string? CnaeFiscalDescricao { get; init; }

        [JsonPropertyName("cnae_fiscal")]
        public JsonElement? CnaeFiscal { get; init; }

        [JsonPropertyName("ddd_telefone_1")]
        public string? DddTelefone1 { get; init; }

        [JsonPropertyName("ddd_telefone_2")]
        public string? DddTelefone2 { get; init; }

        [JsonPropertyName("email")]
        public string? Email { get; init; }

        [JsonPropertyName("cep")]
        public string? Cep { get; init; }

        [JsonPropertyName("logradouro")]
        public string? Logradouro { get; init; }

        [JsonPropertyName("descricao_tipo_de_logradouro")]
        public string? DescricaoTipoDeLogradouro { get; init; }

        [JsonPropertyName("numero")]
        public string? Numero { get; init; }

        [JsonPropertyName("complemento")]
        public string? Complemento { get; init; }

        [JsonPropertyName("bairro")]
        public string? Bairro { get; init; }

        [JsonPropertyName("municipio")]
        public string? Municipio { get; init; }

        [JsonPropertyName("codigo_municipio_ibge")]
        public JsonElement? CodigoMunicipioIbge { get; init; }

        [JsonPropertyName("inscricao_estadual")]
        public string? InscricaoEstadual { get; init; }

        [JsonPropertyName("uf")]
        public string? Uf { get; init; }
    }

    private sealed class PublicaCnpjWsResponse
    {
        [JsonPropertyName("razao_social")]
        public string? RazaoSocial { get; init; }

        [JsonPropertyName("estabelecimento")]
        public PublicaCnpjWsEstabelecimentoResponse? Estabelecimento { get; init; }
    }

    private sealed class PublicaCnpjWsEstabelecimentoResponse
    {
        [JsonPropertyName("cnpj")]
        public string? Cnpj { get; init; }

        [JsonPropertyName("nome_fantasia")]
        public string? NomeFantasia { get; init; }

        [JsonPropertyName("tipo_logradouro")]
        public string? TipoLogradouro { get; init; }

        [JsonPropertyName("logradouro")]
        public string? Logradouro { get; init; }

        [JsonPropertyName("numero")]
        public string? Numero { get; init; }

        [JsonPropertyName("complemento")]
        public string? Complemento { get; init; }

        [JsonPropertyName("bairro")]
        public string? Bairro { get; init; }

        [JsonPropertyName("cep")]
        public string? Cep { get; init; }

        [JsonPropertyName("email")]
        public string? Email { get; init; }

        [JsonPropertyName("ddd1")]
        public string? Ddd1 { get; init; }

        [JsonPropertyName("telefone1")]
        public string? Telefone1 { get; init; }

        [JsonPropertyName("ddd2")]
        public string? Ddd2 { get; init; }

        [JsonPropertyName("telefone2")]
        public string? Telefone2 { get; init; }

        [JsonPropertyName("atividade_principal")]
        public PublicaCnpjWsAtividadeResponse? AtividadePrincipal { get; init; }

        [JsonPropertyName("cidade")]
        public PublicaCnpjWsCidadeResponse? Cidade { get; init; }

        [JsonPropertyName("estado")]
        public PublicaCnpjWsEstadoResponse? Estado { get; init; }

        [JsonPropertyName("inscricoes_estaduais")]
        public IReadOnlyCollection<PublicaCnpjWsInscricaoEstadualResponse>? InscricoesEstaduais { get; init; }
    }

    private sealed class PublicaCnpjWsAtividadeResponse
    {
        [JsonPropertyName("id")]
        public string? Id { get; init; }

        [JsonPropertyName("descricao")]
        public string? Descricao { get; init; }
    }

    private sealed class PublicaCnpjWsCidadeResponse
    {
        [JsonPropertyName("nome")]
        public string? Nome { get; init; }

        [JsonPropertyName("ibge_id")]
        public int? IbgeId { get; init; }
    }

    private sealed class PublicaCnpjWsEstadoResponse
    {
        [JsonPropertyName("sigla")]
        public string? Sigla { get; init; }
    }

    private sealed class PublicaCnpjWsInscricaoEstadualResponse
    {
        [JsonPropertyName("inscricao_estadual")]
        public string? InscricaoEstadual { get; init; }

        [JsonPropertyName("ativo")]
        public bool Ativo { get; init; }

        [JsonPropertyName("estado")]
        public PublicaCnpjWsEstadoResponse? Estado { get; init; }
    }
}
