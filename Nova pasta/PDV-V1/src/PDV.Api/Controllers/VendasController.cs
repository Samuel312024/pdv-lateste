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
[Route("api/vendas")]
public class VendasController(VendaService vendaService) : ControllerBase
{
    [HttpPost("finalizar")]
    public async Task<ActionResult<ApiResponse<FinalizarVendaResponse>>> Finalizar([FromBody] FinalizarVendaRequest request)
    {
        var response = await vendaService.FinalizarAsync(request);
        return Ok(ApiResponse<FinalizarVendaResponse>.Ok(response, "Venda finalizada com sucesso."));
    }

    [HttpGet]
    [RequirePermission(Permissoes.VisualizarVendas)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<VendaDto>>>> GetAll()
    {
        var response = await vendaService.GetAllAsync();
        return Ok(ApiResponse<IReadOnlyCollection<VendaDto>>.Ok(response));
    }

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissoes.VisualizarVendas)]
    public async Task<ActionResult<ApiResponse<VendaDto>>> GetById(Guid id)
    {
        var response = await vendaService.GetByIdAsync(id);
        return Ok(ApiResponse<VendaDto>.Ok(response));
    }

    [HttpPost("{id:guid}/cancelar")]
    [RequirePermission(Permissoes.CancelarVenda)]
    public async Task<ActionResult<ApiResponse<VendaDto>>> Cancelar(Guid id, [FromBody] CancelarVendaRequest request)
    {
        var response = await vendaService.CancelarAsync(id, request);
        return Ok(ApiResponse<VendaDto>.Ok(response, "Venda cancelada com sucesso."));
    }
}
