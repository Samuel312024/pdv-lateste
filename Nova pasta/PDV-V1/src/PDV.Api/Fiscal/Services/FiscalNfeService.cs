using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PDV.Api.Common;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Fiscal.Contracts;
using PDV.Api.Fiscal.DTOs;
using PDV.Api.Fiscal.Validators;
using PDV.Api.Infrastructure;

namespace PDV.Api.Fiscal.Services;

public class FiscalNfeService(
    AppDbContext dbContext,
    CurrentUserService currentUser,
    FiscalProviderFactory providerFactory)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

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
            throw new AppException("A venda vinculada a NF-e nao possui pagamentos para compor o documento fiscal.");
        }

        if (!nota.ProntaParaTransmissao)
        {
            throw new AppException("A NF-e ainda possui pendencias fiscais. Revise o detalhamento antes de transmitir.");
        }

        var provider = providerFactory.Create(empresa);
        var request = BuildRequest(nota, venda, empresa);
        NFeRequestValidator.ValidateOrThrow(request.Documento);

        nota.ProviderFiscal = provider.Kind;
        nota.ReferenciaFiscal ??= request.Documento.Referencia;
        nota.DataTransmissao = DateTime.UtcNow;
        nota.PayloadOriginalJson = JsonSerializer.Serialize(request.Documento, JsonOptions);

        var result = await provider.EmitirNFeAsync(request);
        if (!result.Finalizado && provider.Kind != FiscalProvider.SefazDirect)
        {
            result = await PollUntilFinalAsync(provider, result.Referencia, cancellationToken);
        }

        ApplyResult(nota, result);
        RegisterTransmissionLog(nota, usuarioId, result.Status == FiscalDocumentoStatus.Autorizada, result.Mensagem, provider.DisplayName);
        await dbContext.SaveChangesAsync(cancellationToken);
        return nota;
    }

    public async Task<ConsultarNFeResult> SincronizarAsync(Guid notaFiscalId, CancellationToken cancellationToken = default)
    {
        var usuarioId = currentUser.GetUserId();
        var (nota, provider) = await LoadNotaProviderAsync(notaFiscalId, cancellationToken);
        var result = await provider.SincronizarNFeAsync(ResolveReferenceOrId(nota));

        ApplyResult(nota, result);
        RegisterOperationLog(nota, usuarioId, "Sincronizar", result.Mensagem, provider.DisplayName, new
        {
            nota.NotaFiscalId,
            nota.DocumentoFiscalId,
            nota.ReferenciaFiscal,
            nota.CodigoStatusSefaz
        });
        await dbContext.SaveChangesAsync(cancellationToken);
        return result;
    }

    public async Task<CancelarNFeResult> CancelarAsync(Guid notaFiscalId, string justificativa, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(justificativa))
        {
            throw new AppException("Informe a justificativa do cancelamento.");
        }

        var usuarioId = currentUser.GetUserId();
        var (nota, provider) = await LoadNotaProviderAsync(notaFiscalId, cancellationToken);
        if (nota.Status != NotaFiscalStatus.Autorizada)
        {
            throw new AppException("Somente NF-e autorizada pode ser cancelada.");
        }

        var result = await provider.CancelarNFeAsync(new CancelarNFeRequest(ResolveReferenceOrId(nota), justificativa.Trim()));
        ApplyCancelResult(nota, result);

        if (!result.Finalizado)
        {
            var refreshed = await provider.SincronizarNFeAsync(ResolveReferenceOrId(nota));
            ApplyResult(nota, refreshed);
            result = MergeCancellationWithConsulta(result, refreshed);
        }

        RegisterOperationLog(nota, usuarioId, "Cancelar", result.Mensagem, provider.DisplayName, new
        {
            nota.NotaFiscalId,
            nota.DocumentoFiscalId,
            nota.ReferenciaFiscal,
            nota.CodigoStatusSefaz,
            Justificativa = justificativa.Trim(),
            result.EventoId
        });
        await dbContext.SaveChangesAsync(cancellationToken);
        return result;
    }

    public async Task<FiscalEventoNFeResult> SolicitarCartaCorrecaoAsync(Guid notaFiscalId, string correcao, CancellationToken cancellationToken = default)
    {
        var usuarioId = currentUser.GetUserId();
        var (nota, provider) = await LoadNotaProviderAsync(notaFiscalId, cancellationToken);
        if (nota.Status != NotaFiscalStatus.Autorizada)
        {
            throw new AppException("Somente NF-e autorizada pode receber carta de correcao.");
        }

        var result = await provider.SolicitarCartaCorrecaoNFeAsync(new CartaCorrecaoNFeRequest(ResolveReferenceOrId(nota), correcao));
        ApplyFiscalEventResult(nota, result);

        if (!result.Finalizado)
        {
            var refreshed = await provider.SincronizarNFeAsync(ResolveReferenceOrId(nota));
            ApplyResult(nota, refreshed);
        }

        RegisterOperationLog(nota, usuarioId, "CartaCorrecao", result.Mensagem, provider.DisplayName, new
        {
            nota.NotaFiscalId,
            nota.DocumentoFiscalId,
            nota.ReferenciaFiscal,
            nota.CodigoStatusSefaz,
            result.EventoId,
            Correcao = correcao
        });
        await dbContext.SaveChangesAsync(cancellationToken);
        return result;
    }

    public async Task<EnviarEmailNFeResult> EnviarEmailAsync(Guid notaFiscalId, IReadOnlyCollection<string> destinatarios, CancellationToken cancellationToken = default)
    {
        var usuarioId = currentUser.GetUserId();
        var (nota, provider) = await LoadNotaProviderAsync(notaFiscalId, cancellationToken);
        var normalizedRecipients = destinatarios
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Select(item => item.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var result = await provider.EnviarEmailNFeAsync(new EnviarEmailNFeRequest(ResolveReferenceOrId(nota), normalizedRecipients));

        RegisterOperationLog(nota, usuarioId, "EnviarEmail", result.Mensagem, provider.DisplayName, new
        {
            nota.NotaFiscalId,
            nota.DocumentoFiscalId,
            nota.ReferenciaFiscal,
            Destinatarios = normalizedRecipients
        });
        await dbContext.SaveChangesAsync(cancellationToken);
        return result;
    }

    public async Task<BaixarNFeDocumentoResult> BaixarDocumentoAsync(
        Guid notaFiscalId,
        NFeDownloadDocumentoTipo tipo,
        bool incluirLogotipo,
        bool exibirNomeFantasia,
        string? formato,
        string? mensagemRodape,
        bool? canhoto,
        CancellationToken cancellationToken = default)
    {
        var (nota, provider) = await LoadNotaProviderAsync(notaFiscalId, cancellationToken);
        var result = await provider.BaixarDocumentoNFeAsync(new BaixarNFeDocumentoRequest(
            ResolveReferenceOrId(nota),
            tipo,
            incluirLogotipo,
            exibirNomeFantasia,
            formato,
            mensagemRodape,
            canhoto));

        CacheDownloadedDocument(nota, result);
        await dbContext.SaveChangesAsync(cancellationToken);
        return result;
    }

    public async Task<InutilizarNFeResult> InutilizarNumeracaoAsync(InutilizarNFeRequest request, CancellationToken cancellationToken = default)
    {
        var empresaId = currentUser.GetEmpresaId();
        var usuarioId = currentUser.GetUserId();
        var empresa = await dbContext.Empresas
            .FirstOrDefaultAsync(item => item.EmpresaId == empresaId, cancellationToken)
            ?? throw new NotFoundException("Empresa emissora nao encontrada.");
        var provider = providerFactory.Create(empresa);
        var result = await provider.InutilizarNumeracaoNFeAsync(request);

        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = empresaId,
            UsuarioId = usuarioId,
            Modulo = "NotasFiscais",
            Acao = "InutilizarNumeracao",
            Descricao = $"Pedido de inutilizacao da serie {request.Serie} numeros {request.NumeroInicial} a {request.NumeroFinal} enviado via {provider.DisplayName}.",
            Dados = JsonSerializer.Serialize(new
            {
                request.Ano,
                request.Serie,
                request.NumeroInicial,
                request.NumeroFinal,
                request.Justificativa,
                result.EventoId,
                result.CodigoStatus,
                result.Mensagem
            }),
            IpAddress = currentUser.GetIpAddress()
        });
        await dbContext.SaveChangesAsync(cancellationToken);
        return result;
    }

    public async Task<EmpresaFiscalSefazStatusDto> ConsultarStatusServicoAsync(Empresa empresa, CancellationToken cancellationToken = default)
    {
        var provider = providerFactory.Create(empresa);
        var result = await provider.ConsultarStatusServicoAsync();

        return new EmpresaFiscalSefazStatusDto(
            result.Disponivel,
            result.CodigoStatus,
            result.Mensagem,
            provider.Kind.ToString(),
            empresa.UsaIntegracaoDiretaSefaz || provider.Kind == FiscalProvider.SefazDirect,
            empresa.AmbienteNfe.ToString(),
            empresa.Uf ?? string.Empty,
            result.Url,
            result.DataRecebimentoUtc,
            DateTime.UtcNow,
            new EmpresaFiscalSefazDiagnosticoDto(
                empresa.UsaIntegracaoDiretaSefaz || provider.Kind == FiscalProvider.SefazDirect ? "RespostaFiscal" : "HttpRequest",
                result.Mensagem,
                null,
                result.Disponivel,
                null,
                null,
                result.CodigoStatus,
                false,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                provider.Kind == FiscalProvider.SefazDirect ? "Integracao direta com a SEFAZ." : $"Integracao via provider REST {provider.DisplayName}.",
                result.DetalheTecnico));
    }

    private async Task<EmitirNFeResult> PollUntilFinalAsync(IFiscalProvider provider, string referencia, CancellationToken cancellationToken)
    {
        var last = new EmitirNFeResult(
            FiscalDocumentoStatus.Pendente,
            "Documento aguardando processamento no provider fiscal.",
            referencia,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            DateTime.UtcNow,
            null,
            false);

        for (var attempt = 0; attempt < 5; attempt += 1)
        {
            cancellationToken.ThrowIfCancellationRequested();
            await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);
            var consult = attempt >= 3
                ? await provider.SincronizarNFeAsync(referencia)
                : await provider.ConsultarNFeAsync(referencia);
            last = new EmitirNFeResult(
                consult.Status,
                consult.Mensagem,
                consult.Referencia,
                consult.DocumentoId,
                consult.CodigoStatus,
                consult.ChaveAcesso,
                consult.Protocolo,
                consult.XmlAutorizado,
                consult.DanfeUrl,
                consult.DanfePdfBase64,
                null,
                null,
                consult.RetornoProviderJson,
                null,
                consult.DataAutorizacaoUtc,
                consult.Finalizado);

            if (consult.Finalizado)
            {
                return last;
            }
        }

        return last;
    }

    private async Task<(NotaFiscal nota, IFiscalProvider provider)> LoadNotaProviderAsync(Guid notaFiscalId, CancellationToken cancellationToken)
    {
        var empresaId = currentUser.GetEmpresaId();
        var nota = await dbContext.NotasFiscais
            .FirstOrDefaultAsync(item => item.NotaFiscalId == notaFiscalId && item.EmpresaId == empresaId, cancellationToken)
            ?? throw new NotFoundException("NF-e nao encontrada.");

        var empresa = await dbContext.Empresas
            .FirstOrDefaultAsync(item => item.EmpresaId == empresaId, cancellationToken)
            ?? throw new NotFoundException("Empresa emissora nao encontrada.");

        return (nota, providerFactory.Create(empresa, nota.ProviderFiscal));
    }

    private static EmitirNFeRequest BuildRequest(NotaFiscal nota, Venda venda, Empresa empresa)
    {
        var emitente = Deserialize<NotaFiscalEmitenteSnapshotDto>(nota.EmitenteSnapshotJson)
            ?? throw new AppException("Nao foi possivel ler o snapshot do emitente da NF-e.");
        var destinatario = Deserialize<NotaFiscalDestinatarioSnapshotDto>(nota.DestinatarioSnapshotJson)
            ?? throw new AppException("Nao foi possivel ler o snapshot do destinatario da NF-e.");

        var document = new NFeRequest(
            nota.NotaFiscalId,
            nota.ReferenciaFiscal ?? BuildReference(nota),
            nota.Ambiente,
            nota.Serie,
            nota.Numero,
            nota.DataEmissao,
            "VENDA DE MERCADORIA",
            nota.Observacoes ?? $"Gerado automaticamente pela venda {nota.NumeroVenda}.",
            new NFeEmitenteRequest(
                emitente.RazaoSocial,
                emitente.NomeFantasia,
                OnlyDigits(emitente.Cnpj) ?? string.Empty,
                emitente.InscricaoEstadual,
                emitente.InscricaoEstadualIsento,
                emitente.InscricaoMunicipal,
                emitente.CnaePrincipal,
                emitente.EmailFiscal,
                ParseRegime(emitente.RegimeTributario),
                new NFeEnderecoRequest(
                    emitente.Logradouro ?? string.Empty,
                    emitente.Numero ?? string.Empty,
                    emitente.Complemento,
                    emitente.Bairro ?? string.Empty,
                    emitente.Cidade ?? string.Empty,
                    emitente.Uf ?? string.Empty,
                    emitente.Cep ?? string.Empty,
                    emitente.CodigoMunicipioIbge ?? string.Empty,
                    emitente.Telefone)),
            new NFeDestinatarioRequest(
                destinatario.Nome,
                OnlyDigits(destinatario.Documento),
                destinatario.Email,
                true,
                new NFeEnderecoRequest(
                    destinatario.Logradouro ?? string.Empty,
                    destinatario.Numero ?? string.Empty,
                    destinatario.Complemento,
                    destinatario.Bairro ?? string.Empty,
                    destinatario.Cidade ?? string.Empty,
                    destinatario.Uf ?? string.Empty,
                    destinatario.Cep ?? string.Empty,
                    ResolveMunicipioCodigo(venda.Cliente),
                    destinatario.Telefone)),
            nota.Itens
                .OrderBy(item => item.ProdutoNome)
                .Select(item => new NFeItemRequest(
                    item.ProdutoId,
                    item.ProdutoId.ToString("N")[..8].ToUpperInvariant(),
                    item.ProdutoNome,
                    item.UnidadeMedida,
                    item.UnidadeTributavel ?? item.UnidadeMedida,
                    null,
                    OnlyDigits(item.Ncm) ?? string.Empty,
                    OnlyDigits(item.Cest),
                    OnlyDigits(item.Cfop) ?? string.Empty,
                    item.Quantidade,
                    item.ValorUnitario,
                    item.Desconto,
                    item.Total,
                    new NFeImpostoRequest(
                        item.OrigemFiscal,
                        item.Csosn,
                        item.CstIcms,
                        item.CstPis,
                        item.CstCofins,
                        item.AliquotaIcms,
                        item.AliquotaPis,
                        item.AliquotaCofins)))
                .ToArray(),
            venda.Pagamentos
                .Select(item => new NFePagamentoRequest(item.FormaPagamento.ToString(), item.ValorPago))
                .ToArray(),
            nota.ValorProdutos,
            nota.ValorDesconto,
            nota.ValorTotal);

        return new EmitirNFeRequest(
            new FiscalProviderContext(
                empresa.EmpresaId,
                empresa.Nome,
                emitente.NomeFantasia,
                OnlyDigits(empresa.Cnpj) ?? string.Empty,
                emitente.InscricaoEstadual,
                emitente.InscricaoEstadualIsento,
                emitente.InscricaoMunicipal,
                emitente.Telefone,
                emitente.EmailFiscal,
                empresa.Uf ?? string.Empty,
                ParseRegime(emitente.RegimeTributario),
                empresa.CertificadoDigitalCaminho,
                null,
                new NFeEnderecoRequest(
                    emitente.Logradouro ?? string.Empty,
                    emitente.Numero ?? string.Empty,
                    emitente.Complemento,
                    emitente.Bairro ?? string.Empty,
                    emitente.Cidade ?? string.Empty,
                    emitente.Uf ?? string.Empty,
                    emitente.Cep ?? string.Empty,
                    emitente.CodigoMunicipioIbge ?? string.Empty,
                    emitente.Telefone),
                empresa.AmbienteNfe,
                empresa.UsaIntegracaoDiretaSefaz ? FiscalProvider.SefazDirect : empresa.ProviderFiscal,
                empresa.UsaIntegracaoDiretaSefaz,
                empresa.UrlApiFiscal,
                null,
                null,
                null),
            document);
    }

    private static void ApplyResult(NotaFiscal nota, EmitirNFeResult result)
    {
        nota.ReferenciaFiscal = result.Referencia;
        nota.DocumentoFiscalId = result.DocumentoId;
        nota.ChaveAcesso = result.ChaveAcesso ?? nota.ChaveAcesso;
        nota.ProtocoloAutorizacao = result.Protocolo ?? nota.ProtocoloAutorizacao;
        nota.CodigoStatusSefaz = result.CodigoStatus;
        nota.MensagemStatusSefaz = TrimTo(result.Mensagem, 500);
        nota.PayloadProviderJson = result.PayloadProviderJson;
        nota.RetornoProviderJson = result.RetornoProviderJson;
        nota.DanfeUrl = result.DanfeUrl;
        nota.DanfePdfBase64 = result.DanfePdfBase64;
        nota.XmlRetorno = result.XmlAutorizado ?? nota.XmlRetorno;
        nota.DataTransmissao = result.DataTransmissaoUtc ?? nota.DataTransmissao ?? DateTime.UtcNow;
        nota.DataAutorizacao = result.DataAutorizacaoUtc;
        nota.Status = result.Status switch
        {
            FiscalDocumentoStatus.Autorizada => NotaFiscalStatus.Autorizada,
            FiscalDocumentoStatus.Cancelada => NotaFiscalStatus.Cancelada,
            FiscalDocumentoStatus.Rejeitada or FiscalDocumentoStatus.Erro => NotaFiscalStatus.Rejeitada,
            _ => NotaFiscalStatus.PendenteTransmissao
        };
    }

    private static void ApplyResult(NotaFiscal nota, ConsultarNFeResult result)
        => ApplyResult(
            nota,
            new EmitirNFeResult(
                result.Status,
                result.Mensagem,
                result.Referencia,
                result.DocumentoId,
                result.CodigoStatus,
                result.ChaveAcesso,
                result.Protocolo,
                result.XmlAutorizado,
                result.DanfeUrl,
                result.DanfePdfBase64,
                null,
                null,
                result.RetornoProviderJson,
                nota.DataTransmissao ?? DateTime.UtcNow,
                result.DataAutorizacaoUtc,
                result.Finalizado));

    private static void ApplyCancelResult(NotaFiscal nota, CancelarNFeResult result)
    {
        nota.ReferenciaFiscal ??= result.Referencia;
        nota.DocumentoFiscalId ??= result.DocumentoId;
        nota.ChaveAcesso = result.ChaveAcesso ?? nota.ChaveAcesso;
        nota.ProtocoloAutorizacao = result.Protocolo ?? nota.ProtocoloAutorizacao;
        nota.CodigoStatusSefaz = result.CodigoStatus ?? nota.CodigoStatusSefaz;
        nota.MensagemStatusSefaz = TrimTo(result.Mensagem, 500);
        nota.RetornoProviderJson = result.RetornoProviderJson ?? nota.RetornoProviderJson;
        if (result.Status == FiscalDocumentoStatus.Cancelada)
        {
            nota.Status = NotaFiscalStatus.Cancelada;
        }
    }

    private static void ApplyFiscalEventResult(NotaFiscal nota, FiscalEventoNFeResult result)
    {
        nota.ReferenciaFiscal ??= result.Referencia;
        nota.DocumentoFiscalId ??= result.DocumentoId;
        nota.ChaveAcesso = result.ChaveAcesso ?? nota.ChaveAcesso;
        nota.ProtocoloAutorizacao = result.Protocolo ?? nota.ProtocoloAutorizacao;
        nota.CodigoStatusSefaz = result.CodigoStatus ?? nota.CodigoStatusSefaz;
        nota.MensagemStatusSefaz = TrimTo(result.Mensagem, 500);
        nota.RetornoProviderJson = result.RetornoProviderJson ?? nota.RetornoProviderJson;
        if (result.Status == FiscalDocumentoStatus.Cancelada)
        {
            nota.Status = NotaFiscalStatus.Cancelada;
        }
    }

    private static void CacheDownloadedDocument(NotaFiscal nota, BaixarNFeDocumentoResult result)
    {
        if (!result.Disponivel)
        {
            return;
        }

        if (result.Tipo == NFeDownloadDocumentoTipo.DanfePdf)
        {
            nota.DanfeUrl = result.Url ?? nota.DanfeUrl;
            nota.DanfePdfBase64 = result.ConteudoBase64 ?? nota.DanfePdfBase64;
            return;
        }

        if (result.Tipo == NFeDownloadDocumentoTipo.XmlProcessado && !string.IsNullOrWhiteSpace(result.ConteudoTexto))
        {
            nota.XmlRetorno = result.ConteudoTexto;
        }
    }

    private static CancelarNFeResult MergeCancellationWithConsulta(CancelarNFeResult cancelamento, ConsultarNFeResult consulta)
        => new(
            consulta.Status == FiscalDocumentoStatus.Cancelada ? FiscalDocumentoStatus.Cancelada : cancelamento.Status,
            consulta.Mensagem,
            consulta.Referencia,
            consulta.DocumentoId,
            cancelamento.EventoId,
            consulta.CodigoStatus ?? cancelamento.CodigoStatus,
            consulta.Protocolo ?? cancelamento.Protocolo,
            consulta.ChaveAcesso ?? cancelamento.ChaveAcesso,
            consulta.RetornoProviderJson ?? cancelamento.RetornoProviderJson,
            consulta.DataAutorizacaoUtc ?? cancelamento.DataRecebimentoUtc,
            consulta.Finalizado);

    private void RegisterTransmissionLog(NotaFiscal nota, Guid usuarioId, bool sucesso, string mensagem, string provider)
    {
        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = nota.EmpresaId,
            UsuarioId = usuarioId,
            Modulo = "NotasFiscais",
            Acao = "Transmitir",
            Descricao = sucesso
                ? $"NF-e {nota.Serie}/{nota.Numero} transmitida com sucesso via {provider}."
                : $"NF-e {nota.Serie}/{nota.Numero} transmitida via {provider} com retorno pendente ou rejeicao.",
            Dados = JsonSerializer.Serialize(new
            {
                nota.NotaFiscalId,
                nota.ProviderFiscal,
                nota.DocumentoFiscalId,
                nota.ReferenciaFiscal,
                nota.CodigoStatusSefaz,
                Mensagem = mensagem
            }),
            IpAddress = currentUser.GetIpAddress()
        });
    }

    private void RegisterOperationLog(NotaFiscal nota, Guid usuarioId, string action, string message, string provider, object payload)
    {
        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = nota.EmpresaId,
            UsuarioId = usuarioId,
            Modulo = "NotasFiscais",
            Acao = action,
            Descricao = $"Operacao {action} da NF-e {nota.Serie}/{nota.Numero} via {provider}.",
            Dados = JsonSerializer.Serialize(new
            {
                Mensagem = message,
                Payload = payload
            }),
            IpAddress = currentUser.GetIpAddress()
        });
    }

    private static T? Deserialize<T>(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return default;
        }

        try
        {
            return JsonSerializer.Deserialize<T>(json, JsonOptions);
        }
        catch
        {
            return default;
        }
    }

    private static string BuildReference(NotaFiscal nota)
        => $"NF{nota.Serie:D3}{nota.Numero:D9}-{nota.NotaFiscalId.ToString("N")[..8].ToUpperInvariant()}";

    private static string ResolveReferenceOrId(NotaFiscal nota)
        => nota.DocumentoFiscalId
            ?? nota.ReferenciaFiscal
            ?? nota.ChaveAcesso
            ?? throw new AppException("A NF-e ainda nao possui referencia ou identificador para consultar o provider fiscal.");

    private static string? OnlyDigits(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var digits = new string(value.Where(char.IsDigit).ToArray());
        return digits.Length == 0 ? null : digits;
    }

    private static EmpresaRegimeTributario ParseRegime(string value)
        => Enum.TryParse<EmpresaRegimeTributario>(value, true, out var parsed)
            ? parsed
            : EmpresaRegimeTributario.SimplesNacional;

    private static string ResolveMunicipioCodigo(Cliente? cliente)
        => OnlyDigits(cliente?.CodigoMunicipioIbge)
            ?? throw new AppException($"Cliente {cliente?.Nome ?? "sem identificacao"} esta sem codigo IBGE do municipio para a NF-e.");

    private static string TrimTo(string value, int maxLength)
        => value.Length <= maxLength ? value : value[..maxLength];
}
