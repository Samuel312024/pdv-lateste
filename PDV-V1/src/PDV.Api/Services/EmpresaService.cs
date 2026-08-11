using System.Net.Mail;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using PDV.Api.Common;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Fiscal.Services;
using PDV.Api.Infrastructure;

namespace PDV.Api.Services;

public class EmpresaService(
    AppDbContext dbContext,
    CurrentUserService currentUser,
    NfeCertificateService nfeCertificateService,
    MunicipioCatalogService municipioCatalogService,
    FiscalNfeService fiscalNfeService)
{
    public async Task<EmpresaFiscalDto> GetFiscalAsync()
    {
        var empresaId = currentUser.GetEmpresaId();
        var empresa = await dbContext.Empresas
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Empresa nao encontrada.");

        return await MapAsync(empresa);
    }

    public async Task<EmpresaFiscalDto> UpdateFiscalAsync(EmpresaFiscalRequest request)
    {
        var empresaId = currentUser.GetEmpresaId();
        var empresa = await dbContext.Empresas
            .FirstOrDefaultAsync(item => item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Empresa nao encontrada.");

        ApplyValidation(request);

        var certificadoDigitalCaminhoAnterior = empresa.CertificadoDigitalCaminho;
        empresa.Nome = request.Nome.Trim();
        empresa.NomeFantasia = NormalizeNullable(request.NomeFantasia);
        empresa.Cnpj = NormalizeDocument(request.Cnpj, 14, "CNPJ da empresa");
        empresa.InscricaoEstadualIsento = request.InscricaoEstadualIsento;
        empresa.InscricaoEstadual = request.InscricaoEstadualIsento
            ? null
            : NormalizeMaxLength(request.InscricaoEstadual, 20, "Inscricao estadual");
        empresa.InscricaoMunicipal = NormalizeMaxLength(request.InscricaoMunicipal, 20, "Inscricao municipal");
        empresa.CnaePrincipal = NormalizeMaxLength(request.CnaePrincipal, 20, "CNAE principal");
        empresa.Telefone = NormalizeMaxLength(request.Telefone, 20, "Telefone");
        empresa.EmailFiscal = NormalizeEmail(request.EmailFiscal);
        empresa.Cep = NormalizeDigitsWithLength(request.Cep, 8, "CEP");
        empresa.Logradouro = NormalizeMaxLength(request.Logradouro, 180, "Logradouro");
        empresa.Numero = NormalizeMaxLength(request.Numero, 20, "Numero");
        empresa.Complemento = NormalizeMaxLength(request.Complemento, 120, "Complemento");
        empresa.Bairro = NormalizeMaxLength(request.Bairro, 80, "Bairro");
        var cidade = NormalizeMaxLength(request.Cidade, 80, "Cidade");
        var uf = NormalizeUf(request.Uf);
        var codigoMunicipioIbge = NormalizeDigitsWithLength(request.CodigoMunicipioIbge, 7, "Codigo IBGE do municipio");
        var municipioResolution = await municipioCatalogService.ResolveForAddressAsync(cidade, uf, codigoMunicipioIbge);
        if (!municipioResolution.IsValid)
        {
            throw new AppException(municipioResolution.ErrorMessage ?? "Nao foi possivel validar o municipio informado.");
        }

        if (municipioResolution.Municipio is not null)
        {
            cidade = municipioResolution.Municipio.Nome;
            uf = municipioResolution.Municipio.Uf;
            codigoMunicipioIbge = municipioResolution.Municipio.CodigoIbge;
        }

        empresa.Cidade = cidade;
        empresa.Uf = uf;
        empresa.CodigoMunicipioIbge = codigoMunicipioIbge;
        empresa.CertificadoDigitalCaminho = NfeCertificateService.NormalizePath(request.CertificadoDigitalCaminho);
        empresa.RegimeTributario = ParseRegimeTributario(request.RegimeTributario);
        empresa.AmbienteNfe = ParseAmbienteFiscal(request.AmbienteNfe);
        empresa.ProviderFiscal = ParseFiscalProvider(request.ProviderFiscal);
        empresa.UsaIntegracaoDiretaSefaz = request.UsaIntegracaoDiretaSefaz || empresa.ProviderFiscal == FiscalProvider.SefazDirect;
        empresa.ApiFiscalClientId = NormalizeMaxLength(request.ApiFiscalClientId, 200, "Client ID da API fiscal");
        empresa.UrlApiFiscal = NormalizeMaxLength(request.UrlApiFiscal, 500, "URL da API fiscal");
        empresa.CobrancaDigitalProvider = ParseCobrancaDigitalProvider(request.CobrancaDigitalProvider);
        empresa.AmbienteCobrancaDigital = ParseAmbienteFiscal(request.AmbienteCobrancaDigital);
        empresa.ApiCobrancaClientId = NormalizeMaxLength(request.ApiCobrancaClientId, 200, "Client ID da cobranca digital");
        empresa.UrlApiCobranca = NormalizeMaxLength(request.UrlApiCobranca, 500, "URL da API de cobranca digital");
        empresa.DiasVencimentoCobranca = request.DiasVencimentoCobranca;
        empresa.SerieNfe = request.SerieNfe;
        empresa.ProximoNumeroNfe = request.ProximoNumeroNfe;

        if (!empresa.UsaIntegracaoDiretaSefaz)
        {
            if (empresa.ProviderFiscal == FiscalProvider.NuvemFiscal)
            {
                if (!string.IsNullOrWhiteSpace(request.ApiFiscalClientSecret))
                {
                    empresa.ApiFiscalClientSecretProtegido = nfeCertificateService.ProtectSecret(request.ApiFiscalClientSecret);
                }
                else if (string.IsNullOrWhiteSpace(empresa.ApiFiscalClientSecretProtegido) && string.IsNullOrWhiteSpace(empresa.TokenApiFiscalProtegido))
                {
                    throw new AppException("Informe o Client Secret da Nuvem Fiscal para o sistema gerar o token automaticamente.");
                }

                var hasClientId = !string.IsNullOrWhiteSpace(empresa.ApiFiscalClientId);
                var hasClientSecret = !string.IsNullOrWhiteSpace(empresa.ApiFiscalClientSecretProtegido);
                if (hasClientId != hasClientSecret)
                {
                    throw new AppException("A configuracao OAuth da Nuvem Fiscal esta incompleta. Informe Client ID e Client Secret juntos ou use apenas o token manual legado.");
                }
            }

            if (!string.IsNullOrWhiteSpace(request.TokenApiFiscal))
            {
                empresa.TokenApiFiscalProtegido = nfeCertificateService.ProtectSecret(request.TokenApiFiscal);
            }
            else if (empresa.ProviderFiscal != FiscalProvider.NuvemFiscal && string.IsNullOrWhiteSpace(empresa.TokenApiFiscalProtegido))
            {
                throw new AppException("Informe o token da API fiscal para usar a integracao REST externa.");
            }
        }

        if (empresa.CobrancaDigitalProvider == CobrancaDigitalProvider.Efi)
        {
            if (!string.IsNullOrWhiteSpace(request.ApiCobrancaClientSecret))
            {
                empresa.ApiCobrancaClientSecretProtegido = nfeCertificateService.ProtectSecret(request.ApiCobrancaClientSecret);
            }
            else if (string.IsNullOrWhiteSpace(empresa.ApiCobrancaClientSecretProtegido))
            {
                throw new AppException("Informe o Client Secret da cobranca digital Efí.");
            }

            if (string.IsNullOrWhiteSpace(empresa.ApiCobrancaClientId))
            {
                throw new AppException("Informe o Client ID da cobranca digital Efí.");
            }
        }

        if (empresa.CertificadoDigitalCaminho is null)
        {
            nfeCertificateService.DeleteManagedCertificateIfExists(certificadoDigitalCaminhoAnterior);
            empresa.CertificadoDigitalSenhaProtegida = null;
        }
        else
        {
            if (!string.IsNullOrWhiteSpace(request.SenhaCertificadoDigital))
            {
                nfeCertificateService.LoadFromPath(empresa.CertificadoDigitalCaminho, request.SenhaCertificadoDigital);
                empresa.CertificadoDigitalSenhaProtegida = nfeCertificateService.ProtectSecret(request.SenhaCertificadoDigital);
            }
            else if (string.IsNullOrWhiteSpace(empresa.CertificadoDigitalSenhaProtegida))
            {
                throw new AppException("Informe a senha do certificado digital da NF-e ao configurar o caminho do arquivo.");
            }

            using var certificate = nfeCertificateService.LoadFromEmpresa(empresa);
        }

        if (empresa.UsaIntegracaoDiretaSefaz &&
            (string.IsNullOrWhiteSpace(empresa.CertificadoDigitalCaminho) || string.IsNullOrWhiteSpace(empresa.CertificadoDigitalSenhaProtegida)))
        {
            throw new AppException("Configure certificado digital e senha para usar a integracao direta com a SEFAZ.");
        }

        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = empresa.EmpresaId,
            UsuarioId = currentUser.GetUserId(),
            Modulo = "Empresa",
            Acao = "AtualizacaoFiscal",
            Descricao = "Configuracao fiscal da empresa atualizada.",
            IpAddress = currentUser.GetIpAddress(),
            Dados = System.Text.Json.JsonSerializer.Serialize(new
            {
                empresa.RegimeTributario,
                empresa.AmbienteNfe,
                empresa.ProviderFiscal,
                empresa.UsaIntegracaoDiretaSefaz,
                empresa.ApiFiscalClientId,
                empresa.CobrancaDigitalProvider,
                empresa.AmbienteCobrancaDigital,
                empresa.ApiCobrancaClientId,
                empresa.DiasVencimentoCobranca,
                empresa.SerieNfe,
                empresa.ProximoNumeroNfe
            })
        });

        await dbContext.SaveChangesAsync();
        return await MapAsync(empresa);
    }

    public async Task<EmpresaFiscalCertificadoUploadDto> UploadFiscalCertificateAsync(IFormFile arquivo, CancellationToken cancellationToken = default)
    {
        var empresaId = currentUser.GetEmpresaId();
        var empresa = await dbContext.Empresas
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.EmpresaId == empresaId, cancellationToken)
            ?? throw new NotFoundException("Empresa nao encontrada.");

        var caminho = await nfeCertificateService.SaveUploadedCertificateAsync(empresa.EmpresaId, arquivo, cancellationToken);

        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = empresa.EmpresaId,
            UsuarioId = currentUser.GetUserId(),
            Modulo = "Empresa",
            Acao = "UploadCertificadoFiscal",
            Descricao = "Arquivo de certificado digital enviado para configuracao fiscal.",
            IpAddress = currentUser.GetIpAddress(),
            Dados = System.Text.Json.JsonSerializer.Serialize(new
            {
                NomeArquivoOriginal = arquivo.FileName,
                CaminhoGerenciado = caminho,
                arquivo.Length
            })
        });

        await dbContext.SaveChangesAsync(cancellationToken);

        return new EmpresaFiscalCertificadoUploadDto(
            caminho,
            Path.GetFileName(caminho),
            arquivo.Length);
    }

    public async Task<EmpresaFiscalCertificadoTesteDto> TestFiscalCertificateAsync(
        EmpresaFiscalCertificadoTesteRequest request,
        CancellationToken cancellationToken = default)
    {
        var empresaId = currentUser.GetEmpresaId();
        var empresa = await dbContext.Empresas
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.EmpresaId == empresaId, cancellationToken)
            ?? throw new NotFoundException("Empresa nao encontrada.");

        var caminhoSalvo = NfeCertificateService.NormalizePath(empresa.CertificadoDigitalCaminho);
        var caminho = NfeCertificateService.NormalizePath(request.Caminho) ?? caminhoSalvo;

        if (caminho is null)
        {
            return await RegisterCertificateTestResultAsync(
                empresa,
                false,
                "Selecione ou configure um certificado digital antes de testar.",
                null,
                cancellationToken);
        }

        try
        {
            var senha = !string.IsNullOrWhiteSpace(request.Senha)
                ? request.Senha.Trim()
                : string.Equals(caminho, caminhoSalvo, StringComparison.OrdinalIgnoreCase)
                    ? nfeCertificateService.UnprotectSecret(empresa.CertificadoDigitalSenhaProtegida)
                    : null;

            if (string.IsNullOrWhiteSpace(senha))
            {
                return await RegisterCertificateTestResultAsync(
                    empresa,
                    false,
                    "Informe a senha do certificado para testar o arquivo selecionado.",
                    caminho,
                    cancellationToken);
            }

            using var certificate = nfeCertificateService.LoadFromPath(caminho, senha);
            var expired = certificate.NotAfter.ToUniversalTime() <= DateTime.UtcNow;
            var compatibility = nfeCertificateService.AnalyzeCompatibility(certificate, empresa.Cnpj);
            var message = expired
                ? $"Certificado carregado e chave privada acessivel, mas ele esta vencido desde {certificate.NotAfter:dd/MM/yyyy}."
                : $"Certificado valido. Chave privada acessivel para assinatura local da NF-e ate {certificate.NotAfter:dd/MM/yyyy}.";

            return await RegisterCertificateTestResultAsync(
                empresa,
                !expired,
                message,
                caminho,
                cancellationToken,
                certificate.NotAfter,
                compatibility);
        }
        catch (AppException ex)
        {
            return await RegisterCertificateTestResultAsync(
                empresa,
                false,
                ex.Message,
                caminho,
                cancellationToken);
        }
    }

    public async Task<EmpresaFiscalSefazStatusDto> TestSefazStatusAsync(CancellationToken cancellationToken = default)
    {
        var empresaId = currentUser.GetEmpresaId();
        var empresa = await dbContext.Empresas
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.EmpresaId == empresaId, cancellationToken)
            ?? throw new NotFoundException("Empresa nao encontrada.");

        var response = await fiscalNfeService.ConsultarStatusServicoAsync(empresa, cancellationToken);

        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = empresa.EmpresaId,
            UsuarioId = currentUser.GetUserId(),
            Modulo = "Empresa",
            Acao = "TesteStatusSefaz",
            Descricao = response.Disponivel
                ? "Consulta de status da SEFAZ concluida com servico disponivel."
                : "Consulta de status da SEFAZ retornou indisponibilidade ou erro de transporte.",
            IpAddress = currentUser.GetIpAddress(),
            Dados = System.Text.Json.JsonSerializer.Serialize(response)
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        return response;
    }

    private static void ApplyValidation(EmpresaFiscalRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Nome))
        {
            throw new AppException("Razao social da empresa e obrigatoria.");
        }

        if (request.Nome.Trim().Length > 150)
        {
            throw new AppException("Razao social da empresa deve ter no maximo 150 caracteres.");
        }

        if (request.NomeFantasia?.Trim().Length > 150)
        {
            throw new AppException("Nome fantasia deve ter no maximo 150 caracteres.");
        }

        if (request.SerieNfe is < 1 or > 999)
        {
            throw new AppException("Serie padrao da NF-e deve estar entre 1 e 999.");
        }

        if (request.ProximoNumeroNfe is < 1 or > 999999999)
        {
            throw new AppException("Proximo numero da NF-e deve estar entre 1 e 999999999.");
        }

        _ = ParseRegimeTributario(request.RegimeTributario);
        _ = ParseAmbienteFiscal(request.AmbienteNfe);
        _ = ParseFiscalProvider(request.ProviderFiscal);
        _ = ParseCobrancaDigitalProvider(request.CobrancaDigitalProvider);

        if (request.DiasVencimentoCobranca is < 1 or > 120)
        {
            throw new AppException("Os dias padrao para vencimento da cobranca digital devem ficar entre 1 e 120.");
        }

        if (!request.InscricaoEstadualIsento && string.IsNullOrWhiteSpace(request.InscricaoEstadual))
        {
            throw new AppException("Informe a inscricao estadual ou marque a empresa como isenta.");
        }

        if (!request.UsaIntegracaoDiretaSefaz &&
            ParseFiscalProvider(request.ProviderFiscal) == FiscalProvider.NuvemFiscal &&
            string.IsNullOrWhiteSpace(request.ApiFiscalClientId) &&
            string.IsNullOrWhiteSpace(request.TokenApiFiscal))
        {
            throw new AppException("Informe o Client ID da Nuvem Fiscal ou um token manual legado.");
        }
    }

    private async Task<EmpresaFiscalDto> MapAsync(Empresa empresa)
    {
        var certificateInfo = nfeCertificateService.Describe(empresa);
        var pendencias = BuildPendencias(empresa, certificateInfo).ToList();
        var cobrancaDigitalPendencias = BuildCobrancaDigitalPendencias(empresa).ToList();
        var municipioResolution = await municipioCatalogService.ResolveForAddressAsync(empresa.Cidade, empresa.Uf, empresa.CodigoMunicipioIbge);
        if (municipioResolution.HasInput && !municipioResolution.IsValid && !string.IsNullOrWhiteSpace(municipioResolution.ErrorMessage))
        {
            pendencias.Add(municipioResolution.ErrorMessage);
        }

        var pendenciasNormalizadas = pendencias
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return new EmpresaFiscalDto(
            empresa.EmpresaId,
            empresa.Nome,
            empresa.NomeFantasia,
            empresa.Cnpj,
            empresa.InscricaoEstadual,
            empresa.InscricaoEstadualIsento,
            empresa.InscricaoMunicipal,
            empresa.CnaePrincipal,
            empresa.Telefone,
            empresa.EmailFiscal,
            empresa.Cep,
            empresa.Logradouro,
            empresa.Numero,
            empresa.Complemento,
            empresa.Bairro,
            empresa.Cidade,
            empresa.Uf,
            empresa.CodigoMunicipioIbge,
            certificateInfo.Caminho,
            certificateInfo.Configurado && certificateInfo.ErroValidacao is null,
            certificateInfo.ValidoAte,
            certificateInfo.ErroValidacao,
            empresa.RegimeTributario.ToString(),
            empresa.AmbienteNfe.ToString(),
            empresa.ProviderFiscal.ToString(),
            empresa.UsaIntegracaoDiretaSefaz,
            empresa.ApiFiscalClientId,
            !string.IsNullOrWhiteSpace(empresa.ApiFiscalClientSecretProtegido),
            empresa.UrlApiFiscal,
            !string.IsNullOrWhiteSpace(empresa.TokenApiFiscalProtegido),
            empresa.CobrancaDigitalProvider.ToString(),
            empresa.AmbienteCobrancaDigital.ToString(),
            empresa.ApiCobrancaClientId,
            !string.IsNullOrWhiteSpace(empresa.ApiCobrancaClientSecretProtegido),
            empresa.UrlApiCobranca,
            empresa.DiasVencimentoCobranca,
            cobrancaDigitalPendencias.Count == 0,
            cobrancaDigitalPendencias,
            empresa.SerieNfe,
            empresa.ProximoNumeroNfe,
            pendenciasNormalizadas.Length == 0,
            pendenciasNormalizadas);
    }

    private async Task<EmpresaFiscalCertificadoTesteDto> RegisterCertificateTestResultAsync(
        Empresa empresa,
        bool valido,
        string mensagem,
        string? caminho,
        CancellationToken cancellationToken,
        DateTime? validoAte = null,
        NfeCertificateCompatibilityReport? compatibility = null)
    {
        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = empresa.EmpresaId,
            UsuarioId = currentUser.GetUserId(),
            Modulo = "Empresa",
            Acao = "TesteCertificadoFiscal",
            Descricao = valido
                ? "Teste do certificado digital da NF-e concluido com sucesso."
                : "Teste do certificado digital da NF-e identificou pendencias.",
            IpAddress = currentUser.GetIpAddress(),
            Dados = System.Text.Json.JsonSerializer.Serialize(new
            {
                valido,
                mensagem,
                caminho,
                validoAte,
                compatibility
            })
        });

        await dbContext.SaveChangesAsync(cancellationToken);

        return new EmpresaFiscalCertificadoTesteDto(
            valido,
            mensagem,
            caminho,
            validoAte,
            compatibility?.ProvavelmenteCompativelIcpBrasilA1 ?? false,
            compatibility?.CertificadoDesenvolvimento ?? false,
            compatibility?.CnpjCertificado,
            compatibility?.CnpjConfereComEmpresa,
            compatibility?.Diagnostico);
    }

    private static IEnumerable<string> BuildPendencias(Empresa empresa, NfeCertificateInfo certificateInfo)
    {
        if (string.IsNullOrWhiteSpace(empresa.Nome))
        {
            yield return "Preencha a razao social da empresa.";
        }

        if (string.IsNullOrWhiteSpace(empresa.Cnpj))
        {
            yield return "Informe o CNPJ da empresa.";
        }

        if (!empresa.InscricaoEstadualIsento && string.IsNullOrWhiteSpace(empresa.InscricaoEstadual))
        {
            yield return "Informe a inscricao estadual ou marque a empresa como isenta.";
        }

        if (string.IsNullOrWhiteSpace(empresa.Cep))
        {
            yield return "Informe o CEP fiscal da empresa.";
        }

        if (string.IsNullOrWhiteSpace(empresa.Logradouro) || string.IsNullOrWhiteSpace(empresa.Numero))
        {
            yield return "Complete logradouro e numero do endereco fiscal.";
        }

        if (string.IsNullOrWhiteSpace(empresa.Bairro) || string.IsNullOrWhiteSpace(empresa.Cidade) || string.IsNullOrWhiteSpace(empresa.Uf))
        {
            yield return "Preencha bairro, cidade e UF do endereco fiscal.";
        }

        if (string.IsNullOrWhiteSpace(empresa.CodigoMunicipioIbge))
        {
            yield return "Informe o codigo IBGE do municipio da empresa.";
        }

        if (empresa.UsaIntegracaoDiretaSefaz || empresa.ProviderFiscal == FiscalProvider.SefazDirect)
        {
            if (string.IsNullOrWhiteSpace(empresa.CertificadoDigitalCaminho) || string.IsNullOrWhiteSpace(empresa.CertificadoDigitalSenhaProtegida))
            {
                yield return "Configure o caminho e a senha do certificado digital da NF-e para a integracao direta.";
            }
            else if (certificateInfo.ErroValidacao is not null)
            {
                yield return $"Certificado digital da NF-e invalido: {certificateInfo.ErroValidacao}";
            }
            else if (certificateInfo.ValidoAte.HasValue && certificateInfo.ValidoAte.Value <= DateTime.UtcNow)
            {
                yield return "O certificado digital da NF-e esta vencido.";
            }
        }
        else if (empresa.ProviderFiscal == FiscalProvider.NuvemFiscal)
        {
            var hasClientId = !string.IsNullOrWhiteSpace(empresa.ApiFiscalClientId);
            var hasClientSecret = !string.IsNullOrWhiteSpace(empresa.ApiFiscalClientSecretProtegido);
            var hasLegacyToken = !string.IsNullOrWhiteSpace(empresa.TokenApiFiscalProtegido);

            if (hasClientId != hasClientSecret)
            {
                yield return "A configuracao OAuth da Nuvem Fiscal esta incompleta. Informe Client ID e Client Secret juntos ou use apenas o token manual legado.";
            }

            if (!hasClientId && !hasClientSecret && !hasLegacyToken)
            {
                yield return "Informe Client ID e Client Secret da Nuvem Fiscal para gerar o token automaticamente, ou use um token manual legado.";
            }

            if (string.IsNullOrWhiteSpace(empresa.CertificadoDigitalCaminho) || string.IsNullOrWhiteSpace(empresa.CertificadoDigitalSenhaProtegida))
            {
                yield return "Configure certificado digital e senha locais da empresa para sincronizar o emitente com a Nuvem Fiscal.";
            }

            if (string.IsNullOrWhiteSpace(empresa.EmailFiscal))
            {
                yield return "Informe o e-mail fiscal da empresa para sincronizar o cadastro na Nuvem Fiscal.";
            }
        }
        else if (string.IsNullOrWhiteSpace(empresa.TokenApiFiscalProtegido))
        {
            yield return "Informe o token da API fiscal para usar a integracao REST externa.";
        }

        if (!empresa.UsaIntegracaoDiretaSefaz && empresa.ProviderFiscal == FiscalProvider.SefazDirect)
        {
            yield return "Selecione um provider REST ou ative a integracao direta com a SEFAZ.";
        }

        if (empresa.SerieNfe < 1)
        {
            yield return "Defina uma serie padrao valida para a NF-e.";
        }

        if (empresa.ProximoNumeroNfe < 1)
        {
            yield return "Defina o proximo numero da NF-e.";
        }
    }

    private static IReadOnlyCollection<string> BuildCobrancaDigitalPendencias(Empresa empresa)
    {
        var pendencias = new List<string>();

        if (empresa.CobrancaDigitalProvider == CobrancaDigitalProvider.Nenhum)
        {
            pendencias.Add("Selecione um provider para habilitar Pix e boleto integrados.");
            return pendencias;
        }

        if (empresa.CobrancaDigitalProvider == CobrancaDigitalProvider.Efi)
        {
            if (string.IsNullOrWhiteSpace(empresa.ApiCobrancaClientId))
            {
                pendencias.Add("Informe o Client ID da cobranca digital Efí.");
            }

            if (string.IsNullOrWhiteSpace(empresa.ApiCobrancaClientSecretProtegido))
            {
                pendencias.Add("Informe o Client Secret da cobranca digital Efí.");
            }
        }

        if (empresa.DiasVencimentoCobranca is < 1 or > 120)
        {
            pendencias.Add("Defina entre 1 e 120 dias como vencimento padrao da cobranca digital.");
        }

        return pendencias;
    }

    private static string? NormalizeNullable(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? NormalizeMaxLength(string? value, int maxLength, string fieldName)
    {
        var normalized = NormalizeNullable(value);
        if (normalized is not null && normalized.Length > maxLength)
        {
            throw new AppException($"{fieldName} deve ter no maximo {maxLength} caracteres.");
        }

        return normalized;
    }

    private static string? NormalizeDocument(string? value, int expectedLength, string fieldName)
    {
        var normalized = NormalizeNullable(value);
        if (normalized is null)
        {
            return null;
        }

        var digits = OnlyDigits(normalized);
        if (digits.Length != expectedLength)
        {
            throw new AppException($"{fieldName} deve conter {expectedLength} digitos.");
        }

        return digits;
    }

    private static string? NormalizeDigitsWithLength(string? value, int expectedLength, string fieldName)
    {
        var normalized = NormalizeNullable(value);
        if (normalized is null)
        {
            return null;
        }

        var digits = OnlyDigits(normalized);
        if (digits.Length != expectedLength)
        {
            throw new AppException($"{fieldName} deve conter {expectedLength} digitos.");
        }

        return digits;
    }

    private static string? NormalizeEmail(string? value)
    {
        var normalized = NormalizeNullable(value);
        if (normalized is null)
        {
            return null;
        }

        if (normalized.Length > 150)
        {
            throw new AppException("E-mail fiscal deve ter no maximo 150 caracteres.");
        }

        try
        {
            _ = new MailAddress(normalized);
            return normalized;
        }
        catch (FormatException)
        {
            throw new AppException("E-mail fiscal invalido.");
        }
    }

    private static string? NormalizeUf(string? value)
    {
        var normalized = NormalizeNullable(value);
        if (normalized is null)
        {
            return null;
        }

        normalized = normalized.ToUpperInvariant();
        if (normalized.Length != 2)
        {
            throw new AppException("UF deve conter 2 caracteres.");
        }

        return normalized;
    }

    private static EmpresaRegimeTributario ParseRegimeTributario(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new AppException("Regime tributario invalido.");
        }

        if (!Enum.TryParse<EmpresaRegimeTributario>(value.Trim(), true, out var parsed))
        {
            throw new AppException("Regime tributario invalido.");
        }

        return parsed;
    }

    private static AmbienteFiscal ParseAmbienteFiscal(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new AppException("Ambiente fiscal invalido.");
        }

        if (!Enum.TryParse<AmbienteFiscal>(value.Trim(), true, out var parsed))
        {
            throw new AppException("Ambiente fiscal invalido.");
        }

        return parsed;
    }

    private static FiscalProvider ParseFiscalProvider(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new AppException("Provider fiscal invalido.");
        }

        if (!Enum.TryParse<FiscalProvider>(value.Trim(), true, out var parsed))
        {
            throw new AppException("Provider fiscal invalido.");
        }

        return parsed;
    }

    private static CobrancaDigitalProvider ParseCobrancaDigitalProvider(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new AppException("Provider da cobranca digital invalido.");
        }

        if (!Enum.TryParse<CobrancaDigitalProvider>(value.Trim(), true, out var parsed))
        {
            throw new AppException("Provider da cobranca digital invalido.");
        }

        return parsed;
    }

    private static string OnlyDigits(string value)
        => new(value.Where(char.IsDigit).ToArray());
}
