using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PDV.Api.Authorization;
using PDV.Api.Common;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Infrastructure;
using PDV.Api.Services;

namespace PDV.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/clientes")]
public class ClientesController(
    ClienteService clienteService,
    CnpjLookupService cnpjLookupService,
    CurrentUserService currentUser,
    AuthService authService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<ClienteDto>>>> GetAll([FromQuery] string? termo)
    {
        EnsureClientDirectoryAccess();
        var response = await clienteService.GetAllAsync(termo);
        return Ok(ApiResponse<IReadOnlyCollection<ClienteDto>>.Ok(response));
    }

    [HttpGet("cnpj/{cnpj}")]
    public async Task<ActionResult<ApiResponse<CnpjLookupDto>>> BuscarCnpj(string cnpj, CancellationToken cancellationToken)
    {
        var response = await cnpjLookupService.BuscarAsync(cnpj, cancellationToken);
        return Ok(ApiResponse<CnpjLookupDto>.Ok(response));
    }

    [HttpGet("{id:guid}/historico")]
    public async Task<ActionResult<ApiResponse<ClienteHistoricoDto>>> GetHistorico(Guid id)
    {
        EnsureClientDirectoryAccess();
        var response = await clienteService.GetHistoricoAsync(id);
        return Ok(ApiResponse<ClienteHistoricoDto>.Ok(response));
    }

    [HttpPost]
    [RequirePermission(Permissoes.GerenciarClientes)]
    public async Task<ActionResult<ApiResponse<ClienteDto>>> Create([FromBody] ClienteRequest request)
    {
        var response = await clienteService.CreateAsync(request);
        return Ok(ApiResponse<ClienteDto>.Ok(response, "Cliente criado com sucesso."));
    }

    [HttpPost("perfil-comprador")]
    public async Task<ActionResult<ApiResponse<ClientePerfilCompradorResponse>>> SaveBuyerProfile([FromBody] ClientePerfilCompradorRequest request)
    {
        var cliente = await clienteService.SaveBuyerProfileAsync(request);
        var sessaoAtualizada = await authService.BuildSessionAsync(currentUser.GetUserId());
        return Ok(ApiResponse<ClientePerfilCompradorResponse>.Ok(
            new ClientePerfilCompradorResponse(cliente, sessaoAtualizada),
            "Perfil do comprador vinculado com sucesso."));
    }

    [HttpPut("{id:guid}")]
    [RequirePermission(Permissoes.GerenciarClientes)]
    public async Task<ActionResult<ApiResponse<ClienteDto>>> Update(Guid id, [FromBody] ClienteRequest request)
    {
        var response = await clienteService.UpdateAsync(id, request);
        return Ok(ApiResponse<ClienteDto>.Ok(response, "Cliente atualizado com sucesso."));
    }

    [HttpDelete("{id:guid}")]
    [RequirePermission(Permissoes.GerenciarClientes)]
    public async Task<ActionResult<ApiResponse<object>>> Delete(Guid id, [FromQuery] bool permanente = false)
    {
        if (permanente)
        {
            await clienteService.DeletePermanentlyAsync(id);
            return Ok(ApiResponse<object>.Ok(null, "Cliente excluido permanentemente com sucesso."));
        }

        await clienteService.ArchiveAsync(id);
        return Ok(ApiResponse<object>.Ok(null, "Cliente inativado com sucesso."));
    }

    private void EnsureClientDirectoryAccess()
    {
        if (currentUser.IsMasterUser()
            || currentUser.HasPermission(Permissoes.VisualizarClientes)
            || currentUser.HasPermission(Permissoes.GerenciarClientes))
        {
            return;
        }

        throw new ForbiddenAppException("Seu usuario nao possui acesso a base de clientes e fornecedores.");
    }
}
