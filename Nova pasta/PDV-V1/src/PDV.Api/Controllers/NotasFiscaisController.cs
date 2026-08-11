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
[Route("api/notas-fiscais")]
public class NotasFiscaisController(NotaFiscalService notaFiscalService) : ControllerBase
{
    [HttpGet]
    [RequirePermission(Permissoes.VisualizarNotasFiscais)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<NotaFiscalResumoDto>>>> GetAll()
    {
        var response = await notaFiscalService.GetAllAsync();
        return Ok(ApiResponse<IReadOnlyCollection<NotaFiscalResumoDto>>.Ok(response));
    }

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissoes.VisualizarNotasFiscais)]
    public async Task<ActionResult<ApiResponse<NotaFiscalDto>>> GetById(Guid id)
    {
        var response = await notaFiscalService.GetByIdAsync(id);
        return Ok(ApiResponse<NotaFiscalDto>.Ok(response));
    }

    [HttpGet("vendas-disponiveis")]
    [RequirePermission(Permissoes.VisualizarNotasFiscais)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<NotaFiscalVendaDisponivelDto>>>> GetVendasDisponiveis([FromQuery] string? termo)
    {
        var response = await notaFiscalService.GetVendasDisponiveisAsync(termo);
        return Ok(ApiResponse<IReadOnlyCollection<NotaFiscalVendaDisponivelDto>>.Ok(response));
    }

    [HttpPost("emitir/venda/{vendaId:guid}")]
    [RequirePermission(Permissoes.EmitirNotasFiscais)]
    public async Task<ActionResult<ApiResponse<NotaFiscalDto>>> EmitirPorVenda(Guid vendaId, [FromBody] EmitirNotaFiscalVendaRequest request)
    {
        var response = await notaFiscalService.EmitirPorVendaAsync(vendaId, request);
        return Ok(ApiResponse<NotaFiscalDto>.Ok(response, "NF-e gerada com sucesso."));
    }

    [HttpPost("{id:guid}/transmitir")]
    [RequirePermission(Permissoes.EmitirNotasFiscais)]
    public async Task<ActionResult<ApiResponse<TransmitirNotaFiscalResponse>>> Transmitir(Guid id, CancellationToken cancellationToken)
    {
        var response = await notaFiscalService.TransmitirAsync(id, cancellationToken);
        return Ok(ApiResponse<TransmitirNotaFiscalResponse>.Ok(response, response.Mensagem));
    }

    [HttpPost("{id:guid}/sincronizar")]
    [RequirePermission(Permissoes.EmitirNotasFiscais)]
    public async Task<ActionResult<ApiResponse<NotaFiscalOperacaoResponse>>> Sincronizar(Guid id, CancellationToken cancellationToken)
    {
        var response = await notaFiscalService.SincronizarAsync(id, cancellationToken);
        return Ok(ApiResponse<NotaFiscalOperacaoResponse>.Ok(response, response.Mensagem));
    }

    [HttpPost("{id:guid}/cancelar")]
    [RequirePermission(Permissoes.EmitirNotasFiscais)]
    public async Task<ActionResult<ApiResponse<NotaFiscalOperacaoResponse>>> Cancelar(Guid id, [FromBody] CancelarNotaFiscalRequest request, CancellationToken cancellationToken)
    {
        var response = await notaFiscalService.CancelarAsync(id, request, cancellationToken);
        return Ok(ApiResponse<NotaFiscalOperacaoResponse>.Ok(response, response.Mensagem));
    }

    [HttpPost("{id:guid}/carta-correcao")]
    [RequirePermission(Permissoes.EmitirNotasFiscais)]
    public async Task<ActionResult<ApiResponse<NotaFiscalOperacaoResponse>>> SolicitarCartaCorrecao(Guid id, [FromBody] CartaCorrecaoNotaFiscalRequest request, CancellationToken cancellationToken)
    {
        var response = await notaFiscalService.SolicitarCartaCorrecaoAsync(id, request, cancellationToken);
        return Ok(ApiResponse<NotaFiscalOperacaoResponse>.Ok(response, response.Mensagem));
    }

    [HttpPost("{id:guid}/email")]
    [RequirePermission(Permissoes.EmitirNotasFiscais)]
    public async Task<ActionResult<ApiResponse<NotaFiscalEmailResponse>>> EnviarEmail(Guid id, [FromBody] EnviarEmailNotaFiscalRequest request, CancellationToken cancellationToken)
    {
        var response = await notaFiscalService.EnviarEmailAsync(id, request, cancellationToken);
        return Ok(ApiResponse<NotaFiscalEmailResponse>.Ok(response, response.Mensagem));
    }

    [HttpGet("{id:guid}/documento")]
    [RequirePermission(Permissoes.VisualizarNotasFiscais)]
    public async Task<ActionResult<ApiResponse<NotaFiscalDownloadDocumentoDto>>> BaixarDocumento(Guid id, [FromQuery] BaixarNotaFiscalDocumentoRequest request, CancellationToken cancellationToken)
    {
        var response = await notaFiscalService.BaixarDocumentoAsync(id, request, cancellationToken);
        return Ok(ApiResponse<NotaFiscalDownloadDocumentoDto>.Ok(response, response.Mensagem));
    }

    [HttpPost("inutilizacoes")]
    [RequirePermission(Permissoes.EmitirNotasFiscais)]
    public async Task<ActionResult<ApiResponse<NotaFiscalInutilizacaoResponse>>> InutilizarNumeracao([FromBody] InutilizarNotaFiscalNumeracaoRequest request, CancellationToken cancellationToken)
    {
        var response = await notaFiscalService.InutilizarNumeracaoAsync(request, cancellationToken);
        return Ok(ApiResponse<NotaFiscalInutilizacaoResponse>.Ok(response, response.Mensagem));
    }
}
