namespace PDV.Api.DTOs;

public sealed record UsuarioDto(
    Guid UsuarioId,
    Guid EmpresaId,
    string EmpresaNomeExibicao,
    Guid PerfilId,
    Guid? ClienteId,
    string? ClienteNome,
    string PerfilCodigo,
    string PerfilNome,
    string Nome,
    string Email,
    string? CodigoBarrasCracha,
    bool Ativo,
    bool IsMaster,
    bool UsarPermissoesCustomizadas,
    IReadOnlyCollection<string> PermissoesCustomizadas,
    IReadOnlyCollection<string> PermissoesEfetivas,
    DateTime DataCadastro);

public sealed record UsuarioRequest(
    Guid PerfilId,
    Guid? ClienteId,
    string Nome,
    string Email,
    string? CodigoBarrasCracha,
    string? Senha,
    bool Ativo,
    bool UsarPermissoesCustomizadas,
    IReadOnlyCollection<string>? PermissoesCustomizadas);

public sealed record UsuarioClienteVinculoDto(
    Guid ClienteId,
    string Nome,
    string? Documento,
    string? Telefone,
    string? Cidade,
    string? Uf,
    bool Ativo);

public sealed record UsuarioEntregadorDto(
    Guid UsuarioId,
    string Nome,
    string Email,
    string PerfilCodigo,
    string PerfilNome,
    bool Ativo);

public sealed record UsuarioCrachaSugestaoDto(
    Guid PerfilId,
    string PerfilCodigo,
    string PerfilNome,
    string CodigoBarrasCracha,
    string ConteudoQrCode);

public sealed record PerfilOpcaoDto(
    Guid PerfilId,
    string Codigo,
    string Nome,
    IReadOnlyCollection<string> Permissoes);

public sealed record PermissaoOpcaoDto(
    string Codigo,
    string Nome,
    string Grupo,
    string Descricao);
