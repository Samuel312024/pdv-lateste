using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PDV.Api.Authorization;
using PDV.Api.Common;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Services;

namespace PDV.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/fiscal")]
public class FiscalController(
    FiscalCalculationService fiscalCalculationService,
    ProdutoFiscalService produtoFiscalService) : ControllerBase
{
    [HttpPost("calculos/produto")]
    [RequirePermission(Permissoes.VisualizarProduto)]
    public async Task<ActionResult<ApiResponse<FiscalCalculoProdutoResponse>>> CalcularProduto(
        [FromBody] FiscalCalculoProdutoRequest request,
        CancellationToken cancellationToken)
    {
        var response = await fiscalCalculationService.CalcularProdutoAsync(request, cancellationToken);
        return Ok(ApiResponse<FiscalCalculoProdutoResponse>.Ok(response));
    }

    [HttpGet("ncm/oficial")]
    [RequirePermission(Permissoes.VisualizarProduto)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<FiscalNcmOficialDto>>>> BuscarTabelaNcmOficial(
        [FromQuery] string? termo,
        [FromQuery] bool somenteItensFinais = false,
        CancellationToken cancellationToken = default)
    {
        var response = await produtoFiscalService.BuscarNcmsOficiaisAsync(termo, somenteItensFinais, cancellationToken);
        return Ok(ApiResponse<IReadOnlyCollection<FiscalNcmOficialDto>>.Ok(response));
    }

    [HttpPost("ncm/importar")]
    [RequirePermission(Permissoes.GerenciarEmpresaFiscal)]
    public async Task<ActionResult<ApiResponse<FiscalNcmImportacaoResultadoDto>>> ImportarTabelaNcmOficial(
        CancellationToken cancellationToken)
    {
        var response = await produtoFiscalService.ImportarTabelaNcmOficialAsync(cancellationToken);
        return Ok(ApiResponse<FiscalNcmImportacaoResultadoDto>.Ok(response, "Tabela NCM oficial importada com sucesso."));
    }
}
