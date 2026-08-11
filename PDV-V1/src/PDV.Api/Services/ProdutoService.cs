using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PDV.Api.Common;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Infrastructure;

namespace PDV.Api.Services;

public class ProdutoService(
    AppDbContext dbContext,
    CurrentUserService currentUser,
    ProdutoFiscalService produtoFiscalService)
{
    private static readonly JsonSerializerOptions CustomFieldJsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<IReadOnlyCollection<ProdutoCatalogoItemDto>> GetCatalogoAsync(string? termo, bool somenteDisponiveis, bool visaoComprador)
    {
        var empresaId = currentUser.GetEmpresaId();
        var query = dbContext.Produtos
            .AsNoTracking()
            .Where(item => item.EmpresaId == empresaId && item.Ativo);

        if (!string.IsNullOrWhiteSpace(termo))
        {
            var normalizedTerm = termo.Trim();
            query = query.Where(item =>
                item.Nome.Contains(normalizedTerm) ||
                (item.Descricao != null && item.Descricao.Contains(normalizedTerm)) ||
                (item.Marca != null && item.Marca.Contains(normalizedTerm)) ||
                (item.CodigoBarras != null && item.CodigoBarras.Contains(normalizedTerm)));
        }

        if (somenteDisponiveis)
        {
            query = query.Where(item => !item.ControlaEstoque || item.EstoqueAtual > 0);
        }

        var produtos = await query
            .OrderBy(item => item.Nome)
            .ToListAsync();

        var categoriaIds = produtos
            .Where(item => item.CategoriaId.HasValue)
            .Select(item => item.CategoriaId!.Value)
            .Distinct()
            .ToArray();

        var categoriaLookup = categoriaIds.Length == 0
            ? new Dictionary<Guid, string>()
            : await dbContext.Categorias
                .AsNoTracking()
                .Where(item => item.EmpresaId == empresaId && item.Ativo && categoriaIds.Contains(item.CategoriaId))
                .ToDictionaryAsync(item => item.CategoriaId, item => item.Nome);

        return produtos
            .Select(item => MapCatalogItem(item, categoriaLookup, visaoComprador))
            .ToArray();
    }

    public async Task<IReadOnlyCollection<ProdutoDto>> GetAllAsync(string? termo, bool? somenteAtivos)
    {
        var empresaId = currentUser.GetEmpresaId();
        var query = dbContext.Produtos
            .Include(item => item.Codigos)
            .Include(item => item.ClienteFornecedor)
            .Include(item => item.Fornecedores)
                .ThenInclude(item => item.ClienteFornecedor)
            .Include(item => item.RegrasFiscaisAplicadas)
            .Where(item => item.EmpresaId == empresaId);

        if (!string.IsNullOrWhiteSpace(termo))
        {
            var normalizedTerm = termo.Trim();
            query = query.Where(item =>
                item.Nome.Contains(normalizedTerm) ||
                (item.CodigoBarras != null && item.CodigoBarras.Contains(normalizedTerm)) ||
                item.Codigos.Any(codigo => codigo.Ativo && codigo.Codigo.Contains(normalizedTerm)));
        }

        if (somenteAtivos.HasValue)
        {
            query = query.Where(item => item.Ativo == somenteAtivos.Value);
        }

        var produtos = await query
            .OrderBy(item => item.Nome)
            .ToListAsync();

        return produtos.Select(Map).ToArray();
    }

    public async Task<ProdutoDto> GetByIdAsync(Guid id)
    {
        var empresaId = currentUser.GetEmpresaId();
        var produto = await dbContext.Produtos
            .Include(item => item.Codigos)
            .Include(item => item.ClienteFornecedor)
            .Include(item => item.Fornecedores)
                .ThenInclude(item => item.ClienteFornecedor)
            .Include(item => item.RegrasFiscaisAplicadas)
            .FirstOrDefaultAsync(item => item.ProdutoId == id && item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Produto nao encontrado.");

        return Map(produto);
    }

    public async Task<IReadOnlyCollection<ProdutoDto>> SearchAsync(string? termo)
    {
        var empresaId = currentUser.GetEmpresaId();
        var normalizedTerm = termo?.Trim() ?? string.Empty;

        var produtos = await dbContext.Produtos
            .Include(item => item.Codigos)
            .Include(item => item.ClienteFornecedor)
            .Include(item => item.Fornecedores)
                .ThenInclude(item => item.ClienteFornecedor)
            .Include(item => item.RegrasFiscaisAplicadas)
            .Where(item =>
                item.EmpresaId == empresaId &&
                item.Ativo &&
                (normalizedTerm == string.Empty ||
                 item.Nome.Contains(normalizedTerm) ||
                 (item.CodigoBarras != null && item.CodigoBarras.Contains(normalizedTerm)) ||
                 item.Codigos.Any(codigo => codigo.Ativo && codigo.Codigo.Contains(normalizedTerm))))
            .OrderBy(item => item.Nome)
            .Take(20)
            .ToListAsync();

        return produtos.Select(Map).ToArray();
    }

    public async Task<ProdutoDto> GetByBarcodeAsync(string codigoBarras, bool incluirInativos = false)
    {
        var empresaId = currentUser.GetEmpresaId();
        if (string.IsNullOrWhiteSpace(codigoBarras))
        {
            throw new AppException("Codigo de barras e obrigatorio.");
        }

        var normalizedCode = codigoBarras.Trim();
        var produto = await dbContext.Produtos
            .Include(item => item.Codigos)
            .Include(item => item.ClienteFornecedor)
            .Include(item => item.Fornecedores)
                .ThenInclude(item => item.ClienteFornecedor)
            .Include(item => item.RegrasFiscaisAplicadas)
            .FirstOrDefaultAsync(item =>
                item.EmpresaId == empresaId &&
                (incluirInativos || item.Ativo) &&
                (
                    item.CodigoBarras == normalizedCode ||
                    item.Codigos.Any(codigo => (incluirInativos || codigo.Ativo) && codigo.Codigo == normalizedCode)
                ))
            ?? throw new NotFoundException("Produto nao encontrado para o codigo de barras informado.");

        return Map(produto);
    }

    public async Task<ProdutoDto> CreateAsync(ProdutoRequest request)
    {
        var empresaId = currentUser.GetEmpresaId();
        var empresa = await dbContext.Empresas
            .FirstOrDefaultAsync(item => item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Empresa nao encontrada.");
        var controlalote = request.ControlaLote;
        var politicaBaixaLote = ParsePoliticaBaixaLote(request.PoliticaBaixaLote);
        var desiredCodes = BuildDesiredCodes(request);
        var desiredSuppliers = BuildDesiredSuppliers(request, request.Nome);
        var customFields = NormalizeCustomFields(request.CamposCustomizados);
        var fiscal = await ValidateAsync(request, empresa, empresaId, null, desiredCodes, desiredSuppliers, customFields);
        var promotion = NormalizePromotion(request.PrecoVenda, request.PrecoPromocional, request.PromocaoTitulo, request.PromocaoInicioUtc, request.PromocaoFimUtc);

        var principalCode = desiredCodes.FirstOrDefault(item => item.Principal);

        var produto = new Produto
        {
            ProdutoId = Guid.NewGuid(),
            EmpresaId = empresaId,
            CategoriaId = request.CategoriaId,
            ClienteFornecedorId = request.ClienteFornecedorId,
            CodigoBarras = principalCode?.Codigo,
            Nome = request.Nome.Trim(),
            Descricao = NormalizeNullable(request.Descricao),
            Marca = NormalizeNullable(request.Marca),
            Ncm = fiscal.Ncm,
            Cest = fiscal.Cest,
            OrigemFiscal = fiscal.OrigemFiscal,
            PerfilFiscalPadrao = fiscal.PerfilFiscalPadrao,
            CfopVendaPadrao = fiscal.CfopVendaPadrao,
            CfopVendaInterestadual = fiscal.CfopVendaInterestadual,
            CfopCompraPadrao = fiscal.CfopCompraPadrao,
            CfopCompraInterestadual = fiscal.CfopCompraInterestadual,
            Csosn = fiscal.Csosn,
            CstIcms = fiscal.CstIcms,
            CstPis = fiscal.CstPis,
            CstCofins = fiscal.CstCofins,
            BeneficioFiscalCodigo = fiscal.BeneficioFiscalCodigo,
            CodigoAnp = fiscal.CodigoAnp,
            UnidadeTributavel = fiscal.UnidadeTributavel,
            ExTipi = fiscal.ExTipi,
            AliquotaIcms = fiscal.AliquotaIcms,
            AliquotaIpi = fiscal.AliquotaIpi,
            AliquotaPis = fiscal.AliquotaPis,
            AliquotaCofins = fiscal.AliquotaCofins,
            ImagemUrl = NormalizeNullable(request.ImagemUrl),
            CatalogoResumo = NormalizeNullable(request.CatalogoResumo),
            DestaqueCatalogoComprador = request.DestaqueCatalogoComprador,
            PrecoPromocional = promotion.PrecoPromocional,
            PromocaoTitulo = promotion.PromocaoTitulo,
            PromocaoInicioUtc = promotion.PromocaoInicioUtc,
            PromocaoFimUtc = promotion.PromocaoFimUtc,
            CodigoProdutoFornecedor = NormalizeNullable(request.CodigoProdutoFornecedor),
            UltimaNotaFiscalCompra = NormalizeNullable(request.UltimaNotaFiscalCompra),
            DadosExtrasJson = SerializeCustomFields(customFields),
            PrecoVenda = request.PrecoVenda,
            PrecoCusto = request.PrecoCusto,
            EstoqueAtual = controlalote ? 0m : request.EstoqueAtual,
            EstoqueMinimo = request.EstoqueMinimo,
            UnidadeMedida = request.UnidadeMedida.Trim().ToUpperInvariant(),
            Ativo = request.Ativo,
            ControlaEstoque = request.ControlaEstoque,
            ControlaLote = controlalote,
            PoliticaBaixaLote = politicaBaixaLote,
            DataCadastro = DateTime.UtcNow
        };

        ApplyCodes(produto, desiredCodes, empresaId);
        ApplySupplierLinks(produto, desiredSuppliers, empresaId);
        SyncLegacySupplierFields(produto);
        ReplaceFiscalRules(produto, fiscal, empresaId);

        dbContext.Produtos.Add(produto);
        AddLog("Criacao", $"Produto {produto.Nome} criado.");
        await dbContext.SaveChangesAsync();
        await SyncProdutoErpBalanceAsync(produto.ProdutoId, empresaId, produto.ControlaEstoque, produto.ControlaLote, produto.EstoqueAtual);
        RegisterFiscalAuditLogs(produto, null, fiscal);
        await dbContext.SaveChangesAsync();

        if (produto.ClienteFornecedorId.HasValue)
        {
            await dbContext.Entry(produto).Reference(item => item.ClienteFornecedor).LoadAsync();
        }

        if (produto.Fornecedores.Count > 0)
        {
            await dbContext.Entry(produto)
                .Collection(item => item.Fornecedores)
                .Query()
                .Include(item => item.ClienteFornecedor)
                .LoadAsync();
        }

        return Map(produto);
    }

    public async Task<ProdutoDto> UpdateAsync(Guid id, ProdutoRequest request)
    {
        var empresaId = currentUser.GetEmpresaId();
        var empresa = await dbContext.Empresas
            .FirstOrDefaultAsync(item => item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Empresa nao encontrada.");
        var controlalote = request.ControlaLote;
        var politicaBaixaLote = ParsePoliticaBaixaLote(request.PoliticaBaixaLote);

        await using var transaction = await dbContext.Database.BeginTransactionAsync();

        var produto = await dbContext.Produtos
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.ProdutoId == id && item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Produto nao encontrado.");

        var desiredCodes = BuildDesiredCodes(request);
        var desiredSuppliers = BuildDesiredSuppliers(request, request.Nome);
        var customFields = NormalizeCustomFields(request.CamposCustomizados);
        var fiscal = await ValidateAsync(request, empresa, empresaId, id, desiredCodes, desiredSuppliers, customFields);
        var promotion = NormalizePromotion(request.PrecoVenda, request.PrecoPromocional, request.PromocaoTitulo, request.PromocaoInicioUtc, request.PromocaoFimUtc);
        var previousSnapshot = CaptureFiscalAuditSnapshot(produto);
        var principalCode = desiredCodes.FirstOrDefault(item => item.Principal);
        var principalBarcode = principalCode is null ? null : principalCode.Codigo;
        var principalSupplier = desiredSuppliers
            .FirstOrDefault(item => item.Ativo && item.FornecedorPrincipal)
            ?? desiredSuppliers.FirstOrDefault(item => item.Ativo);
        var estoqueAtualPersistido = controlalote
            ? await dbContext.EstoquesLote
                .Where(item => item.ProdutoId == id && item.EmpresaId == empresaId && item.QuantidadeDisponivel > 0)
                .SumAsync(item => item.QuantidadeDisponivel)
            : request.EstoqueAtual;

        var legacySupplierId = principalSupplier?.ClienteFornecedorId;
        var legacySupplierCode = principalSupplier?.CodigoProdutoFornecedor;

        var affectedRows = await dbContext.Produtos
            .Where(item => item.ProdutoId == id && item.EmpresaId == empresaId)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(item => item.CategoriaId, request.CategoriaId)
                .SetProperty(item => item.ClienteFornecedorId, legacySupplierId)
                .SetProperty(item => item.CodigoBarras, principalBarcode)
                .SetProperty(item => item.Nome, request.Nome.Trim())
                .SetProperty(item => item.Descricao, NormalizeNullable(request.Descricao))
                .SetProperty(item => item.Marca, NormalizeNullable(request.Marca))
                .SetProperty(item => item.Ncm, fiscal.Ncm)
                .SetProperty(item => item.Cest, fiscal.Cest)
                .SetProperty(item => item.OrigemFiscal, fiscal.OrigemFiscal)
                .SetProperty(item => item.PerfilFiscalPadrao, fiscal.PerfilFiscalPadrao)
                .SetProperty(item => item.CfopVendaPadrao, fiscal.CfopVendaPadrao)
                .SetProperty(item => item.CfopVendaInterestadual, fiscal.CfopVendaInterestadual)
                .SetProperty(item => item.CfopCompraPadrao, fiscal.CfopCompraPadrao)
                .SetProperty(item => item.CfopCompraInterestadual, fiscal.CfopCompraInterestadual)
                .SetProperty(item => item.Csosn, fiscal.Csosn)
                .SetProperty(item => item.CstIcms, fiscal.CstIcms)
                .SetProperty(item => item.CstPis, fiscal.CstPis)
                .SetProperty(item => item.CstCofins, fiscal.CstCofins)
                .SetProperty(item => item.BeneficioFiscalCodigo, fiscal.BeneficioFiscalCodigo)
                .SetProperty(item => item.CodigoAnp, fiscal.CodigoAnp)
                .SetProperty(item => item.UnidadeTributavel, fiscal.UnidadeTributavel)
                .SetProperty(item => item.ExTipi, fiscal.ExTipi)
                .SetProperty(item => item.AliquotaIcms, fiscal.AliquotaIcms)
                .SetProperty(item => item.AliquotaIpi, fiscal.AliquotaIpi)
                .SetProperty(item => item.AliquotaPis, fiscal.AliquotaPis)
                .SetProperty(item => item.AliquotaCofins, fiscal.AliquotaCofins)
                .SetProperty(item => item.ImagemUrl, NormalizeNullable(request.ImagemUrl))
                .SetProperty(item => item.CatalogoResumo, NormalizeNullable(request.CatalogoResumo))
                .SetProperty(item => item.DestaqueCatalogoComprador, request.DestaqueCatalogoComprador)
                .SetProperty(item => item.PrecoPromocional, promotion.PrecoPromocional)
                .SetProperty(item => item.PromocaoTitulo, promotion.PromocaoTitulo)
                .SetProperty(item => item.PromocaoInicioUtc, promotion.PromocaoInicioUtc)
                .SetProperty(item => item.PromocaoFimUtc, promotion.PromocaoFimUtc)
                .SetProperty(item => item.CodigoProdutoFornecedor, legacySupplierCode)
                .SetProperty(item => item.UltimaNotaFiscalCompra, NormalizeNullable(request.UltimaNotaFiscalCompra))
                .SetProperty(item => item.DadosExtrasJson, SerializeCustomFields(customFields))
                .SetProperty(item => item.PrecoVenda, request.PrecoVenda)
                .SetProperty(item => item.PrecoCusto, request.PrecoCusto)
                .SetProperty(item => item.EstoqueAtual, estoqueAtualPersistido)
                .SetProperty(item => item.EstoqueMinimo, request.EstoqueMinimo)
                .SetProperty(item => item.UnidadeMedida, request.UnidadeMedida.Trim().ToUpperInvariant())
                .SetProperty(item => item.Ativo, request.Ativo)
                .SetProperty(item => item.ControlaEstoque, request.ControlaEstoque)
                .SetProperty(item => item.ControlaLote, controlalote)
                .SetProperty(item => item.PoliticaBaixaLote, politicaBaixaLote));

        if (affectedRows == 0)
        {
            var produtoAindaExiste = await dbContext.Produtos
                .AsNoTracking()
                .AnyAsync(item => item.ProdutoId == id && item.EmpresaId == empresaId);

            if (!produtoAindaExiste)
            {
                throw new NotFoundException("Produto nao encontrado.");
            }
        }

        await dbContext.ProdutoCodigos
            .Where(item => item.ProdutoId == id)
            .ExecuteDeleteAsync();
        await dbContext.ProdutoFornecedores
            .Where(item => item.ProdutoId == id)
            .ExecuteDeleteAsync();
        await dbContext.ProdutoFiscalRegrasAplicadas
            .Where(item => item.ProdutoId == id)
            .ExecuteDeleteAsync();

        if (desiredCodes.Count > 0)
        {
            dbContext.ProdutoCodigos.AddRange(desiredCodes.Select(item => CreateProdutoCodigo(id, empresaId, item)));
        }

        if (desiredSuppliers.Count > 0)
        {
            dbContext.ProdutoFornecedores.AddRange(desiredSuppliers.Select(item => CreateProdutoFornecedor(id, empresaId, item)));
        }

        if (fiscal.RegrasAplicadas.Count > 0)
        {
            dbContext.ProdutoFiscalRegrasAplicadas.AddRange(fiscal.RegrasAplicadas.Select(item => CreateProdutoFiscalRegra(id, empresaId, item)));
        }

        AddLog("Edicao", $"Produto {request.Nome.Trim()} atualizado.");
        RegisterFiscalAuditLogs(empresaId, id, previousSnapshot, fiscal);
        await SyncProdutoErpBalanceAsync(id, empresaId, request.ControlaEstoque, controlalote, estoqueAtualPersistido);
        await dbContext.SaveChangesAsync();
        await transaction.CommitAsync();

        return await GetByIdAsync(id);
    }

    public async Task ArchiveAsync(Guid id)
    {
        var empresaId = currentUser.GetEmpresaId();
        var produto = await dbContext.Produtos
            .Include(item => item.Codigos)
            .FirstOrDefaultAsync(item => item.ProdutoId == id && item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Produto nao encontrado.");

        produto.Ativo = false;
        foreach (var codigo in produto.Codigos)
        {
            codigo.Ativo = false;
        }

        AddLog("Inativacao", $"Produto {produto.Nome} inativado.");
        await dbContext.SaveChangesAsync();
    }

    public async Task DeletePermanentlyAsync(Guid id)
    {
        var empresaId = currentUser.GetEmpresaId();
        var produto = await dbContext.Produtos
            .Include(item => item.Codigos)
            .FirstOrDefaultAsync(item => item.ProdutoId == id && item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Produto nao encontrado.");

        var possuiReferencias = await dbContext.VendaItens.AnyAsync(item => item.ProdutoId == id)
            || await dbContext.MovimentacoesEstoque.AnyAsync(item => item.ProdutoId == id)
            || await dbContext.ProdutoLotes.AnyAsync(item => item.ProdutoId == id)
            || await dbContext.EstoquesLote.AnyAsync(item => item.ProdutoId == id)
            || await dbContext.MovimentacoesEstoqueLote.AnyAsync(item => item.ProdutoId == id)
            || await dbContext.EstoquesDeposito.AnyAsync(item => item.ProdutoId == id && (item.QuantidadeDisponivel > 0 || item.QuantidadeReservada > 0))
            || await dbContext.TransferenciasEstoque.AnyAsync(item => item.ProdutoId == id);

        if (possuiReferencias)
        {
            throw new AppException("Este produto ja possui vendas ou movimentacoes de estoque. Use a opcao de inativar em vez de excluir permanentemente.");
        }

        await dbContext.EstoquesDeposito
            .Where(item => item.ProdutoId == id)
            .ExecuteDeleteAsync();
        dbContext.ProdutoCodigos.RemoveRange(produto.Codigos);
        dbContext.Produtos.Remove(produto);
        AddLog("Exclusao", $"Produto {produto.Nome} excluido permanentemente.");
        await dbContext.SaveChangesAsync();
    }

    private async Task<ProdutoFiscalValidationResult> ValidateAsync(
        ProdutoRequest request,
        Empresa empresa,
        Guid empresaId,
        Guid? produtoId,
        IReadOnlyCollection<DesiredProdutoCodigo> desiredCodes,
        IReadOnlyCollection<DesiredProdutoFornecedor> desiredSuppliers,
        IReadOnlyCollection<ProdutoCampoCustomizadoDto> customFields)
    {
        if (string.IsNullOrWhiteSpace(request.Nome))
        {
            throw new AppException("Nome do produto e obrigatorio.");
        }

        if (request.PrecoVenda <= 0)
        {
            throw new AppException("Preco de venda deve ser maior que zero.");
        }

        if (request.PrecoCusto < 0 || request.EstoqueAtual < 0 || request.EstoqueMinimo < 0)
        {
            throw new AppException("Valores de custo e estoque nao podem ser negativos.");
        }

        if (request.ControlaLote && !request.ControlaEstoque)
        {
            throw new AppException("Controle por lote exige que o produto tambem controle estoque.");
        }

        _ = ParsePoliticaBaixaLote(request.PoliticaBaixaLote);

        if (request.ControlaLote)
        {
            var possuiLotesRegistrados = produtoId.HasValue && await dbContext.EstoquesLote
                .AnyAsync(item => item.ProdutoId == produtoId.Value && item.EmpresaId == empresaId);

            if (!possuiLotesRegistrados && request.EstoqueAtual > 0)
            {
                throw new AppException("Para produtos com controle por lote, deixe o estoque inicial zerado e registre as entradas pelos lotes.");
            }
        }
        else if (produtoId.HasValue)
        {
            var possuiSaldoLote = await dbContext.EstoquesLote
                .AnyAsync(item => item.ProdutoId == produtoId.Value && item.EmpresaId == empresaId && item.QuantidadeDisponivel > 0);

            if (possuiSaldoLote)
            {
                throw new AppException("Nao e possivel desativar o controle por lote enquanto ainda existe saldo disponivel nos lotes do produto.");
            }
        }

        if (string.IsNullOrWhiteSpace(request.UnidadeMedida))
        {
            throw new AppException("Unidade de medida e obrigatoria.");
        }

        if (request.AliquotaIcms is < 0 or > 100 ||
            request.AliquotaIpi is < 0 or > 100 ||
            request.AliquotaPis is < 0 or > 100 ||
            request.AliquotaCofins is < 0 or > 100)
        {
            throw new AppException("Aliquotas fiscais devem ficar entre 0 e 100.");
        }

        if (!string.IsNullOrWhiteSpace(request.CodigoProdutoFornecedor) && !desiredSuppliers.Any(item => item.FornecedorPrincipal))
        {
            throw new AppException("Selecione um fornecedor principal antes de informar o codigo do fornecedor.");
        }

        if (customFields.Count > 40)
        {
            throw new AppException("Limite de 40 campos personalizados por produto.");
        }

        if (desiredCodes.Count != desiredCodes.Select(item => item.Codigo).Distinct(StringComparer.OrdinalIgnoreCase).Count())
        {
            throw new AppException("Nao e permitido repetir o mesmo codigo principal ou alternativo no produto.");
        }

        var duplicateCode = await FindDuplicateCodeAsync(empresaId, produtoId, desiredCodes);
        if (!string.IsNullOrWhiteSpace(duplicateCode))
        {
            throw new AppException(
                $"Ja existe outro produto com o codigo {duplicateCode} nesta empresa. " +
                "Se o item antigo estiver inativo, reative ou edite o cadastro existente."
            );
        }

        if (request.CategoriaId.HasValue)
        {
            var categoriaExiste = await dbContext.Categorias.AnyAsync(item =>
                item.CategoriaId == request.CategoriaId.Value &&
                item.EmpresaId == empresaId);

            if (!categoriaExiste)
            {
                throw new AppException("Categoria informada nao pertence a empresa.");
            }
        }

        await ValidateDesiredSuppliersAsync(empresaId, desiredSuppliers);

        var fiscal = await produtoFiscalService.ValidarAsync(
            empresa,
            request,
            currentUser.GetPerfil() == Perfis.Admin);

        if (!fiscal.FiscalCompleto)
        {
            throw new AppException("Produto nao pode ser salvo. Corrija:" + Environment.NewLine + string.Join(Environment.NewLine, fiscal.Pendencias.Select(item => $"- {item}")));
        }

        return fiscal;
    }

    private void ApplyCodes(Produto produto, IReadOnlyCollection<DesiredProdutoCodigo> desiredCodes, Guid empresaId)
    {
        foreach (var desiredCode in desiredCodes)
        {
            produto.Codigos.Add(CreateProdutoCodigo(produto.ProdutoId, empresaId, desiredCode));
        }
    }

    private void ApplySupplierLinks(Produto produto, IReadOnlyCollection<DesiredProdutoFornecedor> desiredSuppliers, Guid empresaId)
    {
        foreach (var desiredSupplier in desiredSuppliers)
        {
            produto.Fornecedores.Add(CreateProdutoFornecedor(produto.ProdutoId, empresaId, desiredSupplier));
        }
    }

    private static void SyncLegacySupplierFields(Produto produto)
    {
        var principalSupplier = produto.Fornecedores
            .FirstOrDefault(item => item.Ativo && item.FornecedorPrincipal)
            ?? produto.Fornecedores.FirstOrDefault(item => item.Ativo);

        produto.ClienteFornecedorId = principalSupplier?.ClienteFornecedorId;
        produto.ClienteFornecedor = principalSupplier?.ClienteFornecedor;
        produto.CodigoProdutoFornecedor = principalSupplier?.CodigoProdutoFornecedor;
    }

    private async Task ValidateDesiredSuppliersAsync(Guid empresaId, IReadOnlyCollection<DesiredProdutoFornecedor> desiredSuppliers)
    {
        if (desiredSuppliers.Count == 0)
        {
            return;
        }

        if (desiredSuppliers.Count != desiredSuppliers.Select(item => item.ClienteFornecedorId).Distinct().Count())
        {
            throw new AppException("Nao e permitido repetir o mesmo fornecedor no produto.");
        }

        foreach (var supplier in desiredSuppliers)
        {
            if (supplier.PrecoCompra < 0 || supplier.QuantidadeMinima < 0 || supplier.UltimoPrecoPago < 0)
            {
                throw new AppException("Valores de compra do fornecedor nao podem ser negativos.");
            }

            if (supplier.PrazoEntregaDias < 0)
            {
                throw new AppException("Prazo de entrega do fornecedor nao pode ser negativo.");
            }

            if (supplier.CodigoProdutoFornecedor?.Length > 120)
            {
                throw new AppException("Codigo do produto no fornecedor deve ter no maximo 120 caracteres.");
            }

            if (supplier.NomeProdutoFornecedor?.Length > 180)
            {
                throw new AppException("Nome do produto no fornecedor deve ter no maximo 180 caracteres.");
            }
        }

        var activeSuppliers = desiredSuppliers.Where(item => item.Ativo).ToArray();
        if (activeSuppliers.Length > 0)
        {
            var principalCount = activeSuppliers.Count(item => item.FornecedorPrincipal);
            if (principalCount == 0)
            {
                throw new AppException("Escolha um fornecedor principal entre os fornecedores ativos vinculados ao produto.");
            }

            if (principalCount > 1)
            {
                throw new AppException("Marque apenas um fornecedor principal por produto.");
            }
        }
        else if (desiredSuppliers.Any(item => item.FornecedorPrincipal))
        {
            throw new AppException("Fornecedor principal precisa estar ativo para ser usado no produto.");
        }

        var supplierIds = desiredSuppliers
            .Select(item => item.ClienteFornecedorId)
            .Distinct()
            .ToArray();

        var fornecedores = await dbContext.Clientes
            .Where(item => item.EmpresaId == empresaId && supplierIds.Contains(item.ClienteId))
            .ToDictionaryAsync(item => item.ClienteId);

        foreach (var supplier in desiredSuppliers)
        {
            if (!fornecedores.TryGetValue(supplier.ClienteFornecedorId, out var fornecedor))
            {
                throw new AppException("Um dos fornecedores informados nao pertence a empresa atual.");
            }

            if (supplier.Ativo || supplier.FornecedorPrincipal)
            {
                if (!fornecedor.Ativo || !fornecedor.EhFornecedor)
                {
                    throw new AppException($"O fornecedor {fornecedor.Nome} precisa estar ativo e marcado como fornecedor para permanecer vinculado ao produto.");
                }

                if (string.IsNullOrWhiteSpace(fornecedor.Documento))
                {
                    throw new AppException($"O fornecedor {fornecedor.Nome} precisa ter CPF/CNPJ cadastrado para vincular produtos com rastreabilidade real.");
                }
            }
        }
    }

    private static Dictionary<string, string?> CaptureFiscalAuditSnapshot(Produto produto)
        => new(StringComparer.OrdinalIgnoreCase)
        {
            ["Ncm"] = produto.Ncm,
            ["Cest"] = produto.Cest,
            ["OrigemFiscal"] = produto.OrigemFiscal,
            ["PerfilFiscalPadrao"] = produto.PerfilFiscalPadrao?.ToString(),
            ["CfopVendaPadrao"] = produto.CfopVendaPadrao,
            ["CfopVendaInterestadual"] = produto.CfopVendaInterestadual,
            ["CfopCompraPadrao"] = produto.CfopCompraPadrao,
            ["CfopCompraInterestadual"] = produto.CfopCompraInterestadual,
            ["Csosn"] = produto.Csosn,
            ["CstIcms"] = produto.CstIcms,
            ["CstPis"] = produto.CstPis,
            ["CstCofins"] = produto.CstCofins,
            ["BeneficioFiscalCodigo"] = produto.BeneficioFiscalCodigo,
            ["CodigoAnp"] = produto.CodigoAnp,
            ["UnidadeTributavel"] = produto.UnidadeTributavel,
            ["ExTipi"] = produto.ExTipi,
            ["AliquotaIcms"] = produto.AliquotaIcms?.ToString("0.####"),
            ["AliquotaIpi"] = produto.AliquotaIpi?.ToString("0.####"),
            ["AliquotaPis"] = produto.AliquotaPis?.ToString("0.####"),
            ["AliquotaCofins"] = produto.AliquotaCofins?.ToString("0.####")
        };

    private void ReplaceFiscalRules(Produto produto, ProdutoFiscalValidationResult fiscal, Guid empresaId)
    {
        dbContext.ProdutoFiscalRegrasAplicadas.RemoveRange(produto.RegrasFiscaisAplicadas);
        produto.RegrasFiscaisAplicadas.Clear();

        foreach (var regra in fiscal.RegrasAplicadas)
        {
            produto.RegrasFiscaisAplicadas.Add(CreateProdutoFiscalRegra(produto.ProdutoId, empresaId, regra));
        }
    }

    private void RegisterFiscalAuditLogs(
        Produto produto,
        IReadOnlyDictionary<string, string?>? beforeSnapshot,
        ProdutoFiscalValidationResult fiscal)
        => RegisterFiscalAuditLogs(produto.EmpresaId, produto.ProdutoId, beforeSnapshot, fiscal);

    private void RegisterFiscalAuditLogs(
        Guid empresaId,
        Guid produtoId,
        IReadOnlyDictionary<string, string?>? beforeSnapshot,
        ProdutoFiscalValidationResult fiscal)
    {
        foreach (var campo in fiscal.CamposAuditaveis)
        {
            var novoValor = campo.Valor;
            string? valorAnterior = null;
            if (beforeSnapshot is not null)
            {
                beforeSnapshot.TryGetValue(campo.Campo, out valorAnterior);
            }

            if (beforeSnapshot is not null && string.Equals(valorAnterior, novoValor, StringComparison.Ordinal))
            {
                continue;
            }

            dbContext.FiscalRegraAplicadaLogs.Add(new FiscalRegraAplicadaLog
            {
                FiscalRegraAplicadaLogId = Guid.NewGuid(),
                EmpresaId = empresaId,
                ProdutoId = produtoId,
                UsuarioId = currentUser.GetUserId(),
                Campo = campo.Campo,
                ValorAnterior = valorAnterior,
                ValorNovo = novoValor,
                OrigemRegra = campo.OrigemRegra,
                Justificativa = fiscal.JustificativaManual,
                IpAddress = currentUser.GetIpAddress(),
                DataAlteracao = DateTime.UtcNow
            });
        }
    }

    private static ProdutoCodigo CreateProdutoCodigo(Guid produtoId, Guid empresaId, DesiredProdutoCodigo desiredCode)
        => new()
        {
            ProdutoCodigoId = Guid.NewGuid(),
            EmpresaId = empresaId,
            ProdutoId = produtoId,
            Codigo = desiredCode.Codigo,
            Tipo = desiredCode.Tipo,
            Principal = desiredCode.Principal,
            Ativo = true,
            DataCadastro = DateTime.UtcNow
        };

    private static ProdutoFornecedor CreateProdutoFornecedor(Guid produtoId, Guid empresaId, DesiredProdutoFornecedor desiredSupplier)
        => new()
        {
            ProdutoFornecedorId = Guid.NewGuid(),
            EmpresaId = empresaId,
            ProdutoId = produtoId,
            ClienteFornecedorId = desiredSupplier.ClienteFornecedorId,
            CodigoProdutoFornecedor = desiredSupplier.CodigoProdutoFornecedor,
            NomeProdutoFornecedor = desiredSupplier.NomeProdutoFornecedor,
            PrecoCompra = desiredSupplier.PrecoCompra,
            QuantidadeMinima = desiredSupplier.QuantidadeMinima,
            PrazoEntregaDias = desiredSupplier.PrazoEntregaDias,
            UltimaCompraEm = desiredSupplier.UltimaCompraEm,
            UltimoPrecoPago = desiredSupplier.UltimoPrecoPago,
            FornecedorPrincipal = desiredSupplier.FornecedorPrincipal,
            Ativo = desiredSupplier.Ativo,
            DataCadastro = DateTime.UtcNow
        };

    private static ProdutoFiscalRegraAplicada CreateProdutoFiscalRegra(Guid produtoId, Guid empresaId, ProdutoRegraFiscalAplicadaDto regra)
        => new()
        {
            ProdutoFiscalRegraAplicadaId = Guid.NewGuid(),
            EmpresaId = empresaId,
            ProdutoId = produtoId,
            Ordem = regra.Ordem,
            Campo = regra.Campo,
            Codigo = regra.Codigo,
            Descricao = regra.Descricao,
            OrigemRegra = Enum.TryParse<OrigemRegraFiscal>(regra.OrigemRegra, true, out var origemRegra)
                ? origemRegra
                : OrigemRegraFiscal.SugestaoAutomatica,
            DataAplicacao = DateTime.UtcNow
        };

    private static IReadOnlyCollection<DesiredProdutoCodigo> BuildDesiredCodes(ProdutoRequest request)
    {
        var desiredCodes = new List<DesiredProdutoCodigo>();
        var principalCode = NormalizeNullable(request.CodigoBarras);

        if (!string.IsNullOrWhiteSpace(principalCode))
        {
            desiredCodes.Add(new DesiredProdutoCodigo(
                principalCode,
                ParseCodigoTipo(request.TipoCodigoPrincipal, ProdutoCodigoTipo.Ean),
                true));
        }

        if (request.CodigosAlternativos is not null)
        {
            foreach (var item in request.CodigosAlternativos)
            {
                var code = NormalizeNullable(item.Codigo);
                if (string.IsNullOrWhiteSpace(code))
                {
                    continue;
                }

                desiredCodes.Add(new DesiredProdutoCodigo(
                    code,
                    ParseCodigoTipo(item.Tipo, ProdutoCodigoTipo.Interno),
                    false));
            }
        }

        return desiredCodes;
    }

    private static IReadOnlyCollection<DesiredProdutoFornecedor> BuildDesiredSuppliers(ProdutoRequest request, string? productName)
    {
        var desiredSuppliers = new List<DesiredProdutoFornecedor>();
        var normalizedProductName = NormalizeNullable(productName);

        if (request.Fornecedores is not null)
        {
            foreach (var item in request.Fornecedores)
            {
                var hasSupplierData = item.ClienteFornecedorId.HasValue ||
                    !string.IsNullOrWhiteSpace(item.CodigoProdutoFornecedor) ||
                    !string.IsNullOrWhiteSpace(item.NomeProdutoFornecedor) ||
                    item.PrecoCompra.HasValue ||
                    item.QuantidadeMinima.HasValue ||
                    item.PrazoEntregaDias.HasValue ||
                    item.UltimaCompraEm.HasValue ||
                    item.UltimoPrecoPago.HasValue;

                if (!hasSupplierData)
                {
                    continue;
                }

                if (!item.ClienteFornecedorId.HasValue || item.ClienteFornecedorId.Value == Guid.Empty)
                {
                    throw new AppException("Selecione um fornecedor valido em todas as linhas de fornecedor do produto.");
                }

                desiredSuppliers.Add(new DesiredProdutoFornecedor(
                    item.ClienteFornecedorId.Value,
                    NormalizeNullable(item.CodigoProdutoFornecedor),
                    NormalizeNullable(item.NomeProdutoFornecedor) ?? normalizedProductName,
                    item.PrecoCompra,
                    item.QuantidadeMinima,
                    item.PrazoEntregaDias,
                    item.UltimaCompraEm,
                    item.UltimoPrecoPago,
                    item.FornecedorPrincipal,
                    item.Ativo));
            }
        }

        if (request.ClienteFornecedorId.HasValue && request.ClienteFornecedorId.Value != Guid.Empty)
        {
            var supplierId = request.ClienteFornecedorId.Value;
            var existingIndex = desiredSuppliers.FindIndex(item => item.ClienteFornecedorId == supplierId);
            if (existingIndex >= 0)
            {
                var current = desiredSuppliers[existingIndex];
                desiredSuppliers[existingIndex] = current with
                {
                    CodigoProdutoFornecedor = current.CodigoProdutoFornecedor ?? NormalizeNullable(request.CodigoProdutoFornecedor),
                    NomeProdutoFornecedor = current.NomeProdutoFornecedor ?? normalizedProductName,
                    FornecedorPrincipal = true,
                    Ativo = true
                };
            }
            else
            {
                desiredSuppliers.Add(new DesiredProdutoFornecedor(
                    supplierId,
                    NormalizeNullable(request.CodigoProdutoFornecedor),
                    normalizedProductName,
                    null,
                    null,
                    null,
                    null,
                    null,
                    true,
                    true));
            }
        }

        if (!request.ClienteFornecedorId.HasValue)
        {
            var activeSuppliers = desiredSuppliers.Where(item => item.Ativo).ToArray();
            if (activeSuppliers.Length == 1 && !activeSuppliers[0].FornecedorPrincipal)
            {
                var activeSupplierId = activeSuppliers[0].ClienteFornecedorId;
                var index = desiredSuppliers.FindIndex(item => item.ClienteFornecedorId == activeSupplierId);
                desiredSuppliers[index] = desiredSuppliers[index] with { FornecedorPrincipal = true };
            }
        }

        return desiredSuppliers;
    }

    private static ProdutoCodigoTipo ParseCodigoTipo(string? tipo, ProdutoCodigoTipo fallback)
    {
        if (string.IsNullOrWhiteSpace(tipo))
        {
            return fallback;
        }

        return Enum.TryParse<ProdutoCodigoTipo>(tipo.Trim(), true, out var parsed)
            ? parsed
            : fallback;
    }

    private async Task<string?> FindDuplicateCodeAsync(
        Guid empresaId,
        Guid? produtoId,
        IReadOnlyCollection<DesiredProdutoCodigo> desiredCodes)
    {
        if (desiredCodes.Count == 0)
        {
            return null;
        }

        var desiredCodeValues = desiredCodes
            .Select(item => item.Codigo)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var duplicateInProducts = await dbContext.Produtos
            .Where(item =>
                item.EmpresaId == empresaId &&
                item.ProdutoId != produtoId &&
                item.CodigoBarras != null &&
                desiredCodeValues.Contains(item.CodigoBarras))
            .Select(item => item.CodigoBarras)
            .FirstOrDefaultAsync();

        if (!string.IsNullOrWhiteSpace(duplicateInProducts))
        {
            return duplicateInProducts;
        }

        return await dbContext.ProdutoCodigos
            .Where(item =>
                item.EmpresaId == empresaId &&
                item.ProdutoId != produtoId &&
                desiredCodeValues.Contains(item.Codigo))
            .Select(item => item.Codigo)
            .FirstOrDefaultAsync();
    }

    private async Task SyncProdutoErpBalanceAsync(
        Guid produtoId,
        Guid empresaId,
        bool controlaEstoque,
        bool controlaLote,
        decimal estoqueAtualPersistido)
    {
        await EnsureDepositosEmpresaAsync(empresaId);

        var deposits = await dbContext.DepositosEstoque
            .Where(item => item.EmpresaId == empresaId && item.Ativo)
            .OrderByDescending(item => item.Padrao)
            .ThenBy(item => item.Codigo)
            .ToListAsync();

        var depositoPadrao = deposits.FirstOrDefault()
            ?? throw new AppException("Nenhum deposito ativo encontrado para a empresa.");

        var balances = await dbContext.EstoquesDeposito
            .Where(item => item.EmpresaId == empresaId && item.ProdutoId == produtoId)
            .ToListAsync();

        if (!controlaEstoque)
        {
            if (balances.Any(item => item.QuantidadeDisponivel > 0 || item.QuantidadeReservada > 0))
            {
                throw new AppException("Este item ja possui saldo por deposito. Desative o controle apenas depois de zerar o estoque e as reservas no centro de estoque.");
            }

            return;
        }

        if (controlaLote)
        {
            if (balances.Any(item =>
                    item.DepositoEstoqueId != depositoPadrao.DepositoEstoqueId &&
                    (item.QuantidadeDisponivel > 0 || item.QuantidadeReservada > 0)))
            {
                throw new AppException("Produtos com controle por lote ainda operam no deposito padrao. Zere saldos externos antes de ativar esse modo.");
            }

            var balancePadraoLote = balances.FirstOrDefault(item => item.DepositoEstoqueId == depositoPadrao.DepositoEstoqueId);
            if (balancePadraoLote is null)
            {
                balancePadraoLote = new EstoqueDeposito
                {
                    EstoqueDepositoId = Guid.NewGuid(),
                    EmpresaId = empresaId,
                    DepositoEstoqueId = depositoPadrao.DepositoEstoqueId,
                    ProdutoId = produtoId,
                    QuantidadeReservada = 0m
                };
                dbContext.EstoquesDeposito.Add(balancePadraoLote);
                balances.Add(balancePadraoLote);
            }

            balancePadraoLote.QuantidadeDisponivel = RoundQuantity(estoqueAtualPersistido);
            balancePadraoLote.Ativo = balancePadraoLote.QuantidadeDisponivel > 0 || balancePadraoLote.QuantidadeReservada > 0;
            balancePadraoLote.DataAtualizacao = DateTime.UtcNow;
            return;
        }

        var possuiReserva = balances.Any(item => item.QuantidadeReservada > 0);
        var depositosAtivosComSaldo = balances.Count(item => item.QuantidadeDisponivel > 0 || item.QuantidadeReservada > 0);
        var balancePadrao = balances.FirstOrDefault(item => item.DepositoEstoqueId == depositoPadrao.DepositoEstoqueId);
        if (balancePadrao is null)
        {
            balancePadrao = new EstoqueDeposito
            {
                EstoqueDepositoId = Guid.NewGuid(),
                EmpresaId = empresaId,
                DepositoEstoqueId = depositoPadrao.DepositoEstoqueId,
                ProdutoId = produtoId,
                QuantidadeReservada = 0m
            };
            dbContext.EstoquesDeposito.Add(balancePadrao);
            balances.Add(balancePadrao);
        }

        var saldoDisponivelAtual = RoundQuantity(balances.Sum(item => item.QuantidadeDisponivel));
        var saldoDesejado = RoundQuantity(estoqueAtualPersistido);
        if (saldoDisponivelAtual != saldoDesejado)
        {
            if (possuiReserva || depositosAtivosComSaldo > 1)
            {
                throw new AppException("Este item ja opera com saldo por deposito ou reserva. Ajuste o estoque pelo centro de estoque para preservar a trilha ERP.");
            }

            balancePadrao.QuantidadeDisponivel = saldoDesejado;
        }

        balancePadrao.Ativo = balancePadrao.QuantidadeDisponivel > 0 || balancePadrao.QuantidadeReservada > 0;
        balancePadrao.DataAtualizacao = DateTime.UtcNow;
    }

    private async Task EnsureDepositosEmpresaAsync(Guid empresaId)
    {
        var deposits = await dbContext.DepositosEstoque
            .Where(item => item.EmpresaId == empresaId)
            .OrderBy(item => item.Codigo)
            .ToListAsync();

        var changed = false;
        if (deposits.Count == 0)
        {
            dbContext.DepositosEstoque.AddRange(
                CreateDeposito(empresaId, "LOJA-01", "Operacao PDV", "Deposito padrao que alimenta diretamente a venda no PDV.", padrao: true, permiteVendaDireta: true),
                CreateDeposito(empresaId, "RET-01", "Retaguarda", "Reserva tecnica para abastecimento interno, contagem e pulmao de estoque.", padrao: false, permiteVendaDireta: false),
                CreateDeposito(empresaId, "QAR-01", "Quarentena e avaria", "Area tecnica para itens bloqueados, avariados ou aguardando conferencia.", padrao: false, permiteVendaDireta: false));
            changed = true;
        }
        else if (!deposits.Any(item => item.Padrao && item.Ativo))
        {
            var firstActive = deposits.FirstOrDefault(item => item.Ativo) ?? deposits[0];
            firstActive.Padrao = true;
            changed = true;
        }

        if (changed)
        {
            await dbContext.SaveChangesAsync();
        }
    }

    private static DepositoEstoque CreateDeposito(
        Guid empresaId,
        string codigo,
        string nome,
        string descricao,
        bool padrao,
        bool permiteVendaDireta)
        => new()
        {
            DepositoEstoqueId = Guid.NewGuid(),
            EmpresaId = empresaId,
            Codigo = codigo,
            Nome = nome,
            Descricao = descricao,
            Padrao = padrao,
            PermiteVendaDireta = permiteVendaDireta,
            Ativo = true,
            DataCadastro = DateTime.UtcNow
        };

    private static decimal RoundQuantity(decimal value)
        => Math.Round(value, 3, MidpointRounding.AwayFromZero);

    private void AddLog(string acao, string descricao)
    {
        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = currentUser.GetEmpresaId(),
            UsuarioId = currentUser.GetUserId(),
            Modulo = "Produtos",
            Acao = acao,
            Descricao = descricao,
            IpAddress = currentUser.GetIpAddress()
        });
    }

    private static ProdutoDto Map(Produto produto)
    {
        var codes = produto.Codigos
            .Where(item => item.Ativo)
            .OrderByDescending(item => item.Principal)
            .ThenBy(item => item.Codigo)
            .Select(item => new ProdutoCodigoDto(
                item.ProdutoCodigoId,
                item.Codigo,
                item.Tipo.ToString(),
                item.Principal,
                item.Ativo))
            .ToArray();

        if (codes.Length == 0 && !string.IsNullOrWhiteSpace(produto.CodigoBarras))
        {
            codes =
            [
                new ProdutoCodigoDto(Guid.Empty, produto.CodigoBarras, ProdutoCodigoTipo.Ean.ToString(), true, true)
            ];
        }

        var principal = codes.FirstOrDefault(item => item.Principal);
        var melhorPrecoFornecedorId = produto.Fornecedores
            .Where(item => item.Ativo && item.PrecoCompra.HasValue)
            .OrderBy(item => item.PrecoCompra)
            .ThenBy(item => item.PrazoEntregaDias ?? int.MaxValue)
            .Select(item => item.ProdutoFornecedorId)
            .FirstOrDefault();
        var fornecedores = produto.Fornecedores
            .OrderByDescending(item => item.Ativo)
            .ThenByDescending(item => item.FornecedorPrincipal)
            .ThenBy(item => item.ClienteFornecedor.Nome)
            .Select(item => new ProdutoFornecedorDto(
                item.ProdutoFornecedorId,
                item.ProdutoId,
                item.ClienteFornecedorId,
                item.ClienteFornecedor.Nome,
                FormatDocumento(item.ClienteFornecedor.Documento),
                item.CodigoProdutoFornecedor,
                item.NomeProdutoFornecedor,
                item.PrecoCompra,
                item.QuantidadeMinima,
                item.PrazoEntregaDias,
                item.UltimaCompraEm,
                item.UltimoPrecoPago,
                item.FornecedorPrincipal,
                item.Ativo,
                melhorPrecoFornecedorId != Guid.Empty && item.ProdutoFornecedorId == melhorPrecoFornecedorId,
                item.DataCadastro))
            .ToArray();
        var customFields = DeserializeCustomFields(produto.DadosExtrasJson);
        var regrasAplicadas = produto.RegrasFiscaisAplicadas
            .OrderBy(item => item.Ordem)
            .Select(item => new ProdutoRegraFiscalAplicadaDto(
                item.Campo,
                item.Codigo,
                item.Descricao,
                item.OrigemRegra.ToString(),
                item.Ordem,
                item.DataAplicacao))
            .ToArray();
        var pendenciasFiscais = BuildFiscalPendencias(produto);

        return new ProdutoDto(
            produto.ProdutoId,
            produto.EmpresaId,
            produto.CategoriaId,
            produto.ClienteFornecedorId,
            produto.ClienteFornecedor?.Nome,
            FormatDocumento(produto.ClienteFornecedor?.Documento),
            principal?.Codigo ?? produto.CodigoBarras,
            principal?.Tipo,
            produto.Nome,
            produto.Descricao,
            produto.Marca,
            produto.Ncm,
            produto.Cest,
            produto.OrigemFiscal,
            produto.PerfilFiscalPadrao?.ToString(),
            produto.CfopVendaPadrao,
            produto.CfopVendaInterestadual,
            produto.CfopCompraPadrao,
            produto.CfopCompraInterestadual,
            produto.Csosn,
            produto.CstIcms,
            produto.CstPis,
            produto.CstCofins,
            produto.BeneficioFiscalCodigo,
            produto.CodigoAnp,
            produto.UnidadeTributavel,
            produto.ExTipi,
            produto.AliquotaIcms,
            produto.AliquotaIpi,
            produto.AliquotaPis,
            produto.AliquotaCofins,
            produto.ImagemUrl,
            produto.CatalogoResumo,
            produto.DestaqueCatalogoComprador,
            produto.PrecoPromocional,
            produto.PromocaoTitulo,
            produto.PromocaoInicioUtc,
            produto.PromocaoFimUtc,
            produto.CodigoProdutoFornecedor,
            produto.UltimaNotaFiscalCompra,
            produto.PrecoVenda,
            produto.PrecoCusto,
            produto.EstoqueAtual,
            produto.EstoqueMinimo,
            produto.UnidadeMedida,
            produto.Ativo,
            produto.ControlaEstoque,
            produto.ControlaLote,
            produto.PoliticaBaixaLote.ToString(),
            fornecedores,
            codes,
            customFields,
            regrasAplicadas,
            pendenciasFiscais,
            pendenciasFiscais.Count == 0,
            produto.DataCadastro,
            produto.ControlaEstoque && produto.EstoqueAtual <= produto.EstoqueMinimo);
    }

    private static ProdutoCatalogoItemDto MapCatalogItem(Produto produto, IReadOnlyDictionary<Guid, string> categoriaLookup, bool visaoComprador)
    {
        var disponivelParaVenda = produto.Ativo && (!produto.ControlaEstoque || produto.EstoqueAtual > 0);
        var promotion = ResolvePromotionState(produto);
        var precoCatalogo = visaoComprador && promotion.Ativa
            ? promotion.PrecoPromocional!.Value
            : produto.PrecoVenda;

        return new ProdutoCatalogoItemDto(
            produto.ProdutoId,
            produto.EmpresaId,
            produto.CategoriaId,
            produto.CategoriaId.HasValue && categoriaLookup.TryGetValue(produto.CategoriaId.Value, out var categoriaNome)
                ? categoriaNome
                : null,
            produto.CodigoBarras,
            produto.Nome,
            produto.Descricao,
            produto.Marca,
            produto.ImagemUrl,
            precoCatalogo,
            visaoComprador && promotion.Ativa ? produto.PrecoVenda : null,
            visaoComprador && promotion.Ativa,
            produto.CatalogoResumo,
            produto.DestaqueCatalogoComprador,
            promotion.PrecoPromocional,
            promotion.Titulo,
            visaoComprador && promotion.Ativa ? promotion.PercentualDesconto : null,
            produto.UnidadeMedida,
            produto.ControlaEstoque,
            produto.EstoqueAtual,
            produto.EstoqueMinimo,
            produto.ControlaEstoque && produto.EstoqueAtual <= produto.EstoqueMinimo,
            disponivelParaVenda);
    }

    private static string? NormalizeNullable(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static PromotionDefinition NormalizePromotion(
        decimal precoVenda,
        decimal? precoPromocional,
        string? promocaoTitulo,
        DateTime? promocaoInicioUtc,
        DateTime? promocaoFimUtc)
    {
        var titulo = NormalizeNullable(promocaoTitulo);
        var possuiMetadados = titulo is not null || promocaoInicioUtc.HasValue || promocaoFimUtc.HasValue;

        if (!precoPromocional.HasValue)
        {
            if (possuiMetadados)
            {
                throw new AppException("Informe o preco promocional para ativar uma campanha no catalogo do comprador.");
            }

            return new PromotionDefinition(null, null, null, null);
        }

        if (precoPromocional.Value <= 0)
        {
            throw new AppException("Preco promocional deve ser maior que zero.");
        }

        if (precoPromocional.Value >= precoVenda)
        {
            throw new AppException("Preco promocional deve ser menor que o preco de venda cheio.");
        }

        if (promocaoInicioUtc.HasValue && promocaoFimUtc.HasValue && promocaoFimUtc.Value < promocaoInicioUtc.Value)
        {
            throw new AppException("Fim da promocao precisa ser igual ou posterior ao inicio.");
        }

        return new PromotionDefinition(precoPromocional.Value, titulo, promocaoInicioUtc, promocaoFimUtc);
    }

    private static PoliticaBaixaEstoqueLote ParsePoliticaBaixaLote(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return PoliticaBaixaEstoqueLote.FEFO;
        }

        return Enum.TryParse<PoliticaBaixaEstoqueLote>(value.Trim(), true, out var parsed)
            ? parsed
            : throw new AppException("Politica de baixa por lote invalida. Use FIFO ou FEFO.");
    }

    private static IReadOnlyCollection<ProdutoCampoCustomizadoDto> NormalizeCustomFields(
        IReadOnlyCollection<ProdutoCampoCustomizadoRequest>? fields)
    {
        if (fields is null || fields.Count == 0)
        {
            return [];
        }

        var normalized = new List<ProdutoCampoCustomizadoDto>();
        var seenKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var field in fields)
        {
            var key = NormalizeNullable(field.Chave);
            if (string.IsNullOrWhiteSpace(key))
            {
                continue;
            }

            if (key.Length > 80)
            {
                throw new AppException("Campos personalizados aceitam ate 80 caracteres no nome.");
            }

            if (!seenKeys.Add(key))
            {
                throw new AppException($"O campo personalizado '{key}' foi informado mais de uma vez.");
            }

            var value = NormalizeNullable(field.Valor);
            if (value?.Length > 2000)
            {
                throw new AppException($"O campo personalizado '{key}' ultrapassou 2000 caracteres.");
            }

            normalized.Add(new ProdutoCampoCustomizadoDto(key, value));
        }

        return normalized;
    }

    private static string? SerializeCustomFields(IReadOnlyCollection<ProdutoCampoCustomizadoDto> customFields)
        => customFields.Count == 0
            ? null
            : JsonSerializer.Serialize(customFields, CustomFieldJsonOptions);

    private static IReadOnlyCollection<ProdutoCampoCustomizadoDto> DeserializeCustomFields(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<ProdutoCampoCustomizadoDto>>(json, CustomFieldJsonOptions)
                ?.Where(item => !string.IsNullOrWhiteSpace(item.Chave))
                .Select(item => new ProdutoCampoCustomizadoDto(item.Chave.Trim(), NormalizeNullable(item.Valor)))
                .ToArray()
                ?? [];
        }
        catch
        {
            return [];
        }
    }

    private static string OnlyDigits(string? value)
        => string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : new string(value.Where(char.IsAsciiDigit).ToArray());

    private static string? FormatDocumento(string? documento)
    {
        var digits = OnlyDigits(documento);
        if (string.IsNullOrWhiteSpace(digits))
        {
            return null;
        }

        return digits.Length switch
        {
            11 => $"{digits[..3]}.{digits[3..6]}.{digits[6..9]}-{digits[9..]}",
            14 => $"{digits[..2]}.{digits[2..5]}.{digits[5..8]}/{digits[8..12]}-{digits[12..]}",
            _ => digits
        };
    }

    private static IReadOnlyCollection<string> BuildFiscalPendencias(Produto produto)
    {
        var pendencias = new List<string>();

        if (string.IsNullOrWhiteSpace(produto.Ncm))
        {
            pendencias.Add("Informe NCM valido.");
        }

        if (string.IsNullOrWhiteSpace(produto.OrigemFiscal))
        {
            pendencias.Add("Informe origem fiscal valida.");
        }

        if (produto.PerfilFiscalPadrao is null)
        {
            pendencias.Add("Informe perfil fiscal do item.");
        }

        if (string.IsNullOrWhiteSpace(produto.CfopCompraPadrao) ||
            string.IsNullOrWhiteSpace(produto.CfopCompraInterestadual) ||
            string.IsNullOrWhiteSpace(produto.CfopVendaPadrao) ||
            string.IsNullOrWhiteSpace(produto.CfopVendaInterestadual))
        {
            pendencias.Add("Complete os CFOPs obrigatorios.");
        }

        if (string.IsNullOrWhiteSpace(produto.CstPis))
        {
            pendencias.Add("Informe CST PIS.");
        }

        if (string.IsNullOrWhiteSpace(produto.CstCofins))
        {
            pendencias.Add("Informe CST COFINS.");
        }

        if (string.IsNullOrWhiteSpace(produto.UnidadeTributavel))
        {
            pendencias.Add("Informe unidade tributavel.");
        }

        return pendencias;
    }

    private static PromotionState ResolvePromotionState(Produto produto)
    {
        if (!produto.PrecoPromocional.HasValue || produto.PrecoPromocional.Value <= 0 || produto.PrecoPromocional.Value >= produto.PrecoVenda)
        {
            return new PromotionState(false, null, null, null);
        }

        var now = DateTime.UtcNow;
        var iniciou = !produto.PromocaoInicioUtc.HasValue || produto.PromocaoInicioUtc.Value <= now;
        var naoExpirou = !produto.PromocaoFimUtc.HasValue || produto.PromocaoFimUtc.Value >= now;
        var ativa = iniciou && naoExpirou;
        var percentual = ativa
            ? (decimal?)Math.Round((1m - (produto.PrecoPromocional.Value / produto.PrecoVenda)) * 100m, 0, MidpointRounding.AwayFromZero)
            : null;

        return new PromotionState(
            ativa,
            produto.PrecoPromocional.Value,
            NormalizeNullable(produto.PromocaoTitulo),
            percentual);
    }

    private sealed record DesiredProdutoCodigo(
        string Codigo,
        ProdutoCodigoTipo Tipo,
        bool Principal);

    private sealed record DesiredProdutoFornecedor(
        Guid ClienteFornecedorId,
        string? CodigoProdutoFornecedor,
        string? NomeProdutoFornecedor,
        decimal? PrecoCompra,
        decimal? QuantidadeMinima,
        int? PrazoEntregaDias,
        DateTime? UltimaCompraEm,
        decimal? UltimoPrecoPago,
        bool FornecedorPrincipal,
        bool Ativo);

    private sealed record PromotionDefinition(
        decimal? PrecoPromocional,
        string? PromocaoTitulo,
        DateTime? PromocaoInicioUtc,
        DateTime? PromocaoFimUtc);

    private sealed record PromotionState(
        bool Ativa,
        decimal? PrecoPromocional,
        string? Titulo,
        decimal? PercentualDesconto);
}
