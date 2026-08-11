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
[Route("api/empresa")]
public class EmpresaController(EmpresaService empresaService) : ControllerBase
{
    [HttpGet("fiscal")]
    [RequirePermission(Permissoes.GerenciarEmpresaFiscal)]
    public async Task<ActionResult<ApiResponse<EmpresaFiscalDto>>> GetFiscal()
    {
        var response = await empresaService.GetFiscalAsync();
        return Ok(ApiResponse<EmpresaFiscalDto>.Ok(response));
    }

    [HttpPut("fiscal")]
    [RequirePermission(Permissoes.GerenciarEmpresaFiscal)]
    public async Task<ActionResult<ApiResponse<EmpresaFiscalDto>>> UpdateFiscal([FromBody] EmpresaFiscalRequest request)
    {
        var response = await empresaService.UpdateFiscalAsync(request);
        return Ok(ApiResponse<EmpresaFiscalDto>.Ok(response, "Configuracao fiscal da empresa salva com sucesso."));
    }

    [HttpPost("fiscal/certificado")]
    [RequirePermission(Permissoes.GerenciarEmpresaFiscal)]
    public async Task<ActionResult<ApiResponse<EmpresaFiscalCertificadoUploadDto>>> UploadFiscalCertificate([FromForm] IFormFile arquivo, CancellationToken cancellationToken)
    {
        var response = await empresaService.UploadFiscalCertificateAsync(arquivo, cancellationToken);
        return Ok(ApiResponse<EmpresaFiscalCertificadoUploadDto>.Ok(
            response,
            "Certificado digital enviado com sucesso. Revise a senha e salve a configuracao fiscal."));
    }

    [HttpPost("fiscal/certificado/teste")]
    [RequirePermission(Permissoes.GerenciarEmpresaFiscal)]
    public async Task<ActionResult<ApiResponse<EmpresaFiscalCertificadoTesteDto>>> TestFiscalCertificate(
        [FromBody] EmpresaFiscalCertificadoTesteRequest request,
        CancellationToken cancellationToken)
    {
        var response = await empresaService.TestFiscalCertificateAsync(request, cancellationToken);
        return Ok(ApiResponse<EmpresaFiscalCertificadoTesteDto>.Ok(
            response,
            response.Valido && response.ProvavelmenteCompativelIcpBrasilA1
                ? "Teste do certificado digital concluido com sucesso."
                : response.Valido
                    ? "O teste local do certificado foi concluido, mas ainda existem alertas de compatibilidade."
                    : "O teste do certificado digital encontrou pendencias."));
    }

    [HttpPost("fiscal/sefaz/status")]
    [RequirePermission(Permissoes.GerenciarEmpresaFiscal)]
    public async Task<ActionResult<ApiResponse<EmpresaFiscalSefazStatusDto>>> TestSefazStatus(CancellationToken cancellationToken)
    {
        var response = await empresaService.TestSefazStatusAsync(cancellationToken);
        return Ok(ApiResponse<EmpresaFiscalSefazStatusDto>.Ok(
            response,
            response.Disponivel
                ? "Consulta de status da SEFAZ concluida com sucesso."
                : "A consulta de status da SEFAZ encontrou pendencias ou indisponibilidade."));
    }
}
