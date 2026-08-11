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
[Route("api/entregas")]
public class EntregasController(EntregaService entregaService) : ControllerBase
{
    [HttpPost("{vendaId:guid}/configurar")]
    [RequirePermission(Permissoes.GerenciarPedidos)]
    public async Task<ActionResult<ApiResponse<PedidoEntregaDto>>> ConfigurarEntrega(Guid vendaId, [FromBody] AtualizarPedidoEntregaRequest request)
    {
        var response = await entregaService.AtualizarEntregaAsync(vendaId, request);
        return Ok(ApiResponse<PedidoEntregaDto>.Ok(response, "Entrega atualizada com sucesso."));
    }

    [AllowAnonymous]
    [HttpGet("publico/{codigoAcesso}")]
    public async Task<ActionResult<ApiResponse<PainelEntregaPublicoDto>>> GetPainelPublico(string codigoAcesso)
    {
        var response = await entregaService.GetPainelPublicoAsync(codigoAcesso);
        return Ok(ApiResponse<PainelEntregaPublicoDto>.Ok(response));
    }

    [AllowAnonymous]
    [HttpPost("publico/{codigoAcesso}/localizacao")]
    public async Task<ActionResult<ApiResponse<PainelEntregaPublicoDto>>> RegistrarLocalizacao(
        string codigoAcesso,
        [FromBody] RegistrarEntregaLocalizacaoRequest request)
    {
        var response = await entregaService.RegistrarLocalizacaoAsync(codigoAcesso, request);
        return Ok(ApiResponse<PainelEntregaPublicoDto>.Ok(response, "Localizacao recebida com sucesso."));
    }
}
