param(
  [string]$OutputDirectory = ".\.codex-temp\certificados-dev",
  [string]$Password = "pdv-dev-123",
  [string]$CommonName = "PDV Dev NF-e UI Test",
  [string]$Organization = "PDV Local Development",
  [int]$DaysValid = 365
)

$ErrorActionPreference = "Stop"

$resolvedOutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
[System.IO.Directory]::CreateDirectory($resolvedOutputDirectory) | Out-Null

$subject = "CN=$CommonName, O=$Organization, C=BR"
$notBefore = [System.DateTimeOffset]::UtcNow.AddDays(-1)
$notAfter = $notBefore.AddDays($DaysValid)
$passwordSecure = ConvertTo-SecureString -String $Password -AsPlainText -Force

$rsa = [System.Security.Cryptography.RSA]::Create(2048)
try {
  $request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
    $subject,
    $rsa,
    [System.Security.Cryptography.HashAlgorithmName]::SHA256,
    [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
  )

  $basicConstraints = [System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false, $false, 0, $true)
  $keyUsage = [System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new(
    [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature -bor
    [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyEncipherment,
    $true
  )

  $eku = [System.Security.Cryptography.OidCollection]::new()
  $eku.Add([System.Security.Cryptography.Oid]::new("1.3.6.1.5.5.7.3.2", "Client Authentication")) | Out-Null
  $eku.Add([System.Security.Cryptography.Oid]::new("1.3.6.1.5.5.7.3.4", "Secure Email")) | Out-Null
  $enhancedKeyUsage = [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($eku, $false)

  $subjectKeyIdentifier = [System.Security.Cryptography.X509Certificates.X509SubjectKeyIdentifierExtension]::new($request.PublicKey, $false)

  $request.CertificateExtensions.Add($basicConstraints)
  $request.CertificateExtensions.Add($keyUsage)
  $request.CertificateExtensions.Add($enhancedKeyUsage)
  $request.CertificateExtensions.Add($subjectKeyIdentifier)

  $certificate = $request.CreateSelfSigned($notBefore, $notAfter)
  try {
    $certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(
      $certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $Password),
      $Password,
      [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable
    )

    $baseName = "pdv-dev-nfe-test"
    $pfxPath = Join-Path $resolvedOutputDirectory "$baseName.pfx"
    $cerPath = Join-Path $resolvedOutputDirectory "$baseName.cer"
    $infoPath = Join-Path $resolvedOutputDirectory "$baseName.txt"

    [System.IO.File]::WriteAllBytes($pfxPath, $certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $Password))
    [System.IO.File]::WriteAllBytes($cerPath, $certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert))

    @(
      "CERTIFICADO DE DESENVOLVIMENTO - NAO ICP-BRASIL"
      ""
      "Uso esperado:"
      "- testar upload do arquivo na UI"
      "- testar armazenamento da senha"
      "- testar leitura local da chave privada"
      ""
      "Limites:"
      "- NAO sera aceito pela Nuvem Fiscal"
      "- NAO sera aceito pela SEFAZ"
      "- NAO substitui um certificado ICP-Brasil A1 real"
      ""
      "Assunto: $($certificate.Subject)"
      "Emitente: $($certificate.Issuer)"
      "Valido ate: $($certificate.NotAfter.ToString('yyyy-MM-dd HH:mm:ss'))"
      "Thumbprint: $($certificate.Thumbprint)"
      "Senha do PFX: $Password"
      "Arquivo PFX: $pfxPath"
      "Arquivo CER: $cerPath"
    ) | Set-Content -Path $infoPath -Encoding UTF8

    Write-Output "PFX: $pfxPath"
    Write-Output "CER: $cerPath"
    Write-Output "INFO: $infoPath"
    Write-Output "PASSWORD: $Password"
  }
  finally {
    $certificate.Dispose()
  }
}
finally {
  $rsa.Dispose()
}
