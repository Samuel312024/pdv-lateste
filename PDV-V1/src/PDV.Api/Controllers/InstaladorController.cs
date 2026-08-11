using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PDV.Api.Common;
using PDV.Api.DTOs;
using PDV.Api.Services;

namespace PDV.Api.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/instalador/pdv")]
public class InstaladorController(InstaladorPdvService instaladorPdvService) : ControllerBase
{
    [HttpGet("status")]
    public ActionResult<ApiResponse<InstaladorPdvStatusDto>> GetStatus()
    {
        var status = instaladorPdvService.GetStatus(ResolveDownloadUrl());
        return Ok(ApiResponse<InstaladorPdvStatusDto>.Ok(status));
    }

    [HttpGet("download")]
    public IActionResult Download()
    {
        var filePath = instaladorPdvService.ResolveInstallerPath();
        if (filePath is null)
        {
            throw new NotFoundException("O instalador do PDV ainda nao foi publicado neste servidor.");
        }

        return PhysicalFile(
            filePath,
            "application/octet-stream",
            InstaladorPdvService.NomeArquivoInstalador,
            enableRangeProcessing: true);
    }

    private string ResolveDownloadUrl()
        => Url.ActionLink(nameof(Download), values: null) ?? "/api/instalador/pdv/download";
}
