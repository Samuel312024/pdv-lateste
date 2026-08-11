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
[Route("api/usuarios")]
public class UsuariosController(UsuarioService usuarioService) : ControllerBase
{
    [HttpGet]
    [RequirePermission(Permissoes.GerenciarUsuarios)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<UsuarioDto>>>> GetAll([FromQuery] string? termo, [FromQuery] bool? somenteAtivos)
    {
        var response = await usuarioService.GetAllAsync(termo, somenteAtivos);
        return Ok(ApiResponse<IReadOnlyCollection<UsuarioDto>>.Ok(response));
    }

    [HttpGet("perfis")]
    [RequirePermission(Permissoes.GerenciarUsuarios)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<PerfilOpcaoDto>>>> GetPerfis()
    {
        var response = await usuarioService.GetPerfisAsync();
        return Ok(ApiResponse<IReadOnlyCollection<PerfilOpcaoDto>>.Ok(response));
    }

    [HttpGet("permissoes")]
    [RequirePermission(Permissoes.GerenciarUsuarios)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<PermissaoOpcaoDto>>>> GetPermissoes()
    {
        var response = await usuarioService.GetPermissoesAsync();
        return Ok(ApiResponse<IReadOnlyCollection<PermissaoOpcaoDto>>.Ok(response));
    }

    [HttpGet("clientes-vinculo")]
    [RequirePermission(Permissoes.GerenciarUsuarios)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<UsuarioClienteVinculoDto>>>> GetClientesVinculo()
    {
        var response = await usuarioService.GetClientesVinculoAsync();
        return Ok(ApiResponse<IReadOnlyCollection<UsuarioClienteVinculoDto>>.Ok(response));
    }

    [HttpGet("entregadores")]
    [RequirePermission(Permissoes.VisualizarPedidos)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<UsuarioEntregadorDto>>>> GetEntregadores()
    {
        var response = await usuarioService.GetDeliveryUsersAsync();
        return Ok(ApiResponse<IReadOnlyCollection<UsuarioEntregadorDto>>.Ok(response));
    }

    [HttpGet("sugestao-cracha")]
    [RequirePermission(Permissoes.GerenciarUsuarios)]
    public async Task<ActionResult<ApiResponse<UsuarioCrachaSugestaoDto>>> GetCrachaSuggestion([FromQuery] Guid perfilId)
    {
        var response = await usuarioService.GetBadgeSuggestionAsync(perfilId);
        return Ok(ApiResponse<UsuarioCrachaSugestaoDto>.Ok(response));
    }

    [HttpPost]
    [RequirePermission(Permissoes.GerenciarUsuarios)]
    public async Task<ActionResult<ApiResponse<UsuarioDto>>> Create([FromBody] UsuarioRequest request)
    {
        var response = await usuarioService.CreateAsync(request);
        return Ok(ApiResponse<UsuarioDto>.Ok(response, "Usuario criado com sucesso."));
    }

    [HttpPut("{id:guid}")]
    [RequirePermission(Permissoes.GerenciarUsuarios)]
    public async Task<ActionResult<ApiResponse<UsuarioDto>>> Update(Guid id, [FromBody] UsuarioRequest request)
    {
        var response = await usuarioService.UpdateAsync(id, request);
        return Ok(ApiResponse<UsuarioDto>.Ok(response, "Usuario atualizado com sucesso."));
    }

    [HttpDelete("{id:guid}")]
    [RequirePermission(Permissoes.GerenciarUsuarios)]
    public async Task<ActionResult<ApiResponse<object>>> Delete(Guid id, [FromQuery] bool permanente = false)
    {
        if (permanente)
        {
            await usuarioService.DeletePermanentlyAsync(id);
            return Ok(ApiResponse<object>.Ok(null, "Usuario excluido permanentemente com sucesso."));
        }

        await usuarioService.ArchiveAsync(id);
        return Ok(ApiResponse<object>.Ok(null, "Usuario inativado com sucesso."));
    }
}
