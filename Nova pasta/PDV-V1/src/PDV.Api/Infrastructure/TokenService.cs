using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace PDV.Api.Infrastructure;

public static class ClaimNames
{
    public const string EmpresaId = "empresa_id";
    public const string ClienteId = "cliente_id";
    public const string Permission = "permission";
    public const string AccessMode = "access_mode";
}

public static class AccessModes
{
    public const string Administrativo = "Administrativo";
    public const string Operacional = "Operacional";
}

public class JwtOptions
{
    public string Issuer { get; set; } = "PDV.Api";
    public string Audience { get; set; } = "PDV.Web";
    public string Key { get; set; } = string.Empty;
    public int ExpiresInHours { get; set; } = 8;
}

public class TokenService(IOptions<JwtOptions> options)
{
    private readonly JwtOptions _jwtOptions = options.Value;

    public (string Token, DateTime ExpiresAt) CreateToken(
        Guid usuarioId,
        Guid empresaId,
        Guid? clienteId,
        string nome,
        string email,
        string perfil,
        IReadOnlyCollection<string> permissoes,
        bool acessoOperacional)
    {
        var expiresAt = DateTime.UtcNow.AddHours(_jwtOptions.ExpiresInHours);
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, usuarioId.ToString()),
            new(ClaimNames.EmpresaId, empresaId.ToString()),
            new(ClaimTypes.Name, nome),
            new(ClaimTypes.Email, email),
            new(ClaimTypes.Role, perfil),
            new(ClaimNames.AccessMode, acessoOperacional ? AccessModes.Operacional : AccessModes.Administrativo)
        };

        if (clienteId.HasValue)
        {
            claims.Add(new Claim(ClaimNames.ClienteId, clienteId.Value.ToString()));
        }

        claims.AddRange(permissoes.Select(permission => new Claim(ClaimNames.Permission, permission)));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtOptions.Key));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: _jwtOptions.Issuer,
            audience: _jwtOptions.Audience,
            claims: claims,
            expires: expiresAt,
            signingCredentials: credentials);

        return (new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
    }
}
