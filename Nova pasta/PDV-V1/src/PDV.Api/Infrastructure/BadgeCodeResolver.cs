using System.Text.RegularExpressions;

namespace PDV.Api.Infrastructure;

public static class BadgeCodeResolver
{
    private static readonly string[] KnownPrefixes =
    [
        "ADM",
        "GER",
        "OPC",
        "COM",
        "ENT"
    ];

    public static string Normalize(string codigoBarrasCracha)
        => codigoBarrasCracha.Trim().ToUpperInvariant();

    public static string[] BuildCandidates(string codigoBarrasCracha)
    {
        var normalized = Normalize(codigoBarrasCracha);
        var candidates = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            normalized,
            normalized.Replace(" ", string.Empty)
        };

        if (TryParse(normalized, out var prefixo, out var sequencia))
        {
            foreach (var prefixoCandidato in ResolvePrefixCandidates(prefixo))
            {
                candidates.Add($"{prefixoCandidato}-{sequencia}");
                candidates.Add($"{prefixoCandidato}-{sequencia.PadLeft(6, '0')}");
                candidates.Add($"{prefixoCandidato}{sequencia}");
                candidates.Add($"{prefixoCandidato}{sequencia.PadLeft(6, '0')}");
            }
        }

        return candidates.ToArray();
    }

    private static bool TryParse(string codigoBarrasCracha, out string prefixo, out string sequencia)
    {
        prefixo = string.Empty;
        sequencia = string.Empty;

        var compact = codigoBarrasCracha.Replace(" ", string.Empty);
        var match = Regex.Match(
            compact,
            @"^(?<prefixo>[A-Z0-9]{3})-?(?<sequencia>\d{1,6})$",
            RegexOptions.CultureInvariant);

        if (!match.Success)
        {
            return false;
        }

        prefixo = match.Groups["prefixo"].Value;
        sequencia = match.Groups["sequencia"].Value;
        return true;
    }

    private static IReadOnlyCollection<string> ResolvePrefixCandidates(string prefixo)
    {
        var candidates = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            prefixo
        };

        foreach (var knownPrefix in KnownPrefixes)
        {
            if (ComputeHammingDistance(prefixo, knownPrefix) <= 1)
            {
                candidates.Add(knownPrefix);
            }
        }

        return candidates;
    }

    private static int ComputeHammingDistance(string left, string right)
    {
        if (left.Length != right.Length)
        {
            return int.MaxValue;
        }

        var distance = 0;
        for (var index = 0; index < left.Length; index += 1)
        {
            if (left[index] != right[index])
            {
                distance += 1;
            }
        }

        return distance;
    }
}
