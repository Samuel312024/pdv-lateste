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
[Route("api/financeiro")]
public class FinanceiroController(FinanceiroService financeiroService) : ControllerBase
{
    [HttpGet("resumo")]
    [RequirePermission(Permissoes.VisualizarFinanceiro)]
    public async Task<ActionResult<ApiResponse<FinanceiroResumoDto>>> GetResumo([FromQuery] FinanceiroFiltroRequest filtro)
    {
        var response = await financeiroService.GetResumoAsync(filtro);
        return Ok(ApiResponse<FinanceiroResumoDto>.Ok(response));
    }

    [HttpGet("lancamentos")]
    [RequirePermission(Permissoes.VisualizarFinanceiro)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<LancamentoFinanceiroDto>>>> GetLancamentos([FromQuery] FinanceiroFiltroRequest filtro)
    {
        var response = await financeiroService.GetLancamentosAsync(filtro);
        return Ok(ApiResponse<IReadOnlyCollection<LancamentoFinanceiroDto>>.Ok(response));
    }

    [HttpPost("contas-receber")]
    [RequirePermission(Permissoes.GerenciarFinanceiro)]
    public async Task<ActionResult<ApiResponse<LancamentoFinanceiroDto>>> CriarContaReceber([FromBody] CriarLancamentoFinanceiroRequest request)
    {
        var response = await financeiroService.CriarContaReceberAsync(request);
        return Ok(ApiResponse<LancamentoFinanceiroDto>.Ok(response, "Conta a receber criada com sucesso."));
    }

    [HttpPost("contas-pagar")]
    [RequirePermission(Permissoes.GerenciarFinanceiro)]
    public async Task<ActionResult<ApiResponse<LancamentoFinanceiroDto>>> CriarContaPagar([FromBody] CriarLancamentoFinanceiroRequest request)
    {
        var response = await financeiroService.CriarContaPagarAsync(request);
        return Ok(ApiResponse<LancamentoFinanceiroDto>.Ok(response, "Conta a pagar criada com sucesso."));
    }

    [HttpPost("lancamentos/{id:guid}/liquidar")]
    [RequirePermission(Permissoes.GerenciarFinanceiro)]
    public async Task<ActionResult<ApiResponse<LancamentoFinanceiroDto>>> Liquidar(Guid id, [FromBody] LiquidarLancamentoFinanceiroRequest request)
    {
        var response = await financeiroService.LiquidarAsync(id, request);
        return Ok(ApiResponse<LancamentoFinanceiroDto>.Ok(response, "Lancamento financeiro liquidado com sucesso."));
    }
}
