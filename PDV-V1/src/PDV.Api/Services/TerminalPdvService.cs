using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using PDV.Api.Common;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Infrastructure;

namespace PDV.Api.Services;

public class TerminalPdvService(
    AppDbContext dbContext,
    CurrentUserService currentUser)
{
    private static readonly HashSet<string> AllowedInstallationProfiles =
    [
        "PRD",
        "HML",
        "HML_PERIFERICOS_MOCK",
        "HML_COMPLETO_MOCK"
    ];

    private static readonly HashSet<string> AllowedPrinterProfiles =
    [
        "NAVEGADOR_PADRAO",
        "TERMICA_80MM",
        "TERMICA_58MM"
    ];

    private static readonly HashSet<string> AllowedScannerProfiles =
    [
        "TECLADO_USB",
        "CAMERA_CELULAR",
        "HIBRIDO"
    ];

    private static readonly HashSet<string> AllowedKeyboardProfiles =
    [
        "PADRAO_PDV",
        "ABNT2",
        "TOUCH"
    ];

    private const string ActivationAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    public async Task<IReadOnlyCollection<TerminalPdvDto>> GetAllAsync()
    {
        EnsureTerminalManagementAccess();

        var empresaId = currentUser.GetEmpresaId();
        var terminals = await dbContext.TerminaisPdv
            .AsNoTracking()
            .Where(item => item.EmpresaId == empresaId)
            .OrderBy(item => item.NumeroPdv)
            .ThenBy(item => item.NomeTerminal)
            .ToListAsync();

        return terminals.Select(Map).ToArray();
    }

    public async Task<TerminalPdvCriadoDto> CreateAsync(CriarTerminalPdvRequest request)
    {
        EnsureTerminalManagementAccess();

        var empresaId = currentUser.GetEmpresaId();
        var nomeTerminal = NormalizeRequired(request.NomeTerminal, "Nome do terminal");
        var lojaNome = NormalizeOptional(request.LojaNome);
        var estadoUf = NormalizeUf(request.EstadoUf);
        var observacao = NormalizeOptional(request.Observacao);
        var perfilInstalacao = NormalizeInstallationProfile(request.PerfilInstalacao);
        var perfilImpressora = NormalizePrinterProfile(request.PerfilImpressora);
        var perfilScanner = NormalizeScannerProfile(request.PerfilScanner);
        var perfilTeclado = NormalizeKeyboardProfile(request.PerfilTeclado);
        var impressaoAutomatica = request.ImpressaoAutomatica ?? true;

        if (request.NumeroPdv <= 0)
        {
            throw new AppException("Numero do PDV deve ser maior que zero.");
        }

        var empresa = await dbContext.Empresas
            .AsNoTracking()
            .Where(item => item.EmpresaId == empresaId)
            .Select(item => new
            {
                NomeExibicao = item.NomeFantasia ?? item.Nome
            })
            .FirstOrDefaultAsync()
            ?? throw new NotFoundException("Empresa vinculada ao usuario nao encontrada.");

        var numeroPdvEmUso = await dbContext.TerminaisPdv
            .AsNoTracking()
            .AnyAsync(item => item.EmpresaId == empresaId && item.NumeroPdv == request.NumeroPdv);

        if (numeroPdvEmUso)
        {
            throw new AppException("Ja existe um terminal cadastrado com esse numero de PDV nesta empresa.");
        }

        var lojaNomeEfetivo = lojaNome ?? empresa.NomeExibicao;
        var codigoTerminal = await GenerateUniqueTerminalCodeAsync(
            empresa.NomeExibicao,
            lojaNomeEfetivo,
            estadoUf,
            request.NumeroPdv);

        var chaveAtivacao = GenerateActivationKey();
        var now = DateTime.UtcNow;

        var terminal = new TerminalPdv
        {
            TerminalPdvId = Guid.NewGuid(),
            EmpresaId = empresaId,
            CodigoTerminal = codigoTerminal,
            NomeTerminal = nomeTerminal,
            LojaNome = lojaNomeEfetivo,
            EstadoUf = estadoUf,
            NumeroPdv = request.NumeroPdv,
            PerfilInstalacao = perfilInstalacao,
            PerfilImpressora = perfilImpressora,
            PerfilScanner = perfilScanner,
            PerfilTeclado = perfilTeclado,
            ImpressaoAutomatica = impressaoAutomatica,
            Observacao = observacao,
            ChaveAtivacaoHash = HashActivationKey(chaveAtivacao),
            ChaveAtivacaoMascara = MaskActivationKey(chaveAtivacao),
            Ativo = true,
            Ativado = false,
            DataCadastro = now,
            ChaveGeradaEm = now
        };

        dbContext.TerminaisPdv.Add(terminal);
        await dbContext.SaveChangesAsync();

        return new TerminalPdvCriadoDto(Map(terminal), chaveAtivacao);
    }

    public async Task<TerminalPdvChaveRegeneradaDto> RegenerateActivationKeyAsync(Guid terminalId)
    {
        EnsureTerminalManagementAccess();

        var terminal = await GetManagedTerminalAsync(terminalId);
        var chaveAtivacao = GenerateActivationKey();

        terminal.ChaveAtivacaoHash = HashActivationKey(chaveAtivacao);
        terminal.ChaveAtivacaoMascara = MaskActivationKey(chaveAtivacao);
        terminal.ChaveGeradaEm = DateTime.UtcNow;

        await dbContext.SaveChangesAsync();

        return new TerminalPdvChaveRegeneradaDto(
            terminal.TerminalPdvId,
            terminal.CodigoTerminal,
            chaveAtivacao,
            terminal.ChaveAtivacaoMascara,
            terminal.ChaveGeradaEm);
    }

    public async Task<TerminalPdvDto> UpdateStatusAsync(Guid terminalId, AtualizarTerminalPdvStatusRequest request)
    {
        EnsureTerminalManagementAccess();

        var terminal = await GetManagedTerminalAsync(terminalId);
        terminal.Ativo = request.Ativo;

        if (!request.Ativo)
        {
            terminal.UltimaSincronizacaoEm = null;
        }

        await dbContext.SaveChangesAsync();
        return Map(terminal);
    }

    public async Task<TerminalPdvAtivacaoDto> ActivateAsync(AtivarTerminalPdvRequest request)
    {
        var codigoTerminal = NormalizeRequired(request.CodigoTerminal, "Codigo do terminal").ToUpperInvariant();
        var chaveAtivacao = NormalizeActivationKey(request.ChaveAtivacao);

        if (chaveAtivacao.Length < 8)
        {
            throw new UnauthorizedAppException("Codigo do terminal ou chave de ativacao invalidos.");
        }

        var terminal = await dbContext.TerminaisPdv
            .FirstOrDefaultAsync(item => item.CodigoTerminal == codigoTerminal)
            ?? throw new UnauthorizedAppException("Codigo do terminal ou chave de ativacao invalidos.");

        if (!terminal.Ativo)
        {
            throw new ForbiddenAppException("Este terminal esta desativado. Solicite nova liberacao ao administrador.");
        }

        if (!IsActivationKeyMatch(terminal.ChaveAtivacaoHash, chaveAtivacao))
        {
            throw new UnauthorizedAppException("Codigo do terminal ou chave de ativacao invalidos.");
        }

        var now = DateTime.UtcNow;
        terminal.Ativado = true;
        terminal.AtivadoEm ??= now;
        terminal.UltimaSincronizacaoEm = now;
        terminal.DispositivoIdentificador = NormalizeOptional(request.DispositivoIdentificador);
        terminal.NomeHost = NormalizeOptional(request.NomeHost);
        terminal.VersaoInstalador = NormalizeOptional(request.VersaoInstalador);
        terminal.VersaoAplicativo = NormalizeOptional(request.VersaoAplicativo);
        terminal.UltimoIp = currentUser.GetIpAddress();

        await dbContext.SaveChangesAsync();

        return new TerminalPdvAtivacaoDto(
            terminal.CodigoTerminal,
            terminal.NomeTerminal,
            terminal.LojaNome,
            terminal.EstadoUf,
            terminal.NumeroPdv,
            terminal.PerfilInstalacao,
            terminal.PerfilImpressora,
            terminal.PerfilScanner,
            terminal.PerfilTeclado,
            terminal.ImpressaoAutomatica,
            terminal.Ativo,
            terminal.Ativado,
            terminal.AtivadoEm,
            terminal.UltimaSincronizacaoEm ?? now);
    }

    private async Task<TerminalPdv> GetManagedTerminalAsync(Guid terminalId)
    {
        var empresaId = currentUser.GetEmpresaId();
        return await dbContext.TerminaisPdv
            .FirstOrDefaultAsync(item => item.TerminalPdvId == terminalId && item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Terminal nao encontrado para a empresa atual.");
    }

    private async Task<string> GenerateUniqueTerminalCodeAsync(
        string empresaNomeExibicao,
        string lojaNome,
        string? estadoUf,
        int numeroPdv)
    {
        var uf = string.IsNullOrWhiteSpace(estadoUf) ? "BR" : estadoUf.Trim().ToUpperInvariant();
        var empresaToken = ToAsciiToken(empresaNomeExibicao, 6, "EMP");
        var lojaToken = ToAsciiToken(lojaNome, 6, "LOJA");
        var nomeBase = string.Equals(empresaToken, lojaToken, StringComparison.Ordinal)
            ? empresaToken
            : $"{empresaToken}-{lojaToken}";

        var baseCode = $"{uf}-{nomeBase}-PDV-{numeroPdv:000}";
        var candidate = baseCode;
        var suffix = 2;

        while (await dbContext.TerminaisPdv.AsNoTracking().AnyAsync(item => item.CodigoTerminal == candidate))
        {
            candidate = $"{baseCode}-{suffix:00}";
            suffix++;
        }

        return candidate;
    }

    private static TerminalPdvDto Map(TerminalPdv item)
        => new(
            item.TerminalPdvId,
            item.EmpresaId,
            item.CodigoTerminal,
            item.NomeTerminal,
            item.LojaNome,
            item.EstadoUf,
            item.NumeroPdv,
            item.PerfilInstalacao,
            item.PerfilImpressora,
            item.PerfilScanner,
            item.PerfilTeclado,
            item.ImpressaoAutomatica,
            item.Observacao,
            item.ChaveAtivacaoMascara,
            item.Ativo,
            item.Ativado,
            item.DispositivoIdentificador,
            item.NomeHost,
            item.VersaoInstalador,
            item.VersaoAplicativo,
            item.UltimoIp,
            item.DataCadastro,
            item.ChaveGeradaEm,
            item.AtivadoEm,
            item.UltimaSincronizacaoEm);

    private void EnsureTerminalManagementAccess()
    {
        if (currentUser.IsMasterUser() || currentUser.HasPermission(Permissoes.GerenciarUsuarios))
        {
            return;
        }

        throw new ForbiddenAppException("Seu usuario nao possui permissao para administrar terminais e chaves de ativacao.");
    }

    private static string GenerateActivationKey()
    {
        Span<char> buffer = stackalloc char[16];
        for (var index = 0; index < buffer.Length; index++)
        {
            buffer[index] = ActivationAlphabet[RandomNumberGenerator.GetInt32(ActivationAlphabet.Length)];
        }

        return FormatActivationKey(new string(buffer));
    }

    private static string NormalizeInstallationProfile(string? value)
    {
        var normalized = NormalizeRequired(value, "Perfil de instalacao").ToUpperInvariant();
        if (AllowedInstallationProfiles.Contains(normalized))
        {
            return normalized;
        }

        throw new AppException("Perfil de instalacao do terminal invalido.");
    }

    private static string NormalizePrinterProfile(string? value)
    {
        var normalized = NormalizeOptional(value)?.ToUpperInvariant() ?? "TERMICA_80MM";
        if (AllowedPrinterProfiles.Contains(normalized))
        {
            return normalized;
        }

        throw new AppException("Perfil de impressora do terminal invalido.");
    }

    private static string NormalizeScannerProfile(string? value)
    {
        var normalized = NormalizeOptional(value)?.ToUpperInvariant() ?? "HIBRIDO";
        if (AllowedScannerProfiles.Contains(normalized))
        {
            return normalized;
        }

        throw new AppException("Perfil de scanner do terminal invalido.");
    }

    private static string NormalizeKeyboardProfile(string? value)
    {
        var normalized = NormalizeOptional(value)?.ToUpperInvariant() ?? "PADRAO_PDV";
        if (AllowedKeyboardProfiles.Contains(normalized))
        {
            return normalized;
        }

        throw new AppException("Perfil de teclado do terminal invalido.");
    }

    private static string? NormalizeUf(string? value)
    {
        var normalized = NormalizeOptional(value)?.ToUpperInvariant();
        if (normalized is null)
        {
            return null;
        }

        if (normalized.Length != 2)
        {
            throw new AppException("UF do terminal deve ter 2 caracteres.");
        }

        return normalized;
    }

    private static string NormalizeRequired(string? value, string fieldName)
    {
        var normalized = NormalizeOptional(value);
        if (!string.IsNullOrWhiteSpace(normalized))
        {
            return normalized;
        }

        throw new AppException($"{fieldName} e obrigatorio.");
    }

    private static string? NormalizeOptional(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string NormalizeActivationKey(string? value)
        => string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : new string(value
                .Trim()
                .ToUpperInvariant()
                .Where(char.IsLetterOrDigit)
                .ToArray());

    private static string HashActivationKey(string activationKey)
    {
        var normalized = NormalizeActivationKey(activationKey);
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(normalized));
        return Convert.ToHexString(bytes);
    }

    private static bool IsActivationKeyMatch(string storedHash, string activationKey)
    {
        var candidateHash = HashActivationKey(activationKey);
        var storedBytes = Encoding.UTF8.GetBytes(storedHash);
        var candidateBytes = Encoding.UTF8.GetBytes(candidateHash);
        return CryptographicOperations.FixedTimeEquals(storedBytes, candidateBytes);
    }

    private static string MaskActivationKey(string activationKey)
    {
        var normalized = NormalizeActivationKey(activationKey);
        var suffix = normalized.Length <= 4 ? normalized : normalized[^4..];
        return $"****-****-****-{suffix}";
    }

    private static string FormatActivationKey(string activationKey)
    {
        var normalized = NormalizeActivationKey(activationKey);
        return string.Join(
            '-',
            Enumerable.Range(0, (normalized.Length + 3) / 4)
                .Select(index =>
                {
                    var offset = index * 4;
                    var size = Math.Min(4, normalized.Length - offset);
                    return normalized.Substring(offset, size);
                }));
    }

    private static string ToAsciiToken(string value, int maxLength, string fallback)
    {
        var normalized = value.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(normalized.Length);

        foreach (var character in normalized)
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(character);
            if (category == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            if (char.IsLetterOrDigit(character))
            {
                builder.Append(char.ToUpperInvariant(character));
            }
        }

        if (builder.Length == 0)
        {
            return fallback;
        }

        return builder.Length <= maxLength
            ? builder.ToString()
            : builder.ToString(0, maxLength);
    }
}
