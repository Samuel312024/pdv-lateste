namespace PDV.Api.DTOs;

public sealed record LoginRequest(string? Email, string? CodigoBarrasCracha, string Senha);

public sealed record UsuarioLogadoDto(
    Guid UsuarioId,
    Guid EmpresaId,
    Guid? ClienteId,
    string? ClienteNome,
    string Nome,
    string Email,
    string Perfil,
    IReadOnlyCollection<string> Permissoes,
    bool IsMaster);

public sealed record LoginResponse(string Token, DateTime ExpiresAt, UsuarioLogadoDto Usuario);
