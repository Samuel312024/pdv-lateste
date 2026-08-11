namespace PDV.Api.Infrastructure;

public class CatalogoProdutosExternosOptions
{
    public bool Habilitado { get; set; } = true;
    public string Provedor { get; set; } = "OpenFoodFacts";
    public string? BaseUrl { get; set; }
    public string? ApiKey { get; set; }
    public string TokenHeaderName { get; set; } = "X-Cosmos-Token";
    public int TimeoutSeconds { get; set; } = 8;
}
