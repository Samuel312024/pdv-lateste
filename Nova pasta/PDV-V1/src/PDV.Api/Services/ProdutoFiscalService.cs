using System.Globalization;
using System.IO.Compression;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using PDV.Api.Common;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Infrastructure;

namespace PDV.Api.Services;

public sealed record ProdutoFiscalCampoAuditavel(
    string Campo,
    string? Valor,
    OrigemRegraFiscal OrigemRegra);

public sealed record ProdutoFiscalValidationResult(
    string? Ncm,
    string? Cest,
    string? OrigemFiscal,
    ProdutoPerfilFiscalPadrao? PerfilFiscalPadrao,
    string? CfopVendaPadrao,
    string? CfopVendaInterestadual,
    string? CfopCompraPadrao,
    string? CfopCompraInterestadual,
    string? Csosn,
    string? CstIcms,
    string? CstPis,
    string? CstCofins,
    string? BeneficioFiscalCodigo,
    string? CodigoAnp,
    string? UnidadeTributavel,
    string? ExTipi,
    decimal? AliquotaIcms,
    decimal? AliquotaIpi,
    decimal? AliquotaPis,
    decimal? AliquotaCofins,
    bool FiscalCompleto,
    IReadOnlyCollection<string> Pendencias,
    IReadOnlyCollection<ProdutoRegraFiscalAplicadaDto> RegrasAplicadas,
    IReadOnlyCollection<ProdutoFiscalCampoAuditavel> CamposAuditaveis,
    string? JustificativaManual);

