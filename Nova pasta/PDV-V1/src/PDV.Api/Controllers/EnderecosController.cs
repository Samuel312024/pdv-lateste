using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PDV.Api.Common;
using PDV.Api.DTOs;
using PDV.Api.Services;

namespace PDV.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/enderecos")]
public class EnderecosController(
    CepLookupService cepLookupService,
    MunicipioCatalogService municipioCatalogService) : ControllerBase
{
    [HttpGet("cep/{cep}")]
    public async Task<ActionResult<ApiResponse<CepLookupDto>>> BuscarCep(string cep, CancellationToken cancellationToken)
    {
        var response = await cepLookupService.BuscarAsync(cep, cancellationToken);
        return Ok(ApiResponse<CepLookupDto>.Ok(response));
    }

    [HttpGet("municipios")]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<MunicipioLookupDto>>>> BuscarMunicipios(
        [FromQuery] string? termo,
        [FromQuery] string? uf,
        [FromQuery] int limit = 20,
        CancellationToken cancellationToken = default)
    {
        var response = await municipioCatalogService.SearchAsync(termo, uf, limit, cancellationToken);
        return Ok(ApiResponse<IReadOnlyCollection<MunicipioLookupDto>>.Ok(response));
    }

    [HttpGet("municipios/resolver")]
    public async Task<ActionResult<ApiResponse<MunicipioLookupDto?>>> ResolverMunicipio(
        [FromQuery] string? cidade,
        [FromQuery] string? uf,
        [FromQuery] string? codigoIbge,
        CancellationToken cancellationToken = default)
    {
        var response = await municipioCatalogService.ResolveAsync(cidade, uf, codigoIbge, cancellationToken);
        return Ok(ApiResponse<MunicipioLookupDto?>.Ok(response));
    }
}
