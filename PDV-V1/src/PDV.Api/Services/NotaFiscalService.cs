using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PDV.Api.Common;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Fiscal.DTOs;
using PDV.Api.Fiscal.Services;
using PDV.Api.Infrastructure;

namespace PDV.Api.Services;

public class NotaFiscalService(
    AppDbContext dbContext,
    CurrentUserService currentUser,
    FiscalNfeService fiscalNfeService,
    MunicipioCatalogService municipioCatalogService)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<IReadOnlyCollection<NotaFiscalResumoDto>> GetAllAsync()
    {
        var empresaId = currentUser.GetEmpresaId();
        var notas = await dbContext.NotasFiscais
            .AsNoTracking()
            .Where(item => item.EmpresaId == empresaId)
            .OrderByDescending(item => item.DataEmissao)
            .Take(100)
            .ToListAsync();

        return notas.Select(MapResumo).ToArray();
    }

    public async Task<NotaFiscalDto> GetByIdAsync(Guid id)
    {
        var empresaId = currentUser.GetEmpresaId();
        var nota = await dbContext.NotasFiscais
            .AsNoTracking()
            .Include(item => item.Itens)
            .FirstOrDefaultAsync(item => item.NotaFiscalId == id && item.EmpresaId == empresaId)
            ?? throw new NotFoundException("NF-e nao encontrada.");

        return MapDetalhe(nota);
    }

    public async Task<IReadOnlyCollection<NotaFiscalVendaDisponivelDto>> GetVendasDisponiveisAsync(string? termo)
    {
        var empresaId = currentUser.GetEmpresaId();
        var normalizedTerm = NormalizeNullable(termo);

        var vendas = await dbContext.Vendas
            .AsNoTracking()
            .Include(item => item.Cliente)
            .Include(item => item.Itens)
            .Where(item =>
                item.EmpresaId == empresaId &&
                item.Status == VendaStatus.Finalizada &&
                !dbContext.NotasFiscais.Any(nota => nota.EmpresaId == empresaId && nota.VendaId == item.VendaId))
            .Where(item =>
                normalizedTerm == null ||
                item.NumeroVenda.Contains(normalizedTerm) ||
                (item.Cliente != null && item.Cliente.Nome.Contains(normalizedTerm)))
            .OrderByDescending(item => item.DataVenda)
            .Take(50)
            .ToListAsync();

        return vendas.Select(item => new NotaFiscalVendaDisponivelDto(
            item.VendaId,
            item.NumeroVenda,
            item.DataVenda,
            NormalizeNullable(item.Cliente?.Nome) ?? "Consumidor final",
            NormalizeNullable(item.Cliente?.Documento),
            item.Total,
            item.Itens.Count)).ToArray();
    }

    public async Task<NotaFiscalDto> EmitirPorVendaAsync(Guid vendaId, EmitirNotaFiscalVendaRequest request)
    {
        var empresaId = currentUser.GetEmpresaId();
        var usuarioId = currentUser.GetUserId();
        var empresa = await dbContext.Empresas
            .FirstOrDefaultAsync(item => item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Empresa nao encontrada.");

        var venda = await LoadVendaParaNotaAsync(empresaId, vendaId);
        var nota = await CriarNotaFiscalAsync(venda, empresa, usuarioId, NotaFiscalOrigem.Manual, request.Observacoes);
        await dbContext.SaveChangesAsync();
        return MapDetalhe(nota);
    }

    public async Task<TransmitirNotaFiscalResponse> TransmitirAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var nota = await fiscalNfeService.TransmitirAsync(id, cancellationToken);
        var detalhe = MapDetalhe(nota);
        var autorizada = nota.Status == NotaFiscalStatus.Autorizada;

        return new TransmitirNotaFiscalResponse(
            detalhe,
            autorizada
                ? $"NF-e {nota.Serie}/{nota.Numero} autorizada em {GetAmbienteDescription(nota.Ambiente)}."
                : nota.MensagemStatusSefaz ?? $"NF-e {nota.Serie}/{nota.Numero} devolvida pela SEFAZ em {GetAmbienteDescription(nota.Ambiente)}.",
            autorizada);
    }

    public async Task<NotaFiscalOperacaoResponse> SincronizarAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var result = await fiscalNfeService.SincronizarAsync(id, cancellationToken);
        var detalhe = await GetByIdAsync(id);
        return new NotaFiscalOperacaoResponse(
            detalhe,
            result.Mensagem,
            result.Finalizado,
            null,
            null,
            result.CodigoStatus,
            result.Protocolo);
    }

    public async Task<NotaFiscalOperacaoResponse> CancelarAsync(Guid id, CancelarNotaFiscalRequest request, CancellationToken cancellationToken = default)
    {
        var result = await fiscalNfeService.CancelarAsync(id, request.Justificativa, cancellationToken);
        var detalhe = await GetByIdAsync(id);
        return new NotaFiscalOperacaoResponse(
            detalhe,
            result.Mensagem,
            result.Finalizado,
            result.EventoId,
            "cancelamento",
            result.CodigoStatus,
            result.Protocolo);
    }

    public async Task<NotaFiscalOperacaoResponse> SolicitarCartaCorrecaoAsync(Guid id, CartaCorrecaoNotaFiscalRequest request, CancellationToken cancellationToken = default)
    {
        var result = await fiscalNfeService.SolicitarCartaCorrecaoAsync(id, request.Correcao, cancellationToken);
        var detalhe = await GetByIdAsync(id);
        return new NotaFiscalOperacaoResponse(
            detalhe,
            result.Mensagem,
            result.Finalizado,
            result.EventoId,
            result.TipoEvento,
            result.CodigoStatus,
            result.Protocolo);
    }

    public async Task<NotaFiscalEmailResponse> EnviarEmailAsync(Guid id, EnviarEmailNotaFiscalRequest request, CancellationToken cancellationToken = default)
    {
        var result = await fiscalNfeService.EnviarEmailAsync(id, request.Destinatarios ?? [], cancellationToken);
        var detalhe = await GetByIdAsync(id);
        return new NotaFiscalEmailResponse(detalhe, result.Mensagem, result.Status);
    }

    public async Task<NotaFiscalDownloadDocumentoDto> BaixarDocumentoAsync(Guid id, BaixarNotaFiscalDocumentoRequest request, CancellationToken cancellationToken = default)
    {
        var tipo = ParseDownloadType(request.Tipo);
        var result = await fiscalNfeService.BaixarDocumentoAsync(
            id,
            tipo,
            request.IncluirLogotipo,
            request.ExibirNomeFantasia,
            request.Formato,
            request.MensagemRodape,
            request.Canhoto,
            cancellationToken);

        return new NotaFiscalDownloadDocumentoDto(
            id,
            result.Tipo.ToString(),
            result.ContentType,
            result.NomeArquivo,
            result.ConteudoBase64,
            result.ConteudoTexto,
            result.Url,
            result.Disponivel,
            result.Mensagem);
    }

    public async Task<NotaFiscalInutilizacaoResponse> InutilizarNumeracaoAsync(InutilizarNotaFiscalNumeracaoRequest request, CancellationToken cancellationToken = default)
    {
        var result = await fiscalNfeService.InutilizarNumeracaoAsync(
            new InutilizarNFeRequest(
                request.Ano,
                request.Serie,
                request.NumeroInicial,
                request.NumeroFinal,
                request.Justificativa),
            cancellationToken);

        return new NotaFiscalInutilizacaoResponse(
            result.Mensagem,
            result.Finalizado,
            result.EventoId,
            result.TipoEvento,
            result.CodigoStatus,
            result.Protocolo);
    }

    public async Task<NotaFiscal> EmitirPorVendaInternaAsync(Guid empresaId, Guid usuarioId, Venda venda, string? observacoes, NotaFiscalOrigem origem)
    {
        var empresa = await dbContext.Empresas
            .FirstOrDefaultAsync(item => item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Empresa nao encontrada.");

        return await CriarNotaFiscalAsync(venda, empresa, usuarioId, origem, observacoes);
    }

    private async Task<Venda> LoadVendaParaNotaAsync(Guid empresaId, Guid vendaId)
    {
        var venda = await dbContext.Vendas
            .Include(item => item.Cliente)
            .Include(item => item.Itens)
                .ThenInclude(item => item.Produto)
            .FirstOrDefaultAsync(item => item.VendaId == vendaId && item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Venda nao encontrada.");

        if (venda.Status != VendaStatus.Finalizada)
        {
            throw new AppException("Somente vendas finalizadas podem gerar NF-e.");
        }

        return venda;
    }

    private async Task<NotaFiscal> CriarNotaFiscalAsync(Venda venda, Empresa empresa, Guid usuarioId, NotaFiscalOrigem origem, string? observacoes)
    {
        if (empresa.SerieNfe is < 1 or > 999)
        {
            throw new AppException("Serie padrao da NF-e invalida na empresa.");
        }

        if (empresa.ProximoNumeroNfe is < 1 or > 999999999)
        {
            throw new AppException("Proximo numero da NF-e invalido na empresa.");
        }

        if (await dbContext.NotasFiscais.AnyAsync(item => item.EmpresaId == empresa.EmpresaId && item.VendaId == venda.VendaId))
        {
            throw new AppException("Ja existe NF-e vinculada a esta venda.");
        }

        var emitente = BuildEmitenteSnapshot(empresa);
        var destinatario = BuildDestinatarioSnapshot(venda.Cliente);
        var pendencias = (await BuildPendenciasAsync(empresa, venda)).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        var prontaParaTransmissao = pendencias.Length == 0;

        var nota = new NotaFiscal
        {
            NotaFiscalId = Guid.NewGuid(),
            EmpresaId = empresa.EmpresaId,
            VendaId = venda.VendaId,
            ClienteId = venda.ClienteId,
            UsuarioId = usuarioId,
            Numero = empresa.ProximoNumeroNfe,
            Serie = empresa.SerieNfe,
            Ambiente = empresa.AmbienteNfe,
            Status = prontaParaTransmissao ? NotaFiscalStatus.PendenteTransmissao : NotaFiscalStatus.Rascunho,
            Origem = origem,
            NumeroVenda = venda.NumeroVenda,
            DestinatarioNome = destinatario.Nome,
            DestinatarioDocumento = destinatario.Documento,
            EmitenteSnapshotJson = JsonSerializer.Serialize(emitente, JsonOptions),
            DestinatarioSnapshotJson = JsonSerializer.Serialize(destinatario, JsonOptions),
            PendenciasJson = pendencias.Length == 0 ? null : JsonSerializer.Serialize(pendencias, JsonOptions),
            Observacoes = NormalizeMaxLength(observacoes, 500),
            ValorProdutos = venda.Subtotal,
            ValorDesconto = venda.DescontoTotal,
            ValorTotal = venda.Total,
            ProntaParaTransmissao = prontaParaTransmissao,
            ProviderFiscal = empresa.UsaIntegracaoDiretaSefaz ? FiscalProvider.SefazDirect : empresa.ProviderFiscal,
            ReferenciaFiscal = $"NF{empresa.SerieNfe:D3}{empresa.ProximoNumeroNfe:D9}-{venda.VendaId.ToString("N")[..8].ToUpperInvariant()}",
            DataEmissao = DateTime.UtcNow
        };

        foreach (var item in venda.Itens)
        {
            var produto = item.Produto;
            var cfop = ResolveCfopVenda(empresa.Uf, venda.Cliente?.Uf, produto);

            nota.Itens.Add(new NotaFiscalItem
            {
                NotaFiscalItemId = Guid.NewGuid(),
                NotaFiscalId = nota.NotaFiscalId,
                ProdutoId = produto.ProdutoId,
                ProdutoNome = produto.Nome,
                UnidadeMedida = NormalizeNullable(produto.UnidadeMedida) ?? "UN",
                Ncm = NormalizeNullable(produto.Ncm),
                Cest = NormalizeNullable(produto.Cest),
                OrigemFiscal = NormalizeNullable(produto.OrigemFiscal),
                Cfop = NormalizeNullable(cfop),
                Csosn = NormalizeNullable(produto.Csosn),
                CstIcms = NormalizeNullable(produto.CstIcms),
                CstPis = NormalizeNullable(produto.CstPis),
                CstCofins = NormalizeNullable(produto.CstCofins),
                BeneficioFiscalCodigo = NormalizeNullable(produto.BeneficioFiscalCodigo),
                CodigoAnp = NormalizeNullable(produto.CodigoAnp),
                UnidadeTributavel = NormalizeNullable(produto.UnidadeTributavel) ?? NormalizeNullable(produto.UnidadeMedida) ?? "UN",
                ExTipi = NormalizeNullable(produto.ExTipi),
                AliquotaIcms = produto.AliquotaIcms,
                AliquotaIpi = produto.AliquotaIpi,
                AliquotaPis = produto.AliquotaPis,
                AliquotaCofins = produto.AliquotaCofins,
                Quantidade = item.Quantidade,
                ValorUnitario = item.ValorUnitario,
                Desconto = item.Desconto,
                Total = item.Total
            });
        }

        empresa.ProximoNumeroNfe += 1;
        dbContext.NotasFiscais.Add(nota);
        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = empresa.EmpresaId,
            UsuarioId = usuarioId,
            Modulo = "NotasFiscais",
            Acao = "Emissao",
            Descricao = prontaParaTransmissao
                ? $"NF-e serie {nota.Serie} numero {nota.Numero} gerada para a venda {venda.NumeroVenda}."
                : $"NF-e serie {nota.Serie} numero {nota.Numero} gerada em rascunho para a venda {venda.NumeroVenda}.",
            Dados = pendencias.Length == 0 ? null : JsonSerializer.Serialize(pendencias, JsonOptions),
            IpAddress = currentUser.GetIpAddress()
        });

        return nota;
    }

    private static NotaFiscalResumoDto MapResumo(NotaFiscal nota)
    {
        var pendencias = DeserializeStringCollection(nota.PendenciasJson);
        return new NotaFiscalResumoDto(
            nota.NotaFiscalId,
            nota.Numero,
            nota.Serie,
            nota.Ambiente.ToString(),
            nota.ProviderFiscal.ToString(),
            nota.Status.ToString(),
            nota.Origem.ToString(),
            nota.NumeroVenda,
            nota.DestinatarioNome,
            nota.DestinatarioDocumento,
            nota.DataEmissao,
            nota.ValorTotal,
            nota.ProntaParaTransmissao,
            pendencias.Count,
            nota.ChaveAcesso,
            nota.CodigoStatusSefaz,
            nota.MensagemStatusSefaz,
            nota.ProtocoloAutorizacao,
            nota.DataAutorizacao);
    }

    private static NotaFiscalDto MapDetalhe(NotaFiscal nota)
    {
        var emitente = DeserializeSnapshot<NotaFiscalEmitenteSnapshotDto>(nota.EmitenteSnapshotJson)
            ?? new NotaFiscalEmitenteSnapshotDto(string.Empty, null, null, null, false, null, null, null, null, null, null, null, null, null, null, null, null, string.Empty, string.Empty);
        var destinatario = DeserializeSnapshot<NotaFiscalDestinatarioSnapshotDto>(nota.DestinatarioSnapshotJson)
            ?? new NotaFiscalDestinatarioSnapshotDto(nota.DestinatarioNome, nota.DestinatarioDocumento, null, null, null, null, null, null, null, null, null);
        var pendencias = DeserializeStringCollection(nota.PendenciasJson);

        return new NotaFiscalDto(
            nota.NotaFiscalId,
            nota.EmpresaId,
            nota.VendaId,
            nota.ClienteId,
            nota.UsuarioId,
            nota.Numero,
            nota.Serie,
            nota.Ambiente.ToString(),
            nota.ProviderFiscal.ToString(),
            nota.Status.ToString(),
            nota.Origem.ToString(),
            nota.NumeroVenda,
            nota.DataEmissao,
            nota.ValorProdutos,
            nota.ValorDesconto,
            nota.ValorTotal,
            nota.ProntaParaTransmissao,
            nota.ChaveAcesso,
            nota.ReferenciaFiscal,
            nota.DocumentoFiscalId,
            nota.CodigoStatusSefaz,
            nota.MensagemStatusSefaz,
            nota.ProtocoloAutorizacao,
            nota.DanfeUrl,
            nota.DataTransmissao,
            nota.DataAutorizacao,
            nota.PayloadOriginalJson,
            nota.PayloadProviderJson,
            nota.RetornoProviderJson,
            nota.XmlEnvio,
            nota.XmlRetorno,
            nota.Observacoes,
            pendencias,
            emitente,
            destinatario,
            nota.Itens
                .OrderBy(item => item.ProdutoNome)
                .Select(item => new NotaFiscalItemDto(
                    item.NotaFiscalItemId,
                    item.ProdutoId,
                    item.ProdutoNome,
                    item.UnidadeMedida,
                    item.Ncm,
                    item.Cest,
                    item.OrigemFiscal,
                    item.Cfop,
                    item.Csosn,
                    item.CstIcms,
                    item.CstPis,
                    item.CstCofins,
                    item.BeneficioFiscalCodigo,
                    item.CodigoAnp,
                    item.UnidadeTributavel,
                    item.ExTipi,
                    item.AliquotaIcms,
                    item.AliquotaIpi,
                    item.AliquotaPis,
                    item.AliquotaCofins,
                    item.Quantidade,
                    item.ValorUnitario,
                    item.Desconto,
                    item.Total)).ToArray());
    }

    private static NotaFiscalEmitenteSnapshotDto BuildEmitenteSnapshot(Empresa empresa)
        => new(
            empresa.Nome,
            NormalizeNullable(empresa.NomeFantasia),
            FormatDocumento(empresa.Cnpj),
            NormalizeNullable(empresa.InscricaoEstadual),
            empresa.InscricaoEstadualIsento,
            NormalizeNullable(empresa.InscricaoMunicipal),
            NormalizeNullable(empresa.CnaePrincipal),
            NormalizeNullable(empresa.Telefone),
            NormalizeNullable(empresa.EmailFiscal),
            FormatCep(empresa.Cep),
            NormalizeNullable(empresa.Logradouro),
            NormalizeNullable(empresa.Numero),
            NormalizeNullable(empresa.Complemento),
            NormalizeNullable(empresa.Bairro),
            NormalizeNullable(empresa.Cidade),
            NormalizeNullable(empresa.Uf),
            NormalizeNullable(empresa.CodigoMunicipioIbge),
            empresa.RegimeTributario.ToString(),
            empresa.AmbienteNfe.ToString());

    private static NotaFiscalDestinatarioSnapshotDto BuildDestinatarioSnapshot(Cliente? cliente)
        => new(
            NormalizeNullable(cliente?.Nome) ?? "Consumidor final",
            FormatDocumento(cliente?.Documento),
            NormalizeNullable(cliente?.Email),
            NormalizeNullable(cliente?.Telefone),
            FormatCep(cliente?.Cep),
            NormalizeNullable(cliente?.Logradouro),
            NormalizeNullable(cliente?.Numero),
            NormalizeNullable(cliente?.Complemento),
            NormalizeNullable(cliente?.Bairro),
            NormalizeNullable(cliente?.Cidade),
            NormalizeNullable(cliente?.Uf));

    private async Task<IReadOnlyCollection<string>> BuildPendenciasAsync(Empresa empresa, Venda venda)
    {
        var pendencias = new List<string>();

        if (string.IsNullOrWhiteSpace(empresa.Cnpj))
        {
            pendencias.Add("Empresa sem CNPJ fiscal definido.");
        }

        if (!empresa.InscricaoEstadualIsento && string.IsNullOrWhiteSpace(empresa.InscricaoEstadual))
        {
            pendencias.Add("Empresa sem inscricao estadual para emissao.");
        }

        if (string.IsNullOrWhiteSpace(empresa.CodigoMunicipioIbge))
        {
            pendencias.Add("Empresa sem codigo IBGE do municipio.");
        }

        if (string.IsNullOrWhiteSpace(empresa.Cep) ||
            string.IsNullOrWhiteSpace(empresa.Logradouro) ||
            string.IsNullOrWhiteSpace(empresa.Numero) ||
            string.IsNullOrWhiteSpace(empresa.Bairro) ||
            string.IsNullOrWhiteSpace(empresa.Cidade) ||
            string.IsNullOrWhiteSpace(empresa.Uf))
        {
            pendencias.Add("Endereco fiscal da empresa esta incompleto.");
        }

        var empresaMunicipio = await municipioCatalogService.ResolveForAddressAsync(empresa.Cidade, empresa.Uf, empresa.CodigoMunicipioIbge);
        if (empresaMunicipio.HasInput && !empresaMunicipio.IsValid && !string.IsNullOrWhiteSpace(empresaMunicipio.ErrorMessage))
        {
            pendencias.Add(empresaMunicipio.ErrorMessage);
        }

        if (venda.ClienteId.HasValue)
        {
            if (venda.Cliente is null)
            {
                pendencias.Add("Cliente vinculado a venda nao foi carregado para a NF-e.");
            }
            else if (string.IsNullOrWhiteSpace(venda.Cliente.Documento))
            {
                pendencias.Add($"Cliente {venda.Cliente.Nome} esta sem CPF/CNPJ cadastrado.");
            }
            else if (string.IsNullOrWhiteSpace(venda.Cliente.CodigoMunicipioIbge))
            {
                pendencias.Add($"Cliente {venda.Cliente.Nome} esta sem codigo IBGE do municipio.");
            }
            else
            {
                var clienteMunicipio = await municipioCatalogService.ResolveForAddressAsync(
                    venda.Cliente.Cidade,
                    venda.Cliente.Uf,
                    venda.Cliente.CodigoMunicipioIbge);

                if (clienteMunicipio.HasInput && !clienteMunicipio.IsValid && !string.IsNullOrWhiteSpace(clienteMunicipio.ErrorMessage))
                {
                    pendencias.Add(clienteMunicipio.ErrorMessage);
                }
            }
        }
        else
        {
            pendencias.Add("Venda sem cliente vinculado. Confirme os dados do destinatario antes da transmissao.");
        }

        var regimeSimples = empresa.RegimeTributario is EmpresaRegimeTributario.SimplesNacional or EmpresaRegimeTributario.SimplesExcessoSublimite;
        foreach (var item in venda.Itens)
        {
            var produto = item.Produto;
            var prefixo = $"Produto {produto.Nome}:";

            if (string.IsNullOrWhiteSpace(produto.Ncm))
            {
                pendencias.Add($"{prefixo} informe o NCM.");
            }

            if (string.IsNullOrWhiteSpace(produto.OrigemFiscal))
            {
                pendencias.Add($"{prefixo} informe a origem fiscal.");
            }

            if (string.IsNullOrWhiteSpace(ResolveCfopVenda(empresa.Uf, venda.Cliente?.Uf, produto)))
            {
                pendencias.Add($"{prefixo} informe o CFOP de venda.");
            }

            if (regimeSimples && string.IsNullOrWhiteSpace(produto.Csosn))
            {
                pendencias.Add($"{prefixo} informe o CSOSN.");
            }

            if (!regimeSimples && string.IsNullOrWhiteSpace(produto.CstIcms))
            {
                pendencias.Add($"{prefixo} informe o CST ICMS.");
            }

            if (string.IsNullOrWhiteSpace(produto.CstPis))
            {
                pendencias.Add($"{prefixo} informe o CST PIS.");
            }

            if (string.IsNullOrWhiteSpace(produto.CstCofins))
            {
                pendencias.Add($"{prefixo} informe o CST COFINS.");
            }
        }

        return pendencias;
    }

    private static string? ResolveCfopVenda(string? empresaUf, string? clienteUf, Produto produto)
    {
        var emitenteUf = NormalizeNullable(empresaUf);
        var destinatarioUf = NormalizeNullable(clienteUf);
        var operacaoInterestadual =
            emitenteUf is not null &&
            destinatarioUf is not null &&
            !string.Equals(emitenteUf, destinatarioUf, StringComparison.OrdinalIgnoreCase);

        var cfopPreferencial = operacaoInterestadual ? produto.CfopVendaInterestadual : produto.CfopVendaPadrao;
        return NormalizeNullable(cfopPreferencial)
            ?? NormalizeNullable(produto.CfopVendaPadrao)
            ?? NormalizeNullable(produto.CfopVendaInterestadual);
    }

    private static T? DeserializeSnapshot<T>(string? json)
        where T : class
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<T>(json, JsonOptions);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static IReadOnlyCollection<string> DeserializeStringCollection(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<string[]>(json, JsonOptions) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static string? NormalizeNullable(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static NFeDownloadDocumentoTipo ParseDownloadType(string value)
        => Enum.TryParse<NFeDownloadDocumentoTipo>(value, true, out var parsed)
            ? parsed
            : throw new AppException("Tipo de download da NF-e nao reconhecido.");

    private static string GetAmbienteDescription(AmbienteFiscal ambiente)
        => ambiente == AmbienteFiscal.Homologacao ? "homologacao" : "producao";

    private static string? NormalizeMaxLength(string? value, int maxLength)
    {
        var normalized = NormalizeNullable(value);
        if (normalized is null)
        {
            return null;
        }

        return normalized.Length <= maxLength ? normalized : normalized[..maxLength].TrimEnd();
    }

    private static string? FormatDocumento(string? value)
    {
        var digits = OnlyDigits(value);
        return digits.Length switch
        {
            11 => $"{digits[..3]}.{digits[3..6]}.{digits[6..9]}-{digits[9..]}",
            14 => $"{digits[..2]}.{digits[2..5]}.{digits[5..8]}/{digits[8..12]}-{digits[12..]}",
            _ => NormalizeNullable(value)
        };
    }

    private static string? FormatCep(string? value)
    {
        var digits = OnlyDigits(value);
        return digits.Length == 8 ? $"{digits[..5]}-{digits[5..]}" : NormalizeNullable(value);
    }

    private static string OnlyDigits(string? value)
        => string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : new string(value.Where(char.IsAsciiDigit).ToArray());
}
