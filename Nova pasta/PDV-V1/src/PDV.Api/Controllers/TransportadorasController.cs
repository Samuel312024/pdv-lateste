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
[Route("api/transportadoras")]
public class TransportadorasController(TransportadoraService transportadoraService) : ControllerBase
{
    [HttpGet]
    [RequirePermission(Permissoes.VisualizarClientes)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<TransportadoraDto>>>> GetAll([FromQuery] bool incluirInativas = false)
    {
        var response = await transportadoraService.GetAllAsync(incluirInativas);
        return Ok(ApiResponse<IReadOnlyCollection<TransportadoraDto>>.Ok(response));
    }

    [HttpPost]
    [RequirePermission(Permissoes.GerenciarClientes)]
    public async Task<ActionResult<ApiResponse<TransportadoraDto>>> Create([FromBody] TransportadoraRequest request)
    {
        var response = await transportadoraService.CreateAsync(request);
        return Ok(ApiResponse<TransportadoraDto>.Ok(response, "Transportadora criada com sucesso."));
    }

    [HttpPut("{id:guid}")]
    [RequirePermission(Permissoes.GerenciarClientes)]
    public async Task<ActionResult<ApiResponse<TransportadoraDto>>> Update(Guid id, [FromBody] TransportadoraRequest request)
    {
        var response = await transportadoraService.UpdateAsync(id, request);
        return Ok(ApiResponse<TransportadoraDto>.Ok(response, "Transportadora atualizada com sucesso."));
    }

    [HttpDelete("{id:guid}")]
    [RequirePermission(Permissoes.GerenciarClientes)]
    public async Task<ActionResult<ApiResponse<object>>> Archive(Guid id)
    {
        await transportadoraService.ArchiveAsync(id);
        return Ok(ApiResponse<object>.Ok(null, "Transportadora inativada com sucesso."));
    }
}
