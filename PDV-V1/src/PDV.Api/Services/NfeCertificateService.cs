using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Security.Principal;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.DataProtection;
using PDV.Api.Common;
using PDV.Api.Domain;

namespace PDV.Api.Services;

public sealed record NfeCertificateInfo(
    bool Configurado,
    string? Caminho,
    DateTime? ValidoAte,
    string? ErroValidacao);

public sealed record NfeCertificateCompatibilityReport(
    bool ProvavelmenteCompativelIcpBrasilA1,
    bool CertificadoDesenvolvimento,
    string? CnpjCertificado,
    bool? CnpjConfereComEmpresa,
    string Diagnostico);

public class NfeCertificateService(IDataProtectionProvider dataProtectionProvider, IHostEnvironment environment)
{
    private const long MaxCertificateSizeBytes = 5 * 1024 * 1024;
    private static readonly byte[] PrivateKeyValidationPayload = [0x50, 0x44, 0x56, 0x2D, 0x4E, 0x46, 0x45];
    private readonly IDataProtector _protector = dataProtectionProvider.CreateProtector("PDV.Api.NFe.Certificate.Secret");
    private readonly string _managedCertificatesRoot = Path.Combine(environment.ContentRootPath, ".nfe-certificados");
    private readonly X509KeyStorageFlags _preferredKeyStorageFlags = environment.IsDevelopment()
        ? X509KeyStorageFlags.Exportable | X509KeyStorageFlags.UserKeySet | X509KeyStorageFlags.PersistKeySet
        : X509KeyStorageFlags.Exportable | X509KeyStorageFlags.MachineKeySet | X509KeyStorageFlags.PersistKeySet;
    private readonly string _keyStorageModeDescription = environment.IsDevelopment()
        ? "UserKeySet + PersistKeySet + Exportable (Development)"
        : "MachineKeySet + PersistKeySet + Exportable";

    public string KeyStorageModeDescription => _keyStorageModeDescription;

    public string ExecutionIdentityDisplay => GetExecutionIdentityDisplay();

    public string? ProtectSecret(string? secret)
        => string.IsNullOrWhiteSpace(secret) ? null : _protector.Protect(secret.Trim());

    public string? UnprotectSecret(string? protectedSecret)
    {
        if (string.IsNullOrWhiteSpace(protectedSecret))
        {
            return null;
        }

        try
        {
            return _protector.Unprotect(protectedSecret);
        }
        catch (Exception ex)
        {
            throw new AppException($"Nao foi possivel ler a senha protegida do certificado digital: {ex.Message}");
        }
    }

    public NfeCertificateInfo Describe(Empresa empresa)
    {
        var caminho = NormalizePath(empresa.CertificadoDigitalCaminho);
        if (caminho is null || string.IsNullOrWhiteSpace(empresa.CertificadoDigitalSenhaProtegida))
        {
            return new NfeCertificateInfo(false, caminho, null, null);
        }

        try
        {
            using var certificate = LoadFromEmpresa(empresa);
            return new NfeCertificateInfo(true, caminho, certificate.NotAfter, null);
        }
        catch (Exception ex)
        {
            return new NfeCertificateInfo(true, caminho, null, ex.Message);
        }
    }

    public X509Certificate2 LoadFromEmpresa(Empresa empresa)
    {
        var caminho = NormalizePath(empresa.CertificadoDigitalCaminho)
            ?? throw new AppException("Configure o caminho do certificado digital da NF-e na empresa.");
        var senha = UnprotectSecret(empresa.CertificadoDigitalSenhaProtegida)
            ?? throw new AppException("Configure a senha do certificado digital da NF-e na empresa.");

        return LoadFromPath(caminho, senha);
    }

    public X509Certificate2 LoadFromPath(string path, string password)
    {
        var normalizedPath = NormalizePath(path)
            ?? throw new AppException("Informe o caminho do certificado digital da NF-e.");

        if (!File.Exists(normalizedPath))
        {
            throw new AppException($"O certificado digital nao foi encontrado em '{normalizedPath}'.");
        }

        try
        {
            var certificate = LoadPkcs12WithPreferredStorage(normalizedPath, password);

            if (!certificate.HasPrivateKey)
            {
                throw new AppException("O certificado digital informado nao possui chave privada para assinatura da NF-e.");
            }

            ValidatePrivateKeyForSigning(certificate);
            return certificate;
        }
        catch (CryptographicException ex)
        {
            throw new AppException($"Nao foi possivel abrir o certificado digital informado: {ex.Message}");
        }
    }

