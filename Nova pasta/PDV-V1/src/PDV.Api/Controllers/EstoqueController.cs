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
[Route("api/estoque")]
public class EstoqueController(EstoqueService estoqueService) : ControllerBase
{
    [HttpGet("movimentacoes")]
    [RequirePermission(Permissoes.VisualizarRelatorios)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<MovimentacaoEstoqueDto>>>> GetMovimentacoes(
        [FromQuery] Guid? produtoId,
        [FromQuery] DateTime? dataInicial,
        [FromQuery] DateTime? dataFinal)
    {
        var response = await estoqueService.GetMovimentacoesAsync(produtoId, dataInicial, dataFinal);
        return Ok(ApiResponse<IReadOnlyCollection<MovimentacaoEstoqueDto>>.Ok(response));
    }

    [HttpGet("lotes/alertas")]
    [RequirePermission(Permissoes.VisualizarProduto)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<EstoqueLoteAlertaDto>>>> GetLotesComAlerta(
        [FromQuery] int diasLimite = 30)
    {
        var response = await estoqueService.GetLotesComAlertaAsync(diasLimite);
        return Ok(ApiResponse<IReadOnlyCollection<EstoqueLoteAlertaDto>>.Ok(response));
    }

    [HttpGet("depositos")]
    [RequirePermission(Permissoes.VisualizarProduto)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<DepositoEstoqueResumoDto>>>> GetDepositos()
    {
        var response = await estoqueService.GetDepositosResumoAsync();
        return Ok(ApiResponse<IReadOnlyCollection<DepositoEstoqueResumoDto>>.Ok(response));
    }

    [HttpGet("produtos/{produtoId:guid}/depositos")]
    [RequirePermission(Permissoes.VisualizarProduto)]
    public async Task<ActionResult<ApiResponse<PosicaoEstoqueProdutoDto>>> GetDepositosProduto(Guid produtoId)
    {
        var response = await estoqueService.GetPosicaoProdutoAsync(produtoId);
        return Ok(ApiResponse<PosicaoEstoqueProdutoDto>.Ok(response));
    }

    [HttpPost("ajuste")]
    [RequirePermission(Permissoes.EditarProduto)]
    public async Task<ActionResult<ApiResponse<MovimentacaoEstoqueDto>>> Ajuste([FromBody] AjusteEstoqueRequest request)
    {
        var response = await estoqueService.AjustarAsync(request);
        return Ok(ApiResponse<MovimentacaoEstoqueDto>.Ok(response, "Ajuste de estoque realizado com sucesso."));
    }

    [HttpGet("produtos/{produtoId:guid}/lotes")]
    [RequirePermission(Permissoes.VisualizarProduto)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<EstoqueLoteDto>>>> GetLotesProduto(
        Guid produtoId,
        [FromQuery] bool apenasComSaldo = false)
    {
        var response = await estoqueService.GetLotesProdutoAsync(produtoId, apenasComSaldo);
        return Ok(ApiResponse<IReadOnlyCollection<EstoqueLoteDto>>.Ok(response));
    }

    [HttpPost("lotes/entrada")]
    [RequirePermission(Permissoes.EditarProduto)]
    public async Task<ActionResult<ApiResponse<EstoqueLoteDto>>> RegistrarEntradaLote([FromBody] RegistrarEntradaLoteRequest request)
    {
        var response = await estoqueService.RegistrarEntradaLoteAsync(request);
        return Ok(ApiResponse<EstoqueLoteDto>.Ok(response, "Entrada de lote registrada com sucesso."));
    }

    [HttpPost("recebimentos")]
    [RequirePermission(Permissoes.EditarProduto)]
    public async Task<ActionResult<ApiResponse<MovimentacaoEstoqueDto>>> RegistrarRecebimento([FromBody] RegistrarRecebimentoEstoqueRequest request)
    {
        var response = await estoqueService.RegistrarRecebimentoAsync(request);
        return Ok(ApiResponse<MovimentacaoEstoqueDto>.Ok(response, "Recebimento de estoque registrado com sucesso."));
    }

    [HttpPost("reservas")]
    [RequirePermission(Permissoes.EditarProduto)]
    public async Task<ActionResult<ApiResponse<MovimentacaoEstoqueDto>>> Reservar([FromBody] ReservarEstoqueRequest request)
    {
        var response = await estoqueService.ReservarAsync(request);
        return Ok(ApiResponse<MovimentacaoEstoqueDto>.Ok(response, "Reserva de estoque registrada com sucesso."));
    }

    [HttpPost("reservas/liberacao")]
    [RequirePermission(Permissoes.EditarProduto)]
    public async Task<ActionResult<ApiResponse<MovimentacaoEstoqueDto>>> LiberarReserva([FromBody] LiberarReservaEstoqueRequest request)
    {
        var response = await estoqueService.LiberarReservaAsync(request);
        return Ok(ApiResponse<MovimentacaoEstoqueDto>.Ok(response, "Reserva liberada com sucesso."));
    }

    [HttpPost("transferencias")]
    [RequirePermission(Permissoes.EditarProduto)]
    public async Task<ActionResult<ApiResponse<TransferenciaEstoqueDto>>> Transferir([FromBody] TransferirEstoqueRequest request)
    {
        var response = await estoqueService.TransferirAsync(request);
        return Ok(ApiResponse<TransferenciaEstoqueDto>.Ok(response, "Transferencia interna registrada com sucesso."));
    }

    [HttpPost("expedicoes")]
    [RequirePermission(Permissoes.EditarProduto)]
    public async Task<ActionResult<ApiResponse<MovimentacaoEstoqueDto>>> RegistrarExpedicao([FromBody] RegistrarExpedicaoEstoqueRequest request)
    {
        var response = await estoqueService.RegistrarExpedicaoAsync(request);
        return Ok(ApiResponse<MovimentacaoEstoqueDto>.Ok(response, "Expedicao registrada com sucesso."));
    }

    [HttpPost("conferencias")]
    [RequirePermission(Permissoes.EditarProduto)]
    public async Task<ActionResult<ApiResponse<ConferenciaEstoqueResultadoDto>>> Conferir([FromBody] ConferirEstoqueRequest request)
    {
        var response = await estoqueService.ConferirAsync(request);
        return Ok(ApiResponse<ConferenciaEstoqueResultadoDto>.Ok(response, "Conferencia de estoque registrada com sucesso."));
    }
}
