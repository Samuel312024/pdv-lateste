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
[Route("api/terminais")]
public class TerminaisController(TerminalPdvService terminalPdvService) : ControllerBase
{
    [HttpGet]
    [RequirePermission(Permissoes.GerenciarUsuarios)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<TerminalPdvDto>>>> GetAll()
    {
        var response = await terminalPdvService.GetAllAsync();
        return Ok(ApiResponse<IReadOnlyCollection<TerminalPdvDto>>.Ok(response));
    }

    [HttpPost]
    [RequirePermission(Permissoes.GerenciarUsuarios)]
    public async Task<ActionResult<ApiResponse<TerminalPdvCriadoDto>>> Create([FromBody] CriarTerminalPdvRequest request)
    {
        var response = await terminalPdvService.CreateAsync(request);
        return Ok(ApiResponse<TerminalPdvCriadoDto>.Ok(response, "Terminal cadastrado com chave de ativacao gerada."));
    }

    [HttpPost("{id:guid}/regenerar-chave")]
    [RequirePermission(Permissoes.GerenciarUsuarios)]
    public async Task<ActionResult<ApiResponse<TerminalPdvChaveRegeneradaDto>>> RegenerateKey(Guid id)
    {
        var response = await terminalPdvService.RegenerateActivationKeyAsync(id);
        return Ok(ApiResponse<TerminalPdvChaveRegeneradaDto>.Ok(response, "Nova chave de ativacao gerada para o terminal."));
    }

    [HttpPut("{id:guid}/status")]
    [RequirePermission(Permissoes.GerenciarUsuarios)]
    public async Task<ActionResult<ApiResponse<TerminalPdvDto>>> UpdateStatus(Guid id, [FromBody] AtualizarTerminalPdvStatusRequest request)
    {
        var response = await terminalPdvService.UpdateStatusAsync(id, request);
        return Ok(ApiResponse<TerminalPdvDto>.Ok(response, "Status do terminal atualizado com sucesso."));
    }

    [AllowAnonymous]
    [HttpPost("ativar")]
    public async Task<ActionResult<ApiResponse<TerminalPdvAtivacaoDto>>> Activate([FromBody] AtivarTerminalPdvRequest request)
    {
        var response = await terminalPdvService.ActivateAsync(request);
        return Ok(ApiResponse<TerminalPdvAtivacaoDto>.Ok(response, "Terminal ativado com sucesso."));
    }
}
