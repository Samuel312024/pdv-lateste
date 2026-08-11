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
[Route("api/relatorios")]
public class RelatoriosController(RelatorioService relatorioService) : ControllerBase
{
    [HttpGet("resumo")]
    [RequirePermission(Permissoes.VisualizarRelatorios)]
    public async Task<ActionResult<ApiResponse<RelatorioResumoDto>>> GetResumo([FromQuery] RelatorioFiltroRequest filtro)
    {
        var response = await relatorioService.GetResumoAsync(filtro);
        return Ok(ApiResponse<RelatorioResumoDto>.Ok(response));
    }

    [HttpGet("faturamento")]
    [RequirePermission(Permissoes.VisualizarRelatorios)]
    public async Task<ActionResult<ApiResponse<RelatorioResumoDto>>> GetFaturamento([FromQuery] RelatorioFiltroRequest filtro)
    {
        var response = await relatorioService.GetResumoAsync(filtro);
        return Ok(ApiResponse<RelatorioResumoDto>.Ok(response));
    }

    [HttpGet("filtros")]
    [RequirePermission(Permissoes.VisualizarRelatorios)]
    public async Task<ActionResult<ApiResponse<RelatorioFiltrosOpcoesDto>>> GetFiltros()
    {
        var response = await relatorioService.GetFiltrosOpcoesAsync();
        return Ok(ApiResponse<RelatorioFiltrosOpcoesDto>.Ok(response));
    }

    [HttpGet("vendas")]
    [RequirePermission(Permissoes.VisualizarRelatorios)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<RelatorioVendaLinhaDto>>>> GetVendas([FromQuery] RelatorioFiltroRequest filtro)
    {
        var response = await relatorioService.GetVendasAsync(filtro);
        return Ok(ApiResponse<IReadOnlyCollection<RelatorioVendaLinhaDto>>.Ok(response));
    }

    [HttpGet("caixa")]
    [RequirePermission(Permissoes.VisualizarRelatorios)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<RelatorioCaixaDto>>>> GetCaixa([FromQuery] RelatorioFiltroRequest filtro)
    {
        var response = await relatorioService.GetCaixasAsync(filtro);
        return Ok(ApiResponse<IReadOnlyCollection<RelatorioCaixaDto>>.Ok(response));
    }

    [HttpGet("estoque-baixo")]
    [RequirePermission(Permissoes.VisualizarRelatorios)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<RelatorioEstoqueBaixoDto>>>> GetEstoqueBaixo([FromQuery] RelatorioFiltroRequest filtro)
    {
        var response = await relatorioService.GetEstoqueBaixoAsync(filtro);
        return Ok(ApiResponse<IReadOnlyCollection<RelatorioEstoqueBaixoDto>>.Ok(response));
    }
}
