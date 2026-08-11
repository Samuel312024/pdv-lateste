using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using PDV.Api.Common;
using PDV.Api.DTOs;
using PDV.Api.Infrastructure;

namespace PDV.Api.Services;

public class ProdutoCatalogoExternoService(
    HttpClient httpClient,
    IOptions<CatalogoProdutosExternosOptions> optionsAccessor)
{
    private readonly CatalogoProdutosExternosOptions options = optionsAccessor.Value;
    private readonly TimeSpan requestTimeout = TimeSpan.FromSeconds(Math.Max(4, optionsAccessor.Value.TimeoutSeconds));
    private static readonly Regex BuscapeNextDataRegex = new(
        "<script id=\"__NEXT_DATA__\" type=\"application/json\">(?<json>.*?)</script>",
        RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.Compiled);
    private static readonly Regex CarrefourProductPathRegex = new(
        "href=\"(?<path>/produto/[^\"?#]+)\"",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex JsonLdScriptRegex = new(
        "<script type=\"application/ld\\+json\">(?<json>.*?)</script>",
        RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.Compiled);
    private static readonly HashSet<string> MatchStopwords = new(StringComparer.Ordinal)
    {
        "a",
        "as",
        "com",
        "da",
        "das",
        "de",
        "do",
        "dos",
        "e",
        "em",
        "na",
        "nas",
        "no",
        "nos",
        "o",
        "os",
        "ou",
        "para",
        "por",
        "sem",
        "the"
    };
    private static readonly string[] FashionCategoryKeywords =
    [
        "tenis",
        "calcado",
        "calcados",
        "sandalia",
        "sapato",
        "camiseta",
        "moda",
        "roupa",
        "vestido",
        "bolsa",
        "mochila"
    ];
    private const int MinimumCatalogCandidateScore = 28;

    public ProdutoBaseExternaStatusDto GetStatus()
    {
        if (!options.Habilitado)
        {
            return new ProdutoBaseExternaStatusDto(
                false,
                "Consulta externa desabilitada. Ative a secao CatalogoProdutosExternos no appsettings para acelerar o cadastro por GTIN e por descricao.",
                null);
        }

        var provider = NormalizeProvider(options.Provedor);
        var providerName = GetProviderDisplayName(provider);

        if (provider == "COSMOS" && string.IsNullOrWhiteSpace(options.ApiKey))
        {
            return new ProdutoBaseExternaStatusDto(
                false,
                "Provedor Cosmos selecionado, mas a chave da API nao foi informada. Configure ApiKey para habilitar consultas GTIN completas do varejo brasileiro.",
                providerName);
        }

        if (provider == "UPCITEMDB" && string.IsNullOrWhiteSpace(options.BaseUrl))
        {
            return new ProdutoBaseExternaStatusDto(
                true,
                "Consulta GTIN pronta para uso com UPCitemdb. A busca por descricao tambem consulta catalogos brasileiros, como Carrefour e Buscape, alem da familia Open Facts.",
                providerName);
        }

        if (provider == "OPENFOODFACTS")
        {
            return new ProdutoBaseExternaStatusDto(
                true,
                "Consulta GTIN ativa com Open Food Facts. A busca por descricao tambem aproveita Carrefour Brasil, Buscape, Open Beauty Facts e Open Products Facts para sugerir imagem, nome e marca.",
                providerName);
        }

        return new ProdutoBaseExternaStatusDto(
            true,
            $"Consulta GTIN ativa com {providerName}. A busca por descricao e imagem tambem combina fontes brasileiras e catalogos globais para apoiar o cadastro rapido.",
            providerName);
    }

    public async Task<ProdutoCatalogoExternoConsultaDto> ConsultarPorGtinAsync(string gtin, CancellationToken cancellationToken = default)
    {
        var normalizedGtin = NormalizeGtin(gtin);
        var provider = NormalizeProvider(options.Provedor);
        var providerName = GetProviderDisplayName(provider);
        if (normalizedGtin.Length is < 8 or > 14)
        {
            throw new AppException("GTIN deve conter entre 8 e 14 digitos.");
        }

        if (!options.Habilitado)
        {
            throw new AppException("Consulta GTIN externa nao esta habilitada.");
        }

        try
        {
            return provider switch
            {
                "COSMOS" => await ConsultarCosmosAsync(normalizedGtin, cancellationToken),
                "UPCITEMDB" => await ConsultarUpcItemDbAsync(normalizedGtin, cancellationToken),
                _ => await ConsultarOpenFoodFactsAsync(normalizedGtin, cancellationToken)
            };
        }
        catch (AppException)
        {
            throw;
        }
        catch (HttpRequestException exception) when (exception.StatusCode == HttpStatusCode.NotFound)
        {
            throw new NotFoundException($"GTIN {normalizedGtin} nao foi encontrado no provedor {providerName}.");
        }
        catch (HttpRequestException)
        {
            throw new AppException($"Nao foi possivel consultar o catalogo externo no momento ({providerName}).", HttpStatusCode.BadGateway);
        }
        catch (TaskCanceledException)
        {
            throw new AppException("A consulta GTIN excedeu o tempo limite.", HttpStatusCode.GatewayTimeout);
        }
    }

    public async Task<ProdutoCatalogoExternoConsultaDto> ConsultarPorDescricaoAsync(string descricao, CancellationToken cancellationToken = default)
    {
        var normalizedSearch = NormalizeSearchTerm(descricao);
        if (normalizedSearch.Length < 3)
        {
            throw new AppException("Informe pelo menos 3 caracteres para buscar imagem e dados por descricao.");
        }

        if (!options.Habilitado)
        {
            throw new AppException("Consulta externa nao esta habilitada.");
        }

        try
        {
            var candidates = await SearchCatalogCandidatesAsync(normalizedSearch, cancellationToken);
            var bestCandidate = candidates
                .OrderByDescending(candidate => candidate.Score)
                .FirstOrDefault();

            if (bestCandidate is null)
            {
                throw new NotFoundException(
                    $"Nenhuma sugestao externa foi encontrada para \"{normalizedSearch}\". Revise o nome do produto ou tente cadastrar o GTIN.");
            }

            return new ProdutoCatalogoExternoConsultaDto(
                true,
                bestCandidate.Codigo ?? normalizedSearch,
                bestCandidate.Nome,
                bestCandidate.Descricao,
                bestCandidate.Marca,
                bestCandidate.Ncm,
                bestCandidate.ImagemUrl,
                bestCandidate.PrecoMedio,
                bestCandidate.UnidadeSugerida,
                bestCandidate.Provedor,
                $"Sugestao localizada em {bestCandidate.Provedor}. Revise a imagem e o texto antes de aplicar ao cadastro definitivo.",
                bestCandidate.FonteUrl,
                bestCandidate.BuscaUrl);
        }
        catch (AppException)
        {
            throw;
        }
        catch (HttpRequestException)
        {
            throw new AppException("Nao foi possivel consultar o catalogo externo por descricao no momento.", HttpStatusCode.BadGateway);
        }
        catch (TaskCanceledException)
        {
            throw new AppException("A busca externa por descricao excedeu o tempo limite.", HttpStatusCode.GatewayTimeout);
        }
    }

    public async Task<ProdutoPesquisaPrecosDto> CompararPrecosPorDescricaoAsync(string descricao, CancellationToken cancellationToken = default)
    {
        var normalizedSearch = NormalizeSearchTerm(descricao);
        if (normalizedSearch.Length < 3)
        {
            throw new AppException("Informe pelo menos 3 caracteres para comparar os precos externos.");
        }

        if (!options.Habilitado)
        {
            throw new AppException("Consulta externa nao esta habilitada.");
        }

        try
        {
            var candidates = await SearchCatalogCandidatesAsync(normalizedSearch, cancellationToken);
            if (candidates.Count == 0)
            {
                throw new NotFoundException(
                    $"Nenhuma oferta externa foi encontrada para \"{normalizedSearch}\". Revise o termo ou envie uma foto mais nitida da embalagem.");
            }

            var orderedCandidates = candidates
                .OrderBy(candidate => candidate.PrecoMedio ?? decimal.MaxValue)
                .ThenByDescending(candidate => candidate.Score)
                .ThenBy(candidate => candidate.Provedor)
                .ToArray();

            var candidatesWithPrice = orderedCandidates
                .Where(candidate => candidate.PrecoMedio.HasValue)
                .ToArray();

            var menorPrecoCandidate = candidatesWithPrice
                .OrderBy(candidate => candidate.PrecoMedio)
                .FirstOrDefault();

            var imagemPrincipal = orderedCandidates
                .Select(candidate => candidate.ImagemUrl)
                .FirstOrDefault(imageUrl => !string.IsNullOrWhiteSpace(imageUrl));

            return new ProdutoPesquisaPrecosDto(
                normalizedSearch,
                BuildPriceResearchMessage(normalizedSearch, orderedCandidates, candidatesWithPrice.Length),
                imagemPrincipal,
                candidatesWithPrice.Length > 0 ? candidatesWithPrice.Min(candidate => candidate.PrecoMedio) : null,
                candidatesWithPrice.Length > 0 ? candidatesWithPrice.Max(candidate => candidate.PrecoMedio) : null,
                candidatesWithPrice.Length > 0 ? decimal.Round(candidatesWithPrice.Average(candidate => candidate.PrecoMedio!.Value), 2) : null,
                menorPrecoCandidate?.Provedor,
                orderedCandidates.Select(MapPriceResearchCandidate).ToArray());
        }
        catch (AppException)
        {
            throw;
        }
        catch (HttpRequestException)
        {
            throw new AppException("Nao foi possivel consultar o comparativo de precos externos no momento.", HttpStatusCode.BadGateway);
        }
        catch (TaskCanceledException)
        {
            throw new AppException("A comparacao externa de precos excedeu o tempo limite.", HttpStatusCode.GatewayTimeout);
        }
    }

    private async Task<ProdutoCatalogoExternoConsultaDto> ConsultarOpenFoodFactsAsync(string gtin, CancellationToken cancellationToken)
    {
        using var requestTimeoutScope = CreateRequestTimeoutScope(cancellationToken);
        using var request = CreateCatalogRequest("https://world.openfoodfacts.org/", $"api/v2/product/{gtin}.json");
        using var responseMessage = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, requestTimeoutScope.Token);
        if (responseMessage.StatusCode == HttpStatusCode.NotFound)
        {
            throw new NotFoundException(
                $"GTIN {gtin} nao foi encontrado no Open Food Facts. Esse catalogo cobre melhor alimentos e bebidas; para varejo mais amplo, configure Cosmos.");
        }

        responseMessage.EnsureSuccessStatusCode();
        var response = await responseMessage.Content.ReadFromJsonAsync<OpenFoodFactsResponse>(requestTimeoutScope.Token);

        if (response?.Status != 1 || response.Product is null || string.IsNullOrWhiteSpace(response.Product.ProductName))
        {
            throw new NotFoundException(
                $"GTIN {gtin} nao foi encontrado no Open Food Facts. Esse catalogo cobre melhor alimentos e bebidas; para varejo mais amplo, configure Cosmos.");
        }

        var nome = response.Product.ProductName.Trim();
        var marca = NormalizeNullable(response.Product.Brands);
        var descricao = BuildExternalDescription(
            NormalizeNullable(response.Product.GenericName),
            NormalizeNullable(response.Product.Categories),
            NormalizeNullable(response.Product.Quantity));

        return new ProdutoCatalogoExternoConsultaDto(
            true,
            NormalizeNullable(response.Product.Code) ?? gtin,
            nome,
            descricao,
            marca,
            null,
            NormalizeNullable(response.Product.ImageFrontSmallUrl) ?? NormalizeNullable(response.Product.ImageFrontUrl),
            null,
            InferUnit(response.Product.Quantity),
            "Open Food Facts",
            "Dados localizados no catalogo externo e prontos para apoiar o cadastro rapido.",
            BuildAbsoluteUri("https://world.openfoodfacts.org/", $"product/{gtin}").ToString(),
            null);
    }

    private async Task<ProdutoCatalogoExternoConsultaDto> ConsultarUpcItemDbAsync(string gtin, CancellationToken cancellationToken)
    {
        using var requestTimeoutScope = CreateRequestTimeoutScope(cancellationToken);
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            BuildAbsoluteUri(options.BaseUrl ?? "https://api.upcitemdb.com/", $"prod/trial/lookup?upc={gtin}"));
        if (!string.IsNullOrWhiteSpace(options.ApiKey))
        {
            request.Headers.TryAddWithoutValidation("user_key", options.ApiKey);
        }

        using var responseMessage = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, requestTimeoutScope.Token);
        if (responseMessage.StatusCode == HttpStatusCode.NotFound)
        {
            throw new NotFoundException("GTIN nao encontrado na base externa configurada.");
        }

        responseMessage.EnsureSuccessStatusCode();
        var response = await responseMessage.Content.ReadFromJsonAsync<UpcItemDbResponse>(requestTimeoutScope.Token);
        var item = response?.Items?.FirstOrDefault();
        if (item is null || string.IsNullOrWhiteSpace(item.Title))
        {
            throw new NotFoundException("GTIN nao encontrado na base externa configurada.");
        }

        var descricao = BuildExternalDescription(
            NormalizeNullable(item.Description),
            NormalizeNullable(item.Category),
            null);

        return new ProdutoCatalogoExternoConsultaDto(
            true,
            NormalizeNullable(item.Ean) ?? NormalizeNullable(item.Upc) ?? gtin,
            item.Title.Trim(),
            descricao,
            NormalizeNullable(item.Brand),
            null,
            item.Images?.FirstOrDefault(),
            null,
            "UN",
            "UPCitemdb",
            "Dados localizados no catalogo externo e prontos para apoiar o cadastro rapido.",
            null,
            null);
    }

    private async Task<ProdutoCatalogoExternoConsultaDto> ConsultarCosmosAsync(string gtin, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(options.ApiKey))
        {
            throw new AppException("A chave da API do Cosmos nao foi configurada.");
        }

        using var requestTimeoutScope = CreateRequestTimeoutScope(cancellationToken);
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            BuildAbsoluteUri(options.BaseUrl ?? "https://api.cosmos.bluesoft.com.br/", $"gtins/{gtin}.json"));
        request.Headers.TryAddWithoutValidation(options.TokenHeaderName, options.ApiKey);

        using var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, requestTimeoutScope.Token);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            throw new NotFoundException("GTIN nao encontrado na base externa configurada.");
        }

        response.EnsureSuccessStatusCode();

        await using var contentStream = await response.Content.ReadAsStreamAsync(requestTimeoutScope.Token);
        using var document = await JsonDocument.ParseAsync(contentStream, cancellationToken: requestTimeoutScope.Token);
        var root = document.RootElement;

        var nome = FirstString(root,
            "description",
            "nome",
            "name");

        if (string.IsNullOrWhiteSpace(nome))
        {
            throw new NotFoundException("GTIN localizado, mas sem descricao aproveitavel no catalogo externo.");
        }

        var marca = FirstString(root,
            "brand.name",
            "brand_name",
            "marca",
            "manufacturer_name");

        var ncm = FirstString(root,
            "ncm",
            "ncm.code",
            "classification.ncm");

        var imagemUrl = FirstString(root,
            "thumbnail",
            "image",
            "images.front",
            "pictures.0.url");

        var descricao = BuildExternalDescription(
            FirstString(root, "short_description", "category.name"),
            FirstString(root, "category.full_name", "department.name"),
            FirstString(root, "packaging", "quantity"));

        return new ProdutoCatalogoExternoConsultaDto(
            true,
            FirstString(root, "gtin", "ean") ?? gtin,
            nome,
            descricao,
            marca,
            ncm,
            imagemUrl,
            FirstDecimal(root, "average_price", "price"),
            InferUnit(FirstString(root, "quantity", "packaging")),
            "Cosmos",
            "Dados localizados no catalogo externo e prontos para apoiar o cadastro rapido.",
            null,
            null);
    }

    private async Task<CatalogSearchCandidate?> TrySearchOpenFactsCatalogAsync(
        OpenFactsCatalogSource provider,
        string normalizedSearch,
        CancellationToken cancellationToken)
    {
        using var requestTimeoutScope = CreateRequestTimeoutScope(cancellationToken);
        var query = $"cgi/search.pl?action=process&json=1&page_size=12&search_simple=1&search_terms={Uri.EscapeDataString(normalizedSearch)}";
        using var request = CreateCatalogRequest(provider.BaseUrl, query);
        using var responseMessage = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, requestTimeoutScope.Token);
        if (!responseMessage.IsSuccessStatusCode)
        {
            return null;
        }

        await using var contentStream = await responseMessage.Content.ReadAsStreamAsync(requestTimeoutScope.Token);
        using var document = await JsonDocument.ParseAsync(contentStream, cancellationToken: requestTimeoutScope.Token);
        if (!document.RootElement.TryGetProperty("products", out var productsNode) || productsNode.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        CatalogSearchCandidate? bestCandidate = null;
        foreach (var productNode in productsNode.EnumerateArray())
        {
            var candidate = BuildOpenFactsCandidate(provider, normalizedSearch, productNode);
            if (candidate is null)
            {
                continue;
            }

            if (bestCandidate is null || candidate.Score > bestCandidate.Score)
            {
                bestCandidate = candidate;
            }
        }

        return bestCandidate;
    }

    private async Task<CatalogSearchCandidate?> TrySearchCarrefourBrasilCatalogAsync(
        string normalizedSearch,
        CancellationToken cancellationToken)
    {
        using var requestTimeoutScope = CreateRequestTimeoutScope(cancellationToken);
        using var request = CreateCatalogRequest(
            "https://mercado.carrefour.com.br/",
            $"busca/{Uri.EscapeDataString(normalizedSearch)}");
        using var responseMessage = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, requestTimeoutScope.Token);
        if (!responseMessage.IsSuccessStatusCode)
        {
            return null;
        }

        var html = await responseMessage.Content.ReadAsStringAsync(requestTimeoutScope.Token);
        var productPaths = CarrefourProductPathRegex.Matches(html)
            .Select(match => NormalizeNullable(WebUtility.HtmlDecode(match.Groups["path"].Value)))
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(path => CalculateSlugScore(normalizedSearch, path!))
            .Take(5)
            .Cast<string>()
            .ToArray();

        if (productPaths.Length == 0)
        {
            return null;
        }

        var candidates = await Task.WhenAll(productPaths.Select(path =>
            SafeSearchAsync(
                ct => TryLoadCarrefourProductCandidateAsync(path, normalizedSearch, ct),
                cancellationToken)));

        return candidates
            .Where(candidate => candidate is not null)
            .OrderByDescending(candidate => candidate!.Score)
            .FirstOrDefault();
    }

    private async Task<CatalogSearchCandidate?> TryLoadCarrefourProductCandidateAsync(
        string productPath,
        string normalizedSearch,
        CancellationToken cancellationToken)
    {
        using var requestTimeoutScope = CreateRequestTimeoutScope(cancellationToken);
        using var request = CreateCatalogRequest("https://mercado.carrefour.com.br/", productPath.TrimStart('/'));
        using var responseMessage = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, requestTimeoutScope.Token);
        if (!responseMessage.IsSuccessStatusCode)
        {
            return null;
        }

        var html = await responseMessage.Content.ReadAsStringAsync(requestTimeoutScope.Token);
        var product = TryParseStructuredProduct(html);
        if (product is null || string.IsNullOrWhiteSpace(product.Nome))
        {
            return null;
        }

        var categoria = FormatCategoryPath(product.Categoria);
        var descricao = BuildExternalDescription(
            LimitText(product.Descricao, 520),
            categoria,
            null);
        var codigo = NormalizeNullable(product.Gtin) ?? NormalizeNullable(product.Codigo);
        var nome = LimitText(product.Nome, 180) ?? product.Nome;
        var marca = LimitText(product.Marca, 80);
        var score = CalculateCatalogScore(
            normalizedSearch,
            nome,
            marca,
            descricao,
            product.ImagemUrl,
            categoria,
            product.Preco,
            codigo);

        return new CatalogSearchCandidate(
            "Carrefour Brasil",
            codigo,
            nome,
            descricao,
            marca,
            null,
            NormalizeNullable(product.ImagemUrl),
            product.Preco,
            InferUnit($"{nome} {descricao}"),
            score,
            BuildAbsoluteUri("https://mercado.carrefour.com.br/", productPath.TrimStart('/')).ToString(),
            BuildAbsoluteUri("https://mercado.carrefour.com.br/", $"busca/{Uri.EscapeDataString(normalizedSearch)}").ToString());
    }

    private async Task<CatalogSearchCandidate?> TrySearchBuscapeCatalogAsync(
        string normalizedSearch,
        CancellationToken cancellationToken)
    {
        using var requestTimeoutScope = CreateRequestTimeoutScope(cancellationToken);
        using var request = CreateCatalogRequest(
            "https://www.buscape.com.br/",
            $"search?q={Uri.EscapeDataString(normalizedSearch)}");
        using var responseMessage = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, requestTimeoutScope.Token);
        if (!responseMessage.IsSuccessStatusCode)
        {
            return null;
        }

        var html = await responseMessage.Content.ReadAsStringAsync(requestTimeoutScope.Token);
        var nextDataMatch = BuscapeNextDataRegex.Match(html);
        if (!nextDataMatch.Success)
        {
            return null;
        }

        using var document = JsonDocument.Parse(WebUtility.HtmlDecode(nextDataMatch.Groups["json"].Value));
        if (!TryGetElement(document.RootElement, "props.initialReduxState.hits.hits", out var hitsNode)
            || hitsNode.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        CatalogSearchCandidate? bestCandidate = null;
        foreach (var hitNode in hitsNode.EnumerateArray().Take(16))
        {
            var candidate = BuildBuscapeCandidate(normalizedSearch, hitNode);
            if (candidate is null)
            {
                continue;
            }

            if (bestCandidate is null || candidate.Score > bestCandidate.Score)
            {
                bestCandidate = candidate;
            }
        }

        return bestCandidate;
    }

    private async Task<IReadOnlyCollection<CatalogSearchCandidate>> SearchCatalogCandidatesAsync(
        string normalizedSearch,
        CancellationToken cancellationToken)
    {
        var providers = new OpenFactsCatalogSource[]
        {
            new("Open Beauty Facts", "https://world.openbeautyfacts.org/"),
            new("Open Products Facts", "https://world.openproductsfacts.org/"),
            new("Open Food Facts", "https://world.openfoodfacts.org/")
        };

        var searchTasks = new List<Task<CatalogSearchCandidate?>>
        {
            SafeSearchAsync(
                ct => TrySearchCarrefourBrasilCatalogAsync(normalizedSearch, ct),
                cancellationToken),
            SafeSearchAsync(
                ct => TrySearchBuscapeCatalogAsync(normalizedSearch, ct),
                cancellationToken)
        };

        searchTasks.AddRange(providers.Select(provider =>
            SafeSearchAsync(
                ct => TrySearchOpenFactsCatalogAsync(provider, normalizedSearch, ct),
                cancellationToken)));

        return (await Task.WhenAll(searchTasks))
            .Where(candidate => candidate is not null && candidate.Score >= MinimumCatalogCandidateScore)
            .Select(candidate => candidate!)
            .ToArray();
    }

    private static ProdutoPesquisaPrecoFonteDto MapPriceResearchCandidate(CatalogSearchCandidate candidate)
        => new(
            candidate.Provedor,
            candidate.Codigo,
            candidate.Nome,
            candidate.Descricao,
            candidate.Marca,
            candidate.Ncm,
            candidate.ImagemUrl,
            candidate.PrecoMedio,
            candidate.UnidadeSugerida,
            candidate.Score,
            candidate.FonteUrl,
            candidate.BuscaUrl);

    private static string BuildPriceResearchMessage(
        string termo,
        IReadOnlyCollection<CatalogSearchCandidate> candidates,
        int pricedSourcesCount)
    {
        var totalSources = candidates.Count;
        if (pricedSourcesCount == 0)
        {
            return $"Encontramos {totalSources} fonte(s) externa(s) para \"{termo}\", mas nenhuma publicou preco direto no resultado atual.";
        }

        return $"Encontramos {totalSources} fonte(s) externa(s) para \"{termo}\", com preco visivel em {pricedSourcesCount} delas.";
    }

    private HttpRequestMessage CreateCatalogRequest(string baseUrl, string relativePath)
    {
        const string userAgent = "PDV-Web/1.0 (+https://pdv.local)";
        var request = new HttpRequestMessage(HttpMethod.Get, BuildAbsoluteUri(baseUrl, relativePath));
        request.Headers.UserAgent.ParseAdd(userAgent);
        request.Headers.AcceptLanguage.ParseAdd("pt-BR,pt;q=0.9,en;q=0.8");
        return request;
    }

    private static CatalogSearchCandidate? BuildOpenFactsCandidate(OpenFactsCatalogSource provider, string normalizedSearch, JsonElement productNode)
    {
        var nome = FirstString(productNode, "product_name", "product_name_pt", "product_name_en");
        if (string.IsNullOrWhiteSpace(nome))
        {
            return null;
        }

        var descricao = BuildExternalDescription(
            FirstString(productNode, "generic_name", "generic_name_pt", "generic_name_en"),
            FirstString(productNode, "categories", "categories_tags.0"),
            FirstString(productNode, "quantity"));
        var marca = FirstString(productNode, "brands", "brands_tags.0");
        var imagemUrl = FirstString(
            productNode,
            "image_front_small_url",
            "image_front_url",
            "selected_images.front.display.pt",
            "selected_images.front.display.en",
            "selected_images.front.small.pt",
            "selected_images.front.small.en");
        var unidadeSugerida = InferUnit(FirstString(productNode, "quantity"));
        var codigo = FirstString(productNode, "code");
        var score = CalculateCatalogScore(normalizedSearch, nome, marca, descricao, imagemUrl, null, null, codigo);
        var sourceUrl = string.IsNullOrWhiteSpace(codigo)
            ? null
            : BuildAbsoluteUri(provider.BaseUrl, $"product/{codigo}").ToString();
        var searchUrl = BuildAbsoluteUri(
            provider.BaseUrl,
            $"cgi/search.pl?action=process&search_simple=1&search_terms={Uri.EscapeDataString(normalizedSearch)}").ToString();

        return new CatalogSearchCandidate(
            provider.ProviderName,
            codigo,
            nome,
            descricao,
            marca,
            null,
            imagemUrl,
            null,
            unidadeSugerida,
            score,
            sourceUrl,
            searchUrl);
    }

    private static CatalogSearchCandidate? BuildBuscapeCandidate(string normalizedSearch, JsonElement hitNode)
    {
        var nome = FirstString(hitNode, "name", "shortName");
        if (string.IsNullOrWhiteSpace(nome))
        {
            return null;
        }

        var categoria = FirstString(hitNode, "categoryName");
        var loja = FirstString(hitNode, "bestOffer.merchantName");
        var quantidadeLojas = FirstString(hitNode, "storeCount");
        var descricao = BuildExternalDescription(
            categoria is null ? null : $"Categoria: {categoria}",
            loja is null ? null : $"Loja destaque: {loja}",
            quantidadeLojas is null ? null : $"{quantidadeLojas} loja(s)");
        var imagemUrl = FirstString(hitNode, "image");
        var codigo = FirstString(hitNode, "sourceId", "objectId", "url");
        var score = CalculateCatalogScore(
            normalizedSearch,
            nome,
            null,
            descricao,
            imagemUrl,
            categoria,
            FirstDecimal(hitNode, "price"),
            codigo);

        return new CatalogSearchCandidate(
            "Buscape Brasil",
            codigo,
            nome,
            descricao,
            null,
            null,
            imagemUrl,
            FirstDecimal(hitNode, "price"),
            InferUnit(nome),
            score,
            NormalizeCatalogUrl("https://www.buscape.com.br/", FirstString(hitNode, "url")),
            BuildAbsoluteUri("https://www.buscape.com.br/", $"search?q={Uri.EscapeDataString(normalizedSearch)}").ToString());
    }

    private async Task<CatalogSearchCandidate?> SafeSearchAsync(
        Func<CancellationToken, Task<CatalogSearchCandidate?>> searchFunc,
        CancellationToken cancellationToken)
    {
        try
        {
            return await searchFunc(cancellationToken);
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return null;
        }
        catch (HttpRequestException)
        {
            return null;
        }
        catch (JsonException)
        {
            return null;
        }
        catch (InvalidOperationException)
        {
            return null;
        }
    }

    private static int CalculateCatalogScore(
        string normalizedSearch,
        string nome,
        string? marca,
        string? descricao,
        string? imagemUrl,
        string? categoria,
        decimal? precoMedio,
        string? codigo)
    {
        var searchTokens = TokenizeForMatch(normalizedSearch);
        var text = string.Join(' ', new[] { nome, marca, descricao, categoria }.Where(item => !string.IsNullOrWhiteSpace(item)));
        var normalizedText = NormalizeTextForMatch(text);
        var score = 0;
        var matchedTokens = 0;

        foreach (var token in searchTokens)
        {
            if (normalizedText.Contains(token, StringComparison.Ordinal))
            {
                score += 18;
                matchedTokens++;
            }
            else if (token.Length >= 3)
            {
                score -= 10;
            }
        }

        var normalizedName = NormalizeTextForMatch(nome);
        var normalizedSearchText = NormalizeTextForMatch(normalizedSearch);
        if (normalizedName.Contains(normalizedSearchText, StringComparison.Ordinal))
        {
            score += 30;
        }

        if (searchTokens.Length > 0 && normalizedName.StartsWith(searchTokens[0], StringComparison.Ordinal))
        {
            score += 6;
        }

        if (searchTokens.Length > 0 && matchedTokens == searchTokens.Length)
        {
            score += 12;
        }

        if (!string.IsNullOrWhiteSpace(imagemUrl))
        {
            score += 10;
        }

        if (!string.IsNullOrWhiteSpace(marca))
        {
            score += 5;
        }

        if (!string.IsNullOrWhiteSpace(descricao))
        {
            score += 3;
        }

        if (!string.IsNullOrWhiteSpace(categoria))
        {
            score += 4;
        }

        if (precoMedio.HasValue)
        {
            score += 3;
        }

        if (!string.IsNullOrWhiteSpace(codigo))
        {
            score += 6;
        }

        if (!string.IsNullOrWhiteSpace(categoria))
        {
            var normalizedCategory = NormalizeTextForMatch(categoria);
            if (searchTokens.Any(token => normalizedCategory.Contains(token, StringComparison.Ordinal)))
            {
                score += 6;
            }

            if (!searchTokens.Any(token => FashionCategoryKeywords.Contains(token, StringComparer.Ordinal))
                && FashionCategoryKeywords.Any(keyword => normalizedCategory.Contains(keyword, StringComparison.Ordinal)))
            {
                score -= 30;
            }
        }

        return score;
    }

    private static int CalculateSlugScore(string normalizedSearch, string productPath)
        => CalculateCatalogScore(
            normalizedSearch,
            productPath.Replace("/produto/", string.Empty, StringComparison.OrdinalIgnoreCase)
                .Replace('-', ' ')
                .Replace('/', ' '),
            null,
            null,
            null,
            null,
            null,
            null);

    private static StructuredCatalogProduct? TryParseStructuredProduct(string html)
    {
        foreach (Match match in JsonLdScriptRegex.Matches(html))
        {
            var json = WebUtility.HtmlDecode(match.Groups["json"].Value);
            using var document = JsonDocument.Parse(json);
            var productNode = FindProductSchemaNode(document.RootElement);
            if (productNode is null)
            {
                continue;
            }

            var nome = FirstString(productNode.Value, "name");
            if (string.IsNullOrWhiteSpace(nome))
            {
                continue;
            }

            return new StructuredCatalogProduct(
                FirstString(productNode.Value, "sku", "mpn"),
                FirstString(productNode.Value, "gtin", "gtin13", "gtin14"),
                nome,
                FirstString(productNode.Value, "description"),
                FirstString(productNode.Value, "brand.name", "brand"),
                FirstString(productNode.Value, "image.0", "image"),
                FirstDecimal(productNode.Value, "offers.price", "offers.0.price"),
                FirstString(productNode.Value, "category"));
        }

        return null;
    }

    private static JsonElement? FindProductSchemaNode(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            if (TryGetString(element, "@type", out var type)
                && type?.Contains("Product", StringComparison.OrdinalIgnoreCase) == true)
            {
                return element;
            }

            if (element.TryGetProperty("@graph", out var graphNode))
            {
                return FindProductSchemaNode(graphNode);
            }
        }

        if (element.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        foreach (var item in element.EnumerateArray())
        {
            var productNode = FindProductSchemaNode(item);
            if (productNode is not null)
            {
                return productNode;
            }
        }

        return null;
    }

    private CancellationTokenSource CreateRequestTimeoutScope(CancellationToken cancellationToken)
    {
        var timeoutScope = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutScope.CancelAfter(requestTimeout);
        return timeoutScope;
    }

    private static Uri BuildAbsoluteUri(string baseUrl, string relativePath)
    {
        var normalizedBaseUrl = baseUrl.EndsWith('/') ? baseUrl : $"{baseUrl}/";
        return new Uri(new Uri(normalizedBaseUrl, UriKind.Absolute), relativePath);
    }

    private static string? NormalizeCatalogUrl(string baseUrl, string? value)
    {
        var normalized = NormalizeNullable(value);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        if (Uri.TryCreate(normalized, UriKind.Absolute, out var absoluteUri))
        {
            return absoluteUri.ToString();
        }

        return BuildAbsoluteUri(baseUrl, normalized.TrimStart('/')).ToString();
    }

    private static string NormalizeGtin(string? value)
        => string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : new string(value.Where(char.IsAsciiDigit).ToArray());

    private static string NormalizeSearchTerm(string? value)
        => string.Join(' ',
            (value ?? string.Empty)
                .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));

    private static string NormalizeProvider(string? provider)
        => string.IsNullOrWhiteSpace(provider)
            ? "OPENFOODFACTS"
            : provider.Trim().ToUpperInvariant();

    private static string GetProviderDisplayName(string normalizedProvider)
        => normalizedProvider switch
        {
            "COSMOS" => "Cosmos",
            "UPCITEMDB" => "UPCitemdb",
            _ => "Open Food Facts"
        };

    private static string? NormalizeNullable(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? BuildExternalDescription(string? primary, string? secondary, string? quantity)
    {
        var parts = new[] { primary, secondary, quantity }
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Select(item => item!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return parts.Length == 0 ? null : string.Join(" | ", parts);
    }

    private static string InferUnit(string? quantity)
    {
        var normalized = NormalizeNullable(quantity)?.ToUpperInvariant() ?? string.Empty;

        if (normalized.Contains("ML"))
        {
            return "ML";
        }

        if (normalized.Contains(" KG") || normalized.StartsWith("KG"))
        {
            return "KG";
        }

        if (normalized.Contains(" G") || normalized.EndsWith("G"))
        {
            return "G";
        }

        if (normalized.Contains(" L") || normalized.EndsWith("L"))
        {
            return "L";
        }

        return "UN";
    }

    private static string? LimitText(string? value, int maxLength)
    {
        var normalized = CollapseWhitespace(WebUtility.HtmlDecode(value ?? string.Empty));
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        return normalized.Length <= maxLength
            ? normalized
            : $"{normalized[..(maxLength - 3)].TrimEnd()}...";
    }

    private static string? FormatCategoryPath(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var parts = value
            .Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return parts.Length == 0 ? null : string.Join(" > ", parts);
    }

    private static string NormalizeTextForMatch(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var normalized = value.Trim().Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(normalized.Length);
        foreach (var character in normalized)
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(character);
            if (category == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            builder.Append(char.IsLetterOrDigit(character)
                ? char.ToLowerInvariant(character)
                : ' ');
        }

        return CollapseWhitespace(builder.ToString().Normalize(NormalizationForm.FormC));
    }

    private static string[] TokenizeForMatch(string value)
        => NormalizeTextForMatch(value)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(token => token.Length > 1 && !MatchStopwords.Contains(token))
            .Distinct(StringComparer.Ordinal)
            .ToArray();

    private static string? FirstString(JsonElement root, params string[] paths)
    {
        foreach (var path in paths)
        {
            if (TryGetString(root, path, out var value) && !string.IsNullOrWhiteSpace(value))
            {
                return value.Trim();
            }
        }

        return null;
    }

    private static decimal? FirstDecimal(JsonElement root, params string[] paths)
    {
        foreach (var path in paths)
        {
            if (TryGetDecimal(root, path, out var value))
            {
                return value;
            }
        }

        return null;
    }

    private static bool TryGetString(JsonElement root, string path, out string? value)
    {
        value = null;
        if (!TryGetElement(root, path, out var current))
        {
            return false;
        }

        value = current.ValueKind switch
        {
            JsonValueKind.String => current.GetString(),
            JsonValueKind.Number => current.GetRawText(),
            _ => null
        };

        return !string.IsNullOrWhiteSpace(value);
    }

    private static bool TryGetElement(JsonElement root, string path, out JsonElement value)
    {
        value = root;
        foreach (var segment in path.Split('.', StringSplitOptions.RemoveEmptyEntries))
        {
            if (value.ValueKind == JsonValueKind.Array)
            {
                if (!int.TryParse(segment, out var index) || value.GetArrayLength() <= index)
                {
                    return false;
                }

                value = value[index];
                continue;
            }

            if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty(segment, out value))
            {
                return false;
            }
        }

        return true;
    }

    private static bool TryGetDecimal(JsonElement root, string path, out decimal value)
    {
        value = 0;
        if (!TryGetString(root, path, out var stringValue) || string.IsNullOrWhiteSpace(stringValue))
        {
            return false;
        }

        return decimal.TryParse(stringValue, NumberStyles.Any, CultureInfo.InvariantCulture, out value)
            || decimal.TryParse(stringValue, NumberStyles.Any, CultureInfo.GetCultureInfo("pt-BR"), out value);
    }

    private static string CollapseWhitespace(string value)
        => string.Join(' ',
            value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));

    private sealed class OpenFoodFactsResponse
    {
        [JsonPropertyName("status")]
        public int Status { get; init; }

        [JsonPropertyName("product")]
        public OpenFoodFactsProduct? Product { get; init; }
    }

    private sealed class OpenFoodFactsProduct
    {
        [JsonPropertyName("code")]
        public string? Code { get; init; }

        [JsonPropertyName("product_name")]
        public string? ProductName { get; init; }

        [JsonPropertyName("generic_name")]
        public string? GenericName { get; init; }

        [JsonPropertyName("brands")]
        public string? Brands { get; init; }

        [JsonPropertyName("categories")]
        public string? Categories { get; init; }

        [JsonPropertyName("quantity")]
        public string? Quantity { get; init; }

        [JsonPropertyName("image_front_small_url")]
        public string? ImageFrontSmallUrl { get; init; }

        [JsonPropertyName("image_front_url")]
        public string? ImageFrontUrl { get; init; }
    }

    private sealed class UpcItemDbResponse
    {
        [JsonPropertyName("items")]
        public List<UpcItemDbItem>? Items { get; init; }
    }

    private sealed class UpcItemDbItem
    {
        [JsonPropertyName("ean")]
        public string? Ean { get; init; }

        [JsonPropertyName("upc")]
        public string? Upc { get; init; }

        [JsonPropertyName("title")]
        public string? Title { get; init; }

        [JsonPropertyName("description")]
        public string? Description { get; init; }

        [JsonPropertyName("brand")]
        public string? Brand { get; init; }

        [JsonPropertyName("category")]
        public string? Category { get; init; }

        [JsonPropertyName("images")]
        public List<string>? Images { get; init; }
    }

    private sealed record OpenFactsCatalogSource(string ProviderName, string BaseUrl);

    private sealed record CatalogSearchCandidate(
        string Provedor,
        string? Codigo,
        string Nome,
        string? Descricao,
        string? Marca,
        string? Ncm,
        string? ImagemUrl,
        decimal? PrecoMedio,
        string UnidadeSugerida,
        int Score,
        string? FonteUrl,
        string? BuscaUrl);

    private sealed record StructuredCatalogProduct(
        string? Codigo,
        string? Gtin,
        string Nome,
        string? Descricao,
        string? Marca,
        string? ImagemUrl,
        decimal? Preco,
        string? Categoria);
}
