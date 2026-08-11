using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using PDV.Api.Common;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Infrastructure;

namespace PDV.Api.Services;

public class AuthService(
    AppDbContext dbContext,
    IPasswordHasher<Usuario> passwordHasher,
    TokenService tokenService,
    IHttpContextAccessor httpContextAccessor,
    UserPresenceService userPresenceService)
{
    public async Task<LoginResponse> LoginAsync(LoginRequest request)
    {
        var normalizedEmail = string.IsNullOrWhiteSpace(request.Email)
            ? null
            : request.Email.Trim().ToLowerInvariant();
        var normalizedCracha = string.IsNullOrWhiteSpace(request.CodigoBarrasCracha)
            ? null
            : BadgeCodeResolver.Normalize(request.CodigoBarrasCracha);
        var crachaCandidates = normalizedCracha is null
            ? []
            : BadgeCodeResolver.BuildCandidates(normalizedCracha);

        if ((normalizedEmail is null && normalizedCracha is null) || string.IsNullOrWhiteSpace(request.Senha))
        {
            throw new UnauthorizedAppException("Cracha, e-mail ou senha invalidos.");
        }

        var usuario = crachaCandidates.Length > 0
            ? await BuildSessionQuery()
                .FirstOrDefaultAsync(item => item.CodigoBarrasCracha != null && crachaCandidates.Contains(item.CodigoBarrasCracha))
            : await BuildSessionQuery()
                .FirstOrDefaultAsync(item => item.Email == normalizedEmail);

        if (usuario is null)
        {
            throw new UnauthorizedAppException("Cracha, e-mail ou senha invalidos.");
        }

        var passwordVerification = passwordHasher.VerifyHashedPassword(usuario, usuario.SenhaHash, request.Senha);
        if (passwordVerification == PasswordVerificationResult.Failed)
        {
            throw new UnauthorizedAppException("Cracha, e-mail ou senha invalidos.");
        }

        return await CreateLoginResponseAsync(
            usuario,
            registrarLogDeLogin: true,
            acessoOperacional: normalizedCracha is not null);
    }

    public async Task<LoginResponse> BuildSessionAsync(Guid usuarioId)
    {
        var usuario = await BuildSessionQuery()
            .FirstOrDefaultAsync(item => item.UsuarioId == usuarioId)
            ?? throw new UnauthorizedAppException("Usuario nao encontrado para atualizar a sessao.");

        return await CreateLoginResponseAsync(
            usuario,
            registrarLogDeLogin: false,
            acessoOperacional: ResolveCurrentOperationalAccess());
    }

    private static string[] ResolvePermissoes(Usuario usuario, bool isMaster)
    {
        if (isMaster)
        {
            return Permissoes.All
                .OrderBy(item => item)
                .ToArray();
        }

        var permissoes = usuario.UsarPermissoesCustomizadas
            ? usuario.UsuarioPermissoes.Select(item => item.Permissao.Codigo)
            : usuario.Perfil.PerfilPermissoes.Select(item => item.Permissao.Codigo);

        return permissoes
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(item => item)
            .ToArray();
    }

    private static string? ResolveIpAddress(IHttpContextAccessor httpContextAccessor)
    {
        var context = httpContextAccessor.HttpContext;
        var forwardedFor = context?.Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(forwardedFor))
        {
            return forwardedFor.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).FirstOrDefault();
        }

        return context?.Connection.RemoteIpAddress?.ToString();
    }

    private IQueryable<Usuario> BuildSessionQuery()
        => dbContext.Usuarios
            .Include(item => item.Empresa)
            .Include(item => item.Cliente)
            .Include(item => item.Perfil)
                .ThenInclude(item => item.PerfilPermissoes)
                    .ThenInclude(item => item.Permissao)
            .Include(item => item.UsuarioPermissoes)
                .ThenInclude(item => item.Permissao);

    private bool ResolveCurrentOperationalAccess()
        => string.Equals(
            httpContextAccessor.HttpContext?.User.FindFirst(ClaimNames.AccessMode)?.Value,
            AccessModes.Operacional,
            StringComparison.OrdinalIgnoreCase);

    private async Task<LoginResponse> CreateLoginResponseAsync(
        Usuario usuario,
        bool registrarLogDeLogin,
        bool acessoOperacional)
    {
        EnsureUsuarioPodeAutenticar(usuario);

        var isMaster = string.Equals(usuario.Email, UsuariosSistema.MasterEmail, StringComparison.OrdinalIgnoreCase);
        var permissoes = ResolvePermissoes(usuario, isMaster);
        var (token, expiresAt) = tokenService.CreateToken(
            usuario.UsuarioId,
            usuario.EmpresaId,
            usuario.ClienteId,
            usuario.Nome,
            usuario.Email,
            usuario.Perfil.Codigo,
            permissoes,
            acessoOperacional);

        userPresenceService.RegisterHeartbeat(usuario.UsuarioId, usuario.EmpresaId);

        if (registrarLogDeLogin)
        {
            dbContext.LogsSistema.Add(new LogSistema
            {
                LogSistemaId = Guid.NewGuid(),
                EmpresaId = usuario.EmpresaId,
                UsuarioId = usuario.UsuarioId,
                Modulo = "Auth",
                Acao = acessoOperacional ? "LoginOperacionalCracha" : "Login",
                Descricao = acessoOperacional
                    ? $"Login operacional por cracha realizado por {usuario.Email}."
                    : $"Login realizado por {usuario.Email}.",
                IpAddress = ResolveIpAddress(httpContextAccessor)
            });

            await dbContext.SaveChangesAsync();
        }

        return new LoginResponse(
            token,
            expiresAt,
            new UsuarioLogadoDto(
                usuario.UsuarioId,
                usuario.EmpresaId,
                usuario.ClienteId,
                usuario.Cliente?.Nome,
                usuario.Nome,
                usuario.Email,
                usuario.Perfil.Codigo,
                permissoes,
                isMaster));
    }

    private static void EnsureUsuarioPodeAutenticar(Usuario usuario)
    {
        if (!usuario.Ativo)
        {
            throw new ForbiddenAppException("Usuario inativo. Contate o administrador.");
        }

        if (!usuario.Empresa.Ativo)
        {
            throw new ForbiddenAppException("A empresa vinculada ao usuario esta inativa.");
        }

        if (!usuario.Perfil.Ativo)
        {
            throw new ForbiddenAppException("O perfil do usuario esta inativo.");
        }
    }
}
