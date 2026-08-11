using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PDV.Api.Common;
using PDV.Api.DTOs;
using PDV.Api.Services;

namespace PDV.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/caixa")]
public class CaixaController(CaixaService caixaService) : ControllerBase
{
    [HttpGet("aberto")]
    public async Task<ActionResult<ApiResponse<CaixaDto?>>> GetOpen()
    {
        var response = await caixaService.GetOpenAsync();
        return Ok(ApiResponse<CaixaDto?>.Ok(response, response is null ? "Nenhum caixa aberto encontrado." : "Caixa aberto encontrado."));
    }

    [HttpGet("checkout-disponivel")]
    public async Task<ActionResult<ApiResponse<CheckoutDisponibilidadeDto>>> GetCheckoutDisponivel()
    {
        var response = await caixaService.GetCheckoutDisponibilidadeAsync();
        return Ok(ApiResponse<CheckoutDisponibilidadeDto>.Ok(response));
    }

    [HttpPost("abrir")]
    public async Task<ActionResult<ApiResponse<CaixaDto>>> Abrir([FromBody] AbrirCaixaRequest request)
    {
        var response = await caixaService.AbrirAsync(request);
        return Ok(ApiResponse<CaixaDto>.Ok(response, "Caixa aberto com sucesso."));
    }

    [HttpPost("fechar")]
    public async Task<ActionResult<ApiResponse<CaixaDto>>> Fechar([FromBody] FecharCaixaRequest request)
    {
        var response = await caixaService.FecharAsync(request);
        return Ok(ApiResponse<CaixaDto>.Ok(response, "Caixa fechado com sucesso."));
    }

    [HttpPost("sangria")]
    public async Task<ActionResult<ApiResponse<CaixaDto>>> Sangria([FromBody] MovimentoCaixaRequest request)
    {
        var response = await caixaService.SangriaAsync(request);
        return Ok(ApiResponse<CaixaDto>.Ok(response, "Sangria registrada com sucesso."));
    }

    [HttpPost("suprimento")]
    public async Task<ActionResult<ApiResponse<CaixaDto>>> Suprimento([FromBody] MovimentoCaixaRequest request)
    {
        var response = await caixaService.SuprimentoAsync(request);
        return Ok(ApiResponse<CaixaDto>.Ok(response, "Suprimento registrado com sucesso."));
    }
}
