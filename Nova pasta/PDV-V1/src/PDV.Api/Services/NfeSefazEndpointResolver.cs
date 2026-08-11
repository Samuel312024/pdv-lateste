using Microsoft.Extensions.Options;
using PDV.Api.Common;
using PDV.Api.Domain;

namespace PDV.Api.Services;

public sealed class NfeSefazOptions
{
    public Dictionary<string, NfeSefazUfOptions> Overrides { get; init; } = new(StringComparer.OrdinalIgnoreCase);

    public bool PreferDirectConnectionWithoutProxy { get; init; } = true;

    public bool AllowSystemProxyFallback { get; init; } = true;

    public bool ForceHttp11 { get; init; } = true;
}

public sealed class NfeSefazUfOptions
{
    public NfeSefazEndpointGroup? Homologacao { get; init; }
    public NfeSefazEndpointGroup? Producao { get; init; }
}

public sealed class NfeSefazEndpointGroup
{
    public string? AutorizacaoUrl { get; init; }
    public string? RetAutorizacaoUrl { get; init; }
    public string? StatusServicoUrl { get; init; }
}

public sealed record NfeSefazEndpoints(
    string AutorizacaoUrl,
    string RetAutorizacaoUrl,
    string StatusServicoUrl);

public class NfeSefazEndpointResolver(IOptions<NfeSefazOptions> options)
{
    private static readonly HashSet<string> SvrsUfs =
    [
        "AC", "AL", "AP", "CE", "DF", "ES", "PA", "PB", "PI", "RJ", "RN", "RO", "RR", "SC", "SE", "TO"
    ];

    public NfeSefazEndpoints Resolve(string? uf, AmbienteFiscal ambiente)
    {
        var normalizedUf = NormalizeUf(uf)
            ?? throw new AppException("Informe a UF fiscal da empresa para localizar o autorizador da NF-e.");

        if (TryResolveOverride(normalizedUf, ambiente, out var overrideEndpoints))
        {
            return overrideEndpoints;
        }

        if (normalizedUf == "SP")
        {
            return ambiente == AmbienteFiscal.Homologacao
                ? new NfeSefazEndpoints(
                    "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
                    "https://homologacao.nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx",
                    "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx")
                : new NfeSefazEndpoints(
                    "https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
                    "https://nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx",
                    "https://nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx");
        }

        if (normalizedUf == "MA")
        {
            return ambiente == AmbienteFiscal.Homologacao
                ? new NfeSefazEndpoints(
                    "https://www.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx",
                    "https://www.sefazvirtual.fazenda.gov.br/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
                    "https://www.sefazvirtual.fazenda.gov.br/NFeStatusServico4/NFeStatusServico4.asmx")
                : new NfeSefazEndpoints(
                    "https://www.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx",
                    "https://www.sefazvirtual.fazenda.gov.br/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
                    "https://www.sefazvirtual.fazenda.gov.br/NFeStatusServico4/NFeStatusServico4.asmx");
        }

        if (SvrsUfs.Contains(normalizedUf))
        {
            return ambiente == AmbienteFiscal.Homologacao
                ? new NfeSefazEndpoints(
                    "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
                    "https://nfe-homologacao.svrs.rs.gov.br/ws/NFeRetAutorizacao/NFeRetAutorizacao4.asmx",
                    "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx")
                : new NfeSefazEndpoints(
                    "https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
                    "https://nfe.svrs.rs.gov.br/ws/NFeRetAutorizacao/NFeRetAutorizacao4.asmx",
                    "https://nfe.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx");
        }

        throw new AppException(
            $"A UF {normalizedUf} ainda nao possui endpoint configurado automaticamente nesta etapa. Configure o override em 'NfeSefaz:Overrides:{normalizedUf}' ou adicione o autorizador local.");
    }

    public static string ResolveUfCode(string? uf)
    {
        var normalizedUf = NormalizeUf(uf)
            ?? throw new AppException("UF da empresa invalida para gerar a chave de acesso da NF-e.");

        return normalizedUf switch
        {
            "RO" => "11",
            "AC" => "12",
            "AM" => "13",
            "RR" => "14",
            "PA" => "15",
            "AP" => "16",
            "TO" => "17",
            "MA" => "21",
            "PI" => "22",
            "CE" => "23",
            "RN" => "24",
            "PB" => "25",
            "PE" => "26",
            "AL" => "27",
            "SE" => "28",
            "BA" => "29",
            "MG" => "31",
            "ES" => "32",
            "RJ" => "33",
            "SP" => "35",
            "PR" => "41",
            "SC" => "42",
            "RS" => "43",
            "MS" => "50",
            "MT" => "51",
            "GO" => "52",
            "DF" => "53",
            _ => throw new AppException($"UF {normalizedUf} ainda nao esta mapeada para a NF-e.")
        };
    }

    private bool TryResolveOverride(string uf, AmbienteFiscal ambiente, out NfeSefazEndpoints endpoints)
    {
        endpoints = null!;

        if (!options.Value.Overrides.TryGetValue(uf, out var overrideOptions))
        {
            return false;
        }

        var group = ambiente == AmbienteFiscal.Homologacao
            ? overrideOptions.Homologacao
            : overrideOptions.Producao;

        if (group is null ||
            string.IsNullOrWhiteSpace(group.AutorizacaoUrl) ||
            string.IsNullOrWhiteSpace(group.RetAutorizacaoUrl) ||
            string.IsNullOrWhiteSpace(group.StatusServicoUrl))
        {
            return false;
        }

        endpoints = new NfeSefazEndpoints(
            group.AutorizacaoUrl.Trim(),
            group.RetAutorizacaoUrl.Trim(),
            group.StatusServicoUrl.Trim());
        return true;
    }

    private static string? NormalizeUf(string? uf)
        => string.IsNullOrWhiteSpace(uf) ? null : uf.Trim().ToUpperInvariant();
}
