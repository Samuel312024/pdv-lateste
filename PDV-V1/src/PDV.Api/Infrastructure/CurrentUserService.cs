using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using PDV.Api.Common;

namespace PDV.Api.Infrastructure;

public class CurrentUserService(IHttpContextAccessor httpContextAccessor)
{
    private ClaimsPrincipal User => httpContextAccessor.HttpContext?.User
        ?? throw new UnauthorizedAppException("Usuario nao autenticado.");

    public Guid GetUserId()
    {
        var value = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(value, out var id)
            ? id
            : throw new UnauthorizedAppException("Identificador do usuario nao encontrado.");
    }

    public Guid GetEmpresaId()
    {
        var value = User.FindFirstValue(ClaimNames.EmpresaId);
        return Guid.TryParse(value, out var id)
            ? id
            : throw new UnauthorizedAppException("Identificador da empresa nao encontrado.");
    }

    public Guid? GetClienteId()
    {
        var value = User.FindFirstValue(ClaimNames.ClienteId);
        return Guid.TryParse(value, out var id) ? id : null;
    }

    public string GetPerfil()
        => User.FindFirstValue(ClaimTypes.Role)
            ?? throw new UnauthorizedAppException("Perfil do usuario nao encontrado.");

    public string GetEmail()
        => User.FindFirstValue(ClaimTypes.Email)
            ?? throw new UnauthorizedAppException("E-mail do usuario nao encontrado.");

    public bool IsMasterUser()
        => string.Equals(GetEmail(), PDV.Api.Domain.UsuariosSistema.MasterEmail, StringComparison.OrdinalIgnoreCase);

    public bool HasOperationalAccess()
        => string.Equals(
            User.FindFirstValue(ClaimNames.AccessMode),
            AccessModes.Operacional,
            StringComparison.OrdinalIgnoreCase);

    public bool HasPermission(string permission)
        => User.Claims.Any(claim => claim.Type == ClaimNames.Permission && claim.Value == permission);

    public string? GetIpAddress()
    {
        var context = httpContextAccessor.HttpContext;
        if (context is null)
        {
            return null;
        }

        var forwardedFor = context.Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(forwardedFor))
        {
            return forwardedFor.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).FirstOrDefault();
        }

        return context.Connection.RemoteIpAddress?.ToString();
    }
}
