using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using PDV.Api.Common;
using PDV.Api.DTOs;
using PDV.Api.Hubs;
using PDV.Api.Services;

namespace PDV.Api.Controllers;

[ApiController]
[Route("api/scanner-sessoes")]
public class ScannerSessoesController(
    ScannerSessaoService scannerSessaoService,
    ProdutoImagemStorageService produtoImagemStorageService,
    ProdutoImagemReconhecimentoService produtoImagemReconhecimentoService,
    IHubContext<ScannerHub> scannerHubContext) : ControllerBase
{
    [AllowAnonymous]
    [HttpPost]
    public ActionResult<ApiResponse<ScannerSessaoCriadaDto>> Criar([FromBody] CriarScannerSessaoRequest request)
    {
        var permitePdvAnonimo = User.Identity?.IsAuthenticated != true;
        if (permitePdvAnonimo && !scannerSessaoService.CanCreateAnonymousDesktopSession(request.Contexto))
        {
            throw new ForbiddenAppException("Esta sessao de scanner exige login do usuario no sistema.");
        }

        var response = scannerSessaoService.CriarSessao(request, permitePdvAnonimo);
        return Ok(ApiResponse<ScannerSessaoCriadaDto>.Ok(response, "Sessao de scanner criada com sucesso."));
    }

    [Authorize]
    [HttpGet("{sessaoId}/leituras")]
    public ActionResult<ApiResponse<IReadOnlyCollection<ScannerLeituraDto>>> GetLeituras(string sessaoId, [FromQuery] long afterSequence = 0)
    {
        var response = scannerSessaoService.GetLeituras(sessaoId, afterSequence);
        return Ok(ApiResponse<IReadOnlyCollection<ScannerLeituraDto>>.Ok(response));
    }

    [Authorize]
    [HttpGet("{sessaoId}/logs")]
    public ActionResult<ApiResponse<IReadOnlyCollection<ScannerLogDto>>> GetLogs(string sessaoId, [FromQuery] long afterSequence = 0)
    {
        var response = scannerSessaoService.GetLogs(sessaoId, afterSequence);
        return Ok(ApiResponse<IReadOnlyCollection<ScannerLogDto>>.Ok(response));
    }

    [AllowAnonymous]
    [HttpGet("{sessaoId}/publico")]
    public ActionResult<ApiResponse<ScannerSessaoPublicaDto>> GetPublico(string sessaoId, [FromQuery] string chaveAcesso)
    {
        var response = scannerSessaoService.GetSessaoPublica(sessaoId, chaveAcesso);
        return Ok(ApiResponse<ScannerSessaoPublicaDto>.Ok(response));
    }

    [AllowAnonymous]
    [HttpPost("{sessaoId}/leituras")]
    public ActionResult<ApiResponse<ScannerLeituraDto>> RegistrarLeitura(
        string sessaoId,
        [FromQuery] string chaveAcesso,
        [FromBody] ScannerLeituraRequest request)
    {
        var response = scannerSessaoService.RegistrarLeitura(sessaoId, chaveAcesso, request);
        return Ok(ApiResponse<ScannerLeituraDto>.Ok(response, "Leitura recebida com sucesso."));
    }

    [AllowAnonymous]
    [HttpPost("{sessaoId}/logs")]
    public ActionResult<ApiResponse<ScannerLogDto>> RegistrarLog(
        string sessaoId,
        [FromQuery] string chaveAcesso,
        [FromBody] ScannerLogRequest request)
    {
        var response = scannerSessaoService.RegistrarLog(sessaoId, chaveAcesso, request);
        return Ok(ApiResponse<ScannerLogDto>.Ok(response, "Log do scanner recebido com sucesso."));
    }

    [AllowAnonymous]
    [HttpPost("{sessaoId}/imagem-produto")]
    public async Task<ActionResult<ApiResponse<ProdutoImagemUploadDto>>> UploadImagemProduto(
        string sessaoId,
        [FromQuery] string chaveAcesso,
        [FromForm] IFormFile arquivo,
        [FromForm] string? termoBusca,
        CancellationToken cancellationToken)
    {
        _ = scannerSessaoService.GetSessaoPublica(sessaoId, chaveAcesso);

        var storedImage = await produtoImagemStorageService.SaveAsync(arquivo, cancellationToken);
        var recognition = await produtoImagemReconhecimentoService.IdentificarAsync(
            storedImage,
            NormalizeOptionalSearchTerm(termoBusca),
            cancellationToken);
        var normalizedSearchTerm = recognition.TermoBuscaEfetivo;
        var absoluteImageUrl = BuildAbsoluteUrl(storedImage.CaminhoRelativo);
        var response = new ProdutoImagemUploadDto(
            absoluteImageUrl,
            storedImage.NomeArquivoOriginal,
            storedImage.TamanhoBytes,
            normalizedSearchTerm,
            recognition.TermoBuscaOrigem,
            recognition.DiagnosticoReconhecimento);

        var payload = JsonSerializer.Serialize(new
        {
            kind = "product-image-capture",
            imageUrl = absoluteImageUrl,
            fileName = storedImage.NomeArquivoOriginal,
            sizeBytes = storedImage.TamanhoBytes,
            searchTerm = normalizedSearchTerm,
            searchOrigin = recognition.TermoBuscaOrigem,
            recognitionDiagnostic = recognition.DiagnosticoReconhecimento,
            source = "scanner-remoto",
            capturedAtUtc = DateTime.UtcNow
        });

        var reading = scannerSessaoService.RegistrarLeitura(
            sessaoId,
            chaveAcesso,
            new ScannerLeituraRequest(payload, "PRODUTO_IMAGEM", "Celular"));

        var realtimePayload = new ScannerCodigoEscaneadoDto(
            sessaoId,
            reading.Sequencia,
            reading.Codigo,
            reading.Formato,
            reading.Origem,
            reading.DataLeituraUtc);

        await scannerHubContext.Clients
            .Group(scannerSessaoService.GetGroupName(sessaoId))
            .SendAsync("CodigoEscaneado", realtimePayload, cancellationToken);

        return Ok(ApiResponse<ProdutoImagemUploadDto>.Ok(response, "Imagem do produto enviada ao cadastro com sucesso."));
    }

    [Authorize]
    [HttpDelete("{sessaoId}")]
    public ActionResult<ApiResponse<object>> Encerrar(string sessaoId)
    {
        scannerSessaoService.EncerrarSessao(sessaoId);
        return Ok(ApiResponse<object>.Ok(null, "Sessao de scanner encerrada."));
    }

    private string BuildAbsoluteUrl(string relativePath)
        => $"{Request.Scheme}://{Request.Host}{relativePath}";

    private static string? NormalizeOptionalSearchTerm(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