    public RSA OpenPrivateKeyForSigning(X509Certificate2 certificate)
    {
        try
        {
            return certificate.GetRSAPrivateKey()
                ?? throw new AppException("O certificado digital informado nao possui chave RSA privada para assinatura da NF-e.");
        }
        catch (CryptographicException ex)
        {
            throw new AppException(BuildPrivateKeyAccessErrorMessage(ex));
        }
    }

    public void ValidatePrivateKeyForSigning(X509Certificate2 certificate)
    {
        using var signingKey = OpenPrivateKeyForSigning(certificate);

        try
        {
            _ = signingKey.SignData(PrivateKeyValidationPayload, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        }
        catch (CryptographicException ex)
        {
            throw new AppException(BuildPrivateKeyAccessErrorMessage(ex));
        }
    }

    public NfeCertificateCompatibilityReport AnalyzeCompatibility(
        X509Certificate2 certificate,
        string? expectedCompanyCnpj = null)
    {
        var normalizedExpectedCnpj = NormalizeDigits(expectedCompanyCnpj);
        var certificateCnpj = TryExtractCertificateCnpj(certificate);
        bool? cnpjMatches = !string.IsNullOrWhiteSpace(normalizedExpectedCnpj) && !string.IsNullOrWhiteSpace(certificateCnpj)
            ? string.Equals(normalizedExpectedCnpj, certificateCnpj, StringComparison.Ordinal)
            : null;

        var issuerHintsIcpBrasil = ContainsIcpBrasilMarker(certificate.Issuer) || ContainsIcpBrasilMarker(certificate.Subject);
        var chainSubjects = GetChainSubjects(certificate);
        var chainHintsIcpBrasil = chainSubjects.Any(ContainsIcpBrasilMarker);
        var isSelfSigned = string.Equals(certificate.Subject, certificate.Issuer, StringComparison.OrdinalIgnoreCase);
        var certificateName = certificate.GetNameInfo(X509NameType.SimpleName, false);
        var developmentCertificate =
            isSelfSigned
            || ContainsDevelopmentMarker(certificate.Subject)
            || ContainsDevelopmentMarker(certificate.Issuer)
            || ContainsDevelopmentMarker(certificateName);

        var probablyCompatible = !developmentCertificate && (issuerHintsIcpBrasil || chainHintsIcpBrasil);
        if (cnpjMatches == false)
        {
            probablyCompatible = false;
        }

        var diagnostics = new List<string>();
        if (probablyCompatible)
        {
            diagnostics.Add("A cadeia local do certificado apresenta indicios compativeis com ICP-Brasil.");
        }
        else
        {
            diagnostics.Add("O arquivo abriu e a chave privada respondeu, mas ele nao aparenta ser um certificado ICP-Brasil A1 aceito pela Nuvem Fiscal/SEFAZ.");
        }

        if (developmentCertificate)
        {
            diagnostics.Add("Ele parece um certificado de desenvolvimento/self-signed, util apenas para testar UI e assinatura local.");
        }
        else if (!issuerHintsIcpBrasil && !chainHintsIcpBrasil)
        {
            diagnostics.Add("Emissor e cadeia local nao mencionam ICP-Brasil.");
        }

        if (!string.IsNullOrWhiteSpace(certificateCnpj))
        {
            diagnostics.Add($"CNPJ identificado no certificado: {FormatCnpj(certificateCnpj)}.");
        }

        if (cnpjMatches == false)
        {
            diagnostics.Add($"Esse CNPJ nao confere com o CNPJ fiscal da empresa ({FormatCnpj(normalizedExpectedCnpj!)}).");
        }
        else if (!string.IsNullOrWhiteSpace(normalizedExpectedCnpj) && string.IsNullOrWhiteSpace(certificateCnpj))
        {
            diagnostics.Add("Nao foi possivel identificar um CNPJ do emitente nas informacoes locais do certificado para comparar com a empresa.");
        }

        if (chainSubjects.Count > 0)
        {
            diagnostics.Add($"Cadeia local observada: {string.Join(" -> ", chainSubjects.Take(3))}.");
        }

        return new NfeCertificateCompatibilityReport(
            probablyCompatible,
            developmentCertificate,
            certificateCnpj,
            cnpjMatches,
            string.Join(" ", diagnostics));
    }

    public string BuildPrivateKeyAccessErrorMessage(Exception exception)
    {
        if (IsMissingPrivateKeyAccess(exception))
        {
            return $"A conta do Windows que executa a API ({GetExecutionIdentityDisplay()}) nao conseguiu acessar a chave privada do certificado digital carregado com {_keyStorageModeDescription}. Reimporte o arquivo PFX na empresa ou ajuste a permissao da chave para esse usuario do servidor.";
        }

        return $"Nao foi possivel usar a chave privada do certificado digital da NF-e com {_keyStorageModeDescription}. Processo atual: {GetExecutionIdentityDisplay()}. Detalhe: {GetRelevantExceptionMessage(exception)}";
    }

    public async Task<string> SaveUploadedCertificateAsync(Guid empresaId, IFormFile arquivo, CancellationToken cancellationToken = default)
    {
        if (arquivo.Length <= 0)
        {
            throw new AppException("Selecione um arquivo PFX valido para o certificado digital.");
        }

        if (arquivo.Length > MaxCertificateSizeBytes)
        {
            throw new AppException("O certificado digital excede o limite de 5 MB suportado pelo sistema.");
        }

        var extension = Path.GetExtension(arquivo.FileName);
        if (!IsSupportedCertificateExtension(extension))
        {
            throw new AppException("Envie um certificado digital no formato .pfx ou .p12.");
        }

        var empresaDirectory = Path.Combine(_managedCertificatesRoot, empresaId.ToString("N"));
        Directory.CreateDirectory(empresaDirectory);

        var normalizedExtension = extension.ToLowerInvariant();
        var destinationPath = Path.Combine(empresaDirectory, $"certificado-digital{normalizedExtension}");
        var temporaryPath = $"{destinationPath}.uploading";

        try
        {
            await using (var targetStream = new FileStream(temporaryPath, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                await arquivo.CopyToAsync(targetStream, cancellationToken);
            }

            if (File.Exists(destinationPath))
            {
                File.Delete(destinationPath);
            }

            File.Move(temporaryPath, destinationPath);
            DeleteSiblingManagedCertificates(empresaDirectory, destinationPath);
            return destinationPath;
        }
        catch
        {
            if (File.Exists(temporaryPath))
            {
                File.Delete(temporaryPath);
            }

            throw;
        }
    }

    public void DeleteManagedCertificateIfExists(string? path)
    {
        var normalizedPath = NormalizePath(path);
        if (normalizedPath is null)
        {
            return;
        }

        var fullPath = Path.GetFullPath(normalizedPath);
        var managedRoot = Path.GetFullPath(_managedCertificatesRoot);
        if (!fullPath.StartsWith(managedRoot, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        if (File.Exists(fullPath))
        {
            File.Delete(fullPath);
        }

        var directory = Path.GetDirectoryName(fullPath);
        if (directory is not null
            && Directory.Exists(directory)
            && !Directory.EnumerateFileSystemEntries(directory).Any())
        {
            Directory.Delete(directory);
        }
    }

    public static string? NormalizePath(string? path)
        => string.IsNullOrWhiteSpace(path) ? null : path.Trim();

    private X509Certificate2 LoadPkcs12WithPreferredStorage(string normalizedPath, string password)
    {
        try
        {
            return X509CertificateLoader.LoadPkcs12FromFile(normalizedPath, password, _preferredKeyStorageFlags);
        }
        catch (CryptographicException ex)
        {
            throw new AppException(
                $"Nao foi possivel abrir o certificado digital informado usando {_keyStorageModeDescription}. "
                + $"Processo atual: {GetExecutionIdentityDisplay()}. Detalhe: {GetRelevantExceptionMessage(ex)}");
        }
    }

    private static bool IsMissingPrivateKeyAccess(Exception exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (current is CryptographicException cryptographicException
                && (cryptographicException.HResult == unchecked((int)0x80090016)
                    || cryptographicException.Message.Contains("conjunto de chaves", StringComparison.OrdinalIgnoreCase)
                    || cryptographicException.Message.Contains("keyset does not exist", StringComparison.OrdinalIgnoreCase)))
            {
                return true;
            }
        }

        return false;
    }

    private static string GetRelevantExceptionMessage(Exception exception)
    {
        string? fallback = null;

        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (!string.IsNullOrWhiteSpace(current.Message))
            {
                fallback = current.Message.Trim();
            }
        }

        return fallback ?? "falha desconhecida ao abrir a chave privada";
    }

    private static string GetExecutionIdentityDisplay()
    {
        try
        {
            if (OperatingSystem.IsWindows())
            {
                var identity = WindowsIdentity.GetCurrent();
                if (!string.IsNullOrWhiteSpace(identity?.Name))
                {
                    return identity.Name;
                }
            }
        }
        catch
        {
            // Fallback below.
        }

        if (!string.IsNullOrWhiteSpace(Environment.UserDomainName) && !string.IsNullOrWhiteSpace(Environment.UserName))
        {
            return $"{Environment.UserDomainName}\\{Environment.UserName}";
        }

        return Environment.UserName;
    }

    private static bool IsSupportedCertificateExtension(string? extension)
        => string.Equals(extension, ".pfx", StringComparison.OrdinalIgnoreCase)
            || string.Equals(extension, ".p12", StringComparison.OrdinalIgnoreCase);

    private static IReadOnlyList<string> GetChainSubjects(X509Certificate2 certificate)
    {
        try
        {
            using var chain = new X509Chain();
            chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
            chain.ChainPolicy.VerificationFlags =
                X509VerificationFlags.AllowUnknownCertificateAuthority
                | X509VerificationFlags.IgnoreCertificateAuthorityRevocationUnknown
                | X509VerificationFlags.IgnoreCtlSignerRevocationUnknown
                | X509VerificationFlags.IgnoreEndRevocationUnknown
                | X509VerificationFlags.IgnoreRootRevocationUnknown;
            chain.Build(certificate);

            return chain.ChainElements
                .Cast<X509ChainElement>()
                .Select(item => item.Certificate.Subject)
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }
        catch
        {
            return [];
        }
    }

    private static bool ContainsIcpBrasilMarker(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        return value.Contains("ICP-Brasil", StringComparison.OrdinalIgnoreCase)
            || value.Contains("ICP Brasil", StringComparison.OrdinalIgnoreCase);
    }

    private static bool ContainsDevelopmentMarker(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        return value.Contains("DESENV", StringComparison.OrdinalIgnoreCase)
            || value.Contains("DEVELOP", StringComparison.OrdinalIgnoreCase)
            || value.Contains("HOMOLOG", StringComparison.OrdinalIgnoreCase)
            || value.Contains("TESTE", StringComparison.OrdinalIgnoreCase)
            || value.Contains("SELF", StringComparison.OrdinalIgnoreCase);
    }

    private static string? TryExtractCertificateCnpj(X509Certificate2 certificate)
    {
        var texts = new List<string?>
        {
            certificate.Subject,
            certificate.SubjectName.Name,
            certificate.Issuer,
            certificate.GetNameInfo(X509NameType.SimpleName, false),
            certificate.GetNameInfo(X509NameType.EmailName, false)
        };

        texts.AddRange(certificate.Extensions
            .Cast<X509Extension>()
            .Select(extension => extension.Format(multiLine: true)));

        foreach (var text in texts)
        {
            if (string.IsNullOrWhiteSpace(text))
            {
                continue;
            }

            foreach (Match match in Regex.Matches(text, @"\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}|\d{14}"))
            {
                var digits = NormalizeDigits(match.Value);
                if (digits is not null && digits.Length == 14 && IsValidCnpj(digits))
                {
                    return digits;
                }
            }
        }

        return null;
    }

    private static string? NormalizeDigits(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var digits = new string(value.Where(char.IsDigit).ToArray());
        return digits.Length == 0 ? null : digits;
    }

    private static string FormatCnpj(string value)
        => value.Length == 14
            ? $"{value[..2]}.{value[2..5]}.{value[5..8]}/{value[8..12]}-{value[12..]}"
            : value;

    private static bool IsValidCnpj(string cnpj)
    {
        if (cnpj.Length != 14 || cnpj.Distinct().Count() == 1)
        {
            return false;
        }

        var numbers = cnpj.Select(item => item - '0').ToArray();
        var firstMultiplier = new[] { 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2 };
        var secondMultiplier = new[] { 6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2 };

        var sum = firstMultiplier.Select((multiplier, index) => multiplier * numbers[index]).Sum();
        var remainder = sum % 11;
        var firstDigit = remainder < 2 ? 0 : 11 - remainder;
        if (numbers[12] != firstDigit)
        {
            return false;
        }

        sum = secondMultiplier.Select((multiplier, index) => multiplier * numbers[index]).Sum();
        remainder = sum % 11;
        var secondDigit = remainder < 2 ? 0 : 11 - remainder;
        return numbers[13] == secondDigit;
    }

    private static void DeleteSiblingManagedCertificates(string directoryPath, string currentDestinationPath)
    {
        foreach (var existingPath in Directory.EnumerateFiles(directoryPath, "certificado-digital.*"))
        {
            if (!string.Equals(existingPath, currentDestinationPath, StringComparison.OrdinalIgnoreCase)
                && File.Exists(existingPath))
            {
                File.Delete(existingPath);
            }
        }
    }
}
