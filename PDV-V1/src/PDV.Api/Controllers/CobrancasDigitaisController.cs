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
[Route("api/cobrancas-digitais")]
public class CobrancasDigitaisController(CobrancaDigitalService cobrancaDigitalService) : ControllerBase
{
    [HttpGet]
    [RequirePermission(Permissoes.VisualizarFinanceiro)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<CobrancaDigitalDto>>>> GetAll([FromQuery] CobrancaDigitalFiltroRequest filtro)
    {
        var response = await cobrancaDigitalService.GetAllAsync(filtro);
        return Ok(ApiResponse<IReadOnlyCollection<CobrancaDigitalDto>>.Ok(response));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ApiResponse<CobrancaDigitalDto>>> GetById(Guid id, [FromQuery] bool sincronizar = false, CancellationToken cancellationToken = default)
    {
        var response = await cobrancaDigitalService.GetByIdAsync(id, sincronizar, cancellationToken);
        return Ok(ApiResponse<CobrancaDigitalDto>.Ok(response));
    }

    [HttpPost("checkout")]
    public async Task<ActionResult<ApiResponse<CobrancaDigitalDto>>> CriarCheckout(
        [FromBody] CriarCobrancaDigitalCheckoutRequest request,
        CancellationToken cancellationToken)
    {
        var response = await cobrancaDigitalService.CriarCheckoutAsync(request, cancellationToken);
        return Ok(ApiResponse<CobrancaDigitalDto>.Ok(response, "Cobranca digital do checkout criada com sucesso."));
    }

    [HttpPost("financeiro")]
    [RequirePermission(Permissoes.GerenciarFinanceiro)]
    public async Task<ActionResult<ApiResponse<CobrancaDigitalDto>>> CriarFinanceiro(
        [FromBody] CriarCobrancaDigitalFinanceiroRequest request,
        CancellationToken cancellationToken)
    {
        var response = await cobrancaDigitalService.CriarFinanceiroAsync(request, cancellationToken);
        return Ok(ApiResponse<CobrancaDigitalDto>.Ok(response, "Cobranca digital criada com sucesso."));
    }
}
