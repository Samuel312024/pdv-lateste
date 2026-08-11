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
[Route("api/dashboard")]
public class DashboardController(DashboardService dashboardService) : ControllerBase
{
    [HttpGet("resumo")]
    [RequirePermission(Permissoes.VisualizarDashboard)]
    public async Task<ActionResult<ApiResponse<DashboardResumoDto>>> GetResumo()
    {
        var response = await dashboardService.GetResumoAsync();
        return Ok(ApiResponse<DashboardResumoDto>.Ok(response));
    }

    [HttpGet("vendas-por-dia")]
    [RequirePermission(Permissoes.VisualizarDashboard)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<DashboardVendasPorDiaDto>>>> GetVendasPorDia()
    {
        var response = await dashboardService.GetVendasPorDiaAsync();
        return Ok(ApiResponse<IReadOnlyCollection<DashboardVendasPorDiaDto>>.Ok(response));
    }

    [HttpGet("produtos-mais-vendidos")]
    [RequirePermission(Permissoes.VisualizarDashboard)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<DashboardProdutosMaisVendidosDto>>>> GetProdutosMaisVendidos()
    {
        var response = await dashboardService.GetProdutosMaisVendidosAsync();
        return Ok(ApiResponse<IReadOnlyCollection<DashboardProdutosMaisVendidosDto>>.Ok(response));
    }

    [HttpGet("vendas-por-forma-pagamento")]
    [RequirePermission(Permissoes.VisualizarDashboard)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<DashboardVendasPorPagamentoDto>>>> GetVendasPorFormaPagamento()
    {
        var response = await dashboardService.GetVendasPorPagamentoAsync();
        return Ok(ApiResponse<IReadOnlyCollection<DashboardVendasPorPagamentoDto>>.Ok(response));
    }

    [HttpGet("monitor-operacional")]
    [RequirePermission(Permissoes.VisualizarMonitorOperacional)]
    public async Task<ActionResult<ApiResponse<MonitorOperacionalSnapshotDto>>> GetMonitorOperacional()
    {
        var response = await dashboardService.GetMonitorOperacionalAsync();
        return Ok(ApiResponse<MonitorOperacionalSnapshotDto>.Ok(response));
    }
}