public class ProdutoFiscalService(
    AppDbContext dbContext,
    CurrentUserService currentUser,
    IHttpClientFactory httpClientFactory,
    ILogger<ProdutoFiscalService> logger)
{
    private const string AutoCreatedNcmDescription = "NCM cadastrado automaticamente - revisar descricao fiscal.";
    private const string QuickCreatedNcmDescription = "NCM cadastrado rapidamente - revisar descricao fiscal.";
    private const string OfficialNcmDownloadUrl = "https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json";
    private const string OfficialNcmDownloadPublicUrl = OfficialNcmDownloadUrl + "?perfil=PUBLICO";
    private const string OfficialNcmSourceName = "Portal Unico Siscomex (JSON)";
    private static readonly FiscalCatalogoOpcaoDto[] PerfilFiscalOptions =
    [
        new("RevendaMercadoria", "Revenda", "Mercadoria de terceiros com sugestao 1102/2102/5102/6102."),
        new("ProducaoEstabelecimento", "Producao propria", "Produzido no estabelecimento com sugestao 1101/2101/5101/6101."),
        new("Servico", "Servico", "Exige regra fiscal especifica antes da venda em NF-e."),
        new("Industrializacao", "Industrializacao", "Perfil para industrializacao; CFOP depende da operacao."),
        new("Bonificacao", "Bonificacao", "Perfil sem valor comercial direto; exige revisao fiscal."),
        new("Devolucao", "Devolucao", "Exige referencia da operacao original.", true, true),
        new("Transferencia", "Transferencia", "Exige unidade ou empresa destino.", true, true)
    ];

    private static readonly FiscalCatalogoOpcaoDto[] OrigemFiscalOptions =
    [
        new("0", "Nacional", "Mercadoria nacional."),
        new("1", "Estrangeira importacao direta", "Importada diretamente."),
        new("2", "Estrangeira adquirida no mercado interno", "Importada por terceiro."),
        new("3", "Nacional com conteudo de importacao superior a 40%", "Conteudo de importacao acima de 40%."),
        new("4", "Nacional conforme processo produtivo basico", "Produzida conforme PPB."),
        new("5", "Nacional com conteudo de importacao inferior ou igual a 40%", "Conteudo de importacao ate 40%."),
        new("6", "Estrangeira importacao direta sem similar nacional", "Sem similar nacional."),
        new("7", "Estrangeira adquirida no mercado interno sem similar nacional", "Sem similar nacional."),
        new("8", "Nacional com conteudo de importacao superior a 70%", "Conteudo de importacao acima de 70%.")
    ];

    private static readonly HashSet<string> PisCofinsAliquotaZeroCodes = ["04", "06", "07", "08", "09"];
    private static readonly HashSet<string> PisCofinsTributavelCodes = ["01", "02", "03", "49", "99"];
    private static readonly HashSet<string> IcmsCsosnComSt = ["201", "202", "203", "500"];
    private static readonly HashSet<string> IcmsCsosnComAliquota = ["101", "201", "202", "203", "900"];
    private static readonly HashSet<string> IcmsCstComSt = ["10", "30", "60", "70"];
    private static readonly HashSet<string> IcmsCstComAliquota = ["00", "10", "20", "51", "70", "90"];

    public async Task<ProdutoFiscalAssistenteContextoDto> GetContextoAsync(CancellationToken cancellationToken = default)
    {
        var empresaId = currentUser.GetEmpresaId();
        var empresa = await dbContext.Empresas
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.EmpresaId == empresaId, cancellationToken)
            ?? throw new NotFoundException("Empresa nao encontrada para carregar o assistente fiscal.");

        var cfops = await dbContext.FiscalCfops
            .AsNoTracking()
            .Where(item => item.Ativo)
            .OrderBy(item => item.Codigo)
            .Select(item => new FiscalCatalogoOpcaoDto(
                item.Codigo,
                item.Descricao,
                BuildCfopDetail(item),
                false,
                item.ExigeContexto))
            .ToArrayAsync(cancellationToken);

        var csosns = await dbContext.FiscalCsosns
            .AsNoTracking()
            .Where(item => item.Ativo)
            .OrderBy(item => item.Codigo)
            .Select(item => new FiscalCatalogoOpcaoDto(item.Codigo, item.Descricao, null, item.ExigeSt, false))
            .ToArrayAsync(cancellationToken);

        var cstIcms = await dbContext.FiscalCstIcms
            .AsNoTracking()
            .Where(item => item.Ativo)
            .OrderBy(item => item.Codigo)
            .Select(item => new FiscalCatalogoOpcaoDto(item.Codigo, item.Descricao, null, item.ExigeSt, false))
            .ToArrayAsync(cancellationToken);

        var cstPisCofins = await dbContext.FiscalCstPisCofins
            .AsNoTracking()
            .Where(item => item.Ativo)
            .OrderBy(item => item.Codigo)
            .Select(item => new FiscalCatalogoOpcaoDto(
                item.Codigo,
                item.Descricao,
                item.AliquotaZero ? "Aliquota zero sugerida." : item.UsaAliquotaPadrao ? "Usa aliquota padrao por regime." : null,
                false,
                false))
            .ToArrayAsync(cancellationToken);

        var beneficiosFiscais = await dbContext.FiscalBeneficios
            .AsNoTracking()
            .Where(item => item.Ativo)
            .OrderBy(item => item.Codigo)
            .Select(item => new FiscalCatalogoOpcaoDto(
                item.Codigo,
                item.Descricao,
                item.Uf == null && item.NcmPrefixo == null
                    ? null
                    : $"UF {item.Uf ?? "todas"}" + (item.NcmPrefixo == null ? string.Empty : $" · NCM {item.NcmPrefixo}"),
                false,
                false))
            .ToArrayAsync(cancellationToken);

        return new ProdutoFiscalAssistenteContextoDto(
            empresa.RegimeTributario.ToString(),
            currentUser.GetPerfil() == Perfis.Admin,
            PerfilFiscalOptions,
            OrigemFiscalOptions,
            cfops,
            csosns,
            cstIcms,
            cstPisCofins,
            beneficiosFiscais);
    }

    public async Task<IReadOnlyCollection<FiscalNcmDto>> BuscarNcmsAsync(string? termo, CancellationToken cancellationToken = default)
    {
        var normalizedTerm = NormalizeNullable(termo);
        var digits = OnlyDigits(normalizedTerm);

        var query = dbContext.FiscalNcms
            .AsNoTracking()
            .Where(item => item.Ativo);

        if (string.IsNullOrWhiteSpace(normalizedTerm))
        {
            var initialResults = await query
                .OrderBy(item => item.Codigo)
                .Take(30)
                .ToArrayAsync(cancellationToken);

            return initialResults.Select(item => MapFiscalNcm(item)).ToArray();
        }

        var prefixMatches = await query
            .Where(item =>
                (!string.IsNullOrWhiteSpace(digits) && item.Codigo.StartsWith(digits)) ||
                item.Descricao.StartsWith(normalizedTerm) ||
                (item.DescricaoCompleta != null && item.DescricaoCompleta.StartsWith(normalizedTerm)) ||
                (item.AtoLegal != null && item.AtoLegal.StartsWith(normalizedTerm)))
            .OrderBy(item =>
                !string.IsNullOrWhiteSpace(digits) && item.Codigo == digits ? 0 :
                !string.IsNullOrWhiteSpace(digits) && item.Codigo.StartsWith(digits) ? 1 :
                !string.IsNullOrWhiteSpace(normalizedTerm) && item.Descricao.StartsWith(normalizedTerm) ? 2 :
                !string.IsNullOrWhiteSpace(normalizedTerm) && item.DescricaoCompleta != null && item.DescricaoCompleta.StartsWith(normalizedTerm) ? 3 :
                !string.IsNullOrWhiteSpace(normalizedTerm) && item.AtoLegal != null && item.AtoLegal.StartsWith(normalizedTerm) ? 4 : 5)
            .ThenBy(item => item.Codigo)
            .Take(30)
            .ToListAsync(cancellationToken);

        if (prefixMatches.Count < 30)
        {
            var remaining = 30 - prefixMatches.Count;
            var matchedIds = prefixMatches
                .Select(item => item.FiscalNcmId)
                .ToArray();

            var containsMatches = await query
                .Where(item =>
                    !matchedIds.Contains(item.FiscalNcmId) &&
                    (
                        (!string.IsNullOrWhiteSpace(digits) && item.Codigo.Contains(digits)) ||
                        item.Descricao.Contains(normalizedTerm) ||
                        (item.DescricaoCompleta != null && item.DescricaoCompleta.Contains(normalizedTerm)) ||
                        (item.AtoLegal != null && item.AtoLegal.Contains(normalizedTerm))
                    ))
                .OrderBy(item => item.Codigo)
                .Take(remaining)
                .ToListAsync(cancellationToken);

            prefixMatches.AddRange(containsMatches);
        }

        return prefixMatches.Select(item => MapFiscalNcm(item)).ToArray();
    }

    public async Task<IReadOnlyCollection<FiscalNcmOficialDto>> BuscarNcmsOficiaisAsync(
        string? termo,
        bool somenteItensFinais = false,
        CancellationToken cancellationToken = default)
    {
        var normalizedTerm = NormalizeNullable(termo);
        var digits = OnlyDigits(normalizedTerm);

        var query = dbContext.FiscalNcmsOficiais
            .AsNoTracking()
            .Where(item => item.Ativo);

        if (somenteItensFinais)
        {
            query = query.Where(item => item.EhItemFinal);
        }

        if (!string.IsNullOrWhiteSpace(normalizedTerm))
        {
            query = query.Where(item =>
                item.Codigo.Contains(normalizedTerm) ||
                (!string.IsNullOrWhiteSpace(digits) && item.CodigoNormalizado.Contains(digits)) ||
                item.Descricao.Contains(normalizedTerm) ||
                (item.DescricaoConcatenada != null && item.DescricaoConcatenada.Contains(normalizedTerm)));
        }

        var results = await query
            .OrderBy(item =>
                !string.IsNullOrWhiteSpace(normalizedTerm) && item.Codigo == normalizedTerm ? 0 :
                !string.IsNullOrWhiteSpace(digits) && item.CodigoNormalizado == digits ? 1 :
                !string.IsNullOrWhiteSpace(normalizedTerm) && item.Codigo.StartsWith(normalizedTerm) ? 2 :
                !string.IsNullOrWhiteSpace(digits) && item.CodigoNormalizado.StartsWith(digits) ? 3 :
                !string.IsNullOrWhiteSpace(normalizedTerm) && item.Descricao.StartsWith(normalizedTerm) ? 4 : 5)
            .ThenBy(item => item.Codigo)
            .Take(100)
            .ToArrayAsync(cancellationToken);

        return results.Select(item => new FiscalNcmOficialDto(
            item.Codigo,
            item.CodigoNormalizado,
            item.Descricao,
            item.DescricaoConcatenada,
            item.DataInicio,
            item.DataFim,
            item.TipoAtoInicio,
            item.NumeroAtoInicio,
            item.AnoAtoInicio,
            item.EhItemFinal,
            item.Vigente,
            item.Ativo)).ToArray();
    }

    public async Task<FiscalNcmDto> CadastrarNcmRapidoAsync(
        FiscalNcmCadastroRapidoRequest request,
        CancellationToken cancellationToken = default)
    {
        var normalizedCode = NormalizeFixedDigits(request.Codigo, 8)
            ?? throw new AppException("Informe NCM valido com 8 digitos para o cadastro rapido.");

        var existing = await dbContext.FiscalNcms
            .FirstOrDefaultAsync(item => item.Codigo == normalizedCode, cancellationToken);

        var normalizedDescription = NormalizeNullable(request.Descricao);
        var normalizedCest = NormalizeFixedDigits(request.CestPadraoCodigo, 7);
        var normalizedAliquotaIbpt = NormalizeAliquotaIbpt(request.AliquotaIbpt);
        var sujeitoSt = request.SujeitoSt ?? false;
        var officialSeed = await TryGetOfficialNcmSeedAsync(normalizedCode, cancellationToken);

        if (existing is null)
        {
            existing = new FiscalNcm
            {
                FiscalNcmId = Guid.NewGuid(),
                Codigo = normalizedCode,
                Descricao = normalizedDescription ?? officialSeed?.DescricaoCurta ?? QuickCreatedNcmDescription,
                DescricaoCompleta = normalizedDescription ?? officialSeed?.DescricaoCompleta ?? QuickCreatedNcmDescription,
                AtoLegal = officialSeed?.AtoLegal,
                DataInicio = officialSeed?.DataInicio,
                DataFim = officialSeed?.DataFim,
                CestPadraoCodigo = normalizedCest,
                AliquotaIbpt = normalizedAliquotaIbpt,
                SujeitoSt = sujeitoSt,
                Vigente = officialSeed?.Vigente ?? false,
                Ativo = true
            };

            dbContext.FiscalNcms.Add(existing);
            RegisterNcmSystemLog(
                "FiscalNcmCadastroRapido",
                $"NCM {normalizedCode} cadastrado rapidamente.",
                new
                {
                    existing.Codigo,
                    existing.Descricao,
                    existing.CestPadraoCodigo,
                    existing.AliquotaIbpt,
                    existing.SujeitoSt
                });
            await dbContext.SaveChangesAsync(cancellationToken);

            logger.LogInformation("NCM {Codigo} cadastrado rapidamente pelo usuario {UsuarioId}.", normalizedCode, currentUser.GetUserId());
            return MapFiscalNcm(
                existing,
                true,
                officialSeed is not null
                    ? "NCM cadastrado rapidamente com apoio da nomenclatura oficial importada."
                    : "NCM cadastrado rapidamente e liberado para sugestao fiscal.");
        }

        var updated = false;
        var hasPlaceholderDescription =
            IsPlaceholderNcmDescription(existing.Descricao) ||
            IsPlaceholderNcmDescription(existing.DescricaoCompleta);

        if (officialSeed is not null)
        {
            if ((hasPlaceholderDescription || string.IsNullOrWhiteSpace(existing.Descricao)) &&
                !string.Equals(existing.Descricao, officialSeed.DescricaoCurta, StringComparison.Ordinal))
            {
                existing.Descricao = officialSeed.DescricaoCurta;
                updated = true;
            }

            if ((hasPlaceholderDescription || string.IsNullOrWhiteSpace(existing.DescricaoCompleta)) &&
                !string.Equals(existing.DescricaoCompleta, officialSeed.DescricaoCompleta, StringComparison.Ordinal))
            {
                existing.DescricaoCompleta = officialSeed.DescricaoCompleta;
                updated = true;
            }

            if (!string.Equals(existing.AtoLegal, officialSeed.AtoLegal, StringComparison.Ordinal))
            {
                existing.AtoLegal = officialSeed.AtoLegal;
                updated = true;
            }

            if (!AreSameDate(existing.DataInicio, officialSeed.DataInicio))
            {
                existing.DataInicio = officialSeed.DataInicio;
                updated = true;
            }

            if (!AreSameDate(existing.DataFim, officialSeed.DataFim))
            {
                existing.DataFim = officialSeed.DataFim;
                updated = true;
            }

            if (existing.Vigente != officialSeed.Vigente)
            {
                existing.Vigente = officialSeed.Vigente;
                updated = true;
            }
        }
        else if (!string.IsNullOrWhiteSpace(normalizedDescription) &&
                 (hasPlaceholderDescription || !string.Equals(existing.Descricao, normalizedDescription, StringComparison.Ordinal)))
        {
            existing.Descricao = normalizedDescription;
            existing.DescricaoCompleta = normalizedDescription;
            updated = true;
        }

        if (normalizedCest != existing.CestPadraoCodigo)
        {
            existing.CestPadraoCodigo = normalizedCest;
            updated = true;
        }

        if (normalizedAliquotaIbpt != existing.AliquotaIbpt)
        {
            existing.AliquotaIbpt = normalizedAliquotaIbpt;
            updated = true;
        }

        if (request.SujeitoSt.HasValue && existing.SujeitoSt != sujeitoSt)
        {
            existing.SujeitoSt = sujeitoSt;
            updated = true;
        }

        if (!existing.Ativo)
        {
            existing.Ativo = true;
            updated = true;
        }

        if (updated)
        {
            RegisterNcmSystemLog(
                "FiscalNcmAtualizacaoRapida",
                $"NCM {normalizedCode} atualizado pelo cadastro rapido.",
                new
                {
                    existing.Codigo,
                    existing.Descricao,
                    existing.CestPadraoCodigo,
                    existing.AliquotaIbpt,
                    existing.SujeitoSt
                });
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return MapFiscalNcm(
            existing,
            IsPlaceholderNcmDescription(existing.Descricao),
            updated
                ? "NCM existente atualizado pelo cadastro rapido."
                : "NCM ja existia na tabela fiscal interna.");
    }

    public async Task<FiscalNcmImportacaoResultadoDto> ImportarTabelaNcmAsync(
        IFormFile arquivo,
        CancellationToken cancellationToken = default)
    {
        if (arquivo.Length == 0)
        {
            throw new AppException("Selecione um arquivo CSV, TXT, TSV ou XLSX com a tabela oficial de NCM.");
        }

        if (IsSpreadsheetFile(arquivo.FileName))
        {
            await using var workbookStream = arquivo.OpenReadStream();
            var officialRows = await ParseOfficialNcmWorkbookRowsAsync(workbookStream, cancellationToken);
            await ImportOfficialNcmCatalogRowsAsync(officialRows, arquivo.FileName, cancellationToken);
            var leafRows = officialRows.Where(row => IsOfficialLeafNcmCode(row.Codigo)).ToArray();
            return await ImportOfficialNcmRowsAsync(leafRows, arquivo.FileName, cancellationToken);
        }

        var warnings = new List<string>();
        var created = 0;
        var updated = 0;
        var ignored = 0;
        var invalid = 0;
        var totalRows = 0;
        var importAt = DateTime.UtcNow;
        var userId = currentUser.GetUserId();

        using var stream = arquivo.OpenReadStream();
        using var reader = new StreamReader(stream, detectEncodingFromByteOrderMarks: true);
        var lines = new List<string>();
        while (!reader.EndOfStream)
        {
            var line = await reader.ReadLineAsync(cancellationToken);
            if (line is not null)
            {
                lines.Add(line);
            }
        }

        if (lines.Count == 0)
        {
            throw new AppException("O arquivo informado nao possui linhas para importar.");
        }

        var delimiter = DetectDelimiter(lines.FirstOrDefault() ?? string.Empty);
        var headerFields = ParseDelimitedLine(lines[0], delimiter);
        var hasHeader = LooksLikeNcmHeader(headerFields);
        var startIndex = hasHeader ? 1 : 0;
        var headerMap = hasHeader ? BuildHeaderMap(headerFields) : null;

        var existingMap = await dbContext.FiscalNcms.ToDictionaryAsync(item => item.Codigo, cancellationToken);

        for (var index = startIndex; index < lines.Count; index++)
        {
            var line = lines[index];
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            totalRows++;
            var fields = ParseDelimitedLine(line, delimiter);

            try
            {
                var row = hasHeader
                    ? MapImportRowFromHeader(fields, headerMap!)
                    : MapImportRowByPosition(fields);

                var normalizedCode = NormalizeFixedDigits(row.Codigo, 8);
                var normalizedDescription = NormalizeNullable(row.Descricao);

                if (normalizedCode is null || normalizedDescription is null)
                {
                    invalid++;
                    if (warnings.Count < 12)
                    {
                        warnings.Add($"Linha {index + 1}: codigo ou descricao de NCM invalidos.");
                    }
                    continue;
                }

                var normalizedCest = NormalizeFixedDigits(row.CestPadraoCodigo, 7);
                var normalizedIbpt = NormalizeNullableDecimal(row.AliquotaIbpt);
                var sujeitoSt = NormalizeNullableBoolean(row.SujeitoSt) ?? false;

                if (existingMap.TryGetValue(normalizedCode, out var existing))
                {
                    var changed = false;

                    if (!string.Equals(existing.Descricao, normalizedDescription, StringComparison.Ordinal))
                    {
                        existing.Descricao = normalizedDescription;
                        existing.DescricaoCompleta = normalizedDescription;
                        changed = true;
                    }

                    if (existing.CestPadraoCodigo != normalizedCest)
                    {
                        existing.CestPadraoCodigo = normalizedCest;
                        changed = true;
                    }

                    if (existing.AliquotaIbpt != normalizedIbpt)
                    {
                        existing.AliquotaIbpt = normalizedIbpt;
                        changed = true;
                    }

                    if (existing.SujeitoSt != sujeitoSt)
                    {
                        existing.SujeitoSt = sujeitoSt;
                        changed = true;
                    }

                    if (!existing.Ativo)
                    {
                        existing.Ativo = true;
                        changed = true;
                    }

                    existing.Vigente = true;
                    existing.DataImportacao = importAt;
                    existing.UsuarioImportacao = userId;

                    if (changed)
                    {
                        updated++;
                    }
                    else
                    {
                        ignored++;
                    }

                    continue;
                }

                var entity = new FiscalNcm
                {
                    FiscalNcmId = Guid.NewGuid(),
                    Codigo = normalizedCode,
                    Descricao = normalizedDescription,
                    DescricaoCompleta = normalizedDescription,
                    Vigente = true,
                    DataImportacao = importAt,
                    UsuarioImportacao = userId,
                    CestPadraoCodigo = normalizedCest,
                    AliquotaIbpt = normalizedIbpt,
                    SujeitoSt = sujeitoSt,
                    Ativo = true
                };

                dbContext.FiscalNcms.Add(entity);
                existingMap[normalizedCode] = entity;
                created++;
            }
            catch (AppException exception)
            {
                invalid++;
                if (warnings.Count < 12)
                {
                    warnings.Add($"Linha {index + 1}: {exception.Message}");
                }
            }
        }

        RegisterNcmSystemLog(
            "FiscalNcmImportacao",
            $"Tabela NCM importada do arquivo {arquivo.FileName}.",
            new
            {
                arquivo.FileName,
                totalRows,
                created,
                updated,
                ignored,
                invalid,
                warnings
            });
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Importacao de tabela NCM concluida para empresa {EmpresaId}. Arquivo {Arquivo}. Criados={Criados}, Atualizados={Atualizados}, Ignorados={Ignorados}, Invalidos={Invalidos}.",
            currentUser.GetEmpresaId(),
            arquivo.FileName,
            created,
            updated,
            ignored,
            invalid);

        return new FiscalNcmImportacaoResultadoDto(
            arquivo.FileName,
            totalRows,
            created,
            updated,
            ignored,
            invalid,
            warnings);
    }

    public async Task<FiscalNcmImportacaoResultadoDto> ImportarTabelaNcmOficialAsync(
        CancellationToken cancellationToken = default)
    {
        var rows = await DownloadOfficialNcmRowsAsync(cancellationToken);
        await ImportOfficialNcmCatalogRowsAsync(rows, OfficialNcmSourceName, cancellationToken);
        var leafRows = rows.Where(row => IsOfficialLeafNcmCode(row.Codigo)).ToArray();
        return await ImportOfficialNcmRowsAsync(leafRows, OfficialNcmSourceName, cancellationToken);
    }

    private async Task<IReadOnlyCollection<OfficialNcmImportRow>> DownloadOfficialNcmRowsAsync(
        CancellationToken cancellationToken)
    {
        var client = httpClientFactory.CreateClient("siscomex-ncm");
        var sourceUrls = new[] { OfficialNcmDownloadUrl, OfficialNcmDownloadPublicUrl };
        var issues = new List<string>();

        foreach (var sourceUrl in sourceUrls)
        {
            try
            {
                using var response = await client.GetAsync(sourceUrl, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
                var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
                if (!response.IsSuccessStatusCode)
                {
                    issues.Add($"{sourceUrl}: HTTP {(int)response.StatusCode}.");
                    continue;
                }

                if (string.IsNullOrWhiteSpace(responseBody))
                {
                    issues.Add($"{sourceUrl}: resposta vazia.");
                    continue;
                }

                if (LooksLikeHtml(responseBody))
                {
                    issues.Add($"{sourceUrl}: o portal retornou HTML em vez de JSON.");
                    continue;
                }

                using var document = JsonDocument.Parse(responseBody);
                var rows = ParseOfficialNcmRows(document.RootElement);
                if (rows.Count > 0)
                {
                    return rows;
                }

                issues.Add($"{sourceUrl}: JSON sem registros de NCM. Estrutura recebida: {DescribeJsonShape(document.RootElement)}.");
            }
            catch (JsonException exception)
            {
                logger.LogWarning(exception, "Resposta invalida ao importar tabela NCM oficial do Siscomex via {SourceUrl}.", sourceUrl);
                issues.Add($"{sourceUrl}: resposta nao veio em JSON valido.");
            }
            catch (HttpRequestException exception)
            {
                logger.LogWarning(exception, "Falha de rede ao importar tabela NCM oficial do Siscomex via {SourceUrl}.", sourceUrl);
                issues.Add($"{sourceUrl}: falha de rede ao consultar o Portal Unico.");
            }
            catch (TaskCanceledException exception) when (!cancellationToken.IsCancellationRequested)
            {
                logger.LogWarning(exception, "Tempo esgotado ao importar tabela NCM oficial do Siscomex via {SourceUrl}.", sourceUrl);
                issues.Add($"{sourceUrl}: tempo esgotado ao consultar o Portal Unico.");
            }
        }

        throw new AppException(
            "Nao foi possivel obter a tabela NCM oficial do Siscomex. "
            + string.Join(" ", issues)
            + " Se o Portal Unico estiver em manutencao ou instavel, tente novamente em alguns minutos.");
    }

    public async Task<IReadOnlyCollection<FiscalCestDto>> BuscarCestsAsync(string? termo, string? ncm, CancellationToken cancellationToken = default)
    {
        var normalizedTerm = NormalizeNullable(termo);
        var normalizedNcm = NormalizeFixedDigits(ncm, 8);
        var digits = OnlyDigits(normalizedTerm);

        var query = dbContext.FiscalCests
            .AsNoTracking()
            .Where(item => item.Ativo);

        if (!string.IsNullOrWhiteSpace(normalizedNcm))
        {
            query = query.Where(item => item.NcmCodigo == null || item.NcmCodigo == normalizedNcm);
        }

        if (!string.IsNullOrWhiteSpace(normalizedTerm))
        {
            query = query.Where(item =>
                item.Codigo.Contains(digits) ||
                item.Descricao.Contains(normalizedTerm));
        }

        return await query
            .OrderBy(item => item.Codigo)
            .Take(30)
            .Select(item => new FiscalCestDto(item.Codigo, item.Descricao, item.NcmCodigo))
            .ToArrayAsync(cancellationToken);
    }

    public async Task<ProdutoFiscalSugestaoNcmDto> SugerirTributacaoPorNcmAsync(
        ProdutoFiscalSugestaoNcmRequest request,
        CancellationToken cancellationToken = default)
    {
        var empresaId = currentUser.GetEmpresaId();
        var empresa = await dbContext.Empresas
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.EmpresaId == empresaId, cancellationToken)
            ?? throw new NotFoundException("Empresa nao encontrada para sugerir a tributacao por NCM.");

        var ensuredNcm = await EnsureNcmAsync(
            request.Ncm,
            request.DescricaoNcm,
            "Sugestao fiscal por NCM",
            cancellationToken);
        var ncm = ensuredNcm.Entity;

        var regimeSimples = IsSimplesRegime(empresa.RegimeTributario);
        var perfilFiscalPadrao = NormalizeNullable(request.PerfilFiscalPadrao) ?? ProdutoPerfilFiscalPadrao.RevendaMercadoria.ToString();
        var origemFiscal = NormalizeNullable(request.OrigemFiscal) ?? "0";
        var unidadeMedida = NormalizeNullable(request.UnidadeMedida) ?? "UN";
        var unidadeTributavel = NormalizeNullable(request.UnidadeTributavel) ?? unidadeMedida;
        var cstPisCofins = GetDefaultPisCofinsCst(empresa.RegimeTributario);

        var fiscalRequest = new ProdutoRequest(
            CategoriaId: null,
            ClienteFornecedorId: null,
            CodigoBarras: null,
            Nome: "Sugestao fiscal por NCM",
            Descricao: ncm?.Descricao,
            Marca: null,
            Ncm: request.Ncm,
            Cest: request.Cest ?? ncm?.CestPadraoCodigo,
            OrigemFiscal: origemFiscal,
            PerfilFiscalPadrao: perfilFiscalPadrao,
            CfopVendaPadrao: null,
            CfopVendaInterestadual: null,
            CfopCompraPadrao: null,
            CfopCompraInterestadual: null,
            Csosn: regimeSimples ? GetDefaultCsosn() : null,
            CstIcms: regimeSimples ? null : GetDefaultCstIcms(),
            CstPis: cstPisCofins,
            CstCofins: cstPisCofins,
            BeneficioFiscalCodigo: request.BeneficioFiscalCodigo,
            CodigoAnp: request.CodigoAnp,
            UnidadeTributavel: unidadeTributavel,
            ExTipi: request.ExTipi,
            AliquotaIcms: null,
            AliquotaIpi: 0m,
            AliquotaPis: null,
            AliquotaCofins: null,
            ImagemUrl: null,
            CatalogoResumo: null,
            DestaqueCatalogoComprador: false,
            PrecoPromocional: null,
            PromocaoTitulo: null,
            PromocaoInicioUtc: null,
            PromocaoFimUtc: null,
            CodigoProdutoFornecedor: null,
            UltimaNotaFiscalCompra: null,
            PrecoVenda: 0m,
            PrecoCusto: 0m,
            EstoqueAtual: 0m,
            EstoqueMinimo: 0m,
            UnidadeMedida: unidadeMedida,
            Ativo: true,
            ControlaEstoque: true,
            TipoCodigoPrincipal: null,
            CodigosAlternativos: null,
            CamposCustomizados: null,
            Fornecedores: null,
            JustificativaFiscalManual: null,
            ConfirmaPisCofinsDiferentes: false);

        var validation = await ValidarAsync(
            empresa,
            fiscalRequest,
            currentUser.GetPerfil() == Perfis.Admin,
            cancellationToken);

        var pendencias = validation.Pendencias.ToList();
        if (ensuredNcm.CreatedAutomatically && !string.IsNullOrWhiteSpace(ensuredNcm.Message))
        {
            pendencias.Add(ensuredNcm.Message);
        }

        return new ProdutoFiscalSugestaoNcmDto(
            validation.Ncm,
            ncm?.Descricao,
            ensuredNcm.CreatedAutomatically,
            ensuredNcm.Message,
            ncm?.SujeitoSt ?? false,
            ncm?.SujeitoSt ?? false,
            validation.Cest,
            validation.OrigemFiscal,
            validation.PerfilFiscalPadrao?.ToString(),
            validation.CfopVendaPadrao,
            validation.CfopVendaInterestadual,
            validation.CfopCompraPadrao,
            validation.CfopCompraInterestadual,
            validation.Csosn,
            validation.CstIcms,
            validation.CstPis,
            validation.CstCofins,
            validation.BeneficioFiscalCodigo,
            validation.CodigoAnp,
            validation.UnidadeTributavel,
            validation.ExTipi,
            validation.AliquotaIcms,
            validation.AliquotaIpi,
            validation.AliquotaPis,
            validation.AliquotaCofins,
            validation.FiscalCompleto,
            pendencias,
            validation.RegrasAplicadas);
    }

    public async Task<ProdutoFiscalValidationResult> ValidarAsync(
        Empresa empresa,
        ProdutoRequest request,
        bool usuarioAdministrador,
        CancellationToken cancellationToken = default)
    {
        await EnsureNcmAsync(
            request.Ncm,
            null,
            "Validacao fiscal do produto",
            cancellationToken);

        var pendencias = new List<string>();
        var regras = new List<ProdutoRegraFiscalAplicadaDto>();
        var campos = new List<ProdutoFiscalCampoAuditavel>();
        var justification = NormalizeNullable(request.JustificativaFiscalManual);

        var ncmMap = await dbContext.FiscalNcms
            .AsNoTracking()
            .Where(item => item.Ativo)
            .ToDictionaryAsync(item => item.Codigo, cancellationToken);

        var cestMap = await dbContext.FiscalCests
            .AsNoTracking()
            .Where(item => item.Ativo)
            .ToDictionaryAsync(item => item.Codigo, cancellationToken);

        var cfopMap = await dbContext.FiscalCfops
            .AsNoTracking()
            .Where(item => item.Ativo)
            .ToDictionaryAsync(item => item.Codigo, cancellationToken);

        var csosnMap = await dbContext.FiscalCsosns
            .AsNoTracking()
            .Where(item => item.Ativo)
            .ToDictionaryAsync(item => item.Codigo, cancellationToken);

        var cstIcmsMap = await dbContext.FiscalCstIcms
            .AsNoTracking()
            .Where(item => item.Ativo)
            .ToDictionaryAsync(item => item.Codigo, cancellationToken);

        var cstPisCofinsMap = await dbContext.FiscalCstPisCofins
            .AsNoTracking()
            .Where(item => item.Ativo)
            .ToDictionaryAsync(item => item.Codigo, cancellationToken);

        var beneficioMap = await dbContext.FiscalBeneficios
            .AsNoTracking()
            .Where(item => item.Ativo)
            .ToDictionaryAsync(item => item.Codigo, cancellationToken);

        var perfil = ParsePerfilFiscalPadrao(request.PerfilFiscalPadrao, pendencias);
        var origemFiscal = NormalizeOrigemFiscal(request.OrigemFiscal, pendencias);
        FiscalNcm? ncm = null;
        var ncmCodigo = NormalizeFixedDigits(request.Ncm, 8);

        if (ncmCodigo is null)
        {
            pendencias.Add("Informe NCM valido com 8 digitos.");
        }
        else if (!ncmMap.TryGetValue(ncmCodigo, out ncm))
        {
            pendencias.Add("NCM invalido ou nao cadastrado na tabela fiscal.");
        }

        if (perfil is not null)
        {
            AddRule(regras, campos, "PerfilFiscalPadrao", perfil.ToString(), $"Perfil fiscal: {GetPerfilLabel(perfil.Value)}", OrigemRegraFiscal.Manual);
        }

        if (origemFiscal is not null)
        {
            AddRule(regras, campos, "OrigemFiscal", origemFiscal, $"Origem: {GetOrigemDescricao(origemFiscal)}", OrigemRegraFiscal.TabelaFiscal);
        }

        if (ncm is not null)
        {
            AddRule(regras, campos, "Ncm", ncm.Codigo, $"NCM validado na tabela: {ncm.Codigo} - {ncm.Descricao}", OrigemRegraFiscal.TabelaFiscal);
        }

        var defaultCfops = perfil is null ? null : GetDefaultCfops(perfil.Value);
        if (perfil is ProdutoPerfilFiscalPadrao.Devolucao)
        {
            pendencias.Add("Perfil Devolucao exige selecao da operacao original antes de salvar o cadastro fiscal.");
        }

        if (perfil is ProdutoPerfilFiscalPadrao.Transferencia)
        {
            pendencias.Add("Perfil Transferencia exige empresa ou unidade destino antes de salvar o cadastro fiscal.");
        }

        var cfopCompraPadrao = ValidateCfop(request.CfopCompraPadrao, "CFOP de compra dentro do estado", cfopMap, pendencias, true);
        var cfopCompraInterestadual = ValidateCfop(request.CfopCompraInterestadual, "CFOP de compra fora do estado", cfopMap, pendencias, true);
        var cfopVendaPadrao = ValidateCfop(request.CfopVendaPadrao, "CFOP de venda dentro do estado", cfopMap, pendencias, false);
        var cfopVendaInterestadual = ValidateCfop(request.CfopVendaInterestadual, "CFOP de venda fora do estado", cfopMap, pendencias, false);

        cfopCompraPadrao = ApplyDefaultCfopIfMissing(cfopCompraPadrao, defaultCfops?.CfopCompraPadrao);
        cfopCompraInterestadual = ApplyDefaultCfopIfMissing(cfopCompraInterestadual, defaultCfops?.CfopCompraInterestadual);
        cfopVendaPadrao = ApplyDefaultCfopIfMissing(cfopVendaPadrao, defaultCfops?.CfopVendaPadrao);
        cfopVendaInterestadual = ApplyDefaultCfopIfMissing(cfopVendaInterestadual, defaultCfops?.CfopVendaInterestadual);

        ValidateCfopPresence(cfopCompraPadrao, "Informe CFOP de compra dentro do estado.");
        ValidateCfopPresence(cfopCompraInterestadual, "Informe CFOP de compra fora do estado.");
        ValidateCfopPresence(cfopVendaPadrao, "Informe CFOP de venda dentro do estado.");
        ValidateCfopPresence(cfopVendaInterestadual, "Informe CFOP de venda fora do estado.");

        void ValidateCfopPresence(string? value, string message)
        {
            if (value is null)
            {
                pendencias.Add(message);
            }
        }

        AddCfopRule("CfopCompraPadrao", cfopCompraPadrao, "CFOP compra interna aplicado");
        AddCfopRule("CfopCompraInterestadual", cfopCompraInterestadual, "CFOP compra interestadual aplicado");
        AddCfopRule("CfopVendaPadrao", cfopVendaPadrao, "CFOP venda interna aplicado");
        AddCfopRule("CfopVendaInterestadual", cfopVendaInterestadual, "CFOP venda interestadual aplicado");

        void AddCfopRule(string campo, string? codigo, string prefixo)
        {
            if (codigo is null || !cfopMap.TryGetValue(codigo, out var cfop))
            {
                return;
            }

            var origem = defaultCfops is not null &&
                (defaultCfops.CfopCompraPadrao == codigo ||
                 defaultCfops.CfopCompraInterestadual == codigo ||
                 defaultCfops.CfopVendaPadrao == codigo ||
                 defaultCfops.CfopVendaInterestadual == codigo)
                    ? OrigemRegraFiscal.SugestaoAutomatica
                    : OrigemRegraFiscal.TabelaFiscal;

            AddRule(regras, campos, campo, codigo, $"{prefixo}: {codigo} - {cfop.Descricao}", origem);
        }

        var regimeSimples = empresa.RegimeTributario is EmpresaRegimeTributario.SimplesNacional or EmpresaRegimeTributario.SimplesExcessoSublimite;
        AddRule(regras, campos, "RegimeTributarioEmpresa", empresa.RegimeTributario.ToString(), $"Regime tributario da empresa: {GetRegimeDescription(empresa.RegimeTributario)}", OrigemRegraFiscal.TabelaFiscal);

        string? csosn = null;
        string? cstIcms = null;

        if (regimeSimples)
        {
            csosn = ValidateCatalogCode(request.Csosn, "CSOSN", csosnMap.Keys, pendencias);
            if (csosn is null)
            {
                pendencias.Add("Informe CSOSN valido para empresa do Simples Nacional.");
            }

            if (!string.IsNullOrWhiteSpace(request.CstIcms))
            {
                pendencias.Add("CST ICMS nao deve ser preenchido quando a empresa usa Simples Nacional.");
            }
        }
        else
        {
            cstIcms = ValidateCatalogCode(request.CstIcms, "CST ICMS", cstIcmsMap.Keys, pendencias);
            if (cstIcms is null)
            {
                pendencias.Add("Informe CST ICMS valido para empresa de regime normal.");
            }

            if (!string.IsNullOrWhiteSpace(request.Csosn))
            {
                pendencias.Add("CSOSN nao deve ser preenchido quando a empresa nao usa Simples Nacional.");
            }
        }

        if (csosn is not null && csosnMap.TryGetValue(csosn, out var csosnInfo))
        {
            AddRule(regras, campos, "Csosn", csosn, $"CSOSN aplicado: {csosn} - {csosnInfo.Descricao}", OrigemRegraFiscal.TabelaFiscal);
        }

        if (cstIcms is not null && cstIcmsMap.TryGetValue(cstIcms, out var cstIcmsInfo))
        {
            AddRule(regras, campos, "CstIcms", cstIcms, $"CST ICMS aplicado: {cstIcms} - {cstIcmsInfo.Descricao}", OrigemRegraFiscal.TabelaFiscal);
        }

        var cstPis = ValidateCatalogCode(request.CstPis, "CST PIS", cstPisCofinsMap.Keys, pendencias);
        var cstCofins = ValidateCatalogCode(request.CstCofins, "CST COFINS", cstPisCofinsMap.Keys, pendencias);

        if (cstPis is null)
        {
            pendencias.Add("Informe CST PIS valido.");
        }

        if (cstCofins is null)
        {
            pendencias.Add("Informe CST COFINS valido.");
        }

        if (cstPis is not null && cstCofins is not null && cstPis != cstCofins)
        {
            if (!request.ConfirmaPisCofinsDiferentes || string.IsNullOrWhiteSpace(justification))
            {
                pendencias.Add("Confirme e justifique a diferenca entre CST PIS e CST COFINS.");
            }
        }

        if (cstPis is not null && cstPisCofinsMap.TryGetValue(cstPis, out var cstPisInfo))
        {
            AddRule(regras, campos, "CstPis", cstPis, $"CST PIS aplicado: {cstPis} - {cstPisInfo.Descricao}", OrigemRegraFiscal.TabelaFiscal);
        }

        if (cstCofins is not null && cstPisCofinsMap.TryGetValue(cstCofins, out var cstCofinsInfo))
        {
            AddRule(regras, campos, "CstCofins", cstCofins, $"CST COFINS aplicado: {cstCofins} - {cstCofinsInfo.Descricao}", OrigemRegraFiscal.TabelaFiscal);
        }

        var beneficioFiscalCodigo = NormalizeNullable(request.BeneficioFiscalCodigo)?.ToUpperInvariant();
        if (beneficioFiscalCodigo is not null)
        {
            if (!beneficioMap.TryGetValue(beneficioFiscalCodigo, out var beneficio))
            {
                pendencias.Add("Beneficio fiscal invalido para a tabela fiscal.");
            }
            else
            {
                if (!string.IsNullOrWhiteSpace(beneficio.Uf) &&
                    !string.IsNullOrWhiteSpace(empresa.Uf) &&
                    !string.Equals(beneficio.Uf, empresa.Uf, StringComparison.OrdinalIgnoreCase))
                {
                    pendencias.Add("Beneficio fiscal pertence a outra UF e precisa ser revisado.");
                }

                if (!string.IsNullOrWhiteSpace(beneficio.NcmPrefixo) &&
                    !string.IsNullOrWhiteSpace(ncmCodigo) &&
                    !ncmCodigo.StartsWith(beneficio.NcmPrefixo, StringComparison.Ordinal))
                {
                    pendencias.Add("Beneficio fiscal nao e compativel com o NCM informado.");
                }

                AddRule(
                    regras,
                    campos,
                    "BeneficioFiscalCodigo",
                    beneficioFiscalCodigo,
                    $"Beneficio fiscal aplicado: {beneficioFiscalCodigo} - {beneficio.Descricao}",
                    OrigemRegraFiscal.TabelaFiscal);
            }
        }

        var codigoAnp = NormalizeOptionalDigitsCode(request.CodigoAnp, "Codigo ANP", 9, pendencias);
        if (codigoAnp is not null)
        {
            AddRule(regras, campos, "CodigoAnp", codigoAnp, $"Codigo ANP informado manualmente: {codigoAnp}.", OrigemRegraFiscal.Manual);
        }

        var unidadeTributavel = NormalizeUpperMaxLength(request.UnidadeTributavel, 10, "Unidade tributavel", pendencias)
            ?? NormalizeUpperMaxLength(request.UnidadeMedida, 10, "Unidade tributavel", pendencias);
        if (unidadeTributavel is not null)
        {
            AddRule(regras, campos, "UnidadeTributavel", unidadeTributavel, $"Unidade tributavel aplicada: {unidadeTributavel}.", OrigemRegraFiscal.Manual);
        }

        var exTipi = NormalizeOptionalVariableDigitsCode(request.ExTipi, "EX TIPI", 1, 3, pendencias);
        if (exTipi is not null)
        {
            AddRule(regras, campos, "ExTipi", exTipi, $"EX TIPI informado manualmente: {exTipi}.", OrigemRegraFiscal.Manual);
        }

        var requerSt = (ncm?.SujeitoSt ?? false) ||
            (csosn is not null && IcmsCsosnComSt.Contains(csosn)) ||
            (cstIcms is not null && IcmsCstComSt.Contains(cstIcms));

        string? cest = null;
        if (requerSt)
        {
            cest = ValidateCatalogCode(request.Cest, "CEST", cestMap.Keys, pendencias, 7);
            if (cest is null)
            {
                pendencias.Add("Informe CEST para produto com regra de ST.");
            }
        }
        else
        {
            cest = ValidateOptionalCatalogCode(request.Cest, "CEST", cestMap.Keys, pendencias, 7);
        }

        if (cest is not null && cestMap.TryGetValue(cest, out var cestInfo))
        {
            AddRule(regras, campos, "Cest", cest, $"CEST aplicado: {cest} - {cestInfo.Descricao}", OrigemRegraFiscal.TabelaFiscal);
        }
        else if (ncm is not null && ncm.CestPadraoCodigo is not null && !requerSt)
        {
            AddRule(regras, campos, "Cest", null, $"CEST sugerido pela tabela para o NCM: {ncm.CestPadraoCodigo}.", OrigemRegraFiscal.TabelaFiscal);
        }

        if (requerSt && ncm is not null && !ncm.SujeitoSt)
        {
            pendencias.Add("Os codigos fiscais indicam ST, mas o NCM selecionado nao possui regra de ST cadastrada.");
        }

        var aliquotaPisSugerida = SuggestPisAliquota(empresa.RegimeTributario, cstPis);
        var aliquotaCofinsSugerida = SuggestCofinsAliquota(empresa.RegimeTributario, cstCofins);
        var aliquotaIcmsSugerida = await SuggestIcmsAliquotaAsync(empresa, ncmCodigo, origemFiscal, cfopVendaPadrao, cancellationToken);
        var aliquotaIpi = request.AliquotaIpi;
        if (aliquotaIpi is < 0 or > 100)
        {
            pendencias.Add("Aliquota IPI deve ficar entre 0 e 100.");
        }

        var aliquotaPis = ValidateAliquota(
            request.AliquotaPis,
            aliquotaPisSugerida,
            "PIS",
            justification,
            pendencias,
            cstPis);

        var aliquotaCofins = ValidateAliquota(
            request.AliquotaCofins,
            aliquotaCofinsSugerida,
            "COFINS",
            justification,
            pendencias,
            cstCofins);

        var aliquotaIcms = ValidateAliquota(
            request.AliquotaIcms,
            aliquotaIcmsSugerida,
            "ICMS",
            justification,
            pendencias,
            regimeSimples ? csosn : cstIcms,
            regimeSimples
                ? (csosn is not null && IcmsCsosnComAliquota.Contains(csosn))
                : (cstIcms is not null && IcmsCstComAliquota.Contains(cstIcms)));

        if (aliquotaPis is not null)
        {
            AddRule(regras, campos, "AliquotaPis", aliquotaPis.Value.ToString("0.####"), $"PIS aplicado conforme regime {GetRegimeDescription(empresa.RegimeTributario)}: {aliquotaPis.Value:0.####}%", ResolveRateOrigin(aliquotaPisSugerida, aliquotaPis));
        }

        if (aliquotaCofins is not null)
        {
            AddRule(regras, campos, "AliquotaCofins", aliquotaCofins.Value.ToString("0.####"), $"COFINS aplicado conforme regime {GetRegimeDescription(empresa.RegimeTributario)}: {aliquotaCofins.Value:0.####}%", ResolveRateOrigin(aliquotaCofinsSugerida, aliquotaCofins));
        }

        if (aliquotaIcms is not null)
        {
            var ruleDescription = aliquotaIcmsSugerida is null
                ? $"Aliquota ICMS aplicada manualmente: {aliquotaIcms.Value:0.####}%."
                : $"Aliquota ICMS aplicada pela tabela da UF {empresa.Uf}: {aliquotaIcms.Value:0.####}%.";
            AddRule(regras, campos, "AliquotaIcms", aliquotaIcms.Value.ToString("0.####"), ruleDescription, ResolveRateOrigin(aliquotaIcmsSugerida, aliquotaIcms));
        }

        if (aliquotaIpi is not null)
        {
            AddRule(regras, campos, "AliquotaIpi", aliquotaIpi.Value.ToString("0.####"), $"IPI informado para a operacao: {aliquotaIpi.Value:0.####}%.", OrigemRegraFiscal.Manual);
        }

        var fiscalCompleto = pendencias.Count == 0;

        return new ProdutoFiscalValidationResult(
            ncmCodigo,
            cest,
            origemFiscal,
            perfil,
            cfopVendaPadrao,
            cfopVendaInterestadual,
            cfopCompraPadrao,
            cfopCompraInterestadual,
            csosn,
            cstIcms,
            cstPis,
            cstCofins,
            beneficioFiscalCodigo,
            codigoAnp,
            unidadeTributavel,
            exTipi,
            aliquotaIcms,
            aliquotaIpi,
            aliquotaPis,
            aliquotaCofins,
            fiscalCompleto,
            pendencias,
            regras.OrderBy(item => item.Ordem).ToArray(),
            campos,
            justification);
    }

    private async Task<EnsureNcmResult> EnsureNcmAsync(
        string? rawNcm,
        string? descricaoHint,
        string origemOperacao,
        CancellationToken cancellationToken)
    {
        var normalizedCode = NormalizeFixedDigits(rawNcm, 8);
        if (normalizedCode is null)
        {
            return new EnsureNcmResult(null, false, null);
        }

        var officialSeed = await TryGetOfficialNcmSeedAsync(normalizedCode, cancellationToken);
        var existing = await dbContext.FiscalNcms
            .FirstOrDefaultAsync(item => item.Codigo == normalizedCode, cancellationToken);

        var normalizedDescription = NormalizeNullable(descricaoHint);
        if (existing is not null)
        {
            var changed = false;
            var hasPlaceholderDescription =
                IsPlaceholderNcmDescription(existing.Descricao) ||
                IsPlaceholderNcmDescription(existing.DescricaoCompleta);

            if (!existing.Ativo)
            {
                existing.Ativo = true;
                changed = true;
            }

            if (officialSeed is not null)
            {
                if ((hasPlaceholderDescription || string.IsNullOrWhiteSpace(existing.Descricao)) &&
                    !string.Equals(existing.Descricao, officialSeed.DescricaoCurta, StringComparison.Ordinal))
                {
                    existing.Descricao = officialSeed.DescricaoCurta;
                    changed = true;
                }

                if ((hasPlaceholderDescription || string.IsNullOrWhiteSpace(existing.DescricaoCompleta)) &&
                    !string.Equals(existing.DescricaoCompleta, officialSeed.DescricaoCompleta, StringComparison.Ordinal))
                {
                    existing.DescricaoCompleta = officialSeed.DescricaoCompleta;
                    changed = true;
                }

                if (!string.Equals(existing.AtoLegal, officialSeed.AtoLegal, StringComparison.Ordinal))
                {
                    existing.AtoLegal = officialSeed.AtoLegal;
                    changed = true;
                }

                if (!AreSameDate(existing.DataInicio, officialSeed.DataInicio))
                {
                    existing.DataInicio = officialSeed.DataInicio;
                    changed = true;
                }

                if (!AreSameDate(existing.DataFim, officialSeed.DataFim))
                {
                    existing.DataFim = officialSeed.DataFim;
                    changed = true;
                }

                if (existing.Vigente != officialSeed.Vigente)
                {
                    existing.Vigente = officialSeed.Vigente;
                    changed = true;
                }
            }
            else if (!string.IsNullOrWhiteSpace(normalizedDescription) &&
                     hasPlaceholderDescription &&
                     !string.Equals(existing.Descricao, normalizedDescription, StringComparison.Ordinal))
            {
                existing.Descricao = normalizedDescription;
                existing.DescricaoCompleta = normalizedDescription;
                changed = true;
            }

            if (changed)
            {
                RegisterNcmSystemLog(
                    "FiscalNcmReativacao",
                    $"NCM {normalizedCode} reativado/atualizado durante {origemOperacao}.",
                    new
                    {
                        existing.Codigo,
                        existing.Descricao,
                        Origem = origemOperacao
                    });
                await dbContext.SaveChangesAsync(cancellationToken);
            }

            return new EnsureNcmResult(existing, false, null);
        }

        var entity = new FiscalNcm
        {
            FiscalNcmId = Guid.NewGuid(),
            Codigo = normalizedCode,
            Descricao = normalizedDescription ?? officialSeed?.DescricaoCurta ?? AutoCreatedNcmDescription,
            DescricaoCompleta = normalizedDescription ?? officialSeed?.DescricaoCompleta ?? AutoCreatedNcmDescription,
            AtoLegal = officialSeed?.AtoLegal,
            DataInicio = officialSeed?.DataInicio,
            DataFim = officialSeed?.DataFim,
            Vigente = officialSeed?.Vigente ?? false,
            Ativo = true
        };

        dbContext.FiscalNcms.Add(entity);
        var message = officialSeed is not null
            ? $"NCM {normalizedCode} nao existia na tabela interna e foi cadastrado automaticamente com a descricao oficial ja importada."
            : $"NCM {normalizedCode} nao existia na tabela interna e foi cadastrado automaticamente para nao travar o cadastro do produto.";
        RegisterNcmSystemLog(
            "FiscalNcmAutoCadastro",
            $"NCM {normalizedCode} cadastrado automaticamente durante {origemOperacao}.",
            new
            {
                entity.Codigo,
                entity.Descricao,
                Origem = origemOperacao
            });
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "NCM {Codigo} cadastrado automaticamente pela operacao {OrigemOperacao} para empresa {EmpresaId}.",
            normalizedCode,
            origemOperacao,
            currentUser.GetEmpresaId());

        return new EnsureNcmResult(entity, true, message);
    }

    private async Task<OfficialNcmSeed?> TryGetOfficialNcmSeedAsync(string normalizedCode, CancellationToken cancellationToken)
    {
        var official = await dbContext.FiscalNcmsOficiais
            .AsNoTracking()
            .Where(item => item.Ativo && item.CodigoNormalizado == normalizedCode)
            .OrderByDescending(item => item.EhItemFinal)
            .ThenByDescending(item => item.Vigente)
            .ThenBy(item => item.Codigo)
            .FirstOrDefaultAsync(cancellationToken);

        var descricaoCurta = Truncate(official?.Descricao, 250);
        if (descricaoCurta is null)
        {
            return null;
        }

        return new OfficialNcmSeed(
            descricaoCurta,
            Truncate(official?.DescricaoConcatenada ?? official?.Descricao, 2000) ?? descricaoCurta,
            Truncate(BuildAtoLegal(official?.TipoAtoInicio, official?.NumeroAtoInicio, official?.AnoAtoInicio), 160),
            official?.DataInicio,
            official?.DataFim,
            official?.Vigente ?? false);
    }

    private static FiscalNcmDto MapFiscalNcm(
        FiscalNcm item,
        bool? cadastroAutomatico = null,
        string? observacaoCadastro = null)
    {
        var auto = cadastroAutomatico ?? IsPlaceholderNcmDescription(item.Descricao);
        return new FiscalNcmDto(
            item.Codigo,
            item.Descricao,
            item.CestPadraoCodigo,
            item.AliquotaIbpt,
            item.SujeitoSt,
            auto,
            observacaoCadastro ?? (auto ? "Cadastro provisorio. Revise a descricao fiscal ou importe a tabela oficial." : null));
    }

    private void RegisterNcmSystemLog(string acao, string descricao, object dados)
    {
        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = currentUser.GetEmpresaId(),
            UsuarioId = currentUser.GetUserId(),
            Modulo = "FiscalNcm",
            Acao = acao,
            Descricao = descricao,
            Dados = JsonSerializer.Serialize(dados),
            IpAddress = currentUser.GetIpAddress(),
            DataCriacao = DateTime.UtcNow
        });
    }

    private async Task ImportOfficialNcmCatalogRowsAsync(
        IReadOnlyCollection<OfficialNcmImportRow> rows,
        string sourceName,
        CancellationToken cancellationToken)
    {
        var warnings = new List<string>();
        var created = 0;
        var updated = 0;
        var ignored = 0;
        var invalid = 0;
        var importAt = DateTime.UtcNow;
        var importDate = importAt.Date;
        var importedCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var existingMap = await dbContext.FiscalNcmsOficiais.ToDictionaryAsync(item => item.Codigo, cancellationToken);

        foreach (var row in rows)
        {
            var normalizedCode = NormalizeNullable(row.Codigo);
            var normalizedDigits = OnlyDigits(row.Codigo);
            var normalizedDescription = NormalizeOfficialDescription(row.Descricao);
            var normalizedDescriptionConcat = NormalizeOfficialDescription(row.DescricaoCompleta ?? row.Descricao);
            var shortDescription = Truncate(normalizedDescription, 500);
            var completeDescription = Truncate(normalizedDescriptionConcat, 4000);

            if (normalizedCode is null || normalizedDigits.Length == 0 || shortDescription is null)
            {
                invalid++;
                if (warnings.Count < 12)
                {
                    warnings.Add($"Linha {row.Index}: codigo ou descricao da nomenclatura oficial invalidos.");
                }

                continue;
            }

            importedCodes.Add(normalizedCode);
            var normalizedTipoAto = Truncate(NormalizeNullable(row.TipoAtoIni), 80);
            var normalizedNumeroAto = Truncate(NormalizeNullable(row.NumeroAtoIni), 20);
            var normalizedAnoAto = Truncate(NormalizeNullable(row.AnoAtoIni), 10);
            var dataInicio = ParseOfficialDate(row.DataInicio);
            var dataFim = ParseOfficialDate(row.DataFim);
            var vigente = (!dataInicio.HasValue || dataInicio.Value.Date <= importDate) &&
                          (!dataFim.HasValue || dataFim.Value.Date >= importDate);
            var ehItemFinal = normalizedDigits.Length == 8;

            if (existingMap.TryGetValue(normalizedCode, out var existing))
            {
                var changed = false;

                if (!string.Equals(existing.CodigoNormalizado, normalizedDigits, StringComparison.Ordinal))
                {
                    existing.CodigoNormalizado = normalizedDigits;
                    changed = true;
                }

                if (!string.Equals(existing.Descricao, shortDescription, StringComparison.Ordinal))
                {
                    existing.Descricao = shortDescription;
                    changed = true;
                }

                if (!string.Equals(existing.DescricaoConcatenada, completeDescription, StringComparison.Ordinal))
                {
                    existing.DescricaoConcatenada = completeDescription;
                    changed = true;
                }

                if (!AreSameDate(existing.DataInicio, dataInicio))
                {
                    existing.DataInicio = dataInicio;
                    changed = true;
                }

                if (!AreSameDate(existing.DataFim, dataFim))
                {
                    existing.DataFim = dataFim;
                    changed = true;
                }

                if (!string.Equals(existing.TipoAtoInicio, normalizedTipoAto, StringComparison.Ordinal))
                {
                    existing.TipoAtoInicio = normalizedTipoAto;
                    changed = true;
                }

                if (!string.Equals(existing.NumeroAtoInicio, normalizedNumeroAto, StringComparison.Ordinal))
                {
                    existing.NumeroAtoInicio = normalizedNumeroAto;
                    changed = true;
                }

                if (!string.Equals(existing.AnoAtoInicio, normalizedAnoAto, StringComparison.Ordinal))
                {
                    existing.AnoAtoInicio = normalizedAnoAto;
                    changed = true;
                }

                if (existing.EhItemFinal != ehItemFinal)
                {
                    existing.EhItemFinal = ehItemFinal;
                    changed = true;
                }

                if (existing.Vigente != vigente)
                {
                    existing.Vigente = vigente;
                    changed = true;
                }

                if (!existing.Ativo)
                {
                    existing.Ativo = true;
                    changed = true;
                }

                existing.DataImportacao = importAt;

                if (changed)
                {
                    updated++;
                }
                else
                {
                    ignored++;
                }

                continue;
            }

            dbContext.FiscalNcmsOficiais.Add(new FiscalNcmOficial
            {
                FiscalNcmOficialId = Guid.NewGuid(),
                Codigo = normalizedCode,
                CodigoNormalizado = normalizedDigits,
                Descricao = shortDescription,
                DescricaoConcatenada = completeDescription,
                DataInicio = dataInicio,
                DataFim = dataFim,
                TipoAtoInicio = normalizedTipoAto,
                NumeroAtoInicio = normalizedNumeroAto,
                AnoAtoInicio = normalizedAnoAto,
                EhItemFinal = ehItemFinal,
                Vigente = vigente,
                DataImportacao = importAt,
                Ativo = true
            });

            created++;
        }

        foreach (var existing in existingMap.Values.Where(item => !importedCodes.Contains(item.Codigo) && item.Ativo))
        {
            existing.Ativo = false;
            existing.Vigente = false;
            existing.DataImportacao = importAt;
            updated++;
        }

        RegisterNcmSystemLog(
            "FiscalNcmCatalogoOficialImportacao",
            $"Catalogo oficial completo de NCM importado de {sourceName}.",
            new
            {
                sourceName,
                importAt,
                TotalLinhas = rows.Count,
                Criados = created,
                Atualizados = updated,
                Ignorados = ignored,
                Invalidos = invalid,
                Avisos = warnings
            });
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Catalogo oficial completo de NCM importado para empresa {EmpresaId} a partir de {Fonte}. Criados={Criados}, Atualizados={Atualizados}, Ignorados={Ignorados}, Invalidos={Invalidos}.",
            currentUser.GetEmpresaId(),
            sourceName,
            created,
            updated,
            ignored,
            invalid);
    }

    private async Task<FiscalNcmImportacaoResultadoDto> ImportOfficialNcmRowsAsync(
        IReadOnlyCollection<OfficialNcmImportRow> rows,
        string sourceName,
        CancellationToken cancellationToken)
    {
        var warnings = new List<string>();
        var created = 0;
        var updated = 0;
        var ignored = 0;
        var invalid = 0;
        var importAt = DateTime.UtcNow;
        var importDate = importAt.Date;
        var importedCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var userId = currentUser.GetUserId();
        var existingMap = await dbContext.FiscalNcms.ToDictionaryAsync(item => item.Codigo, cancellationToken);

        foreach (var row in rows)
        {
            try
            {
                var normalizedCode = NormalizeFixedDigits(row.Codigo, 8);
                var fullDescription = NormalizeOfficialDescription(row.DescricaoCompleta ?? row.Descricao);
                if (normalizedCode is null || fullDescription is null)
                {
                    invalid++;
                    if (warnings.Count < 12)
                    {
                        warnings.Add($"Linha {row.Index}: codigo ou descricao de NCM invalidos.");
                    }

                    continue;
                }

                importedCodes.Add(normalizedCode);
                var shortDescription = Truncate(fullDescription, 250)!;
                var completeDescription = Truncate(fullDescription, 2000);
                var atoLegal = Truncate(BuildAtoLegal(row.TipoAtoIni, row.NumeroAtoIni, row.AnoAtoIni), 160);
                var dataInicio = ParseOfficialDate(row.DataInicio);
                var dataFim = ParseOfficialDate(row.DataFim);
                var vigente = (!dataInicio.HasValue || dataInicio.Value.Date <= importDate) &&
                              (!dataFim.HasValue || dataFim.Value.Date >= importDate);

                if (existingMap.TryGetValue(normalizedCode, out var existing))
                {
                    var changed = false;

                    if (!string.Equals(existing.Descricao, shortDescription, StringComparison.Ordinal))
                    {
                        existing.Descricao = shortDescription;
                        changed = true;
                    }

                    if (!string.Equals(existing.DescricaoCompleta, completeDescription, StringComparison.Ordinal))
                    {
                        existing.DescricaoCompleta = completeDescription;
                        changed = true;
                    }

                    if (!string.Equals(existing.AtoLegal, atoLegal, StringComparison.Ordinal))
                    {
                        existing.AtoLegal = atoLegal;
                        changed = true;
                    }

                    if (!AreSameDate(existing.DataInicio, dataInicio))
                    {
                        existing.DataInicio = dataInicio;
                        changed = true;
                    }

                    if (!AreSameDate(existing.DataFim, dataFim))
                    {
                        existing.DataFim = dataFim;
                        changed = true;
                    }

                    if (existing.Vigente != vigente)
                    {
                        existing.Vigente = vigente;
                        changed = true;
                    }

                    if (!existing.Ativo)
                    {
                        existing.Ativo = true;
                        changed = true;
                    }

                    existing.DataImportacao = importAt;
                    existing.UsuarioImportacao = userId;

                    if (changed)
                    {
                        updated++;
                    }
                    else
                    {
                        ignored++;
                    }

                    continue;
                }

                dbContext.FiscalNcms.Add(new FiscalNcm
                {
                    FiscalNcmId = Guid.NewGuid(),
                    Codigo = normalizedCode,
                    Descricao = shortDescription,
                    DescricaoCompleta = completeDescription,
                    AtoLegal = atoLegal,
                    DataInicio = dataInicio,
                    DataFim = dataFim,
                    Vigente = vigente,
                    DataImportacao = importAt,
                    UsuarioImportacao = userId,
                    Ativo = true
                });

                created++;
            }
            catch (AppException exception)
            {
                invalid++;
                if (warnings.Count < 12)
                {
                    warnings.Add($"Linha {row.Index}: {exception.Message}");
                }
            }
        }

        foreach (var existing in existingMap.Values.Where(item =>
                     item.DataImportacao.HasValue &&
                     !importedCodes.Contains(item.Codigo) &&
                     (item.Vigente || item.Ativo)))
        {
            existing.Vigente = false;
            existing.Ativo = false;
            existing.DataImportacao = importAt;
            existing.UsuarioImportacao = userId;
            updated++;
        }

        RegisterNcmSystemLog(
            "FiscalNcmImportacaoOficial",
            $"Tabela NCM operacional importada de {sourceName}.",
            new
            {
                Fonte = sourceName,
                importAt,
                TotalLinhas = rows.Count,
                Criados = created,
                Atualizados = updated,
                Ignorados = ignored,
                Invalidos = invalid,
                Avisos = warnings
            });
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Importacao operacional de tabela NCM concluida para empresa {EmpresaId} a partir de {Fonte}. Criados={Criados}, Atualizados={Atualizados}, Ignorados={Ignorados}, Invalidos={Invalidos}.",
            currentUser.GetEmpresaId(),
            sourceName,
            created,
            updated,
            ignored,
            invalid);

        return new FiscalNcmImportacaoResultadoDto(
            sourceName,
            rows.Count,
            created,
            updated,
            ignored,
            invalid,
            warnings);
    }

    private static IReadOnlyCollection<OfficialNcmImportRow> ParseOfficialNcmRows(JsonElement root)
    {
        var rows = new List<OfficialNcmImportRow>();
        TryCollectOfficialNcmRows(root, rows, 0);
        return rows;
    }

    private static async Task<IReadOnlyCollection<OfficialNcmImportRow>> ParseOfficialNcmWorkbookRowsAsync(
        Stream stream,
        CancellationToken cancellationToken)
    {
        using var memoryStream = new MemoryStream();
        await stream.CopyToAsync(memoryStream, cancellationToken);
        memoryStream.Position = 0;

        using var archive = new ZipArchive(memoryStream, ZipArchiveMode.Read, leaveOpen: false);
        var worksheetPath = ResolveOfficialWorkbookWorksheetPath(archive);
        var worksheetEntry = archive.GetEntry(worksheetPath)
            ?? throw new AppException("Nao foi possivel localizar a planilha principal no arquivo XLSX informado.");

        var sharedStrings = LoadOfficialWorkbookSharedStrings(archive);
        var worksheetDocument = XDocument.Load(worksheetEntry.Open());
        var spreadsheetNamespace = worksheetDocument.Root?.Name.Namespace ?? XNamespace.None;
        var sheetRows = worksheetDocument.Root?
            .Element(spreadsheetNamespace + "sheetData")?
            .Elements(spreadsheetNamespace + "row")
            .ToArray()
            ?? [];

        var rows = new List<OfficialNcmImportRow>();
        Dictionary<string, int>? headerMap = null;

        foreach (var rowElement in sheetRows)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var rowIndex = (int?)rowElement.Attribute("r") ?? rows.Count + 1;
            var rowValues = MapOfficialWorkbookRowValues(rowElement, spreadsheetNamespace, sharedStrings);
            if (rowValues.Count == 0)
            {
                continue;
            }

            if (headerMap is null)
            {
                headerMap = TryBuildOfficialWorkbookHeaderMap(rowValues);
                continue;
            }

            var mappedRow = new OfficialNcmImportRow(
                rowIndex,
                TryGetOfficialWorkbookField(rowValues, headerMap, "codigo", "ncm", "codigoncm"),
                TryGetOfficialWorkbookField(rowValues, headerMap, "descricao", "descricaoncm", "descricaooficial"),
                TryGetOfficialWorkbookField(rowValues, headerMap, "descricaoconcatenada", "descricaocompleta", "descricaoexpandida"),
                TryGetOfficialWorkbookField(rowValues, headerMap, "datainicio", "iniciovigencia"),
                TryGetOfficialWorkbookField(rowValues, headerMap, "datafim", "fimvigencia"),
                TryGetOfficialWorkbookField(rowValues, headerMap, "atolegalinicio", "tipoatoini", "tipoorgaoatoini", "tipoorgaatoini"),
                TryGetOfficialWorkbookField(rowValues, headerMap, "numero", "numeroatoini", "numeroato"),
                TryGetOfficialWorkbookField(rowValues, headerMap, "ano", "anoatoini", "anoato"));

            if (string.IsNullOrWhiteSpace(mappedRow.Codigo) &&
                string.IsNullOrWhiteSpace(mappedRow.Descricao) &&
                string.IsNullOrWhiteSpace(mappedRow.DescricaoCompleta))
            {
                continue;
            }

            rows.Add(mappedRow);
        }

        if (rows.Count == 0)
        {
            throw new AppException("O arquivo XLSX informado nao trouxe linhas validas da tabela oficial de NCM.");
        }

        return rows;
    }

    private static string ResolveOfficialWorkbookWorksheetPath(ZipArchive archive)
    {
        var workbookEntry = archive.GetEntry("xl/workbook.xml")
            ?? throw new AppException("Nao foi possivel ler o workbook do arquivo XLSX informado.");
        var workbookRelsEntry = archive.GetEntry("xl/_rels/workbook.xml.rels")
            ?? throw new AppException("Nao foi possivel ler os relacionamentos do workbook XLSX informado.");

        var workbookDocument = XDocument.Load(workbookEntry.Open());
        var workbookRelationshipsDocument = XDocument.Load(workbookRelsEntry.Open());
        var spreadsheetNamespace = workbookDocument.Root?.Name.Namespace ?? XNamespace.None;
        var officeDocumentRelationshipNamespace = XNamespace.Get("http://schemas.openxmlformats.org/officeDocument/2006/relationships");
        var packageRelationshipNamespace = XNamespace.Get("http://schemas.openxmlformats.org/package/2006/relationships");

        var firstSheet = workbookDocument
            .Descendants(spreadsheetNamespace + "sheet")
            .FirstOrDefault()
            ?? throw new AppException("O arquivo XLSX informado nao possui planilhas para importar.");

        var relationshipId = (string?)firstSheet.Attribute(officeDocumentRelationshipNamespace + "id")
            ?? (string?)firstSheet.Attribute("id")
            ?? throw new AppException("Nao foi possivel identificar a primeira planilha do arquivo XLSX informado.");

        var relationship = workbookRelationshipsDocument
            .Descendants(packageRelationshipNamespace + "Relationship")
            .FirstOrDefault(item => string.Equals((string?)item.Attribute("Id"), relationshipId, StringComparison.Ordinal))
            ?? throw new AppException("Nao foi possivel localizar o relacionamento da planilha principal no XLSX informado.");

        var target = ((string?)relationship.Attribute("Target"))?.Replace('\\', '/')
            ?? throw new AppException("Nao foi possivel identificar o caminho da planilha principal no XLSX informado.");

        target = target.TrimStart('/');
        return target.StartsWith("xl/", StringComparison.OrdinalIgnoreCase)
            ? target
            : $"xl/{target}";
    }

    private static IReadOnlyList<string> LoadOfficialWorkbookSharedStrings(ZipArchive archive)
    {
        var sharedStringsEntry = archive.GetEntry("xl/sharedStrings.xml");
        if (sharedStringsEntry is null)
        {
            return [];
        }

        var sharedStringsDocument = XDocument.Load(sharedStringsEntry.Open());
        var spreadsheetNamespace = sharedStringsDocument.Root?.Name.Namespace ?? XNamespace.None;
        return sharedStringsDocument
            .Descendants(spreadsheetNamespace + "si")
            .Select(item => string.Concat(item.Descendants(spreadsheetNamespace + "t").Select(text => text.Value)))
            .ToArray();
    }

    private static Dictionary<int, string> MapOfficialWorkbookRowValues(
        XElement rowElement,
        XNamespace spreadsheetNamespace,
        IReadOnlyList<string> sharedStrings)
    {
        var values = new Dictionary<int, string>();

        foreach (var cell in rowElement.Elements(spreadsheetNamespace + "c"))
        {
            var cellReference = (string?)cell.Attribute("r");
            var columnIndex = GetSpreadsheetColumnIndex(cellReference);
            if (columnIndex < 0)
            {
                continue;
            }

            values[columnIndex] = GetOfficialWorkbookCellValue(cell, spreadsheetNamespace, sharedStrings);
        }

        return values;
    }

    private static string GetOfficialWorkbookCellValue(
        XElement cell,
        XNamespace spreadsheetNamespace,
        IReadOnlyList<string> sharedStrings)
    {
        var cellType = (string?)cell.Attribute("t");
        return cellType switch
        {
            "s" => TryGetSharedStringValue(cell.Element(spreadsheetNamespace + "v")?.Value, sharedStrings),
            "inlineStr" => string.Concat(cell.Descendants(spreadsheetNamespace + "t").Select(item => item.Value)),
            _ => cell.Element(spreadsheetNamespace + "v")?.Value
                 ?? string.Concat(cell.Descendants(spreadsheetNamespace + "t").Select(item => item.Value))
                 ?? string.Empty
        };
    }

    private static string TryGetSharedStringValue(string? indexValue, IReadOnlyList<string> sharedStrings)
    {
        return int.TryParse(indexValue, out var index) && index >= 0 && index < sharedStrings.Count
            ? sharedStrings[index]
            : string.Empty;
    }

    private static int GetSpreadsheetColumnIndex(string? cellReference)
    {
        if (string.IsNullOrWhiteSpace(cellReference))
        {
            return -1;
        }

        var letters = new string(cellReference
            .TakeWhile(character => char.IsLetter(character))
            .ToArray());

        if (letters.Length == 0)
        {
            return -1;
        }

        var index = 0;
        foreach (var letter in letters)
        {
            index = (index * 26) + (char.ToUpperInvariant(letter) - 'A' + 1);
        }

        return index - 1;
    }

    private static Dictionary<string, int>? TryBuildOfficialWorkbookHeaderMap(IReadOnlyDictionary<int, string> rowValues)
    {
        var headerMap = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var (columnIndex, value) in rowValues)
        {
            var normalizedHeader = NormalizeImportHeader(value);
            if (normalizedHeader is null || headerMap.ContainsKey(normalizedHeader))
            {
                continue;
            }

            headerMap[normalizedHeader] = columnIndex;
        }

        return ContainsAnyOfficialWorkbookHeader(headerMap, "codigo", "ncm", "codigoncm")
               && ContainsAnyOfficialWorkbookHeader(headerMap, "descricao", "descricaoncm", "descricaooficial")
            ? headerMap
            : null;
    }

    private static bool ContainsAnyOfficialWorkbookHeader(
        IReadOnlyDictionary<string, int> headerMap,
        params string[] aliases)
        => aliases.Any(headerMap.ContainsKey);

    private static string? TryGetOfficialWorkbookField(
        IReadOnlyDictionary<int, string> rowValues,
        IReadOnlyDictionary<string, int> headerMap,
        params string[] aliases)
    {
        foreach (var alias in aliases)
        {
            if (!headerMap.TryGetValue(alias, out var columnIndex) || !rowValues.TryGetValue(columnIndex, out var value))
            {
                continue;
            }

            return value;
        }

        return null;
    }

    private static void TryCollectOfficialNcmRows(JsonElement element, List<OfficialNcmImportRow> rows, int depth)
    {
        if (depth > 6 || rows.Count > 0)
        {
            return;
        }

        switch (element.ValueKind)
        {
            case JsonValueKind.Array:
                if (TryMapOfficialNcmArray(element, rows))
                {
                    return;
                }

                foreach (var item in element.EnumerateArray())
                {
                    if (item.ValueKind is JsonValueKind.Array or JsonValueKind.Object)
                    {
                        TryCollectOfficialNcmRows(item, rows, depth + 1);
                        if (rows.Count > 0)
                        {
                            return;
                        }
                    }
                }

                return;
            case JsonValueKind.Object:
                foreach (var property in element.EnumerateObject())
                {
                    if (property.Value.ValueKind is JsonValueKind.Array or JsonValueKind.Object)
                    {
                        TryCollectOfficialNcmRows(property.Value, rows, depth + 1);
                        if (rows.Count > 0)
                        {
                            return;
                        }
                    }
                }

                return;
        }
    }

    private static bool TryMapOfficialNcmArray(JsonElement element, List<OfficialNcmImportRow> rows)
    {
        var mappedRows = new List<OfficialNcmImportRow>();
        var index = 1;

        foreach (var item in element.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object)
            {
                index++;
                continue;
            }

            if (!LooksLikeOfficialNcmItem(item))
            {
                return false;
            }

            mappedRows.Add(MapOfficialNcmRow(item, index));
            index++;
        }

        if (mappedRows.Count == 0)
        {
            return false;
        }

        rows.AddRange(mappedRows);
        return true;
    }

    private static OfficialNcmImportRow MapOfficialNcmRow(JsonElement item, int index)
        => new(
            index,
            GetJsonString(item, "Codigo", "codigo"),
            GetJsonString(item, "Descricao", "descricao"),
            GetJsonString(item, "DescricaoCompleta", "descricaoCompleta", "descricaoExpandida", "descricaoConcatenada"),
            GetJsonString(item, "Data_Inicio", "dataInicio", "DataInicio"),
            GetJsonString(item, "Data_Fim", "dataFim", "DataFim"),
            GetJsonString(item, "Tipo_Ato_Ini", "tipoOrgaoAtoIni", "tipoAtoIni"),
            GetJsonString(item, "Numero_Ato_Ini", "numeroAtoIni", "numeroAto"),
            GetJsonString(item, "Ano_Ato_Ini", "anoAtoIni", "anoAto"));

    private static bool LooksLikeOfficialNcmItem(JsonElement item)
        => HasJsonProperty(item, "Codigo", "codigo")
            || HasJsonProperty(item, "Descricao", "descricao")
            || HasJsonProperty(item, "DescricaoCompleta", "descricaoCompleta", "descricaoExpandida", "descricaoConcatenada");

    private static bool HasJsonProperty(JsonElement item, params string[] names)
    {
        if (item.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        foreach (var name in names)
        {
            if (item.TryGetProperty(name, out _))
            {
                return true;
            }
        }

        return false;
    }

    private static string? GetJsonString(JsonElement item, params string[] names)
    {
        foreach (var name in names)
        {
            if (!item.TryGetProperty(name, out var value))
            {
                continue;
            }

            return value.ValueKind switch
            {
                JsonValueKind.String => value.GetString(),
                JsonValueKind.Number => value.GetRawText(),
                JsonValueKind.True => bool.TrueString,
                JsonValueKind.False => bool.FalseString,
                _ => value.GetRawText()
            };
        }

        return null;
    }

    private static bool LooksLikeHtml(string responseBody)
    {
        var trimmed = responseBody.TrimStart();
        return trimmed.StartsWith("<!DOCTYPE", StringComparison.OrdinalIgnoreCase)
            || trimmed.StartsWith("<html", StringComparison.OrdinalIgnoreCase)
            || trimmed.StartsWith("<head", StringComparison.OrdinalIgnoreCase)
            || trimmed.StartsWith("<body", StringComparison.OrdinalIgnoreCase);
    }

    private static string DescribeJsonShape(JsonElement root)
    {
        return root.ValueKind switch
        {
            JsonValueKind.Array => $"array com {root.GetArrayLength()} item(ns)",
            JsonValueKind.Object => string.Join(", ", root.EnumerateObject().Take(6).Select(property => $"{property.Name}:{property.Value.ValueKind}")),
            _ => root.ValueKind.ToString()
        };
    }

    private static string? NormalizeOfficialDescription(string? value)
    {
        var normalized = NormalizeNullable(value);
        if (normalized is null)
        {
            return null;
        }

        normalized = WebUtility.HtmlDecode(normalized);
        normalized = Regex.Replace(normalized, "<[^>]+>", string.Empty);
        normalized = Regex.Replace(normalized, "\\s+", " ").Trim();
        return normalized.Length == 0 ? null : normalized;
    }

    private static string? BuildAtoLegal(string? tipoAto, string? numeroAto, string? anoAto)
    {
        var parts = new List<string>();
        var normalizedTipo = NormalizeNullable(tipoAto);
        var normalizedNumero = NormalizeNullable(numeroAto);
        var normalizedAno = NormalizeNullable(anoAto);

        if (normalizedTipo is not null)
        {
            parts.Add(normalizedTipo);
        }

        if (normalizedNumero is not null && normalizedAno is not null)
        {
            parts.Add($"{normalizedNumero}/{normalizedAno}");
        }
        else if (normalizedNumero is not null)
        {
            parts.Add(normalizedNumero);
        }
        else if (normalizedAno is not null)
        {
            parts.Add(normalizedAno);
        }

        return parts.Count == 0 ? null : string.Join(' ', parts);
    }

    private static DateTime? ParseOfficialDate(string? value)
    {
        var normalized = NormalizeNullable(value);
        if (normalized is null)
        {
            return null;
        }

        if (double.TryParse(normalized, NumberStyles.Any, CultureInfo.InvariantCulture, out var excelSerial))
        {
            try
            {
                return DateTime.FromOADate(excelSerial).Date;
            }
            catch (ArgumentException)
            {
            }
        }

        var formats = new[] { "dd/MM/yyyy", "d/M/yyyy", "yyyy-MM-dd", "yyyyMMdd" };
        if (DateTime.TryParseExact(normalized, formats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
        {
            return parsed.Date;
        }

        return DateTime.TryParse(normalized, CultureInfo.GetCultureInfo("pt-BR"), DateTimeStyles.None, out parsed)
            ? parsed.Date
            : null;
    }

    private static string? Truncate(string? value, int maxLength)
    {
        var normalized = NormalizeNullable(value);
        if (normalized is null)
        {
            return null;
        }

        return normalized.Length <= maxLength ? normalized : normalized[..maxLength];
    }

    private static bool AreSameDate(DateTime? left, DateTime? right)
        => left?.Date == right?.Date;

    private static OrigemRegraFiscal ResolveRateOrigin(decimal? suggested, decimal? actual)
        => suggested.HasValue && actual.HasValue && suggested.Value == actual.Value
            ? OrigemRegraFiscal.SugestaoAutomatica
            : OrigemRegraFiscal.Manual;

    private async Task<decimal?> SuggestIcmsAliquotaAsync(
        Empresa empresa,
        string? ncmCodigo,
        string? origemFiscal,
        string? cfopVendaPadrao,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(empresa.Uf))
        {
            return null;
        }

        var origemFiscalCodigo = NormalizeOrigemFiscal(origemFiscal, []);
        var regime = empresa.RegimeTributario.ToString();

        var candidates = await dbContext.FiscalAliquotasIcms
            .AsNoTracking()
            .Where(item => item.Ativo && item.UfOrigem == empresa.Uf)
            .OrderBy(item => item.Prioridade)
            .ToListAsync(cancellationToken);

        var bestMatch = candidates
            .Where(item =>
                (item.RegimeTributario == null || item.RegimeTributario == regime) &&
                (item.CfopCodigo == null || item.CfopCodigo == cfopVendaPadrao) &&
                (item.OrigemFiscalCodigo == null || item.OrigemFiscalCodigo == origemFiscalCodigo) &&
                (item.NcmPrefixo == null || (ncmCodigo != null && ncmCodigo.StartsWith(item.NcmPrefixo, StringComparison.Ordinal))))
            .OrderBy(item => item.Prioridade)
            .ThenByDescending(item => item.NcmPrefixo?.Length ?? 0)
            .FirstOrDefault();

        return bestMatch?.Aliquota;
    }

    private static decimal? ValidateAliquota(
        decimal? actual,
        decimal? suggested,
        string fieldName,
        string? justification,
        List<string> pendencias,
        string? code,
        bool applicable = true)
    {
        if (!applicable)
        {
            return 0m;
        }

        if (actual is < 0 or > 100)
        {
            pendencias.Add($"Aliquota {fieldName} deve ficar entre 0 e 100.");
            return actual;
        }

        if (suggested is null)
        {
            if (!actual.HasValue)
            {
                pendencias.Add($"Nao foi encontrada regra automatica para a aliquota {fieldName}. Revise a tabela fiscal.");
            }
            else if (actual.Value > 0 && string.IsNullOrWhiteSpace(justification))
            {
                pendencias.Add($"Justifique a alteracao manual da aliquota {fieldName}.");
            }

            return actual;
        }

        if (!actual.HasValue)
        {
            return suggested.Value;
        }

        if (actual.Value == suggested.Value)
        {
            return actual.Value;
        }

        if (string.IsNullOrWhiteSpace(justification))
        {
            pendencias.Add($"Justifique a alteracao manual da aliquota {fieldName}.");
        }

        return actual.Value;
    }

    private static decimal? SuggestPisAliquota(EmpresaRegimeTributario regime, string? cstPis)
    {
        if (cstPis is null)
        {
            return null;
        }

        if (PisCofinsAliquotaZeroCodes.Contains(cstPis))
        {
            return 0m;
        }

        if (!PisCofinsTributavelCodes.Contains(cstPis))
        {
            return null;
        }

        return regime switch
        {
            EmpresaRegimeTributario.LucroReal => 1.65m,
            EmpresaRegimeTributario.LucroPresumido => 0.65m,
            EmpresaRegimeTributario.RegimeNormal => 0.65m,
            EmpresaRegimeTributario.SimplesNacional => 0m,
            EmpresaRegimeTributario.SimplesExcessoSublimite => 0m,
            _ => null
        };
    }

    private static decimal? SuggestCofinsAliquota(EmpresaRegimeTributario regime, string? cstCofins)
    {
        if (cstCofins is null)
        {
            return null;
        }

        if (PisCofinsAliquotaZeroCodes.Contains(cstCofins))
        {
            return 0m;
        }

        if (!PisCofinsTributavelCodes.Contains(cstCofins))
        {
            return null;
        }

        return regime switch
        {
            EmpresaRegimeTributario.LucroReal => 7.60m,
            EmpresaRegimeTributario.LucroPresumido => 3.00m,
            EmpresaRegimeTributario.RegimeNormal => 3.00m,
            EmpresaRegimeTributario.SimplesNacional => 0m,
            EmpresaRegimeTributario.SimplesExcessoSublimite => 0m,
            _ => null
        };
    }

    private static bool IsSimplesRegime(EmpresaRegimeTributario regime)
        => regime is EmpresaRegimeTributario.SimplesNacional or EmpresaRegimeTributario.SimplesExcessoSublimite;

    private static string GetDefaultCsosn()
        => "102";

    private static string GetDefaultCstIcms()
        => "00";

    private static string GetDefaultPisCofinsCst(EmpresaRegimeTributario regime)
        => IsSimplesRegime(regime) ? "49" : "01";

    private static string? ApplyDefaultCfopIfMissing(string? current, string? suggested)
        => current ?? suggested;

    private static string? ValidateCfop(
        string? value,
        string fieldName,
        IReadOnlyDictionary<string, FiscalCfop> cfops,
        List<string> pendencias,
        bool entrada)
    {
        var normalized = NormalizeFixedDigits(value, 4);
        if (normalized is null)
        {
            return null;
        }

        if (!cfops.TryGetValue(normalized, out var cfop))
        {
            pendencias.Add($"{fieldName} nao existe na tabela fiscal.");
            return normalized;
        }

        if (entrada && !cfop.Entrada)
        {
            pendencias.Add($"{fieldName} precisa ser um CFOP de entrada.");
        }

        if (!entrada && !cfop.Saida)
        {
            pendencias.Add($"{fieldName} precisa ser um CFOP de saida.");
        }

        return normalized;
    }

    private static string? ValidateCatalogCode(
        string? value,
        string fieldName,
        IEnumerable<string> validCodes,
        List<string> pendencias,
        int expectedDigits = 0)
    {
        var normalized = expectedDigits > 0
            ? NormalizeFixedDigits(value, expectedDigits)
            : NormalizeNullable(value)?.ToUpperInvariant();

        if (normalized is null)
        {
            return null;
        }

        if (!validCodes.Contains(normalized, StringComparer.OrdinalIgnoreCase))
        {
            pendencias.Add($"{fieldName} invalido para a tabela fiscal.");
        }

        return normalized;
    }

    private static string? ValidateOptionalCatalogCode(
        string? value,
        string fieldName,
        IEnumerable<string> validCodes,
        List<string> pendencias,
        int expectedDigits = 0)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return ValidateCatalogCode(value, fieldName, validCodes, pendencias, expectedDigits);
    }

    private static string? NormalizeOptionalDigitsCode(string? value, string fieldName, int expectedDigits, List<string> pendencias)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var normalized = NormalizeFixedDigits(value, expectedDigits);
        if (normalized is null)
        {
            pendencias.Add($"{fieldName} deve conter {expectedDigits} digitos quando informado.");
        }

        return normalized;
    }

    private static string? NormalizeOptionalVariableDigitsCode(
        string? value,
        string fieldName,
        int minDigits,
        int maxDigits,
        List<string> pendencias)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var digits = OnlyDigits(value);
        if (digits.Length < minDigits || digits.Length > maxDigits)
        {
            pendencias.Add($"{fieldName} deve conter de {minDigits} a {maxDigits} digitos quando informado.");
            return digits.Length == 0 ? null : digits;
        }

        return digits;
    }

    private static string? NormalizeUpperMaxLength(string? value, int maxLength, string fieldName, List<string> pendencias)
    {
        var normalized = NormalizeNullable(value)?.ToUpperInvariant();
        if (normalized is null)
        {
            return null;
        }

        if (normalized.Length > maxLength)
        {
            pendencias.Add($"{fieldName} deve ter no maximo {maxLength} caracteres.");
            return normalized[..maxLength];
        }

        return normalized;
    }

    private static decimal? NormalizeAliquotaIbpt(decimal? value)
    {
        if (!value.HasValue)
        {
            return null;
        }

        if (value.Value is < 0 or > 100)
        {
            throw new AppException("Aliquota IBPT do NCM deve ficar entre 0 e 100.");
        }

        return Math.Round(value.Value, 4, MidpointRounding.AwayFromZero);
    }

    private static decimal? NormalizeNullableDecimal(string? value)
    {
        var normalized = NormalizeNullable(value);
        if (normalized is null)
        {
            return null;
        }

        normalized = normalized.Replace('%', ' ').Trim().Replace(',', '.');
        return decimal.TryParse(normalized, NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed)
            ? NormalizeAliquotaIbpt(parsed)
            : null;
    }

    private static bool? NormalizeNullableBoolean(string? value)
    {
        var normalized = NormalizeNullable(value)?.ToLowerInvariant();
        if (normalized is null)
        {
            return null;
        }

        return normalized switch
        {
            "1" or "true" or "sim" or "s" or "yes" or "y" => true,
            "0" or "false" or "nao" or "n" or "no" => false,
            _ => null
        };
    }

    private static bool IsPlaceholderNcmDescription(string? description)
    {
        var normalized = NormalizeNullable(description);
        if (normalized is null)
        {
            return false;
        }

        return normalized.Contains("revisar descricao fiscal", StringComparison.OrdinalIgnoreCase)
            || normalized.Contains("revisao fiscal", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsSpreadsheetFile(string? fileName)
        => string.Equals(Path.GetExtension(fileName), ".xlsx", StringComparison.OrdinalIgnoreCase);

    private static char DetectDelimiter(string line)
    {
        var candidates = new[] { ';', '\t', ',', '|' };
        return candidates
            .OrderByDescending(candidate => line.Count(character => character == candidate))
            .FirstOrDefault(candidate => line.Contains(candidate));
    }

    private static string[] ParseDelimitedLine(string line, char delimiter)
    {
        if (delimiter == default)
        {
            return [line];
        }

        var values = new List<string>();
        var current = new List<char>();
        var insideQuotes = false;

        for (var index = 0; index < line.Length; index++)
        {
            var character = line[index];
            if (character == '"')
            {
                if (insideQuotes && index + 1 < line.Length && line[index + 1] == '"')
                {
                    current.Add('"');
                    index++;
                    continue;
                }

                insideQuotes = !insideQuotes;
                continue;
            }

            if (character == delimiter && !insideQuotes)
            {
                values.Add(new string(current.ToArray()).Trim());
                current.Clear();
                continue;
            }

            current.Add(character);
        }

        values.Add(new string(current.ToArray()).Trim());
        return values.ToArray();
    }

    private static bool LooksLikeNcmHeader(IReadOnlyList<string> fields)
    {
        var normalized = fields
            .Select(NormalizeImportHeader)
            .Where(item => item is not null)
            .Cast<string>()
            .ToArray();

        return normalized.Contains("codigo") ||
               normalized.Contains("ncm") ||
               normalized.Contains("descricao") ||
               normalized.Contains("descricaoncm");
    }

    private static Dictionary<string, int> BuildHeaderMap(IReadOnlyList<string> headers)
    {
        var map = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < headers.Count; index++)
        {
            var normalized = NormalizeImportHeader(headers[index]);
            if (normalized is null || map.ContainsKey(normalized))
            {
                continue;
            }

            map[normalized] = index;
        }

        return map;
    }

    private static NcmImportRow MapImportRowFromHeader(
        IReadOnlyList<string> fields,
        IReadOnlyDictionary<string, int> headerMap)
        => new(
            TryGetImportField(fields, headerMap, "codigo", "ncm", "codigoncm", "codigoncm"),
            TryGetImportField(fields, headerMap, "descricao", "descricaoncm", "descricaooficial"),
            TryGetImportField(fields, headerMap, "cest", "cestpadrao", "cestpadraocodigo"),
            TryGetImportField(fields, headerMap, "aliquotaibpt", "ibpt", "aliqibpt"),
            TryGetImportField(fields, headerMap, "sujeitost", "st", "substituicaotributaria"));

    private static NcmImportRow MapImportRowByPosition(IReadOnlyList<string> fields)
        => new(
            fields.ElementAtOrDefault(0),
            fields.ElementAtOrDefault(1),
            fields.ElementAtOrDefault(2),
            fields.ElementAtOrDefault(3),
            fields.ElementAtOrDefault(4));

    private static string? TryGetImportField(
        IReadOnlyList<string> fields,
        IReadOnlyDictionary<string, int> headerMap,
        params string[] aliases)
    {
        foreach (var alias in aliases)
        {
            if (!headerMap.TryGetValue(alias, out var index) || index >= fields.Count)
            {
                continue;
            }

            return fields[index];
        }

        return null;
    }

    private static string? NormalizeImportHeader(string? value)
    {
        var normalized = NormalizeNullable(value);
        if (normalized is null)
        {
            return null;
        }

        return new string(normalized
            .Normalize(NormalizationForm.FormD)
            .Where(character => char.GetUnicodeCategory(character) != System.Globalization.UnicodeCategory.NonSpacingMark)
            .Select(character => char.IsLetterOrDigit(character) ? char.ToLowerInvariant(character) : '\0')
            .Where(character => character != '\0')
            .ToArray());
    }

    private static ProdutoPerfilFiscalPadrao? ParsePerfilFiscalPadrao(string? value, List<string> pendencias)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            pendencias.Add("Selecione o perfil fiscal do item.");
            return null;
        }

        if (!Enum.TryParse<ProdutoPerfilFiscalPadrao>(value.Trim(), true, out var parsed))
        {
            pendencias.Add("Perfil fiscal do item invalido.");
            return null;
        }

        return parsed;
    }

    private static string? NormalizeOrigemFiscal(string? value, List<string> pendencias)
    {
        var normalized = NormalizeNullable(value);
        if (normalized is null)
        {
            pendencias.Add("Selecione uma origem fiscal valida.");
            return null;
        }

        var code = normalized[0].ToString();
        if (!OrigemFiscalOptions.Any(item => item.Codigo == code))
        {
            pendencias.Add("Origem fiscal invalida.");
            return null;
        }

        return code;
    }

    private static string? NormalizeFixedDigits(string? value, int expectedDigits)
    {
        var digits = OnlyDigits(value);
        return digits.Length == expectedDigits ? digits : null;
    }

    private static string? NormalizeNullable(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string OnlyDigits(string? value)
        => string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : new string(value.Where(char.IsAsciiDigit).ToArray());

    private static bool IsOfficialLeafNcmCode(string? value)
        => OnlyDigits(value).Length == 8;

    private static void AddRule(
        List<ProdutoRegraFiscalAplicadaDto> regras,
        List<ProdutoFiscalCampoAuditavel> campos,
        string campo,
        string? codigo,
        string descricao,
        OrigemRegraFiscal origemRegra)
    {
        var ordem = regras.Count + 1;
        regras.Add(new ProdutoRegraFiscalAplicadaDto(campo, codigo, descricao, origemRegra.ToString(), ordem, DateTime.UtcNow));
        campos.Add(new ProdutoFiscalCampoAuditavel(campo, codigo, origemRegra));
    }

    private static ProdutoDefaultCfops? GetDefaultCfops(ProdutoPerfilFiscalPadrao perfil)
        => perfil switch
        {
            ProdutoPerfilFiscalPadrao.RevendaMercadoria => new ProdutoDefaultCfops("1102", "2102", "5102", "6102"),
            ProdutoPerfilFiscalPadrao.ProducaoEstabelecimento => new ProdutoDefaultCfops("1101", "2101", "5101", "6101"),
            _ => null
        };

    private static string GetPerfilLabel(ProdutoPerfilFiscalPadrao perfil)
        => PerfilFiscalOptions.FirstOrDefault(item => item.Codigo == perfil.ToString())?.Descricao ?? perfil.ToString();

    private static string GetOrigemDescricao(string codigo)
        => OrigemFiscalOptions.FirstOrDefault(item => item.Codigo == codigo)?.Descricao ?? codigo;

    private static string GetRegimeDescription(EmpresaRegimeTributario regime)
        => regime switch
        {
            EmpresaRegimeTributario.SimplesNacional => "Simples Nacional",
            EmpresaRegimeTributario.SimplesExcessoSublimite => "Simples com excesso de sublimite",
            EmpresaRegimeTributario.LucroPresumido => "Lucro Presumido",
            EmpresaRegimeTributario.LucroReal => "Lucro Real",
            EmpresaRegimeTributario.RegimeNormal => "Regime normal legado",
            _ => regime.ToString()
        };

    private static string BuildCfopDetail(FiscalCfop cfop)
    {
        var direction = cfop.Entrada && cfop.Saida
            ? "entrada e saida"
            : cfop.Entrada
                ? "entrada"
                : "saida";

        var scope = cfop.DentroEstado && cfop.ForaEstado
            ? "interno e interestadual"
            : cfop.DentroEstado
                ? "interno"
                : cfop.ForaEstado
                    ? "interestadual"
                    : "escopo livre";

        return $"{direction} · {scope}";
    }

    private sealed record EnsureNcmResult(
        FiscalNcm? Entity,
        bool CreatedAutomatically,
        string? Message);

    private sealed record OfficialNcmSeed(
        string DescricaoCurta,
        string DescricaoCompleta,
        string? AtoLegal,
        DateTime? DataInicio,
        DateTime? DataFim,
        bool Vigente);

    private sealed record NcmImportRow(
        string? Codigo,
        string? Descricao,
        string? CestPadraoCodigo,
        string? AliquotaIbpt,
        string? SujeitoSt);

    private sealed record OfficialNcmImportRow(
        int Index,
        string? Codigo,
        string? Descricao,
        string? DescricaoCompleta,
        string? DataInicio,
        string? DataFim,
        string? TipoAtoIni,
        string? NumeroAtoIni,
        string? AnoAtoIni);

    private sealed record ProdutoDefaultCfops(
        string? CfopCompraPadrao,
        string? CfopCompraInterestadual,
        string? CfopVendaPadrao,
        string? CfopVendaInterestadual);
}
