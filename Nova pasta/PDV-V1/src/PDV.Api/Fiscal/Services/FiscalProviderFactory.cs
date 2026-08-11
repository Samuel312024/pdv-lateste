using Microsoft.Extensions.DependencyInjection;
using PDV.Api.Common;
using PDV.Api.Domain;
using PDV.Api.Fiscal.Contracts;
using PDV.Api.Fiscal.DTOs;
using PDV.Api.Fiscal.Providers.FocusNFe;
using PDV.Api.Fiscal.Providers.NuvemFiscal;
using PDV.Api.Fiscal.Providers.PlugNotas;
using PDV.Api.Fiscal.Providers.SefazDirect;
using PDV.Api.Services;

namespace PDV.Api.Fiscal.Services;

public class FiscalProviderFactory(IServiceProvider serviceProvider, NfeCertificateService nfeCertificateService)
{
    public IFiscalProvider Create(Empresa empresa, FiscalProvider? overrideProvider = null)
    {
        var context = BuildContext(empresa, overrideProvider);
        return context.Provider switch
        {
            FiscalProvider.NuvemFiscal => ActivatorUtilities.CreateInstance<NuvemFiscalProvider>(serviceProvider, context),
            FiscalProvider.FocusNFe => ActivatorUtilities.CreateInstance<FocusNFeProvider>(serviceProvider, context),
            FiscalProvider.PlugNotas => ActivatorUtilities.CreateInstance<PlugNotasProvider>(serviceProvider, context),
            FiscalProvider.SefazDirect => ActivatorUtilities.CreateInstance<SefazDirectFiscalProvider>(serviceProvider, context),
            _ => throw new AppException("Provider fiscal configurado nao foi reconhecido.")
        };
    }

    private FiscalProviderContext BuildContext(Empresa empresa, FiscalProvider? overrideProvider)
    {
        var provider = overrideProvider ?? (empresa.UsaIntegracaoDiretaSefaz ? FiscalProvider.SefazDirect : empresa.ProviderFiscal);
        var usaIntegracaoDiretaSefaz = provider == FiscalProvider.SefazDirect;
        var cnpj = OnlyDigits(empresa.Cnpj)
            ?? throw new AppException("Configure o CNPJ da empresa antes de selecionar o provider fiscal.");
        var uf = NormalizeUf(empresa.Uf)
            ?? throw new AppException("Configure a UF da empresa antes de selecionar o provider fiscal.");
        var token = provider == FiscalProvider.SefazDirect
            ? null
            : nfeCertificateService.UnprotectSecret(empresa.TokenApiFiscalProtegido);
        var clientSecret = provider == FiscalProvider.SefazDirect
            ? null
            : nfeCertificateService.UnprotectSecret(empresa.ApiFiscalClientSecretProtegido);
        var certificatePassword = provider == FiscalProvider.SefazDirect
            ? null
            : nfeCertificateService.UnprotectSecret(empresa.CertificadoDigitalSenhaProtegida);

        return new FiscalProviderContext(
            empresa.EmpresaId,
            empresa.Nome,
            string.IsNullOrWhiteSpace(empresa.NomeFantasia) ? null : empresa.NomeFantasia.Trim(),
            cnpj,
            string.IsNullOrWhiteSpace(empresa.InscricaoEstadual) ? null : empresa.InscricaoEstadual.Trim(),
            empresa.InscricaoEstadualIsento,
            string.IsNullOrWhiteSpace(empresa.InscricaoMunicipal) ? null : empresa.InscricaoMunicipal.Trim(),
            string.IsNullOrWhiteSpace(empresa.Telefone) ? null : empresa.Telefone.Trim(),
            string.IsNullOrWhiteSpace(empresa.EmailFiscal) ? null : empresa.EmailFiscal.Trim(),
            uf,
            empresa.RegimeTributario,
            NfeCertificateService.NormalizePath(empresa.CertificadoDigitalCaminho),
            certificatePassword,
            BuildEnderecoEmitente(empresa, uf),
            empresa.AmbienteNfe,
            provider,
            usaIntegracaoDiretaSefaz,
            string.IsNullOrWhiteSpace(empresa.UrlApiFiscal) ? null : empresa.UrlApiFiscal.Trim(),
            token,
            string.IsNullOrWhiteSpace(empresa.ApiFiscalClientId) ? null : empresa.ApiFiscalClientId.Trim(),
            clientSecret);
    }

    private static string? NormalizeUf(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim().ToUpperInvariant();

    private static string? OnlyDigits(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var digits = new string(value.Where(char.IsDigit).ToArray());
        return digits.Length == 0 ? null : digits;
    }

    private static NFeEnderecoRequest? BuildEnderecoEmitente(Empresa empresa, string uf)
    {
        if (string.IsNullOrWhiteSpace(empresa.Logradouro)
            || string.IsNullOrWhiteSpace(empresa.Numero)
            || string.IsNullOrWhiteSpace(empresa.Bairro)
            || string.IsNullOrWhiteSpace(empresa.Cidade)
            || string.IsNullOrWhiteSpace(empresa.Cep)
            || string.IsNullOrWhiteSpace(empresa.CodigoMunicipioIbge))
        {
            return null;
        }

        return new NFeEnderecoRequest(
            empresa.Logradouro.Trim(),
            empresa.Numero.Trim(),
            string.IsNullOrWhiteSpace(empresa.Complemento) ? null : empresa.Complemento.Trim(),
            empresa.Bairro.Trim(),
            empresa.Cidade.Trim(),
            uf,
            empresa.Cep.Trim(),
            empresa.CodigoMunicipioIbge.Trim(),
            string.IsNullOrWhiteSpace(empresa.Telefone) ? null : empresa.Telefone.Trim());
    }
}
