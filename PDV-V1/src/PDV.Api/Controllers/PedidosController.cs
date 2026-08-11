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
[Route("api/pedidos")]
public class PedidosController(PedidoService pedidoService) : ControllerBase
{
    [HttpGet]
    [RequirePermission(Permissoes.VisualizarPedidos)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<PedidoResumoDto>>>> GetAll(
        [FromQuery] string? status,
        [FromQuery] string? atendimento,
        [FromQuery] string? termo)
    {
        var response = await pedidoService.GetAllAsync(status, atendimento, termo);
        return Ok(ApiResponse<IReadOnlyCollection<PedidoResumoDto>>.Ok(response));
    }

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissoes.VisualizarPedidos)]
    public async Task<ActionResult<ApiResponse<PedidoDetalheDto>>> GetById(Guid id)
    {
        var response = await pedidoService.GetByIdAsync(id);
        return Ok(ApiResponse<PedidoDetalheDto>.Ok(response));
    }

    [HttpPost("{id:guid}/status")]
    [RequirePermission(Permissoes.GerenciarPedidos)]
    public async Task<ActionResult<ApiResponse<PedidoDetalheDto>>> AtualizarStatus(Guid id, [FromBody] AtualizarPedidoStatusRequest request)
    {
        var response = await pedidoService.AtualizarStatusAsync(id, request);
        return Ok(ApiResponse<PedidoDetalheDto>.Ok(response, "Status do pedido atualizado com sucesso."));
    }

    [HttpGet("meus")]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<PedidoResumoDto>>>> GetMine()
    {
        var response = await pedidoService.GetMineAsync();
        return Ok(ApiResponse<IReadOnlyCollection<PedidoResumoDto>>.Ok(response));
    }

    [HttpGet("meus/{id:guid}")]
    public async Task<ActionResult<ApiResponse<PedidoDetalheDto>>> GetMineById(Guid id)
    {
        var response = await pedidoService.GetMineByIdAsync(id);
        return Ok(ApiResponse<PedidoDetalheDto>.Ok(response));
    }

    [HttpGet("entregador")]
    [RequirePermission(Permissoes.AcessarPainelEntregador)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<PedidoResumoDto>>>> GetAssignedDeliveries()
    {
        var response = await pedidoService.GetAssignedDeliveriesAsync();
        return Ok(ApiResponse<IReadOnlyCollection<PedidoResumoDto>>.Ok(response));
    }

    [HttpGet("entregador/{id:guid}")]
    [RequirePermission(Permissoes.AcessarPainelEntregador)]
    public async Task<ActionResult<ApiResponse<PedidoDetalheDto>>> GetAssignedDeliveryById(Guid id)
    {
        var response = await pedidoService.GetAssignedDeliveryByIdAsync(id);
        return Ok(ApiResponse<PedidoDetalheDto>.Ok(response));
    }
}
