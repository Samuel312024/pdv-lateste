using System.ComponentModel;
using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Security.Cryptography.Xml;
using System.Text;
using System.Text.Json;
using System.Xml;
using System.Xml.Linq;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PDV.Api.Common;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Infrastructure;

namespace PDV.Api.Services;

public class NfeTransmissionService(
    AppDbContext dbContext,
    CurrentUserService currentUser,
    NfeCertificateService nfeCertificateService,
    NfeSefazEndpointResolver endpointResolver,
    MunicipioCatalogService municipioCatalogService,
    IOptions<NfeSefazOptions> nfeSefazOptions)
{
    private const string NfeNamespace = "http://www.portalfiscal.inf.br/nfe";
    private const string Soap11Namespace = "http://schemas.xmlsoap.org/soap/envelope/";
    private const string Soap12Namespace = "http://www.w3.org/2003/05/soap-envelope";
    private const string XmlSignatureNamespace = SignedXml.XmlDsigNamespaceUrl;
    private const string HomologacaoDestinatario = "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";
    private const string HomologacaoCnpjDestinatario = "99999999000191";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly SoapRequestVariant[] SoapRequestVariants =
    [
        new("SOAP 1.2 · nfeDadosMsg direto · sem cabecalho", SoapEnvelopeKind.Soap12, SoapBodyKind.DirectDataMessage, false, false, true),
        new("SOAP 1.2 · nfeDadosMsg direto · com SOAPAction", SoapEnvelopeKind.Soap12, SoapBodyKind.DirectDataMessage, false, true, true),
        new("SOAP 1.2 · nfeDadosMsg direto · com nfeCabecMsg", SoapEnvelopeKind.Soap12, SoapBodyKind.DirectDataMessage, true, true, true),
        new("SOAP 1.1 · nfeDadosMsg direto · com nfeCabecMsg", SoapEnvelopeKind.Soap11, SoapBodyKind.DirectDataMessage, true, true, false),
        new("SOAP 1.2 · wrapper do servico · sem cabecalho", SoapEnvelopeKind.Soap12, SoapBodyKind.OperationWrapper, false, true, true)
    ];

    public async Task<EmpresaFiscalSefazStatusDto> ConsultarStatusServicoAsync(
        Empresa empresa,
        CancellationToken cancellationToken = default)
    {
        var ambiente = empresa.AmbienteNfe;
        var uf = empresa.Uf
            ?? throw new AppException("Empresa sem UF fiscal definida para consultar o status da SEFAZ.");
        var consultadoEmUtc = DateTime.UtcNow;
        var endpoints = endpointResolver.Resolve(uf, ambiente);
        SoapTransportDiagnostic? diagnostico = null;

        try
        {
            using var certificate = nfeCertificateService.LoadFromEmpresa(empresa);
            var request = BuildConsStatServDocument(ambiente, uf);
            var diagnosticResult = await SendSoapWithDiagnosticsAsync(
                endpoints.StatusServicoUrl,
                "NFeStatusServico4",
                uf,
                request.Root!,
                certificate,
                cancellationToken);
            var response = diagnosticResult.Response;
            diagnostico = diagnosticResult.Diagnostic;

            var retorno = GetPayloadElement(response, "retConsStatServ")
                ?? throw new AppException("A SEFAZ nao retornou o envelope esperado para a consulta de status do servico.");

            var codigoStatus = GetIntValue(retorno, "cStat");
            var mensagem = GetValue(retorno, "xMotivo") ?? "A SEFAZ respondeu sem mensagem de status.";
            var dataRecebimento = ParseSefazDate(GetValue(retorno, "dhRecbto"));
            diagnostico.Etapa = "RespostaFiscal";
            diagnostico.Resumo = codigoStatus.HasValue
                ? $"A SEFAZ respondeu ao status do servico com cStat {codigoStatus.Value}."
                : "A SEFAZ respondeu ao status do servico, mas sem cStat identificavel.";
            diagnostico.CausaProvavel = codigoStatus == 107
                ? "Canal TLS, autenticacao do certificado cliente e operacao SOAP responderam normalmente."
                : "O transporte HTTPS concluiu e a SEFAZ respondeu em XML. Qualquer indisponibilidade restante ja e do proprio servico fiscal.";
            diagnostico.DetalheTecnico = BuildResponsePreview(retorno.ToString(SaveOptions.DisableFormatting), 480);

            return new EmpresaFiscalSefazStatusDto(
                codigoStatus == 107,
                codigoStatus,
                mensagem,
                FiscalProvider.SefazDirect.ToString(),
                true,
                ambiente.ToString(),
                uf,
                endpoints.StatusServicoUrl,
                dataRecebimento,
                consultadoEmUtc,
                MapTransportDiagnostic(diagnostico));
        }
        catch (SoapTransportException ex)
        {
            return new EmpresaFiscalSefazStatusDto(
                false,
                null,
                ex.Message,
                FiscalProvider.SefazDirect.ToString(),
                true,
                ambiente.ToString(),
                uf,
                endpoints.StatusServicoUrl,
                null,
                consultadoEmUtc,
                MapTransportDiagnostic(ex.Diagnostic));
        }
        catch (AppException ex)
        {
            return new EmpresaFiscalSefazStatusDto(
                false,
                null,
                ex.Message,
                FiscalProvider.SefazDirect.ToString(),
                true,
                ambiente.ToString(),
                uf,
                endpoints.StatusServicoUrl,
                null,
                consultadoEmUtc,
                MapTransportDiagnostic(diagnostico));
        }
    }

    public async Task<NotaFiscal> TransmitirAsync(Guid notaFiscalId, CancellationToken cancellationToken = default)
    {
        var empresaId = currentUser.GetEmpresaId();
        var usuarioId = currentUser.GetUserId();

        var nota = await dbContext.NotasFiscais
            .Include(item => item.Itens)
            .Include(item => item.Venda)
                .ThenInclude(item => item!.Pagamentos)
            .Include(item => item.Venda)
                .ThenInclude(item => item!.Cliente)
            .Include(item => item.Cliente)
            .FirstOrDefaultAsync(item => item.NotaFiscalId == notaFiscalId && item.EmpresaId == empresaId, cancellationToken)
            ?? throw new NotFoundException("NF-e nao encontrada para transmissao.");

        var empresa = await dbContext.Empresas
            .FirstOrDefaultAsync(item => item.EmpresaId == empresaId, cancellationToken)
            ?? throw new NotFoundException("Empresa emissora nao encontrada.");

        if (nota.Status == NotaFiscalStatus.Cancelada)
        {
            throw new AppException("NF-e cancelada nao pode ser transmitida.");
        }

        if (nota.Status == NotaFiscalStatus.Autorizada)
        {
            return nota;
        }

        var venda = nota.Venda ?? throw new AppException("Somente NF-e originadas de venda podem ser transmitidas nesta etapa.");
        if (venda.Pagamentos.Count == 0)
        {
            throw new AppException("A venda vinculada a NF-e nao possui pagamentos para compor o XML fiscal.");
        }

        RefreshNotaSnapshot(nota, empresa, venda);
        var pendencias = (await BuildTransmissionPendenciasAsync(empresa, nota, venda, cancellationToken))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        nota.PendenciasJson = pendencias.Length == 0 ? null : JsonSerializer.Serialize(pendencias, JsonOptions);
        nota.ProntaParaTransmissao = pendencias.Length == 0;
        nota.Status = nota.ProntaParaTransmissao ? NotaFiscalStatus.PendenteTransmissao : NotaFiscalStatus.Rascunho;

        if (!nota.ProntaParaTransmissao)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            throw new AppException("A NF-e ainda possui pendencias fiscais. Revise o detalhamento antes de transmitir.");
        }

        using var certificate = nfeCertificateService.LoadFromEmpresa(empresa);
        var endpoints = endpointResolver.Resolve(empresa.Uf, nota.Ambiente);

        var chaveAcesso = nota.ChaveAcesso;
        var codigoNumerico = nota.CodigoNumerico;
        if (string.IsNullOrWhiteSpace(chaveAcesso) || string.IsNullOrWhiteSpace(codigoNumerico))
        {
            codigoNumerico = GenerateCodigoNumerico();
            chaveAcesso = BuildChaveAcesso(empresa, nota, codigoNumerico);
            nota.CodigoNumerico = codigoNumerico;
            nota.ChaveAcesso = chaveAcesso;
        }

        var nfeDocument = BuildSignedNfeDocument(empresa, nota, venda, certificate, chaveAcesso, codigoNumerico);
        var loteId = DateTime.UtcNow.ToString("yyyyMMddHHmmss", CultureInfo.InvariantCulture);
        nota.LoteTransmissao = loteId;
        nota.DataTransmissao = DateTime.UtcNow;
        nota.XmlEnvio = BuildEnviNfeDocument(nfeDocument, loteId).ToString(SaveOptions.DisableFormatting);

        var envioResponse = await SendSoapAsync(
            endpoints.AutorizacaoUrl,
            "NFeAutorizacao4",
            empresa.Uf!,
            BuildEnviNfeDocument(nfeDocument, loteId).Root!,
            certificate,
            cancellationToken);

        var retornoEnvio = GetPayloadElement(envioResponse, "retEnviNFe")
            ?? throw new AppException("A SEFAZ nao retornou o envelope esperado para autorizacao da NF-e.");

        var cStatEnvio = GetIntValue(retornoEnvio, "cStat");
        var xMotivoEnvio = GetValue(retornoEnvio, "xMotivo");

        XElement retornoFinal = retornoEnvio;
        if (cStatEnvio == 103)
        {
            var recibo = GetValue(retornoEnvio, "nRec")
                ?? throw new AppException("A SEFAZ aceitou o lote, mas nao retornou numero de recibo.");
            nota.ReciboSefaz = recibo;

            retornoFinal = await ConsultarReciboAteConcluirAsync(
                endpoints.RetAutorizacaoUrl,
                empresa.Uf!,
                nota.Ambiente,
                recibo,
                certificate,
                cancellationToken);
        }
        else if (cStatEnvio != 104)
        {
            ApplyRejeicao(
                nota,
                cStatEnvio,
                xMotivoEnvio ?? "A SEFAZ rejeitou o lote de autorizacao antes de gerar o recibo.");

            nota.XmlRetorno = envioResponse.ToString(SaveOptions.DisableFormatting);
            RegisterTransmissionLog(nota, usuarioId, false, nota.MensagemStatusSefaz);
            await dbContext.SaveChangesAsync(cancellationToken);
            return nota;
        }

        nota.XmlRetorno = retornoFinal.Document?.ToString(SaveOptions.DisableFormatting) ?? retornoFinal.ToString(SaveOptions.DisableFormatting);

        var prot = retornoFinal.Descendants().FirstOrDefault(item => item.Name.LocalName == "infProt");
        var cStatProtocolo = prot is not null ? GetIntValue(prot, "cStat") : GetIntValue(retornoFinal, "cStat");
        var xMotivoProtocolo = prot is not null ? GetValue(prot, "xMotivo") : GetValue(retornoFinal, "xMotivo");

        if (cStatProtocolo is 100 or 150)
        {
            nota.Status = NotaFiscalStatus.Autorizada;
            nota.CodigoStatusSefaz = cStatProtocolo;
            nota.MensagemStatusSefaz = xMotivoProtocolo;
            nota.ProtocoloAutorizacao = prot is not null ? GetValue(prot, "nProt") : null;
            nota.DataAutorizacao = prot is not null ? ParseSefazDate(GetValue(prot, "dhRecbto")) : DateTime.UtcNow;
            nota.ProntaParaTransmissao = true;
            RegisterTransmissionLog(nota, usuarioId, true, xMotivoProtocolo);
        }
        else
        {
            ApplyRejeicao(nota, cStatProtocolo, xMotivoProtocolo ?? "A SEFAZ devolveu a NF-e sem autorizacao.");
            RegisterTransmissionLog(nota, usuarioId, false, nota.MensagemStatusSefaz);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return nota;
    }

    private async Task<XElement> ConsultarReciboAteConcluirAsync(
        string retAutorizacaoUrl,
        string uf,
        AmbienteFiscal ambiente,
        string recibo,
        X509Certificate2 certificate,
        CancellationToken cancellationToken)
    {
        for (var tentativa = 1; tentativa <= 6; tentativa++)
        {
            if (tentativa > 1)
            {
                await Task.Delay(TimeSpan.FromSeconds(tentativa), cancellationToken);
            }

            var consultaRecibo = BuildConsReciNfeDocument(ambiente, recibo);
            var response = await SendSoapAsync(
                retAutorizacaoUrl,
                "NFeRetAutorizacao4",
                uf,
                consultaRecibo.Root!,
                certificate,
                cancellationToken);

            var retorno = GetPayloadElement(response, "retConsReciNFe")
                ?? throw new AppException("A SEFAZ nao retornou o envelope esperado de consulta ao recibo.");

            var cStat = GetIntValue(retorno, "cStat");
            if (cStat == 105)
            {
                continue;
            }

            return retorno;
        }

        throw new AppException("A SEFAZ nao concluiu o processamento do recibo da NF-e dentro do tempo esperado.");
    }

    private static void ApplyRejeicao(NotaFiscal nota, int? cStat, string message)
    {
        nota.Status = NotaFiscalStatus.Rejeitada;
        nota.CodigoStatusSefaz = cStat;
        nota.MensagemStatusSefaz = message;
        nota.ProtocoloAutorizacao = null;
        nota.DataAutorizacao = null;
    }

    private void RefreshNotaSnapshot(NotaFiscal nota, Empresa empresa, Venda venda)
    {
        var emitente = new
        {
            RazaoSocial = empresa.Nome,
            NomeFantasia = empresa.NomeFantasia,
            Cnpj = empresa.Cnpj,
            InscricaoEstadual = empresa.InscricaoEstadual,
            InscricaoEstadualIsento = empresa.InscricaoEstadualIsento,
            InscricaoMunicipal = empresa.InscricaoMunicipal,
            CnaePrincipal = empresa.CnaePrincipal,
            Telefone = empresa.Telefone,
            EmailFiscal = empresa.EmailFiscal,
            Cep = empresa.Cep,
            Logradouro = empresa.Logradouro,
            Numero = empresa.Numero,
            Complemento = empresa.Complemento,
            Bairro = empresa.Bairro,
            Cidade = empresa.Cidade,
            Uf = empresa.Uf,
            CodigoMunicipioIbge = empresa.CodigoMunicipioIbge,
            RegimeTributario = empresa.RegimeTributario.ToString(),
            AmbienteNfe = empresa.AmbienteNfe.ToString()
        };

        var destinatario = venda.Cliente is null
            ? new
            {
                Nome = "Consumidor final",
                Documento = (string?)null,
                Email = (string?)null,
                Telefone = (string?)null,
                Cep = (string?)null,
                Logradouro = (string?)null,
                Numero = (string?)null,
                Complemento = (string?)null,
                Bairro = (string?)null,
                Cidade = (string?)null,
                Uf = (string?)null
            }
            : new
            {
                Nome = venda.Cliente.Nome,
                Documento = venda.Cliente.Documento,
                Email = venda.Cliente.Email,
                Telefone = venda.Cliente.Telefone,
                Cep = venda.Cliente.Cep,
                Logradouro = venda.Cliente.Logradouro,
                Numero = venda.Cliente.Numero,
                Complemento = venda.Cliente.Complemento,
                Bairro = venda.Cliente.Bairro,
                Cidade = venda.Cliente.Cidade,
                Uf = venda.Cliente.Uf
            };

        nota.EmitenteSnapshotJson = JsonSerializer.Serialize(emitente, JsonOptions);
        nota.DestinatarioSnapshotJson = JsonSerializer.Serialize(destinatario, JsonOptions);
        nota.DestinatarioNome = venda.Cliente?.Nome ?? "Consumidor final";
        nota.DestinatarioDocumento = venda.Cliente?.Documento;
        nota.Ambiente = empresa.AmbienteNfe;
    }

    private async Task<IReadOnlyCollection<string>> BuildTransmissionPendenciasAsync(
        Empresa empresa,
        NotaFiscal nota,
        Venda venda,
        CancellationToken cancellationToken)
    {
        var pendencias = new List<string>();

        if (string.IsNullOrWhiteSpace(empresa.Cnpj))
        {
            pendencias.Add("Empresa sem CNPJ fiscal definido.");
        }

        if (string.IsNullOrWhiteSpace(empresa.Uf))
        {
            pendencias.Add("Empresa sem UF fiscal definida.");
        }

        if (string.IsNullOrWhiteSpace(empresa.CodigoMunicipioIbge))
        {
            pendencias.Add("Empresa sem codigo IBGE do municipio.");
        }

        if (string.IsNullOrWhiteSpace(empresa.Logradouro) ||
            string.IsNullOrWhiteSpace(empresa.Numero) ||
            string.IsNullOrWhiteSpace(empresa.Bairro) ||
            string.IsNullOrWhiteSpace(empresa.Cidade) ||
            string.IsNullOrWhiteSpace(empresa.Cep))
        {
            pendencias.Add("Endereco fiscal da empresa esta incompleto para a transmissao da NF-e.");
        }

        var empresaMunicipio = await municipioCatalogService.ResolveForAddressAsync(
            empresa.Cidade,
            empresa.Uf,
            empresa.CodigoMunicipioIbge,
            cancellationToken);

        if (empresaMunicipio.HasInput && !empresaMunicipio.IsValid && !string.IsNullOrWhiteSpace(empresaMunicipio.ErrorMessage))
        {
            pendencias.Add(empresaMunicipio.ErrorMessage);
        }

        var certificateInfo = nfeCertificateService.Describe(empresa);
        if (!certificateInfo.Configurado)
        {
            pendencias.Add("Certificado digital da NF-e nao foi configurado na empresa.");
        }
        else if (certificateInfo.ErroValidacao is not null)
        {
            pendencias.Add($"Certificado digital invalido: {certificateInfo.ErroValidacao}");
        }
        else if (certificateInfo.ValidoAte.HasValue && certificateInfo.ValidoAte.Value <= DateTime.UtcNow)
        {
            pendencias.Add("Certificado digital da NF-e esta vencido.");
        }

        if (venda.Cliente is null)
        {
            pendencias.Add("Vincule um cliente completo a venda para transmitir a NF-e modelo 55.");
        }
        else
        {
            if (string.IsNullOrWhiteSpace(venda.Cliente.Logradouro) ||
                string.IsNullOrWhiteSpace(venda.Cliente.Numero) ||
                string.IsNullOrWhiteSpace(venda.Cliente.Bairro) ||
                string.IsNullOrWhiteSpace(venda.Cliente.Cidade) ||
                string.IsNullOrWhiteSpace(venda.Cliente.Uf) ||
                string.IsNullOrWhiteSpace(venda.Cliente.Cep))
            {
                pendencias.Add($"Cliente {venda.Cliente.Nome} esta com endereco incompleto para a NF-e.");
            }

            if (string.IsNullOrWhiteSpace(venda.Cliente.CodigoMunicipioIbge))
            {
                pendencias.Add($"Cliente {venda.Cliente.Nome} esta sem codigo IBGE do municipio.");
            }
            else
            {
                var clienteMunicipio = await municipioCatalogService.ResolveForAddressAsync(
                    venda.Cliente.Cidade,
                    venda.Cliente.Uf,
                    venda.Cliente.CodigoMunicipioIbge,
                    cancellationToken);

                if (clienteMunicipio.HasInput && !clienteMunicipio.IsValid && !string.IsNullOrWhiteSpace(clienteMunicipio.ErrorMessage))
                {
                    pendencias.Add(clienteMunicipio.ErrorMessage);
                }
            }
        }

        if (nota.Itens.Count == 0)
        {
            pendencias.Add("NF-e sem itens nao pode ser transmitida.");
        }

        var simplesNacional = empresa.RegimeTributario is EmpresaRegimeTributario.SimplesNacional or EmpresaRegimeTributario.SimplesExcessoSublimite;
        foreach (var item in nota.Itens)
        {
            if (string.IsNullOrWhiteSpace(item.Ncm))
            {
                pendencias.Add($"Produto {item.ProdutoNome} esta sem NCM.");
            }

            if (string.IsNullOrWhiteSpace(item.Cfop))
            {
                pendencias.Add($"Produto {item.ProdutoNome} esta sem CFOP de venda.");
            }

            if (string.IsNullOrWhiteSpace(item.UnidadeMedida))
            {
                pendencias.Add($"Produto {item.ProdutoNome} esta sem unidade comercial.");
            }

            if (simplesNacional)
            {
                if (!SupportedCsosn.Contains(item.Csosn ?? string.Empty))
                {
                    pendencias.Add($"Produto {item.ProdutoNome} usa CSOSN nao suportado nesta etapa ({item.Csosn ?? "vazio"}).");
                }
            }
            else if (!SupportedCstIcms.Contains(item.CstIcms ?? string.Empty))
            {
                pendencias.Add($"Produto {item.ProdutoNome} usa CST ICMS nao suportado nesta etapa ({item.CstIcms ?? "vazio"}).");
            }
        }

        return pendencias;
    }

    private static readonly HashSet<string> SupportedCsosn = ["102", "103", "300", "400", "500"];
    private static readonly HashSet<string> SupportedCstIcms = ["00", "40", "41"];

    private XDocument BuildSignedNfeDocument(
        Empresa empresa,
        NotaFiscal nota,
        Venda venda,
        X509Certificate2 certificate,
        string chaveAcesso,
        string codigoNumerico)
    {
        var ns = XNamespace.Get(NfeNamespace);
        var now = DateTimeOffset.UtcNow;
        var destinatario = venda.Cliente ?? throw new AppException("Cliente da venda e obrigatorio para a NF-e.");
        var isHomologacao = nota.Ambiente == AmbienteFiscal.Homologacao;
        var indDest = ResolveIdDest(empresa.Uf, destinatario.Uf);

        var itemNodes = new List<XElement>();
        decimal totalPis = 0;
        decimal totalCofins = 0;
        decimal totalIcmsBase = 0;
        decimal totalIcms = 0;
        var itemIndex = 1;

        foreach (var item in nota.Itens.OrderBy(item => item.ProdutoNome))
        {
            var imposto = BuildImpostoNode(ns, empresa.RegimeTributario, item, ref totalPis, ref totalCofins, ref totalIcmsBase, ref totalIcms);

            itemNodes.Add(
                new XElement(ns + "det",
                    new XAttribute("nItem", itemIndex.ToString(CultureInfo.InvariantCulture)),
                    new XElement(ns + "prod",
                        new XElement(ns + "cProd", BuildCodigoProdutoFiscal(item)),
                        new XElement(ns + "cEAN", ResolveEan(item)),
                        new XElement(ns + "xProd", item.ProdutoNome),
                        new XElement(ns + "NCM", OnlyDigits(item.Ncm) ?? string.Empty),
                        string.IsNullOrWhiteSpace(item.Cest) ? null : new XElement(ns + "CEST", OnlyDigits(item.Cest)),
                        new XElement(ns + "CFOP", OnlyDigits(item.Cfop) ?? string.Empty),
                        new XElement(ns + "uCom", item.UnidadeMedida),
                        new XElement(ns + "qCom", FormatQuantity(item.Quantidade)),
                        new XElement(ns + "vUnCom", FormatMoney(item.ValorUnitario, 10)),
                        new XElement(ns + "vProd", FormatMoney(item.Quantidade * item.ValorUnitario)),
                        new XElement(ns + "cEANTrib", ResolveEan(item)),
                        new XElement(ns + "uTrib", item.UnidadeMedida),
                        new XElement(ns + "qTrib", FormatQuantity(item.Quantidade)),
                        new XElement(ns + "vUnTrib", FormatMoney(item.ValorUnitario, 10)),
                        item.Desconto > 0 ? new XElement(ns + "vDesc", FormatMoney(item.Desconto)) : null,
                        new XElement(ns + "indTot", "1")),
                    imposto));

            itemIndex += 1;
        }

        var totalNode =
            new XElement(ns + "total",
                new XElement(ns + "ICMSTot",
                    new XElement(ns + "vBC", FormatMoney(totalIcmsBase)),
                    new XElement(ns + "vICMS", FormatMoney(totalIcms)),
                    new XElement(ns + "vICMSDeson", "0.00"),
                    new XElement(ns + "vFCP", "0.00"),
                    new XElement(ns + "vBCST", "0.00"),
                    new XElement(ns + "vST", "0.00"),
                    new XElement(ns + "vFCPST", "0.00"),
                    new XElement(ns + "vFCPSTRet", "0.00"),
                    new XElement(ns + "vProd", FormatMoney(nota.ValorProdutos)),
                    new XElement(ns + "vFrete", "0.00"),
                    new XElement(ns + "vSeg", "0.00"),
                    new XElement(ns + "vDesc", FormatMoney(nota.ValorDesconto)),
                    new XElement(ns + "vII", "0.00"),
                    new XElement(ns + "vIPI", "0.00"),
                    new XElement(ns + "vIPIDevol", "0.00"),
                    new XElement(ns + "vPIS", FormatMoney(totalPis)),
                    new XElement(ns + "vCOFINS", FormatMoney(totalCofins)),
                    new XElement(ns + "vOutro", "0.00"),
                    new XElement(ns + "vNF", FormatMoney(nota.ValorTotal))));

        var pagamentosNode =
            new XElement(ns + "pag",
                venda.Pagamentos.Select(pagamento =>
                    new XElement(ns + "detPag",
                        new XElement(ns + "tPag", ResolvePaymentCode(pagamento.FormaPagamento)),
                        ResolvePaymentCode(pagamento.FormaPagamento) == "99"
                            ? new XElement(ns + "xPag", pagamento.FormaPagamento.ToString())
                            : null,
                        new XElement(ns + "vPag", FormatMoney(pagamento.ValorPago)))));

        var infNFe =
            new XElement(ns + "infNFe",
                new XAttribute("Id", $"NFe{chaveAcesso}"),
                new XAttribute("versao", "4.00"),
                new XElement(ns + "ide",
                    new XElement(ns + "cUF", NfeSefazEndpointResolver.ResolveUfCode(empresa.Uf)),
                    new XElement(ns + "cNF", codigoNumerico),
                    new XElement(ns + "natOp", "VENDA DE MERCADORIA"),
                    new XElement(ns + "mod", "55"),
                    new XElement(ns + "serie", nota.Serie.ToString(CultureInfo.InvariantCulture)),
                    new XElement(ns + "nNF", nota.Numero.ToString(CultureInfo.InvariantCulture)),
                    new XElement(ns + "dhEmi", now.ToString("yyyy-MM-ddTHH:mm:sszzz", CultureInfo.InvariantCulture)),
                    new XElement(ns + "tpNF", "1"),
                    new XElement(ns + "idDest", indDest),
                    new XElement(ns + "cMunFG", empresa.CodigoMunicipioIbge),
                    new XElement(ns + "tpImp", "1"),
                    new XElement(ns + "tpEmis", "1"),
                    new XElement(ns + "cDV", chaveAcesso[^1].ToString()),
                    new XElement(ns + "tpAmb", nota.Ambiente == AmbienteFiscal.Homologacao ? "2" : "1"),
                    new XElement(ns + "finNFe", "1"),
                    new XElement(ns + "indFinal", "1"),
                    new XElement(ns + "indPres", "1"),
                    new XElement(ns + "procEmi", "0"),
                    new XElement(ns + "verProc", "PDV-V1/1.0")),
                new XElement(ns + "emit",
                    new XElement(ns + "CNPJ", OnlyDigits(empresa.Cnpj) ?? string.Empty),
                    new XElement(ns + "xNome", empresa.Nome),
                    string.IsNullOrWhiteSpace(empresa.NomeFantasia) ? null : new XElement(ns + "xFant", empresa.NomeFantasia),
                    BuildEnderecoNode(ns, "enderEmit", empresa.Logradouro!, empresa.Numero!, empresa.Complemento, empresa.Bairro!, empresa.CodigoMunicipioIbge!, empresa.Cidade!, empresa.Uf!, empresa.Cep!, empresa.Telefone),
                    new XElement(ns + "IE", empresa.InscricaoEstadualIsento ? "ISENTO" : (empresa.InscricaoEstadual ?? string.Empty)),
                    new XElement(ns + "CRT", ResolveCrt(empresa.RegimeTributario))),
                new XElement(ns + "dest",
                    new XElement(ns + "CNPJ", isHomologacao ? HomologacaoCnpjDestinatario : OnlyDigits(destinatario.Documento) ?? string.Empty),
                    new XElement(ns + "xNome", isHomologacao ? HomologacaoDestinatario : destinatario.Nome),
                    BuildEnderecoNode(ns, "enderDest", destinatario.Logradouro!, destinatario.Numero!, destinatario.Complemento, destinatario.Bairro!, ResolveMunicipioCodigo(destinatario), destinatario.Cidade!, destinatario.Uf!, destinatario.Cep!, destinatario.Telefone),
                    new XElement(ns + "indIEDest", "9"),
                    string.IsNullOrWhiteSpace(destinatario.Email) ? null : new XElement(ns + "email", destinatario.Email)),
                itemNodes,
                totalNode,
                new XElement(ns + "transp", new XElement(ns + "modFrete", "9")),
                pagamentosNode,
                string.IsNullOrWhiteSpace(nota.Observacoes)
                    ? new XElement(ns + "infAdic", new XElement(ns + "infCpl", "Emitida pelo PDV-V1 em ambiente de homologacao."))
                    : new XElement(ns + "infAdic", new XElement(ns + "infCpl", nota.Observacoes)));

        var document =
            new XDocument(
                new XDeclaration("1.0", "utf-8", null),
                new XElement(ns + "NFe", infNFe));

        SignInfNFe(document, certificate, $"#NFe{chaveAcesso}");
        return document;
    }

    private static XElement BuildImpostoNode(
        XNamespace ns,
        EmpresaRegimeTributario regimeTributario,
        NotaFiscalItem item,
        ref decimal totalPis,
        ref decimal totalCofins,
        ref decimal totalIcmsBase,
        ref decimal totalIcms)
    {
        var simplesNacional = regimeTributario is EmpresaRegimeTributario.SimplesNacional or EmpresaRegimeTributario.SimplesExcessoSublimite;
        var baseCalculo = item.Total;
        var pisAliquota = item.AliquotaPis ?? 0;
        var cofinsAliquota = item.AliquotaCofins ?? 0;
        var icmsAliquota = item.AliquotaIcms ?? 0;
        var valorPis = Math.Round(baseCalculo * pisAliquota / 100m, 2, MidpointRounding.AwayFromZero);
        var valorCofins = Math.Round(baseCalculo * cofinsAliquota / 100m, 2, MidpointRounding.AwayFromZero);
        totalPis += valorPis;
        totalCofins += valorCofins;

        XElement icmsNode;
        if (simplesNacional)
        {
            icmsNode = item.Csosn switch
            {
                "102" or "103" or "300" or "400" =>
                    new XElement(ns + $"ICMSSN{item.Csosn}",
                        new XElement(ns + "orig", ResolveOrigem(item.OrigemFiscal)),
                        new XElement(ns + "CSOSN", item.Csosn)),
                "500" =>
                    new XElement(ns + "ICMSSN500",
                        new XElement(ns + "orig", ResolveOrigem(item.OrigemFiscal)),
                        new XElement(ns + "CSOSN", "500"),
                        new XElement(ns + "vBCSTRet", "0.00"),
                        new XElement(ns + "pST", "0.00"),
                        new XElement(ns + "vICMSSubstituto", "0.00"),
                        new XElement(ns + "vICMSSTRet", "0.00")),
                _ => throw new AppException($"CSOSN {item.Csosn ?? "vazio"} ainda nao esta suportado para transmissao automatica.")
            };
        }
        else
        {
            icmsNode = item.CstIcms switch
            {
                "00" => BuildIcms00(ns, item, ref totalIcmsBase, ref totalIcms),
                "40" or "41" =>
                    new XElement(ns + $"ICMS{item.CstIcms}",
                        new XElement(ns + "orig", ResolveOrigem(item.OrigemFiscal)),
                        new XElement(ns + "CST", item.CstIcms)),
                _ => throw new AppException($"CST ICMS {item.CstIcms ?? "vazio"} ainda nao esta suportado para transmissao automatica.")
            };
        }

        return new XElement(ns + "imposto",
            new XElement(ns + "ICMS", icmsNode),
            BuildPisNode(ns, item.CstPis, baseCalculo, pisAliquota, valorPis),
            BuildCofinsNode(ns, item.CstCofins, baseCalculo, cofinsAliquota, valorCofins));
    }

    private static XElement BuildIcms00(XNamespace ns, NotaFiscalItem item, ref decimal totalIcmsBase, ref decimal totalIcms)
    {
        var baseCalculo = item.Total;
        var aliquota = item.AliquotaIcms ?? 0;
        var valorIcms = Math.Round(baseCalculo * aliquota / 100m, 2, MidpointRounding.AwayFromZero);
        totalIcmsBase += baseCalculo;
        totalIcms += valorIcms;

        return new XElement(ns + "ICMS00",
            new XElement(ns + "orig", ResolveOrigem(item.OrigemFiscal)),
            new XElement(ns + "CST", "00"),
            new XElement(ns + "modBC", "3"),
            new XElement(ns + "vBC", FormatMoney(baseCalculo)),
            new XElement(ns + "pICMS", FormatMoney(aliquota, 4)),
            new XElement(ns + "vICMS", FormatMoney(valorIcms)));
    }

    private static XElement BuildPisNode(XNamespace ns, string? cstPis, decimal baseCalculo, decimal aliquota, decimal valorPis)
    {
        var cst = NormalizeTaxCode(cstPis, "99");
        return cst switch
        {
            "01" or "02" => new XElement(ns + "PIS",
                new XElement(ns + "PISAliq",
                    new XElement(ns + "CST", cst),
                    new XElement(ns + "vBC", FormatMoney(baseCalculo)),
                    new XElement(ns + "pPIS", FormatMoney(aliquota, 4)),
                    new XElement(ns + "vPIS", FormatMoney(valorPis)))),
            "04" or "05" or "06" or "07" or "08" or "09" =>
                new XElement(ns + "PIS",
                    new XElement(ns + "PISNT", new XElement(ns + "CST", cst))),
            _ => new XElement(ns + "PIS",
                new XElement(ns + "PISOutr",
                    new XElement(ns + "CST", cst),
                    new XElement(ns + "vBC", FormatMoney(baseCalculo)),
                    new XElement(ns + "pPIS", FormatMoney(aliquota, 4)),
                    new XElement(ns + "vPIS", FormatMoney(valorPis))))
        };
    }

    private static XElement BuildCofinsNode(XNamespace ns, string? cstCofins, decimal baseCalculo, decimal aliquota, decimal valorCofins)
    {
        var cst = NormalizeTaxCode(cstCofins, "99");
        return cst switch
        {
            "01" or "02" => new XElement(ns + "COFINS",
                new XElement(ns + "COFINSAliq",
                    new XElement(ns + "CST", cst),
                    new XElement(ns + "vBC", FormatMoney(baseCalculo)),
                    new XElement(ns + "pCOFINS", FormatMoney(aliquota, 4)),
                    new XElement(ns + "vCOFINS", FormatMoney(valorCofins)))),
            "04" or "05" or "06" or "07" or "08" or "09" =>
                new XElement(ns + "COFINS",
                    new XElement(ns + "COFINSNT", new XElement(ns + "CST", cst))),
            _ => new XElement(ns + "COFINS",
                new XElement(ns + "COFINSOutr",
                    new XElement(ns + "CST", cst),
                    new XElement(ns + "vBC", FormatMoney(baseCalculo)),
                    new XElement(ns + "pCOFINS", FormatMoney(aliquota, 4)),
                    new XElement(ns + "vCOFINS", FormatMoney(valorCofins))))
        };
    }

    private static XElement BuildEnderecoNode(
        XNamespace ns,
        string nodeName,
        string logradouro,
        string numero,
        string? complemento,
        string bairro,
        string codigoMunicipio,
        string cidade,
        string uf,
        string cep,
        string? telefone)
        => new(ns + nodeName,
            new XElement(ns + "xLgr", logradouro),
            new XElement(ns + "nro", numero),
            string.IsNullOrWhiteSpace(complemento) ? null : new XElement(ns + "xCpl", complemento),
            new XElement(ns + "xBairro", bairro),
            new XElement(ns + "cMun", codigoMunicipio),
            new XElement(ns + "xMun", cidade),
            new XElement(ns + "UF", uf),
            new XElement(ns + "CEP", OnlyDigits(cep) ?? string.Empty),
            new XElement(ns + "cPais", "1058"),
            new XElement(ns + "xPais", "BRASIL"),
            string.IsNullOrWhiteSpace(telefone) ? null : new XElement(ns + "fone", OnlyDigits(telefone)));

    private static XDocument BuildEnviNfeDocument(XDocument nfeDocument, string loteId)
    {
        var ns = XNamespace.Get(NfeNamespace);
        return new XDocument(
            new XDeclaration("1.0", "utf-8", null),
            new XElement(ns + "enviNFe",
                new XAttribute("versao", "4.00"),
                new XElement(ns + "idLote", loteId),
                new XElement(ns + "indSinc", "0"),
                nfeDocument.Root));
    }

    private static XDocument BuildConsReciNfeDocument(AmbienteFiscal ambiente, string recibo)
    {
        var ns = XNamespace.Get(NfeNamespace);
        return new XDocument(
            new XDeclaration("1.0", "utf-8", null),
            new XElement(ns + "consReciNFe",
                new XAttribute("versao", "4.00"),
                new XElement(ns + "tpAmb", ambiente == AmbienteFiscal.Homologacao ? "2" : "1"),
                new XElement(ns + "nRec", recibo)));
    }

    private static XDocument BuildConsStatServDocument(AmbienteFiscal ambiente, string uf)
    {
        var ns = XNamespace.Get(NfeNamespace);
        return new XDocument(
            new XDeclaration("1.0", "utf-8", null),
            new XElement(ns + "consStatServ",
                new XAttribute("versao", "4.00"),
                new XElement(ns + "tpAmb", ambiente == AmbienteFiscal.Homologacao ? "2" : "1"),
                new XElement(ns + "cUF", NfeSefazEndpointResolver.ResolveUfCode(uf)),
                new XElement(ns + "xServ", "STATUS")));
    }

    private void SignInfNFe(XDocument document, X509Certificate2 certificate, string referenceUri)
    {
        var xml = new XmlDocument { PreserveWhitespace = true };
        using var reader = document.CreateReader();
        xml.Load(reader);

        var infNFe = xml.GetElementsByTagName("infNFe", NfeNamespace).OfType<XmlElement>().FirstOrDefault()
            ?? throw new AppException("Nao foi possivel localizar o bloco infNFe para assinatura.");

        using var signingKey = nfeCertificateService.OpenPrivateKeyForSigning(certificate);

        var signedXml = new SignedXml(xml)
        {
            SigningKey = signingKey
        };
        var signedInfo = signedXml.SignedInfo
            ?? throw new AppException("Nao foi possivel preparar a assinatura XML da NF-e.");
        signedInfo.CanonicalizationMethod = SignedXml.XmlDsigCanonicalizationUrl;
        signedInfo.SignatureMethod = SignedXml.XmlDsigRSASHA1Url;

        var reference = new Reference(referenceUri);
        reference.AddTransform(new XmlDsigEnvelopedSignatureTransform());
        reference.AddTransform(new XmlDsigC14NTransform());
        reference.DigestMethod = SignedXml.XmlDsigSHA1Url;
        signedXml.AddReference(reference);

        var keyInfo = new KeyInfo();
        keyInfo.AddClause(new KeyInfoX509Data(certificate));
        signedXml.KeyInfo = keyInfo;
        try
        {
            signedXml.ComputeSignature();
        }
        catch (CryptographicException ex)
        {
            throw new AppException(nfeCertificateService.BuildPrivateKeyAccessErrorMessage(ex));
        }

        var signature = signedXml.GetXml();
        infNFe.ParentNode?.AppendChild(xml.ImportNode(signature, true));

        using var stringWriter = new Utf8StringWriter();
        using var xmlWriter = XmlWriter.Create(stringWriter, new XmlWriterSettings
        {
            OmitXmlDeclaration = false,
            Encoding = Encoding.UTF8
        });
        xml.WriteTo(xmlWriter);
        xmlWriter.Flush();

        var signedDocument = XDocument.Parse(stringWriter.ToString(), LoadOptions.PreserveWhitespace);
        document.Root?.ReplaceWith(signedDocument.Root!);
    }

    private async Task<(XDocument Response, SoapTransportDiagnostic Diagnostic)> SendSoapWithDiagnosticsAsync(
        string url,
        string operationName,
        string uf,
        XElement payload,
        X509Certificate2 certificate,
        CancellationToken cancellationToken)
    {
        var diagnostic = CreateTransportDiagnostic(certificate);
        var response = await SendSoapAsyncCore(url, operationName, uf, payload, certificate, diagnostic, cancellationToken);
        return (response, diagnostic);
    }

    private async Task<XDocument> SendSoapAsync(
        string url,
        string operationName,
        string uf,
        XElement payload,
        X509Certificate2 certificate,
        CancellationToken cancellationToken)
    {
        var diagnostic = CreateTransportDiagnostic(certificate);
        return await SendSoapAsyncCore(url, operationName, uf, payload, certificate, diagnostic, cancellationToken);
    }

    private async Task<XDocument> SendSoapAsyncCore(
        string url,
        string operationName,
        string uf,
        XElement payload,
        X509Certificate2 certificate,
        SoapTransportDiagnostic diagnostic,
        CancellationToken cancellationToken)
    {
        SoapTransportException? tlsProbeFailure = null;
        try
        {
            await ProbeTlsHandshakeAsync(url, certificate, diagnostic, cancellationToken);
        }
        catch (SoapTransportException ex)
        {
            tlsProbeFailure = ex;
        }

        var attemptHistory = new List<string>();
        SoapTransportException? lastFailure = tlsProbeFailure;

        for (var index = 0; index < SoapRequestVariants.Length; index++)
        {
            var variant = SoapRequestVariants[index];
            var hasMoreVariants = index < SoapRequestVariants.Length - 1;

            try
            {
                return await SendSoapHttpAttemptAsync(
                    url,
                    operationName,
                    uf,
                    payload,
                    certificate,
                    diagnostic,
                    variant,
                    useSystemProxy: !nfeSefazOptions.Value.PreferDirectConnectionWithoutProxy,
                    cancellationToken);
            }
            catch (SoapTransportException ex)
            {
                lastFailure = ex;
                attemptHistory.Add(BuildAttemptHistoryEntry(BuildAttemptLabel(variant, !nfeSefazOptions.Value.PreferDirectConnectionWithoutProxy), ex.Diagnostic));

                if (ShouldRetryWithSystemProxy(ex)
                    && (!nfeSefazOptions.Value.PreferDirectConnectionWithoutProxy || !nfeSefazOptions.Value.AllowSystemProxyFallback))
                {
                    AppendAttemptHistory(ex.Diagnostic, attemptHistory);
                    throw;
                }

                if (ShouldRetryWithSystemProxy(ex) && nfeSefazOptions.Value.AllowSystemProxyFallback)
                {
                    try
                    {
                        return await SendSoapHttpAttemptAsync(
                            url,
                            operationName,
                            uf,
                            payload,
                            certificate,
                            diagnostic,
                            variant,
                            useSystemProxy: true,
                            cancellationToken);
                    }
                    catch (SoapTransportException proxyEx)
                    {
                        lastFailure = proxyEx;
                        attemptHistory.Add(BuildAttemptHistoryEntry(BuildAttemptLabel(variant, useSystemProxy: true), proxyEx.Diagnostic));
                        if (!ShouldTryNextSoapVariant(proxyEx, hasMoreVariants))
                        {
                            AppendAttemptHistory(proxyEx.Diagnostic, attemptHistory);
                            throw;
                        }

                        continue;
                    }
                }

                if (!ShouldTryNextSoapVariant(ex, hasMoreVariants))
                {
                    AppendAttemptHistory(ex.Diagnostic, attemptHistory);
                    throw;
                }
            }
        }

        if (lastFailure is not null)
        {
            AppendAttemptHistory(lastFailure.Diagnostic, attemptHistory);
            throw lastFailure;
        }

        throw new AppException("Nao foi possivel concluir a chamada SOAP da NF-e para a SEFAZ.");
    }

    private async Task<XDocument> SendSoapHttpAttemptAsync(
        string url,
        string operationName,
        string uf,
        XElement payload,
        X509Certificate2 certificate,
        SoapTransportDiagnostic diagnostic,
        SoapRequestVariant variant,
        bool useSystemProxy,
        CancellationToken cancellationToken)
    {
        var soapAction = BuildSoapAction(operationName);
        var attemptLabel = BuildAttemptLabel(variant, useSystemProxy);
        var envelope = BuildSoapEnvelope(operationName, uf, payload, variant);

        using var handler = CreateSoapHttpClientHandler(certificate, useSystemProxy);
        using var client = new HttpClient(handler)
        {
            Timeout = TimeSpan.FromSeconds(35)
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(envelope.ToString(SaveOptions.DisableFormatting), Encoding.UTF8)
        };

        if (nfeSefazOptions.Value.ForceHttp11)
        {
            request.Version = HttpVersion.Version11;
            request.VersionPolicy = HttpVersionPolicy.RequestVersionExact;
        }

        request.Headers.ExpectContinue = false;
        ConfigureSoapHttpRequest(request, soapAction, variant);

        try
        {
            diagnostic.Etapa = "HttpRequest";
            diagnostic.Resumo = $"Enviando {operationName} para a SEFAZ usando {attemptLabel}.";
            diagnostic.CausaProvavel = "O certificado cliente foi validado para a conexao segura. Se houver falha daqui para frente, ela ocorrera no HTTP, no formato SOAP ou em filtro intermediario.";
            diagnostic.DetalheTecnico = $"Formato em uso: {attemptLabel}.";

            using var response = await client.SendAsync(request, cancellationToken);
            var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
            diagnostic.HttpStatusCode = (int)response.StatusCode;
            diagnostic.RespostaHtml = LooksLikeHtmlError(responseBody);

            if (!response.IsSuccessStatusCode)
            {
                PopulateHttpFailureDiagnostic(diagnostic, response.StatusCode, responseBody, url, operationName, attemptLabel);
                throw new SoapTransportException(
                    BuildHttpFailureMessage(response.StatusCode, responseBody, url, operationName, attemptLabel),
                    response.StatusCode,
                    diagnostic);
            }

            diagnostic.Etapa = "RespostaHttp";
            diagnostic.Resumo = $"A SEFAZ respondeu HTTP {(int)response.StatusCode} com payload XML para {operationName}.";
            diagnostic.CausaProvavel = "Canal TLS, protocolo HTTP e formato SOAP foram aceitos pelo autorizador. Qualquer erro restante passa a ser do XML ou da regra fiscal.";
            diagnostic.DetalheTecnico = $"Formato aceito: {attemptLabel}. Retorno resumido: {BuildResponsePreview(responseBody, 480)}";

            try
            {
                return XDocument.Parse(responseBody, LoadOptions.PreserveWhitespace);
            }
            catch (XmlException)
            {
                diagnostic.Etapa = "RespostaHttp";
                diagnostic.Resumo = "A SEFAZ respondeu ao HTTPS, mas o retorno nao estava em XML valido.";
                diagnostic.CausaProvavel = "O endpoint respondeu algo fora do padrao SOAP/XML esperado. Isso pode indicar pagina de erro intermediaria, proxy ou operacao SOAP rejeitada antes da camada fiscal.";
                diagnostic.DetalheTecnico = $"Formato em uso: {attemptLabel}. Retorno resumido: {BuildResponsePreview(responseBody, 900)}";
                throw new SoapTransportException(
                    "A SEFAZ respondeu ao canal HTTPS, mas o retorno nao veio em XML valido para a NF-e.",
                    HttpStatusCode.BadGateway,
                    diagnostic);
            }
        }
        catch (HttpRequestException ex) when (IsUnavailableCertificateCredentialError(ex))
        {
            diagnostic.Etapa = "CredencialCliente";
            diagnostic.Resumo = "O Windows nao conseguiu materializar a credencial do certificado cliente para a conexao segura.";
            diagnostic.CausaProvavel = "A chave privada do certificado nao ficou disponivel para o canal TLS. Regrave o certificado na empresa ou ajuste a permissao da chave.";
            diagnostic.DetalheTecnico = $"Formato em uso: {attemptLabel}. Detalhe: {BuildExceptionPreview(ex)}";

            throw new SoapTransportException(
                "Nao foi possivel autenticar o certificado digital da NF-e no canal seguro da SEFAZ. "
                + "O Windows informou que as credenciais do certificado nao estao disponiveis no pacote de seguranca. "
                + "Regrave o certificado da empresa e tente novamente.",
                HttpStatusCode.BadRequest,
                diagnostic);
        }
        catch (HttpRequestException ex)
        {
            diagnostic.Etapa = "HttpRequest";
            diagnostic.Resumo = "A chamada HTTPS para a SEFAZ falhou antes de retornar XML fiscal.";
            diagnostic.CausaProvavel = BuildTransportProbableCause(ex, useSystemProxy);
            diagnostic.DetalheTecnico = $"Formato em uso: {attemptLabel}. Detalhe: {BuildExceptionPreview(ex)}";

            throw new SoapTransportException(
                "A chamada HTTPS para a SEFAZ falhou antes de o XML fiscal ser processado. Consulte o diagnostico de conectividade para detalhes.",
                HttpStatusCode.BadGateway,
                diagnostic);
        }
        catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            diagnostic.Etapa = "HttpRequest";
            diagnostic.Resumo = "A chamada para a SEFAZ excedeu o tempo limite de 35 segundos.";
            diagnostic.CausaProvavel = useSystemProxy
                ? "O autorizador pode estar indisponivel, a rede esta lenta ou o proxy configurado no Windows atrasou a chamada HTTPS."
                : "O autorizador pode estar indisponivel, a rede esta lenta ou existe filtro intermediario atrasando a resposta da SEFAZ.";
            diagnostic.DetalheTecnico = $"Formato em uso: {attemptLabel}. Detalhe: {BuildExceptionPreview(ex)}";

            throw new SoapTransportException(
                "A chamada para a SEFAZ excedeu o tempo limite configurado. Verifique rede, proxy e disponibilidade do autorizador.",
                HttpStatusCode.GatewayTimeout,
                diagnostic);
        }
    }

    private static XDocument BuildSoapEnvelope(
        string operationName,
        string uf,
        XElement payload,
        SoapRequestVariant variant)
    {
        var soapNs = XNamespace.Get(variant.EnvelopeKind == SoapEnvelopeKind.Soap12 ? Soap12Namespace : Soap11Namespace);
        var operationNs = XNamespace.Get($"http://www.portalfiscal.inf.br/nfe/wsdl/{operationName}");

        var envelope = new XElement(soapNs + "Envelope");
        envelope.Add(new XAttribute(XNamespace.Xmlns + (variant.EnvelopeKind == SoapEnvelopeKind.Soap12 ? "soap12" : "soap"), soapNs));

        if (variant.IncludeLegacyHeader)
        {
            envelope.Add(
                new XElement(soapNs + "Header",
                    new XElement(operationNs + "nfeCabecMsg",
                        new XElement(operationNs + "versaoDados", ResolvePayloadVersion(payload)),
                        new XElement(operationNs + "cUF", NfeSefazEndpointResolver.ResolveUfCode(uf)))));
        }

        var dataNode = new XElement(operationNs + "nfeDadosMsg", new XElement(payload));
        var bodyContent = variant.BodyKind == SoapBodyKind.DirectDataMessage
            ? dataNode
            : new XElement(operationNs + operationName, dataNode);

        envelope.Add(new XElement(soapNs + "Body", bodyContent));

        return new XDocument(new XDeclaration("1.0", "utf-8", null), envelope);
    }

    private static void ConfigureSoapHttpRequest(
        HttpRequestMessage request,
        string soapAction,
        SoapRequestVariant variant)
    {
        if (variant.EnvelopeKind == SoapEnvelopeKind.Soap12)
        {
            var contentType = variant.IncludeSoap12ActionParameter
                ? $"application/soap+xml; charset=utf-8; action=\"{soapAction}\""
                : "application/soap+xml; charset=utf-8";
            request.Content!.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType);
        }
        else
        {
            request.Content!.Headers.ContentType = MediaTypeHeaderValue.Parse("text/xml; charset=utf-8");
        }

        if (variant.IncludeSoapActionHeader)
        {
            request.Headers.TryAddWithoutValidation("SOAPAction", $"\"{soapAction}\"");
        }
    }

    private static HttpClientHandler CreateSoapHttpClientHandler(X509Certificate2 certificate, bool useSystemProxy)
    {
        var handler = new HttpClientHandler
        {
            ClientCertificateOptions = ClientCertificateOption.Manual,
            SslProtocols = SslProtocols.Tls12,
            UseProxy = useSystemProxy
        };

        if (!useSystemProxy)
        {
            handler.Proxy = null;
            handler.DefaultProxyCredentials = null;
        }

        handler.ClientCertificates.Add(certificate);
        return handler;
    }

    private SoapTransportDiagnostic CreateTransportDiagnostic(X509Certificate2 certificate)
        => new()
        {
            Etapa = "Preparacao",
            Resumo = "Preparando o teste de conectividade com a SEFAZ.",
            CertificadoClienteAssunto = certificate.Subject,
            CertificadoClienteThumbprint = certificate.Thumbprint,
            CertificadoClienteValidoAte = certificate.NotAfter,
            UsuarioExecucaoWindows = nfeCertificateService.ExecutionIdentityDisplay,
            ModoArmazenamentoChave = nfeCertificateService.KeyStorageModeDescription
        };

    private async Task ProbeTlsHandshakeAsync(
        string url,
        X509Certificate2 certificate,
        SoapTransportDiagnostic diagnostic,
        CancellationToken cancellationToken)
    {
        var endpoint = new Uri(url, UriKind.Absolute);
        diagnostic.Etapa = "TlsHandshake";
        diagnostic.Resumo = $"Abrindo canal TLS com {endpoint.Host}:{endpoint.Port}.";

        using var tcpClient = new TcpClient();
        try
        {
            await tcpClient.ConnectAsync(endpoint.Host, endpoint.Port, cancellationToken);
        }
        catch (Exception ex)
        {
            diagnostic.Resumo = $"Nao foi possivel abrir conexao TCP com {endpoint.Host}:{endpoint.Port}.";
            diagnostic.CausaProvavel = "A rede nao conseguiu alcancar o host da SEFAZ. Verifique DNS, firewall, proxy ou indisponibilidade do endpoint.";
            diagnostic.DetalheTecnico = BuildExceptionPreview(ex);
            throw new SoapTransportException(
                $"Nao foi possivel abrir conexao TCP com {endpoint.Host}:{endpoint.Port} antes do handshake TLS da SEFAZ.",
                HttpStatusCode.BadGateway,
                diagnostic);
        }

        X509Certificate2? serverCertificate = null;
        var sslPolicyErrors = SslPolicyErrors.None;

        try
        {
            using var sslStream = new SslStream(
                tcpClient.GetStream(),
                false,
                (_, remoteCertificate, _, errors) =>
                {
                    sslPolicyErrors = errors;
                    if (remoteCertificate is not null)
                    {
                        serverCertificate = new X509Certificate2(remoteCertificate);
                    }

                    return errors == SslPolicyErrors.None;
                });

            var authenticationOptions = new SslClientAuthenticationOptions
            {
                TargetHost = endpoint.Host,
                EnabledSslProtocols = SslProtocols.Tls12,
                ClientCertificates = new X509CertificateCollection { certificate }
            };

            await sslStream.AuthenticateAsClientAsync(authenticationOptions, cancellationToken);
            PopulateServerCertificateDetails(diagnostic, serverCertificate, sslPolicyErrors);
            diagnostic.TlsHandshakeSucesso = true;
            diagnostic.TlsProtocol = sslStream.SslProtocol.ToString();
            diagnostic.CipherSuite = sslStream.NegotiatedCipherSuite.ToString();
            diagnostic.Resumo = $"Handshake TLS concluido com {diagnostic.TlsProtocol}.";
            diagnostic.CausaProvavel = "O canal seguro aceitou o certificado cliente. Se a chamada ainda falhar, o bloqueio ocorre depois do handshake.";
            diagnostic.DetalheTecnico = $"Cipher suite negociada: {diagnostic.CipherSuite}.";
        }
        catch (Exception ex)
        {
            PopulateServerCertificateDetails(diagnostic, serverCertificate, sslPolicyErrors);
            diagnostic.TlsHandshakeSucesso = false;
            diagnostic.Resumo = "Nao foi possivel concluir o handshake TLS com a SEFAZ usando o certificado configurado.";
            diagnostic.CausaProvavel = BuildTlsProbableCause(ex);
            diagnostic.DetalheTecnico = BuildExceptionPreview(ex);

            throw new SoapTransportException(
                "Nao foi possivel concluir o handshake TLS com a SEFAZ usando o certificado configurado. Consulte o diagnostico para identificar se a rejeicao veio da rede, do certificado cliente ou da confianca TLS.",
                HttpStatusCode.BadGateway,
                diagnostic);
        }
        finally
        {
            serverCertificate?.Dispose();
        }
    }

    private static void PopulateServerCertificateDetails(
        SoapTransportDiagnostic diagnostic,
        X509Certificate2? serverCertificate,
        SslPolicyErrors sslPolicyErrors)
    {
        diagnostic.ErrosCertificadoServidor = sslPolicyErrors == SslPolicyErrors.None ? null : sslPolicyErrors.ToString();
        if (serverCertificate is null)
        {
            return;
        }

        diagnostic.CertificadoServidorAssunto = serverCertificate.Subject;
        diagnostic.CertificadoServidorEmissor = serverCertificate.Issuer;
        diagnostic.CertificadoServidorThumbprint = serverCertificate.Thumbprint;
        diagnostic.CertificadoServidorValidoAte = serverCertificate.NotAfter;
    }

    private static void PopulateHttpFailureDiagnostic(
        SoapTransportDiagnostic diagnostic,
        HttpStatusCode statusCode,
        string responseBody,
        string url,
        string operationName,
        string attemptLabel)
    {
        diagnostic.Etapa = "RespostaHttp";
        diagnostic.HttpStatusCode = (int)statusCode;
        diagnostic.RespostaHtml = LooksLikeHtmlError(responseBody);
        diagnostic.DetalheTecnico = $"Formato em uso: {attemptLabel}. Retorno resumido: {BuildResponsePreview(responseBody, 1200)}";

        if (statusCode == HttpStatusCode.Forbidden && diagnostic.RespostaHtml)
        {
            diagnostic.Resumo = $"O handshake TLS concluiu, mas o endpoint {operationName} respondeu HTTP 403 antes do XML fiscal.";
            diagnostic.CausaProvavel = "O certificado cliente conseguiu abrir o canal TLS, mas o autorizador bloqueou a chamada HTTP. Isso costuma apontar para ambiente/endpoint incorreto, proxy intermediario, politica do servidor da SEFAZ ou formato SOAP rejeitado antes da camada fiscal.";
            return;
        }

        diagnostic.Resumo = $"A SEFAZ respondeu HTTP {(int)statusCode} para {operationName} antes do XML fiscal esperado.";
        diagnostic.CausaProvavel = $"O endpoint {url} respondeu fora do fluxo normal da NF-e. Revise ambiente, URL, proxy e eventuais bloqueios no autorizador.";
    }

    private static EmpresaFiscalSefazDiagnosticoDto? MapTransportDiagnostic(SoapTransportDiagnostic? diagnostic)
        => diagnostic is null
            ? null
            : new EmpresaFiscalSefazDiagnosticoDto(
                diagnostic.Etapa,
                diagnostic.Resumo,
                diagnostic.CausaProvavel,
                diagnostic.TlsHandshakeSucesso,
                diagnostic.TlsProtocol,
                diagnostic.CipherSuite,
                diagnostic.HttpStatusCode,
                diagnostic.RespostaHtml,
                diagnostic.CertificadoServidorAssunto,
                diagnostic.CertificadoServidorEmissor,
                diagnostic.CertificadoServidorThumbprint,
                diagnostic.CertificadoServidorValidoAte,
                diagnostic.ErrosCertificadoServidor,
                diagnostic.CertificadoClienteAssunto,
                diagnostic.CertificadoClienteThumbprint,
                diagnostic.CertificadoClienteValidoAte,
                diagnostic.UsuarioExecucaoWindows,
                diagnostic.ModoArmazenamentoChave,
                diagnostic.DetalheTecnico);

    private static string BuildTlsProbableCause(Exception exception)
    {
        if (HasException<SocketException>(exception))
        {
            return "A conexao TCP com o host da SEFAZ nao foi estabelecida. Verifique DNS, firewall, proxy, antivirus ou indisponibilidade do endpoint.";
        }

        if (IsUnavailableCertificateCredentialError(exception))
        {
            return "O Windows nao conseguiu disponibilizar a credencial do certificado cliente para o handshake TLS.";
        }

        if (HasException<AuthenticationException>(exception) && ContainsAnyMessage(exception, "remote certificate", "trust", "chain", "certificado remoto"))
        {
            return "A validacao do certificado do servidor falhou durante o handshake TLS. Verifique confianca da cadeia, relogio do Windows e inspecao HTTPS.";
        }

        if (HasException<AuthenticationException>(exception))
        {
            return "O handshake TLS foi interrompido antes do HTTP. Isso pode indicar rejeicao do certificado cliente, cadeia ICP-Brasil incompleta ou bloqueio intermediario na conexao segura.";
        }

        return "A conexao segura falhou antes da resposta HTTP. Revise certificado cliente, cadeia de confianca do Windows e eventuais proxies inspecionando HTTPS.";
    }

    private static string BuildTransportProbableCause(Exception exception, bool useSystemProxy)
    {
        if (HasException<SocketException>(exception))
        {
            return useSystemProxy
                ? "A conexao com o host da SEFAZ caiu antes da resposta HTTP mesmo com o proxy do Windows habilitado. Verifique proxy, DNS, firewall e disponibilidade do endpoint."
                : "A conexao direta com o host da SEFAZ caiu antes da resposta HTTP. Verifique rede, DNS, firewall local ou eventual bloqueio de saida sem proxy.";
        }

        if (HasException<AuthenticationException>(exception))
        {
            return "A chamada falhou na camada TLS ou de autenticacao do certificado cliente antes do XML fiscal.";
        }

        return useSystemProxy
            ? "A requisicao HTTPS nao concluiu o fluxo esperado usando o proxy do Windows. Revise proxy, antivirus, endpoint e certificado digital."
            : "A requisicao HTTPS direta nao concluiu o fluxo esperado. Revise endpoint, filtro de saida, antivirus e certificado digital.";
    }

    private static string BuildExceptionPreview(Exception exception)
        => BuildResponsePreview(FlattenExceptionMessages(exception), 900);

    private static string FlattenExceptionMessages(Exception exception)
    {
        var messages = new List<string>();
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (!string.IsNullOrWhiteSpace(current.Message))
            {
                messages.Add(current.Message.Trim());
            }
        }

        return messages.Count == 0 ? exception.GetType().Name : string.Join(" | ", messages.Distinct(StringComparer.OrdinalIgnoreCase));
    }

    private static string BuildResponsePreview(string? responseBody, int maxLength = 600)
    {
        if (string.IsNullOrWhiteSpace(responseBody))
        {
            return "sem detalhes adicionais";
        }

        var compact = string.Join(" ", responseBody
            .Split(['\r', '\n', '\t'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));

        return compact.Length <= maxLength
            ? compact
            : $"{compact[..maxLength]}...";
    }

    private static bool ContainsAnyMessage(Exception exception, params string[] fragments)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            var message = current.Message;
            if (string.IsNullOrWhiteSpace(message))
            {
                continue;
            }

            if (fragments.Any(fragment => message.Contains(fragment, StringComparison.OrdinalIgnoreCase)))
            {
                return true;
            }
        }

        return false;
    }

    private static bool HasException<TException>(Exception exception)
        where TException : Exception
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (current is TException)
            {
                return true;
            }
        }

        return false;
    }

    private static string BuildAttemptLabel(SoapRequestVariant variant, bool useSystemProxy)
        => $"{variant.DisplayName} · {(useSystemProxy ? "proxy do Windows" : "conexao direta sem proxy")}";

    private static string ResolvePayloadVersion(XElement payload)
        => payload.Attribute("versao")?.Value?.Trim() switch
        {
            { Length: > 0 } version => version,
            _ => "4.00"
        };

    private static bool ShouldRetryWithSystemProxy(SoapTransportException exception)
    {
        if (!exception.Diagnostic.HttpStatusCode.HasValue)
        {
            return exception.Diagnostic.Etapa is "TlsHandshake" or "HttpRequest";
        }

        return (exception.StatusCode is HttpStatusCode.BadGateway or HttpStatusCode.GatewayTimeout)
            && exception.Diagnostic.Etapa is "TlsHandshake" or "HttpRequest";
    }

    private static bool ShouldTryNextSoapVariant(SoapTransportException exception, bool hasMoreVariants)
    {
        if (!hasMoreVariants)
        {
            return false;
        }

        if (exception.StatusCode == HttpStatusCode.Forbidden
            && exception.Diagnostic.RespostaHtml)
        {
            return true;
        }

        if (exception.StatusCode is HttpStatusCode.MethodNotAllowed
            or HttpStatusCode.UnsupportedMediaType)
        {
            return true;
        }

        if (exception.StatusCode == HttpStatusCode.InternalServerError
            && ContainsSoapCompatibilityHints(exception.Message, exception.Diagnostic.DetalheTecnico))
        {
            return true;
        }

        return exception.Diagnostic.RespostaHtml
            && (exception.StatusCode is HttpStatusCode.BadGateway or HttpStatusCode.BadRequest);
    }

    private static bool ContainsSoapCompatibilityHints(params string?[] values)
    {
        var hints = new[]
        {
            "SOAPAction",
            "soap action",
            "unsupported media type",
            "content-type",
            "did not recognize",
            "nao reconheceu",
            "não reconheceu",
            "nfeDadosMsg",
            "soap12",
            "text/xml"
        };

        foreach (var value in values)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                continue;
            }

            if (hints.Any(hint => value.Contains(hint, StringComparison.OrdinalIgnoreCase)))
            {
                return true;
            }
        }

        return false;
    }

    private static string BuildAttemptHistoryEntry(string attemptLabel, SoapTransportDiagnostic diagnostic)
    {
        var status = diagnostic.HttpStatusCode.HasValue
            ? $"HTTP {diagnostic.HttpStatusCode.Value}"
            : diagnostic.Etapa;
        var resumo = !string.IsNullOrWhiteSpace(diagnostic.Resumo)
            ? diagnostic.Resumo
            : diagnostic.CausaProvavel ?? "falha sem resumo";
        return $"{attemptLabel} -> {status} ({BuildResponsePreview(resumo, 140)})";
    }

    private static void AppendAttemptHistory(SoapTransportDiagnostic diagnostic, IReadOnlyCollection<string> attemptHistory)
    {
        if (attemptHistory.Count == 0)
        {
            return;
        }

        var history = $"Tentativas de compatibilidade: {string.Join(" | ", attemptHistory)}";
        diagnostic.DetalheTecnico = string.IsNullOrWhiteSpace(diagnostic.DetalheTecnico)
            ? history
            : $"{diagnostic.DetalheTecnico} {history}";
    }

    private static string BuildSoapAction(string operationName)
    {
        var methodName = operationName switch
        {
            "NFeAutorizacao4" => "nfeAutorizacaoLote",
            "NFeRetAutorizacao4" => "nfeRetAutorizacaoLote",
            "NFeStatusServico4" => "nfeStatusServicoNF",
            "NFeConsultaProtocolo4" => "nfeConsultaNF",
            "NFeRecepcaoEvento4" => "nfeRecepcaoEvento",
            "NFeInutilizacao4" => "nfeInutilizacaoNF",
            "CadConsultaCadastro4" => "consultaCadastro",
            _ => throw new AppException($"Metodo SOAP ainda nao mapeado para o servico {operationName}.")
        };

        return $"http://www.portalfiscal.inf.br/nfe/wsdl/{operationName}/{methodName}";
    }

    private static string BuildHttpFailureMessage(HttpStatusCode statusCode, string responseBody, string url, string operationName, string attemptLabel)
    {
        if (statusCode == HttpStatusCode.Forbidden && LooksLikeHtmlError(responseBody))
        {
            return "A SEFAZ retornou HTTP 403 e bloqueou a chamada antes de processar o XML da NF-e. "
                + $"Servico: {operationName}. URL: {url}. "
                + $"Formato tentado: {attemptLabel}. "
                + "Isso normalmente aponta para endpoint/ambiente incorreto, bloqueio do servidor da SEFAZ antes da camada fiscal, proxy intermediario ou formato SOAP rejeitado. "
                + $"Retorno resumido: {BuildResponsePreview(responseBody, 500)}";
        }

        return $"A SEFAZ retornou erro HTTP {(int)statusCode} durante a transmissao da NF-e. Servico: {operationName}. URL: {url}. Formato tentado: {attemptLabel}. Resposta resumida: {BuildResponsePreview(responseBody, 500)}";
    }

    private static bool LooksLikeHtmlError(string responseBody)
        => responseBody.Contains("<html", StringComparison.OrdinalIgnoreCase)
            || responseBody.Contains("<!DOCTYPE html", StringComparison.OrdinalIgnoreCase)
            || responseBody.Contains("403 - Forbidden", StringComparison.OrdinalIgnoreCase);

    private void RegisterTransmissionLog(NotaFiscal nota, Guid usuarioId, bool success, string? message)
    {
        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = nota.EmpresaId,
            UsuarioId = usuarioId,
            Modulo = "NotasFiscais",
            Acao = success ? "TransmissaoAutorizada" : "TransmissaoRejeitada",
            Descricao = success
                ? $"NF-e serie {nota.Serie} numero {nota.Numero} autorizada em {GetAmbienteDescription(nota.Ambiente)}."
                : $"NF-e serie {nota.Serie} numero {nota.Numero} devolvida pela SEFAZ em {GetAmbienteDescription(nota.Ambiente)}.",
            IpAddress = currentUser.GetIpAddress(),
            Dados = JsonSerializer.Serialize(new
            {
                nota.NotaFiscalId,
                nota.ChaveAcesso,
                nota.CodigoStatusSefaz,
                nota.MensagemStatusSefaz,
                NotaMessage = message,
                nota.XmlEnvio,
                nota.XmlRetorno
            })
        });
    }

    private static string GetAmbienteDescription(AmbienteFiscal ambiente)
        => ambiente == AmbienteFiscal.Homologacao ? "homologacao" : "producao";

    private static string BuildChaveAcesso(Empresa empresa, NotaFiscal nota, string codigoNumerico)
    {
        var cUf = NfeSefazEndpointResolver.ResolveUfCode(empresa.Uf);
        var aamm = nota.DataEmissao.ToString("yyMM", CultureInfo.InvariantCulture);
        var cnpj = OnlyDigits(empresa.Cnpj)
            ?? throw new AppException("Empresa sem CNPJ valido para gerar a chave de acesso.");
        var serie = nota.Serie.ToString("000", CultureInfo.InvariantCulture);
        var numero = nota.Numero.ToString("000000000", CultureInfo.InvariantCulture);
        const string modelo = "55";
        const string tpEmis = "1";
        var partialKey = $"{cUf}{aamm}{cnpj}{modelo}{serie}{numero}{tpEmis}{codigoNumerico}";
        var dv = CalculateModulo11(partialKey);
        return $"{partialKey}{dv}";
    }

    private static int CalculateModulo11(string numericValue)
    {
        var weight = 2;
        var total = 0;
        for (var index = numericValue.Length - 1; index >= 0; index--)
        {
            total += (numericValue[index] - '0') * weight;
            weight = weight == 9 ? 2 : weight + 1;
        }

        var remainder = total % 11;
        var digit = 11 - remainder;
        return digit >= 10 ? 0 : digit;
    }

    private static string GenerateCodigoNumerico()
        => RandomNumberGenerator.GetInt32(0, 99_999_999).ToString("00000000", CultureInfo.InvariantCulture);

    private static string BuildCodigoProdutoFiscal(NotaFiscalItem item)
        => item.ProdutoId.ToString("N")[..8].ToUpperInvariant();

    private static string ResolveEan(NotaFiscalItem item)
        => "SEM GTIN";

    private static string ResolvePaymentCode(FormaPagamento formaPagamento)
        => formaPagamento switch
        {
            FormaPagamento.Dinheiro => "01",
            FormaPagamento.CartaoCredito => "03",
            FormaPagamento.CartaoDebito => "04",
            FormaPagamento.Pix => "17",
            FormaPagamento.Voucher => "99",
            _ => "99"
        };

    private static string ResolveIdDest(string? emitUf, string? destUf)
    {
        var emit = NormalizeUf(emitUf);
        var dest = NormalizeUf(destUf);
        if (emit is null || dest is null)
        {
            return "1";
        }

        return emit == dest ? "1" : "2";
    }

    private static string ResolveCrt(EmpresaRegimeTributario regimeTributario)
        => regimeTributario switch
        {
            EmpresaRegimeTributario.SimplesNacional => "1",
            EmpresaRegimeTributario.SimplesExcessoSublimite => "2",
            _ => "3"
        };

    private static string ResolveOrigem(string? origemFiscal)
    {
        var digits = OnlyDigits(origemFiscal);
        return digits is { Length: > 0 } ? digits[0].ToString() : "0";
    }

    private static string ResolveMunicipioCodigo(Cliente cliente)
        => OnlyDigits(cliente.CodigoMunicipioIbge)
            ?? throw new AppException($"Cliente {cliente.Nome} esta sem codigo IBGE do municipio para a NF-e.");

    private static string FormatMoney(decimal value, int decimals = 2)
        => value.ToString(decimals switch
        {
            4 => "0.0000",
            10 => "0.0000000000",
            _ => "0.00"
        }, CultureInfo.InvariantCulture);

    private static string FormatQuantity(decimal value)
        => value.ToString("0.0000", CultureInfo.InvariantCulture);

    private static string NormalizeTaxCode(string? value, string fallback)
        => string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();

    private static string? OnlyDigits(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : new string(value.Where(char.IsDigit).ToArray());

    private static XElement? GetPayloadElement(XDocument document, string localName)
        => document.Descendants().FirstOrDefault(item => item.Name.LocalName == localName);

    private static int? GetIntValue(XElement element, string localName)
    {
        var value = GetValue(element, localName);
        return int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : null;
    }

    private static string? GetValue(XElement element, string localName)
        => element.Descendants().FirstOrDefault(item => item.Name.LocalName == localName)?.Value?.Trim();

    private static DateTime? ParseSefazDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsed)
            ? parsed.UtcDateTime
            : null;
    }

    private static string? NormalizeUf(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim().ToUpperInvariant();

    private static bool IsUnavailableCertificateCredentialError(Exception exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (current is Win32Exception win32Exception
                && (win32Exception.NativeErrorCode == unchecked((int)0x8009030E)
                    || win32Exception.Message.Contains("Credenciais não disponíveis no pacote de segurança", StringComparison.OrdinalIgnoreCase)
                    || win32Exception.Message.Contains("No credentials are available in the security package", StringComparison.OrdinalIgnoreCase)))
            {
                return true;
            }
        }

        return false;
    }

    private sealed class SoapTransportException(
        string message,
        HttpStatusCode statusCode,
        SoapTransportDiagnostic diagnostic) : AppException(message, statusCode)
    {
        public SoapTransportDiagnostic Diagnostic { get; } = diagnostic;
    }

    private sealed class SoapTransportDiagnostic
    {
        public string Etapa { get; set; } = "Preparacao";

        public string Resumo { get; set; } = string.Empty;

        public string? CausaProvavel { get; set; }

        public bool TlsHandshakeSucesso { get; set; }

        public string? TlsProtocol { get; set; }

        public string? CipherSuite { get; set; }

        public int? HttpStatusCode { get; set; }

        public bool RespostaHtml { get; set; }

        public string? CertificadoServidorAssunto { get; set; }

        public string? CertificadoServidorEmissor { get; set; }

        public string? CertificadoServidorThumbprint { get; set; }

        public DateTime? CertificadoServidorValidoAte { get; set; }

        public string? ErrosCertificadoServidor { get; set; }

        public string? CertificadoClienteAssunto { get; set; }

        public string? CertificadoClienteThumbprint { get; set; }

        public DateTime? CertificadoClienteValidoAte { get; set; }

        public string? UsuarioExecucaoWindows { get; set; }

        public string? ModoArmazenamentoChave { get; set; }

        public string? DetalheTecnico { get; set; }
    }

    private enum SoapEnvelopeKind
    {
        Soap11,
        Soap12
    }

    private enum SoapBodyKind
    {
        DirectDataMessage,
        OperationWrapper
    }

    private sealed record SoapRequestVariant(
        string DisplayName,
        SoapEnvelopeKind EnvelopeKind,
        SoapBodyKind BodyKind,
        bool IncludeLegacyHeader,
        bool IncludeSoapActionHeader,
        bool IncludeSoap12ActionParameter);

    private sealed class Utf8StringWriter : StringWriter
    {
        public override Encoding Encoding => Encoding.UTF8;
    }
}
