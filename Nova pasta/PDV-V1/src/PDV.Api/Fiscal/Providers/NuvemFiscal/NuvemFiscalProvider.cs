using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using PDV.Api.Common;
using PDV.Api.Domain;
using PDV.Api.Fiscal.DTOs;
using PDV.Api.Fiscal.Providers;
using PDV.Api.Services;

namespace PDV.Api.Fiscal.Providers.NuvemFiscal;

public class NuvemFiscalProvider(
    FiscalProviderContext context,
    IHttpClientFactory httpClientFactory,
    NuvemFiscalAuthService authService,
    NfeCertificateService nfeCertificateService) : ExternalFiscalProviderBase(context, httpClientFactory)
{
    private const string DefaultSandboxBaseUrl = "https://api.sandbox.nuvemfiscal.com.br";
    private const string DefaultProductionBaseUrl = "https://api.nuvemfiscal.com.br";

    private sealed record ResolvedNFeDocument(
        string Referencia,
        string DocumentoId,
        string RawJson);

    public override FiscalProvider Kind => FiscalProvider.NuvemFiscal;
    public override string DisplayName => "Nuvem Fiscal";

    public override async Task<EmitirNFeResult> EmitirNFeAsync(EmitirNFeRequest request)
    {
        var baseUrl = ResolveBaseUrl();
        using var client = await CreateAuthorizedClientAsync(baseUrl);
        await EnsureProviderReadyAsync(client);

        var providerPayload = BuildProviderPayload(request.Documento);
        using var response = await client.PostAsync("/nfe", JsonContent(providerPayload));
        var responseBody = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            throw new AppException($"A Nuvem Fiscal rejeitou a solicitacao de emissao: {Summarize(responseBody)}");
        }

        using var json = JsonDocument.Parse(responseBody);
        var root = json.RootElement;
        var documentoId = ReadString(root, "id");
        var status = MapStatus(ReadString(root, "status"), ReadNullableInt(root, "codigo_status"));
        var chave = ReadString(root, "chave");
        var protocolo = ReadNestedString(root, "autorizacao", "numero_protocolo");
        var codigoStatus = ReadNestedNullableInt(root, "autorizacao", "codigo_status") ?? ReadNullableInt(root, "codigo_status");
        var mensagem = ReadNestedString(root, "autorizacao", "motivo_status")
            ?? ReadString(root, "motivo_status")
            ?? ReadNestedString(root, "autorizacao", "mensagem")
            ?? "Solicitacao recebida pela Nuvem Fiscal.";

        var xmlUrl = string.IsNullOrWhiteSpace(documentoId) ? null : $"{baseUrl}/nfe/{documentoId}/xml";
        var danfeUrl = string.IsNullOrWhiteSpace(documentoId) ? null : $"{baseUrl}/nfe/{documentoId}/pdf";
        var xml = await TryDownloadTextAsync(client, xmlUrl);
        var danfePdfBase64 = await TryDownloadBinaryAsBase64Async(client, danfeUrl);

        return new EmitirNFeResult(
            status,
            mensagem,
            request.Documento.Referencia,
            documentoId,
            codigoStatus,
            chave,
            protocolo,
            xml,
            danfeUrl,
            danfePdfBase64,
            SerializeJson(request.Documento),
            SerializeJson(providerPayload),
            responseBody,
            DateTime.UtcNow,
            ParseDate(ReadNestedString(root, "autorizacao", "data_recebimento")),
            status is FiscalDocumentoStatus.Autorizada or FiscalDocumentoStatus.Rejeitada);
    }

    public override async Task<ConsultarNFeResult> ConsultarNFeAsync(string referenciaOuId)
    {
        var baseUrl = ResolveBaseUrl();
        using var client = await CreateAuthorizedClientAsync(baseUrl);
        var resolved = await ResolveNFeAsync(client, referenciaOuId);
        return await MapConsultarResultAsync(client, baseUrl, resolved);
    }

    public override async Task<ConsultarNFeResult> SincronizarNFeAsync(string referenciaOuId)
    {
        var baseUrl = ResolveBaseUrl();
        using var client = await CreateAuthorizedClientAsync(baseUrl);
        var resolved = await ResolveNFeAsync(client, referenciaOuId);

        using var response = await client.PostAsync($"/nfe/{resolved.DocumentoId}/sincronizar", JsonContent(new { }));
        var responseBody = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            throw new AppException($"A Nuvem Fiscal nao conseguiu sincronizar a NF-e com a SEFAZ: {Summarize(responseBody)}");
        }

        var refreshed = await ResolveNFeAsync(client, resolved.DocumentoId);
        return await MapConsultarResultAsync(client, baseUrl, refreshed);
    }

    public override async Task<CancelarNFeResult> CancelarNFeAsync(CancelarNFeRequest request)
    {
        var baseUrl = ResolveBaseUrl();
        using var client = await CreateAuthorizedClientAsync(baseUrl);
        var resolved = await ResolveNFeAsync(client, request.ReferenciaOuId);

        using var response = await client.PostAsync(
            $"/nfe/{resolved.DocumentoId}/cancelamento",
            JsonContent(new { justificativa = request.Justificativa }));
        var responseBody = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            throw new AppException($"A Nuvem Fiscal rejeitou o cancelamento da NF-e: {Summarize(responseBody)}");
        }

        using var json = JsonDocument.Parse(responseBody);
        var root = json.RootElement;
        var codigoStatus = ReadNullableInt(root, "codigo_status");
        var mensagem = ReadString(root, "motivo_status")
            ?? ReadString(root, "mensagem")
            ?? "Solicitacao de cancelamento enviada para a Nuvem Fiscal.";
        var status = MapEventStatus(ReadString(root, "status"), codigoStatus, FiscalDocumentoStatus.Cancelada);

        return new CancelarNFeResult(
            status,
            mensagem,
            resolved.Referencia,
            resolved.DocumentoId,
            ReadString(root, "id"),
            codigoStatus,
            ReadString(root, "numero_protocolo"),
            ReadString(root, "chave_acesso"),
            responseBody,
            ParseDate(ReadString(root, "data_recebimento")),
            status is FiscalDocumentoStatus.Cancelada or FiscalDocumentoStatus.Rejeitada);
    }

    public override async Task<FiscalEventoNFeResult> SolicitarCartaCorrecaoNFeAsync(CartaCorrecaoNFeRequest request)
    {
        var normalizedCorrection = request.Correcao?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedCorrection))
        {
            throw new AppException("Informe o texto da carta de correcao.");
        }

        var baseUrl = ResolveBaseUrl();
        using var client = await CreateAuthorizedClientAsync(baseUrl);
        var resolved = await ResolveNFeAsync(client, request.ReferenciaOuId);

        using var response = await client.PostAsync(
            $"/nfe/{resolved.DocumentoId}/carta-correcao",
            JsonContent(new { correcao = normalizedCorrection }));
        var responseBody = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            throw new AppException($"A Nuvem Fiscal rejeitou a carta de correcao da NF-e: {Summarize(responseBody)}");
        }

        return MapEventResult(
            resolved.Referencia,
            resolved.DocumentoId,
            responseBody,
            "Carta de correcao enviada para a Nuvem Fiscal.",
            FiscalDocumentoStatus.Autorizada);
    }

    public override async Task<EnviarEmailNFeResult> EnviarEmailNFeAsync(EnviarEmailNFeRequest request)
    {
        var baseUrl = ResolveBaseUrl();
        using var client = await CreateAuthorizedClientAsync(baseUrl);
        var resolved = await ResolveNFeAsync(client, request.ReferenciaOuId);

        object payload = request.Destinatarios.Count == 0
            ? new { }
            : new
            {
                destinatarios = request.Destinatarios
                    .Select(item => item.Trim())
                    .Where(item => !string.IsNullOrWhiteSpace(item))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .Select(item => new { email = item })
                    .ToArray()
            };

        using var response = await client.PostAsync($"/nfe/{resolved.DocumentoId}/email", JsonContent(payload));
        var responseBody = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            throw new AppException($"A Nuvem Fiscal nao conseguiu enviar o XML/PDF da NF-e por e-mail: {Summarize(responseBody)}");
        }

        using var json = JsonDocument.Parse(responseBody);
        var root = json.RootElement;
        return new EnviarEmailNFeResult(
            ReadString(root, "status_message") ?? "Solicitacao de envio por e-mail recebida pela Nuvem Fiscal.",
            resolved.Referencia,
            resolved.DocumentoId,
            ReadString(root, "status") ?? "pending",
            responseBody);
    }

    public override async Task<BaixarNFeDocumentoResult> BaixarDocumentoNFeAsync(BaixarNFeDocumentoRequest request)
    {
        var baseUrl = ResolveBaseUrl();
        using var client = await CreateAuthorizedClientAsync(baseUrl);
        var resolved = await ResolveNFeAsync(client, request.ReferenciaOuId);
        var relativePath = BuildDocumentPath(resolved.DocumentoId, request);
        var absoluteUrl = BuildAbsoluteUrl(baseUrl, relativePath);

        using var response = await client.GetAsync(relativePath);
        var mediaType = response.Content.Headers.ContentType?.MediaType ?? GuessMediaType(request.Tipo);
        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync();
            return new BaixarNFeDocumentoResult(
                resolved.Referencia,
                resolved.DocumentoId,
                request.Tipo,
                mediaType,
                BuildFileName(resolved, request.Tipo, mediaType),
                null,
                null,
                absoluteUrl,
                false,
                $"Documento ainda nao disponivel na Nuvem Fiscal: {Summarize(errorBody)}");
        }

        if (IsTextLikeContent(mediaType, request.Tipo))
        {
            var content = await response.Content.ReadAsStringAsync();
            return new BaixarNFeDocumentoResult(
                resolved.Referencia,
                resolved.DocumentoId,
                request.Tipo,
                mediaType,
                BuildFileName(resolved, request.Tipo, mediaType),
                null,
                content,
                absoluteUrl,
                true,
                "Documento obtido com sucesso.");
        }

        var bytes = await response.Content.ReadAsByteArrayAsync();
        return new BaixarNFeDocumentoResult(
            resolved.Referencia,
            resolved.DocumentoId,
            request.Tipo,
            mediaType,
            BuildFileName(resolved, request.Tipo, mediaType),
            bytes.Length == 0 ? null : Convert.ToBase64String(bytes),
            null,
            absoluteUrl,
            bytes.Length > 0,
            bytes.Length > 0
                ? "Documento obtido com sucesso."
                : "A Nuvem Fiscal respondeu sem conteudo para o documento solicitado.");
    }

    public override async Task<InutilizarNFeResult> InutilizarNumeracaoNFeAsync(InutilizarNFeRequest request)
    {
        using var client = await CreateAuthorizedClientAsync(ResolveBaseUrl());
        await EnsureProviderReadyAsync(client);

        using var response = await client.PostAsync(
            "/nfe/inutilizacoes",
            JsonContent(new
            {
                ambiente = AmbienteLiteral(Context.Ambiente),
                cnpj = Context.Cnpj,
                ano = request.Ano,
                serie = request.Serie,
                numero_inicial = request.NumeroInicial,
                numero_final = request.NumeroFinal,
                justificativa = request.Justificativa
            }));
        var responseBody = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            throw new AppException($"A Nuvem Fiscal rejeitou a inutilizacao da numeracao da NF-e: {Summarize(responseBody)}");
        }

        using var json = JsonDocument.Parse(responseBody);
        var root = json.RootElement;
        var codigoStatus = ReadNullableInt(root, "codigo_status");
        var mensagem = ReadString(root, "motivo_status")
            ?? ReadString(root, "mensagem")
            ?? "Pedido de inutilizacao recebido pela Nuvem Fiscal.";
        var status = MapEventStatus(ReadString(root, "status"), codigoStatus, FiscalDocumentoStatus.Autorizada);

        return new InutilizarNFeResult(
            status,
            mensagem,
            ReadString(root, "id"),
            ReadString(root, "tipo_evento"),
            codigoStatus,
            ReadString(root, "numero_protocolo"),
            ReadString(root, "chave_acesso"),
            responseBody,
            ParseDate(ReadString(root, "data_recebimento")),
            status is FiscalDocumentoStatus.Autorizada or FiscalDocumentoStatus.Rejeitada);
    }

    public override async Task<StatusServicoResult> ConsultarStatusServicoAsync()
    {
        var baseUrl = ResolveBaseUrl();
        using var client = await CreateAuthorizedClientAsync(baseUrl);
        await EnsureProviderReadyAsync(client);

        var query = $"/nfe/sefaz/status?cpf_cnpj={Context.Cnpj}&autorizador={Context.Uf}";
        using var response = await client.GetAsync(query);
        var responseBody = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            throw new AppException($"Nao foi possivel consultar o status da SEFAZ na Nuvem Fiscal: {Summarize(responseBody)}");
        }

        using var json = JsonDocument.Parse(responseBody);
        var root = json.RootElement;
        var codigoStatus = ReadNullableInt(root, "codigo_status");
        var mensagem = ReadString(root, "motivo_status") ?? "Status consultado com sucesso.";

        return new StatusServicoResult(
            codigoStatus == 107,
            codigoStatus,
            mensagem,
            $"{baseUrl}/nfe/sefaz/status",
            ParseDate(ReadString(root, "data_hora_retorno")),
            responseBody);
    }

    private async Task<HttpClient> CreateAuthorizedClientAsync(string baseUrl)
    {
        var client = CreateJsonClient(baseUrl);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await authService.GetAccessTokenAsync(Context));
        return client;
    }

    private async Task<ConsultarNFeResult> MapConsultarResultAsync(HttpClient client, string baseUrl, ResolvedNFeDocument resolved)
    {
        using var json = JsonDocument.Parse(resolved.RawJson);
        var root = json.RootElement;
        var documentoId = ReadString(root, "id") ?? resolved.DocumentoId;
        var status = MapStatus(ReadString(root, "status"), ReadNestedNullableInt(root, "autorizacao", "codigo_status"));
        var chave = ReadString(root, "chave") ?? ReadNestedString(root, "autorizacao", "chave_acesso");
        var protocolo = ReadNestedString(root, "autorizacao", "numero_protocolo");
        var codigoStatus = ReadNestedNullableInt(root, "autorizacao", "codigo_status") ?? ReadNullableInt(root, "codigo_status");
        var mensagem = ReadNestedString(root, "autorizacao", "motivo_status")
            ?? ReadString(root, "motivo_status")
            ?? ReadString(root, "status")
            ?? "Consulta realizada com sucesso.";

        var xmlUrl = string.IsNullOrWhiteSpace(documentoId) ? null : $"{baseUrl}/nfe/{documentoId}/xml";
        var danfeUrl = string.IsNullOrWhiteSpace(documentoId) ? null : $"{baseUrl}/nfe/{documentoId}/pdf";
        var xml = await TryDownloadTextAsync(client, xmlUrl);
        var danfePdfBase64 = await TryDownloadBinaryAsBase64Async(client, danfeUrl);

        return new ConsultarNFeResult(
            status,
            mensagem,
            ReadString(root, "referencia") ?? resolved.Referencia,
            documentoId,
            codigoStatus,
            chave,
            protocolo,
            xml,
            danfeUrl,
            danfePdfBase64,
            resolved.RawJson,
            ParseDate(ReadNestedString(root, "autorizacao", "data_recebimento")),
            status is FiscalDocumentoStatus.Autorizada or FiscalDocumentoStatus.Rejeitada or FiscalDocumentoStatus.Cancelada);
    }

    private async Task<ResolvedNFeDocument> ResolveNFeAsync(HttpClient client, string referenciaOuId)
    {
        var normalized = string.IsNullOrWhiteSpace(referenciaOuId)
            ? throw new AppException("Informe a referencia ou o identificador da NF-e.")
            : referenciaOuId.Trim();

        var byReference = await TryGetNotaRawByReferenceAsync(client, normalized);
        if (byReference is not null)
        {
            using var referenceJson = JsonDocument.Parse(byReference);
            var documentId = ReadString(referenceJson.RootElement, "id");
            var reference = ReadString(referenceJson.RootElement, "referencia") ?? normalized;
            if (string.IsNullOrWhiteSpace(documentId))
            {
                throw new AppException("A Nuvem Fiscal retornou a NF-e sem o identificador do documento.");
            }

            var byId = await TryGetNotaRawByIdAsync(client, documentId);
            return new ResolvedNFeDocument(reference, documentId, byId ?? byReference);
        }

        var byIdOnly = await TryGetNotaRawByIdAsync(client, normalized);
        if (byIdOnly is null)
        {
            throw new NotFoundException("A Nuvem Fiscal ainda nao localizou a NF-e pela referencia ou identificador informado.");
        }

        using var idJson = JsonDocument.Parse(byIdOnly);
        var referencia = ReadString(idJson.RootElement, "referencia") ?? normalized;
        var documentoIdFromPayload = ReadString(idJson.RootElement, "id") ?? normalized;
        return new ResolvedNFeDocument(referencia, documentoIdFromPayload, byIdOnly);
    }

    private async Task<string?> TryGetNotaRawByReferenceAsync(HttpClient client, string referencia)
    {
        var query = $"/nfe?cpf_cnpj={Context.Cnpj}&ambiente={AmbienteLiteral(Context.Ambiente)}&referencia={Uri.EscapeDataString(referencia)}";
        using var response = await client.GetAsync(query);
        var responseBody = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            throw new AppException($"Nao foi possivel consultar a NF-e na Nuvem Fiscal: {Summarize(responseBody)}");
        }

        using var json = JsonDocument.Parse(responseBody);
        if (!json.RootElement.TryGetProperty("data", out var dataNode) || dataNode.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        foreach (var item in dataNode.EnumerateArray())
        {
            return item.GetRawText();
        }

        return null;
    }

    private async Task<string?> TryGetNotaRawByIdAsync(HttpClient client, string documentoId)
    {
        using var response = await client.GetAsync($"/nfe/{Uri.EscapeDataString(documentoId)}");
        var responseBody = await response.Content.ReadAsStringAsync();
        if (response.IsSuccessStatusCode)
        {
            return responseBody;
        }

        if (IsNotFoundResponse(response.StatusCode, responseBody))
        {
            return null;
        }

        throw new AppException($"Nao foi possivel consultar a NF-e pelo identificador na Nuvem Fiscal: {Summarize(responseBody)}");
    }

    private static FiscalEventoNFeResult MapEventResult(
        string referencia,
        string documentoId,
        string responseBody,
        string defaultMessage,
        FiscalDocumentoStatus successStatus)
    {
        using var json = JsonDocument.Parse(responseBody);
        var root = json.RootElement;
        var codigoStatus = ReadNullableInt(root, "codigo_status");
        var mensagem = ReadString(root, "motivo_status")
            ?? ReadString(root, "mensagem")
            ?? defaultMessage;
        var status = MapEventStatus(ReadString(root, "status"), codigoStatus, successStatus);

        return new FiscalEventoNFeResult(
            status,
            mensagem,
            referencia,
            documentoId,
            ReadString(root, "id"),
            ReadString(root, "tipo_evento"),
            codigoStatus,
            ReadString(root, "numero_protocolo"),
            ReadString(root, "chave_acesso"),
            responseBody,
            ParseDate(ReadString(root, "data_recebimento")),
            status is not FiscalDocumentoStatus.Pendente);
    }

    private static FiscalDocumentoStatus MapEventStatus(string? status, int? code, FiscalDocumentoStatus successStatus)
    {
        var normalized = status?.Trim().ToLowerInvariant();
        if (normalized is "autorizado" or "concluido")
        {
            return successStatus;
        }

        if (normalized is "erro" or "rejeitado")
        {
            return FiscalDocumentoStatus.Rejeitada;
        }

        return code switch
        {
            135 or 136 or 155 => successStatus,
            >= 200 => FiscalDocumentoStatus.Rejeitada,
            _ => FiscalDocumentoStatus.Pendente
        };
    }

    private static string BuildDocumentPath(string documentoId, BaixarNFeDocumentoRequest request)
        => request.Tipo switch
        {
            NFeDownloadDocumentoTipo.DanfePdf => BuildDanfePath(documentoId, request),
            NFeDownloadDocumentoTipo.XmlProcessado => $"/nfe/{documentoId}/xml",
            NFeDownloadDocumentoTipo.XmlNota => $"/nfe/{documentoId}/xml/nota",
            NFeDownloadDocumentoTipo.XmlProtocolo => $"/nfe/{documentoId}/xml/protocolo",
            NFeDownloadDocumentoTipo.CancelamentoPdf => $"/nfe/{documentoId}/cancelamento/pdf",
            NFeDownloadDocumentoTipo.CancelamentoXml => $"/nfe/{documentoId}/cancelamento/xml",
            NFeDownloadDocumentoTipo.CartaCorrecaoPdf => $"/nfe/{documentoId}/carta-correcao/pdf",
            NFeDownloadDocumentoTipo.CartaCorrecaoXml => $"/nfe/{documentoId}/carta-correcao/xml",
            _ => throw new AppException("Tipo de download da NF-e nao reconhecido.")
        };

    private static string BuildDanfePath(string documentoId, BaixarNFeDocumentoRequest request)
    {
        var query = new List<string>();
        if (request.IncluirLogotipo)
        {
            query.Add("logotipo=true");
        }

        if (request.ExibirNomeFantasia)
        {
            query.Add("nome_fantasia=true");
        }

        if (!string.IsNullOrWhiteSpace(request.Formato))
        {
            query.Add($"formato={Uri.EscapeDataString(request.Formato.Trim())}");
        }

        if (!string.IsNullOrWhiteSpace(request.MensagemRodape))
        {
            query.Add($"mensagem_rodape={Uri.EscapeDataString(request.MensagemRodape.Trim())}");
        }

        if (request.Canhoto.HasValue)
        {
            query.Add($"canhoto={request.Canhoto.Value.ToString().ToLowerInvariant()}");
        }

        return query.Count == 0
            ? $"/nfe/{documentoId}/pdf"
            : $"/nfe/{documentoId}/pdf?{string.Join("&", query)}";
    }

    private static string GuessMediaType(NFeDownloadDocumentoTipo tipo)
        => tipo is NFeDownloadDocumentoTipo.DanfePdf or NFeDownloadDocumentoTipo.CancelamentoPdf or NFeDownloadDocumentoTipo.CartaCorrecaoPdf
            ? "application/pdf"
            : "application/xml";

    private static bool IsTextLikeContent(string mediaType, NFeDownloadDocumentoTipo tipo)
        => tipo is NFeDownloadDocumentoTipo.XmlProcessado
            or NFeDownloadDocumentoTipo.XmlNota
            or NFeDownloadDocumentoTipo.XmlProtocolo
            or NFeDownloadDocumentoTipo.CancelamentoXml
            or NFeDownloadDocumentoTipo.CartaCorrecaoXml
            || mediaType.Contains("xml", StringComparison.OrdinalIgnoreCase)
            || mediaType.StartsWith("text/", StringComparison.OrdinalIgnoreCase)
            || mediaType.Contains("json", StringComparison.OrdinalIgnoreCase);

    private static string BuildFileName(ResolvedNFeDocument resolved, NFeDownloadDocumentoTipo tipo, string mediaType)
    {
        var suffix = tipo switch
        {
            NFeDownloadDocumentoTipo.DanfePdf => "danfe",
            NFeDownloadDocumentoTipo.XmlProcessado => "nfe-proc",
            NFeDownloadDocumentoTipo.XmlNota => "nfe-nota",
            NFeDownloadDocumentoTipo.XmlProtocolo => "protocolo",
            NFeDownloadDocumentoTipo.CancelamentoPdf => "cancelamento",
            NFeDownloadDocumentoTipo.CancelamentoXml => "cancelamento",
            NFeDownloadDocumentoTipo.CartaCorrecaoPdf => "carta-correcao",
            NFeDownloadDocumentoTipo.CartaCorrecaoXml => "carta-correcao",
            _ => "documento"
        };
        var extension = mediaType.Contains("pdf", StringComparison.OrdinalIgnoreCase) ? "pdf" : "xml";
        var safeReference = new string(resolved.Referencia.Where(ch => char.IsLetterOrDigit(ch) || ch is '-' or '_').ToArray());
        return $"{safeReference}-{suffix}.{extension}";
    }

    private async Task EnsureProviderReadyAsync(HttpClient client)
    {
        await EnsureEmpresaAsync(client);
        await EnsureCertificateAsync(client);
        await EnsureNfeConfigurationAsync(client);
    }

    private string ResolveBaseUrl()
        => NormalizeBaseUrl(
            Context.BaseUrl,
            Context.Ambiente == AmbienteFiscal.Homologacao
                ? DefaultSandboxBaseUrl
                : DefaultProductionBaseUrl);

    private async Task EnsureEmpresaAsync(HttpClient client)
    {
        var payload = BuildEmpresaPayload();
        using var response = await client.PutAsync($"/empresas/{Context.Cnpj}", JsonContent(payload));
        var responseBody = await response.Content.ReadAsStringAsync();
        if (response.IsSuccessStatusCode)
        {
            return;
        }

        if (!IsNotFoundResponse(response.StatusCode, responseBody))
        {
            throw new AppException($"Nao foi possivel sincronizar a empresa na Nuvem Fiscal: {Summarize(responseBody)}");
        }

        using var createResponse = await client.PostAsync("/empresas", JsonContent(payload));
        var createBody = await createResponse.Content.ReadAsStringAsync();
        if (!createResponse.IsSuccessStatusCode)
        {
            throw new AppException($"Nao foi possivel cadastrar a empresa na Nuvem Fiscal: {Summarize(createBody)}");
        }
    }

    private async Task EnsureCertificateAsync(HttpClient client)
    {
        var path = Context.CertificadoDigitalCaminho;
        var password = Context.CertificadoDigitalSenha;
        if (string.IsNullOrWhiteSpace(path) || string.IsNullOrWhiteSpace(password))
        {
            throw new AppException("Para usar a Nuvem Fiscal, configure na empresa o certificado digital local e a senha para sincronizar o emitente com o provider.");
        }

        using var localCertificate = nfeCertificateService.LoadFromPath(path, password);
        var localThumbprint = NormalizeThumbprint(localCertificate.Thumbprint);
        var shouldUpload = true;

        using var certificateResponse = await client.GetAsync($"/empresas/{Context.Cnpj}/certificado");
        var certificateBody = await certificateResponse.Content.ReadAsStringAsync();
        if (certificateResponse.IsSuccessStatusCode)
        {
            using var certificateJson = JsonDocument.Parse(certificateBody);
            var remoteThumbprint = NormalizeThumbprint(ReadString(certificateJson.RootElement, "thumbprint"));
            shouldUpload = string.IsNullOrWhiteSpace(remoteThumbprint)
                || !string.Equals(remoteThumbprint, localThumbprint, StringComparison.OrdinalIgnoreCase);
        }
        else if (!IsNotFoundResponse(certificateResponse.StatusCode, certificateBody))
        {
            throw new AppException($"Nao foi possivel consultar o certificado da empresa na Nuvem Fiscal: {Summarize(certificateBody)}");
        }

        if (!shouldUpload)
        {
            return;
        }

        var bytes = await File.ReadAllBytesAsync(path);
        using var uploadResponse = await client.PutAsync(
            $"/empresas/{Context.Cnpj}/certificado",
            JsonContent(new
            {
                certificado = Convert.ToBase64String(bytes),
                password
            }));
        var uploadBody = await uploadResponse.Content.ReadAsStringAsync();
        if (!uploadResponse.IsSuccessStatusCode)
        {
            throw new AppException($"Nao foi possivel enviar o certificado para a Nuvem Fiscal: {Summarize(uploadBody)}");
        }
    }

    private async Task EnsureNfeConfigurationAsync(HttpClient client)
    {
        using var response = await client.PutAsync(
            $"/empresas/{Context.Cnpj}/nfe",
            JsonContent(new
            {
                CRT = int.Parse(ResolveCrt(Context.RegimeTributario)),
                ambiente = AmbienteLiteral(Context.Ambiente)
            }));
        var responseBody = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            throw new AppException($"Nao foi possivel configurar o ambiente NF-e da empresa na Nuvem Fiscal: {Summarize(responseBody)}");
        }
    }

    private object BuildEmpresaPayload()
    {
        if (Context.EnderecoEmitente is null)
        {
            throw new AppException("Preencha logradouro, numero, bairro, cidade, UF, CEP e codigo IBGE da empresa antes de sincronizar a Nuvem Fiscal.");
        }

        if (string.IsNullOrWhiteSpace(Context.EmailFiscal))
        {
            throw new AppException("Informe o e-mail fiscal da empresa antes de sincronizar a Nuvem Fiscal.");
        }

        return new
        {
            cpf_cnpj = Context.Cnpj,
            inscricao_estadual = Context.InscricaoEstadualIsento ? "ISENTO" : Context.InscricaoEstadual,
            inscricao_municipal = Context.InscricaoMunicipal,
            nome_razao_social = Context.EmpresaNome,
            nome_fantasia = Context.NomeFantasia,
            fone = OnlyDigits(Context.Telefone),
            email = Context.EmailFiscal,
            endereco = new
            {
                logradouro = Context.EnderecoEmitente.Logradouro,
                numero = Context.EnderecoEmitente.Numero,
                complemento = Context.EnderecoEmitente.Complemento,
                bairro = Context.EnderecoEmitente.Bairro,
                codigo_municipio = Context.EnderecoEmitente.CodigoMunicipioIbge,
                cidade = Context.EnderecoEmitente.Cidade,
                uf = Context.EnderecoEmitente.Uf,
                codigo_pais = "1058",
                pais = "Brasil",
                cep = OnlyDigits(Context.EnderecoEmitente.Cep)
            }
        };
    }

    private static object BuildProviderPayload(NFeRequest document)
        => new
        {
            ambiente = AmbienteLiteral(document.Ambiente),
            referencia = document.Referencia,
            infNFe = new
            {
                versao = "4.00",
                ide = new
                {
                    cUF = ResolveUfCode(document.Emitente.Endereco.Uf),
                    natOp = document.NaturezaOperacao,
                    mod = 55,
                    serie = document.Serie,
                    nNF = document.Numero,
                    dhEmi = document.DataEmissaoUtc.ToString("yyyy-MM-ddTHH:mm:ssK"),
                    tpNF = 1,
                    idDest = document.Emitente.Endereco.Uf == document.Destinatario.Endereco?.Uf ? 1 : 2,
                    cMunFG = document.Emitente.Endereco.CodigoMunicipioIbge,
                    tpImp = 1,
                    tpEmis = 1,
                    finNFe = 1,
                    indFinal = 1,
                    indPres = 1,
                    procEmi = 0,
                    verProc = "PDV-V1/1.0"
                },
                emit = new
                {
                    CNPJ = document.Emitente.Cnpj,
                    xNome = document.Emitente.RazaoSocial,
                    xFant = document.Emitente.NomeFantasia,
                    enderEmit = BuildAddressNode(document.Emitente.Endereco),
                    IE = document.Emitente.InscricaoEstadualIsento ? "ISENTO" : document.Emitente.InscricaoEstadual,
                    IM = document.Emitente.InscricaoMunicipal,
                    CNAE = document.Emitente.CnaePrincipal,
                    CRT = ResolveCrt(document.Emitente.RegimeTributario)
                },
                dest = BuildDestNode(document.Destinatario),
                det = document.Itens.Select((item, index) => BuildItemNode(item, index + 1, document.Emitente.RegimeTributario)).ToArray(),
                total = BuildTotalNode(document),
                transp = new { modFrete = 9 },
                pag = new
                {
                    detPag = document.Pagamentos.Select(item => new
                    {
                        tPag = ResolvePaymentCode(item.FormaPagamento),
                        xPag = ResolvePaymentCode(item.FormaPagamento) == "99" ? item.FormaPagamento : null,
                        vPag = item.ValorPago
                    }).ToArray()
                },
                infAdic = string.IsNullOrWhiteSpace(document.ObservacoesComplementares)
                    ? null
                    : new { infCpl = document.ObservacoesComplementares }
            }
        };

    private static object BuildAddressNode(NFeEnderecoRequest address)
        => new
        {
            xLgr = address.Logradouro,
            nro = address.Numero,
            xCpl = address.Complemento,
            xBairro = address.Bairro,
            cMun = address.CodigoMunicipioIbge,
            xMun = address.Cidade,
            UF = address.Uf,
            CEP = OnlyDigits(address.Cep),
            cPais = "1058",
            xPais = "BRASIL",
            fone = OnlyDigits(address.Telefone)
        };

    private static object BuildDestNode(NFeDestinatarioRequest destinatario)
    {
        var digits = OnlyDigits(destinatario.Documento);
        return new
        {
            CNPJ = digits?.Length == 14 ? digits : null,
            CPF = digits?.Length == 11 ? digits : null,
            xNome = destinatario.Nome,
            enderDest = destinatario.Endereco is null ? null : BuildAddressNode(destinatario.Endereco),
            indIEDest = 9,
            email = destinatario.Email
        };
    }

    private static object BuildItemNode(NFeItemRequest item, int index, EmpresaRegimeTributario regime)
    {
        var baseCalculo = item.Total;
        var aliquotaPis = item.Impostos.AliquotaPis ?? 0;
        var aliquotaCofins = item.Impostos.AliquotaCofins ?? 0;
        var valorPis = Math.Round(baseCalculo * aliquotaPis / 100m, 2, MidpointRounding.AwayFromZero);
        var valorCofins = Math.Round(baseCalculo * aliquotaCofins / 100m, 2, MidpointRounding.AwayFromZero);

        return new
        {
            nItem = index,
            prod = new
            {
                cProd = item.CodigoProduto,
                cEAN = string.IsNullOrWhiteSpace(item.CodigoBarras) ? "SEM GTIN" : item.CodigoBarras,
                xProd = item.Nome,
                NCM = OnlyDigits(item.Ncm),
                CEST = OnlyDigits(item.Cest),
                CFOP = OnlyDigits(item.Cfop),
                uCom = item.UnidadeComercial,
                qCom = item.Quantidade,
                vUnCom = item.ValorUnitario,
                vProd = item.Quantidade * item.ValorUnitario,
                cEANTrib = string.IsNullOrWhiteSpace(item.CodigoBarras) ? "SEM GTIN" : item.CodigoBarras,
                uTrib = item.UnidadeTributavel,
                qTrib = item.Quantidade,
                vUnTrib = item.ValorUnitario,
                vDesc = item.Desconto > 0 ? item.Desconto : (decimal?)null,
                indTot = 1
            },
            imposto = new
            {
                ICMS = BuildIcmsNode(item, regime),
                PIS = BuildPisNode(item.Impostos.CstPis, baseCalculo, aliquotaPis, valorPis),
                COFINS = BuildCofinsNode(item.Impostos.CstCofins, baseCalculo, aliquotaCofins, valorCofins)
            }
        };
    }

    private static object BuildIcmsNode(NFeItemRequest item, EmpresaRegimeTributario regime)
    {
        var simples = regime is EmpresaRegimeTributario.SimplesNacional or EmpresaRegimeTributario.SimplesExcessoSublimite;
        if (simples)
        {
            return item.Impostos.Csosn switch
            {
                "102" or "103" or "300" or "400" => new
                {
                    ICMSSN102 = new
                    {
                        orig = ResolveOrigem(item.Impostos.OrigemFiscal),
                        CSOSN = item.Impostos.Csosn
                    }
                },
                "500" => new
                {
                    ICMSSN500 = new
                    {
                        orig = ResolveOrigem(item.Impostos.OrigemFiscal),
                        CSOSN = "500",
                        vBCSTRet = 0m,
                        pST = 0m,
                        vICMSSubstituto = 0m,
                        vICMSSTRet = 0m
                    }
                },
                _ => new
                {
                    ICMSSN102 = new
                    {
                        orig = ResolveOrigem(item.Impostos.OrigemFiscal),
                        CSOSN = "102"
                    }
                }
            };
        }

        var baseCalculo = item.Total;
        var aliquota = item.Impostos.AliquotaIcms ?? 0;
        var valorIcms = Math.Round(baseCalculo * aliquota / 100m, 2, MidpointRounding.AwayFromZero);

        return item.Impostos.CstIcms switch
        {
            "00" => new
            {
                ICMS00 = new
                {
                    orig = ResolveOrigem(item.Impostos.OrigemFiscal),
                    CST = "00",
                    modBC = 3,
                    vBC = baseCalculo,
                    pICMS = aliquota,
                    vICMS = valorIcms
                }
            },
            "40" or "41" => new
            {
                ICMS40 = new
                {
                    orig = ResolveOrigem(item.Impostos.OrigemFiscal),
                    CST = item.Impostos.CstIcms
                }
            },
            _ => new
            {
                ICMS40 = new
                {
                    orig = ResolveOrigem(item.Impostos.OrigemFiscal),
                    CST = "40"
                }
            }
        };
    }

    private static object BuildPisNode(string? cstPis, decimal baseCalculo, decimal aliquota, decimal valorPis)
    {
        var cst = NormalizeTaxCode(cstPis, "99");
        return cst switch
        {
            "01" or "02" => new { PISAliq = new { CST = cst, vBC = baseCalculo, pPIS = aliquota, vPIS = valorPis } },
            "04" or "05" or "06" or "07" or "08" or "09" => new { PISNT = new { CST = cst } },
            _ => new { PISOutr = new { CST = cst, vBC = baseCalculo, pPIS = aliquota, vPIS = valorPis } }
        };
    }

    private static object BuildCofinsNode(string? cstCofins, decimal baseCalculo, decimal aliquota, decimal valorCofins)
    {
        var cst = NormalizeTaxCode(cstCofins, "99");
        return cst switch
        {
            "01" or "02" => new { COFINSAliq = new { CST = cst, vBC = baseCalculo, pCOFINS = aliquota, vCOFINS = valorCofins } },
            "04" or "05" or "06" or "07" or "08" or "09" => new { COFINSNT = new { CST = cst } },
            _ => new { COFINSOutr = new { CST = cst, vBC = baseCalculo, pCOFINS = aliquota, vCOFINS = valorCofins } }
        };
    }

    private static object BuildTotalNode(NFeRequest document)
    {
        var totalPis = 0m;
        var totalCofins = 0m;
        var totalIcmsBase = 0m;
        var totalIcms = 0m;

        foreach (var item in document.Itens)
        {
            var baseCalculo = item.Total;
            var aliquotaPis = item.Impostos.AliquotaPis ?? 0;
            var aliquotaCofins = item.Impostos.AliquotaCofins ?? 0;
            totalPis += Math.Round(baseCalculo * aliquotaPis / 100m, 2, MidpointRounding.AwayFromZero);
            totalCofins += Math.Round(baseCalculo * aliquotaCofins / 100m, 2, MidpointRounding.AwayFromZero);

            if (item.Impostos.CstIcms == "00")
            {
                totalIcmsBase += baseCalculo;
                totalIcms += Math.Round(baseCalculo * (item.Impostos.AliquotaIcms ?? 0) / 100m, 2, MidpointRounding.AwayFromZero);
            }
        }

        return new
        {
            ICMSTot = new
            {
                vBC = totalIcmsBase,
                vICMS = totalIcms,
                vICMSDeson = 0m,
                vFCP = 0m,
                vBCST = 0m,
                vST = 0m,
                vFCPST = 0m,
                vFCPSTRet = 0m,
                vProd = document.ValorProdutos,
                vFrete = 0m,
                vSeg = 0m,
                vDesc = document.ValorDesconto,
                vII = 0m,
                vIPI = 0m,
                vIPIDevol = 0m,
                vPIS = totalPis,
                vCOFINS = totalCofins,
                vOutro = 0m,
                vNF = document.ValorTotal
            }
        };
    }

    private static string ResolveCrt(EmpresaRegimeTributario regime)
        => regime switch
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

    private static string ResolvePaymentCode(string formaPagamento)
        => formaPagamento.ToLowerInvariant() switch
        {
            "dinheiro" => "01",
            "cartaocredito" => "03",
            "cartaodebito" => "04",
            "pix" => "17",
            "voucher" => "99",
            _ => "99"
        };

    private static int ResolveUfCode(string uf)
        => uf.ToUpperInvariant() switch
        {
            "RO" => 11,
            "AC" => 12,
            "AM" => 13,
            "RR" => 14,
            "PA" => 15,
            "AP" => 16,
            "TO" => 17,
            "MA" => 21,
            "PI" => 22,
            "CE" => 23,
            "RN" => 24,
            "PB" => 25,
            "PE" => 26,
            "AL" => 27,
            "SE" => 28,
            "BA" => 29,
            "MG" => 31,
            "ES" => 32,
            "RJ" => 33,
            "SP" => 35,
            "PR" => 41,
            "SC" => 42,
            "RS" => 43,
            "MS" => 50,
            "MT" => 51,
            "GO" => 52,
            "DF" => 53,
            _ => 35
        };

    private static string NormalizeTaxCode(string? value, string fallback)
        => string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();

    private static FiscalDocumentoStatus MapStatus(string? status, int? code)
    {
        var normalized = status?.Trim().ToLowerInvariant();
        return normalized switch
        {
            "autorizado" or "concluido" => FiscalDocumentoStatus.Autorizada,
            "cancelado" => FiscalDocumentoStatus.Cancelada,
            "erro" or "rejeitado" => FiscalDocumentoStatus.Rejeitada,
            "pendente" or "processando" => FiscalDocumentoStatus.Pendente,
            _ => MapByCode(code)
        };
    }

    private static string? ReadString(JsonElement node, string propertyName)
        => node.TryGetProperty(propertyName, out var value) && value.ValueKind != JsonValueKind.Null
            ? value.GetString()
            : null;

    private static int? ReadNullableInt(JsonElement node, string propertyName)
        => node.TryGetProperty(propertyName, out var value) && value.TryGetInt32(out var intValue)
            ? intValue
            : null;

    private static string? ReadNestedString(JsonElement node, string parent, string child)
        => node.TryGetProperty(parent, out var parentNode) ? ReadString(parentNode, child) : null;

    private static int? ReadNestedNullableInt(JsonElement node, string parent, string child)
        => node.TryGetProperty(parent, out var parentNode) ? ReadNullableInt(parentNode, child) : null;

    private static DateTime? ParseDate(string? value)
        => DateTime.TryParse(value, out var parsed) ? parsed.ToUniversalTime() : null;

    private static bool IsNotFoundResponse(HttpStatusCode statusCode, string? responseBody)
    {
        if (statusCode == HttpStatusCode.NotFound)
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(responseBody))
        {
            return false;
        }

        return responseBody.Contains("notfound", StringComparison.OrdinalIgnoreCase)
            || responseBody.Contains("not found", StringComparison.OrdinalIgnoreCase)
            || responseBody.Contains("CompanyNotFound", StringComparison.OrdinalIgnoreCase)
            || responseBody.Contains("CertificateNotFound", StringComparison.OrdinalIgnoreCase);
    }

    private static string? NormalizeThumbprint(string? value)
        => string.IsNullOrWhiteSpace(value)
            ? null
            : new string(value.Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();

    private static string Summarize(string? responseBody)
        => string.IsNullOrWhiteSpace(responseBody)
            ? "retorno vazio"
            : responseBody.Length <= 400 ? responseBody : responseBody[..400];
}
