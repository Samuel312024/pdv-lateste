using System.Net.Mail;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using PDV.Api.Common;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Infrastructure;

namespace PDV.Api.Services;

public class UsuarioService(
    AppDbContext dbContext,
    CurrentUserService currentUser,
    IPasswordHasher<Usuario> passwordHasher)
{
    public async Task<IReadOnlyCollection<UsuarioDto>> GetAllAsync(string? termo, bool? somenteAtivos)
    {
        EnsureUserManagementAccess();

        var empresaId = currentUser.GetEmpresaId();
        var query = BuildUsuarioQuery(empresaId);

        if (!string.IsNullOrWhiteSpace(termo))
        {
            var normalizedTerm = termo.Trim();
            query = query.Where(item =>
                item.Nome.Contains(normalizedTerm) ||
                item.Email.Contains(normalizedTerm) ||
                (item.CodigoBarrasCracha != null && item.CodigoBarrasCracha.Contains(normalizedTerm)));
        }

        if (somenteAtivos.HasValue)
        {
            query = query.Where(item => item.Ativo == somenteAtivos.Value);
        }

        var usuarios = await query
            .OrderBy(item => item.Nome)
            .ToListAsync();

        return usuarios.Select(Map).ToArray();
    }

    public async Task<IReadOnlyCollection<PerfilOpcaoDto>> GetPerfisAsync()
    {
        EnsureUserManagementAccess();

        var perfis = await dbContext.Perfis
            .AsNoTracking()
            .Include(item => item.PerfilPermissoes)
                .ThenInclude(item => item.Permissao)
            .Where(item => item.Ativo)
            .OrderBy(item => item.Nome)
            .ToListAsync();

        return perfis
            .Select(item => new PerfilOpcaoDto(
                item.PerfilId,
                item.Codigo,
                item.Nome,
                item.PerfilPermissoes
                    .Select(permissao => permissao.Permissao.Codigo)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(codigo => codigo)
                    .ToArray()))
            .ToArray();
    }

    public Task<IReadOnlyCollection<PermissaoOpcaoDto>> GetPermissoesAsync()
    {
        EnsureUserManagementAccess();

        IReadOnlyCollection<PermissaoOpcaoDto> result = Permissoes.Definitions
            .OrderBy(item => item.Grupo)
            .ThenBy(item => item.Nome)
            .Select(item => new PermissaoOpcaoDto(
                item.Codigo,
                item.Nome,
                item.Grupo,
                item.Descricao))
            .ToArray();

        return Task.FromResult(result);
    }

    public async Task<IReadOnlyCollection<UsuarioClienteVinculoDto>> GetClientesVinculoAsync()
    {
        EnsureUserManagementAccess();

        var empresaId = currentUser.GetEmpresaId();
        var clientes = await dbContext.Clientes
            .AsNoTracking()
            .Where(item => item.EmpresaId == empresaId && item.Ativo && !item.EhFornecedor)
            .OrderBy(item => item.Nome)
            .Select(item => new UsuarioClienteVinculoDto(
                item.ClienteId,
                item.Nome,
                item.Documento,
                item.Telefone,
                item.Cidade,
                item.Uf,
                item.Ativo))
            .ToListAsync();

        return clientes;
    }

    public async Task<IReadOnlyCollection<UsuarioEntregadorDto>> GetDeliveryUsersAsync()
    {
        EnsureDeliveryAssignmentAccess();

        var empresaId = currentUser.GetEmpresaId();
        var usuarios = await BuildUsuarioQuery(empresaId)
            .Where(item => item.Ativo)
            .OrderBy(item => item.Nome)
            .ToListAsync();

        return usuarios
            .Where(item =>
                !IsMasterAccount(item.Email) &&
                HasEffectivePermission(item, Permissoes.AcessarPainelEntregador))
            .Select(item => new UsuarioEntregadorDto(
                item.UsuarioId,
                item.Nome,
                item.Email,
                item.Perfil.Codigo,
                item.Perfil.Nome,
                item.Ativo))
            .ToArray();
    }

    public async Task<UsuarioCrachaSugestaoDto> GetBadgeSuggestionAsync(Guid perfilId)
    {
        EnsureUserManagementAccess();

        var empresaId = currentUser.GetEmpresaId();
        var perfil = await GetPerfilAsync(perfilId);
        var codigoBarrasCracha = await GenerateNextBadgeCodeAsync(empresaId, perfil.Codigo);

        return new UsuarioCrachaSugestaoDto(
            perfil.PerfilId,
            perfil.Codigo,
            perfil.Nome,
            codigoBarrasCracha,
            codigoBarrasCracha);
    }

    public async Task<UsuarioDto> CreateAsync(UsuarioRequest request)
    {
        EnsureUserManagementAccess();

        var empresaId = currentUser.GetEmpresaId();
        var validation = await ValidateAsync(request, null);
        var codigoBarrasCracha = validation.CodigoBarrasCracha
            ?? await GenerateNextBadgeCodeAsync(empresaId, validation.PerfilCodigo);

        var usuario = new Usuario
        {
            UsuarioId = Guid.NewGuid(),
            EmpresaId = empresaId,
            PerfilId = request.PerfilId,
            ClienteId = request.ClienteId,
            Nome = request.Nome.Trim(),
            Email = validation.NormalizedEmail,
            CodigoBarrasCracha = codigoBarrasCracha,
            Ativo = request.Ativo,
            DataCadastro = DateTime.UtcNow
        };
        usuario.SenhaHash = passwordHasher.HashPassword(usuario, request.Senha!.Trim());

        await ApplyPermissoesCustomizadasAsync(usuario, request, false);

        dbContext.Usuarios.Add(usuario);
        AddLog("Criacao", $"Usuario {usuario.Email} criado.");
        await dbContext.SaveChangesAsync();

        var savedUsuario = await LoadUsuarioAsync(usuario.UsuarioId, empresaId);
        return Map(savedUsuario);
    }

    public async Task<UsuarioDto> UpdateAsync(Guid id, UsuarioRequest request)
    {
        EnsureUserManagementAccess();

        var empresaId = currentUser.GetEmpresaId();
        var usuario = await BuildUsuarioQuery(empresaId)
            .FirstOrDefaultAsync(item => item.UsuarioId == id)
            ?? throw new NotFoundException("Usuario nao encontrado.");

        var validation = await ValidateAsync(request, id);
        var targetIsMaster = IsMasterAccount(usuario.Email);

        if (targetIsMaster && !currentUser.IsMasterUser())
        {
            throw new ForbiddenAppException($"Somente o usuario {UsuariosSistema.MasterEmail} pode alterar a conta master.");
        }

        if (!request.Ativo && id == currentUser.GetUserId())
        {
            throw new AppException("Voce nao pode inativar o proprio usuario.");
        }

        if (targetIsMaster)
        {
            if (!string.Equals(validation.NormalizedEmail, UsuariosSistema.MasterEmail, StringComparison.OrdinalIgnoreCase))
            {
                throw new AppException("O usuario master deve manter o e-mail master@pdv.local.");
            }

            if (!request.Ativo)
            {
                throw new AppException("O usuario master nao pode ser inativado.");
            }

            if (request.UsarPermissoesCustomizadas)
            {
                throw new AppException("O usuario master usa acesso total fixo e nao aceita permissoes customizadas.");
            }

            var perfilAdminId = await dbContext.Perfis
                .Where(item => item.Codigo == Perfis.Admin)
                .Select(item => item.PerfilId)
                .FirstAsync();

            if (request.PerfilId != perfilAdminId)
            {
                throw new AppException("O usuario master deve permanecer com o perfil Admin.");
            }
        }

        usuario.PerfilId = request.PerfilId;
        usuario.ClienteId = request.ClienteId;
        usuario.Nome = request.Nome.Trim();
        usuario.Email = validation.NormalizedEmail;
        usuario.CodigoBarrasCracha = validation.CodigoBarrasCracha;
        usuario.Ativo = request.Ativo;

        if (!string.IsNullOrWhiteSpace(request.Senha))
        {
            usuario.SenhaHash = passwordHasher.HashPassword(usuario, request.Senha.Trim());
        }

        await ApplyPermissoesCustomizadasAsync(usuario, request, targetIsMaster);

        AddLog("Edicao", $"Usuario {usuario.Email} atualizado.");
        await dbContext.SaveChangesAsync();

        return Map(usuario);
    }

    public async Task ArchiveAsync(Guid id)
    {
        EnsureUserManagementAccess();

        var empresaId = currentUser.GetEmpresaId();
        var usuario = await dbContext.Usuarios
            .FirstOrDefaultAsync(item => item.UsuarioId == id && item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Usuario nao encontrado.");

        if (usuario.UsuarioId == currentUser.GetUserId())
        {
            throw new AppException("Voce nao pode inativar o proprio usuario.");
        }

        if (IsMasterAccount(usuario.Email))
        {
            throw new AppException("O usuario master nao pode ser inativado.");
        }

        usuario.Ativo = false;
        AddLog("Inativacao", $"Usuario {usuario.Email} inativado.");
        await dbContext.SaveChangesAsync();
    }

    public async Task DeletePermanentlyAsync(Guid id)
    {
        EnsureUserManagementAccess();

        var empresaId = currentUser.GetEmpresaId();
        var usuario = await dbContext.Usuarios
            .FirstOrDefaultAsync(item => item.UsuarioId == id && item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Usuario nao encontrado.");

        if (usuario.UsuarioId == currentUser.GetUserId())
        {
            throw new AppException("Voce nao pode excluir permanentemente o proprio usuario.");
        }

        if (IsMasterAccount(usuario.Email))
        {
            throw new AppException("O usuario master nao pode ser excluido.");
        }

        var possuiReferencias = await dbContext.Vendas.AnyAsync(item => item.UsuarioId == id)
            || await dbContext.Caixas.AnyAsync(item => item.UsuarioId == id)
            || await dbContext.MovimentacoesEstoque.AnyAsync(item => item.UsuarioId == id)
            || await dbContext.LancamentosFinanceiros.AnyAsync(item => item.UsuarioId == id);

        if (possuiReferencias)
        {
            throw new AppException("Este usuario ja participou de vendas, caixa, estoque ou financeiro. Use a opcao de inativar em vez de excluir permanentemente.");
        }

        dbContext.Usuarios.Remove(usuario);
        AddLog("Exclusao", $"Usuario {usuario.Email} excluido permanentemente.");
        await dbContext.SaveChangesAsync();
    }

    private IQueryable<Usuario> BuildUsuarioQuery(Guid empresaId)
        => dbContext.Usuarios
            .Include(item => item.Empresa)
            .Include(item => item.Perfil)
                .ThenInclude(item => item.PerfilPermissoes)
                    .ThenInclude(item => item.Permissao)
            .Include(item => item.Cliente)
            .Include(item => item.UsuarioPermissoes)
                .ThenInclude(item => item.Permissao)
            .Where(item => item.EmpresaId == empresaId);

    private async Task<Usuario> LoadUsuarioAsync(Guid id, Guid empresaId)
        => await BuildUsuarioQuery(empresaId)
            .FirstAsync(item => item.UsuarioId == id);

    private async Task<Perfil> GetPerfilAsync(Guid perfilId)
        => await dbContext.Perfis
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.PerfilId == perfilId && item.Ativo)
            ?? throw new AppException("Perfil informado nao esta disponivel.");

    private async Task<UsuarioValidationResult> ValidateAsync(UsuarioRequest request, Guid? usuarioId)
    {
        if (request.PerfilId == Guid.Empty)
        {
            throw new AppException("Perfil do usuario e obrigatorio.");
        }

        if (string.IsNullOrWhiteSpace(request.Nome))
        {
            throw new AppException("Nome do usuario e obrigatorio.");
        }

        if (string.IsNullOrWhiteSpace(request.Email))
        {
            throw new AppException("E-mail do usuario e obrigatorio.");
        }

        if (!usuarioId.HasValue && string.IsNullOrWhiteSpace(request.Senha))
        {
            throw new AppException("Senha e obrigatoria para criar um usuario.");
        }

        if (!string.IsNullOrWhiteSpace(request.Senha) && request.Senha.Trim().Length < 8)
        {
            throw new AppException("A senha deve ter pelo menos 8 caracteres.");
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        try
        {
            _ = new MailAddress(normalizedEmail);
        }
        catch (FormatException)
        {
            throw new AppException("Informe um e-mail valido.");
        }

        var perfil = await GetPerfilAsync(request.PerfilId);

        var normalizedCracha = NormalizeCracha(request.CodigoBarrasCracha);
        if (PerfilExigeCracha(perfil.Codigo) && string.IsNullOrWhiteSpace(normalizedCracha))
        {
            normalizedCracha = await GenerateNextBadgeCodeAsync(currentUser.GetEmpresaId(), perfil.Codigo, usuarioId);
        }

        if (request.ClienteId.HasValue)
        {
            var clienteExiste = await dbContext.Clientes.AnyAsync(item =>
                item.ClienteId == request.ClienteId.Value &&
                item.EmpresaId == currentUser.GetEmpresaId() &&
                item.Ativo &&
                !item.EhFornecedor);

            if (!clienteExiste)
            {
                throw new AppException("Cliente vinculado ao usuario nao pertence a empresa ou esta inativo.");
            }
        }

        var emailJaExiste = await dbContext.Usuarios.AnyAsync(item =>
            item.Email == normalizedEmail &&
            item.UsuarioId != usuarioId);

        if (emailJaExiste)
        {
            throw new AppException("Ja existe um usuario com esse e-mail.");
        }

        if (!string.IsNullOrWhiteSpace(normalizedCracha))
        {
            var crachaJaExiste = await dbContext.Usuarios.AnyAsync(item =>
                item.EmpresaId == currentUser.GetEmpresaId() &&
                item.CodigoBarrasCracha == normalizedCracha &&
                item.UsuarioId != usuarioId);

            if (crachaJaExiste)
            {
                throw new AppException("Ja existe um usuario com esse codigo de cracha na empresa.");
            }
        }

        return new UsuarioValidationResult(normalizedEmail, normalizedCracha, perfil.Codigo);
    }

    private async Task ApplyPermissoesCustomizadasAsync(Usuario usuario, UsuarioRequest request, bool targetIsMaster)
    {
        dbContext.UsuarioPermissoes.RemoveRange(usuario.UsuarioPermissoes);
        usuario.UsuarioPermissoes.Clear();

        if (targetIsMaster || !request.UsarPermissoesCustomizadas)
        {
            usuario.UsarPermissoesCustomizadas = false;
            return;
        }

        usuario.UsarPermissoesCustomizadas = true;

        var codigosSelecionados = request.PermissoesCustomizadas?
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Select(item => item.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray()
            ?? [];

        if (codigosSelecionados.Length == 0)
        {
            return;
        }

        var permissoes = await dbContext.Permissoes
            .Where(item => codigosSelecionados.Contains(item.Codigo))
            .ToDictionaryAsync(item => item.Codigo, item => item.PermissaoId, StringComparer.OrdinalIgnoreCase);

        var codigosInvalidos = codigosSelecionados
            .Where(item => !permissoes.ContainsKey(item))
            .OrderBy(item => item)
            .ToArray();

        if (codigosInvalidos.Length > 0)
        {
            throw new AppException($"Existem permissoes invalidas no acesso individual: {string.Join(", ", codigosInvalidos)}.");
        }

        foreach (var codigo in codigosSelecionados.OrderBy(item => item))
        {
            usuario.UsuarioPermissoes.Add(new UsuarioPermissao
            {
                UsuarioId = usuario.UsuarioId,
                PermissaoId = permissoes[codigo]
            });
        }
    }

    private void EnsureUserManagementAccess()
    {
        if (currentUser.IsMasterUser() || currentUser.HasPermission(Permissoes.GerenciarUsuarios))
        {
            return;
        }

        throw new ForbiddenAppException("Seu usuario nao possui permissao para gerenciar contas, senhas e feature flags individuais.");
    }

    private void EnsureDeliveryAssignmentAccess()
    {
        if (currentUser.IsMasterUser() ||
            currentUser.HasPermission(Permissoes.GerenciarUsuarios) ||
            currentUser.HasPermission(Permissoes.VisualizarPedidos) ||
            currentUser.HasPermission(Permissoes.GerenciarPedidos))
        {
            return;
        }

        throw new ForbiddenAppException("Seu usuario nao possui acesso para consultar entregadores disponiveis.");
    }

    private void AddLog(string acao, string descricao)
    {
        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = currentUser.GetEmpresaId(),
            UsuarioId = currentUser.GetUserId(),
            Modulo = "Usuarios",
            Acao = acao,
            Descricao = descricao,
            IpAddress = currentUser.GetIpAddress()
        });
    }

    private static bool IsMasterAccount(string email)
        => string.Equals(email, UsuariosSistema.MasterEmail, StringComparison.OrdinalIgnoreCase);

    private static bool HasEffectivePermission(Usuario usuario, string permission)
        => ResolvePermissoesEfetivas(usuario).Contains(permission, StringComparer.OrdinalIgnoreCase);

    private static IReadOnlyCollection<string> ResolvePermissoesEfetivas(Usuario usuario)
    {
        if (IsMasterAccount(usuario.Email))
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

    private static UsuarioDto Map(Usuario usuario)
    {
        var permissoesCustomizadas = usuario.UsuarioPermissoes
            .Select(item => item.Permissao.Codigo)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(item => item)
            .ToArray();

        return new UsuarioDto(
            usuario.UsuarioId,
            usuario.EmpresaId,
            string.IsNullOrWhiteSpace(usuario.Empresa.NomeFantasia) ? usuario.Empresa.Nome : usuario.Empresa.NomeFantasia!,
            usuario.PerfilId,
            usuario.ClienteId,
            usuario.Cliente?.Nome,
            usuario.Perfil.Codigo,
            usuario.Perfil.Nome,
            usuario.Nome,
            usuario.Email,
            usuario.CodigoBarrasCracha,
            usuario.Ativo,
            IsMasterAccount(usuario.Email),
            usuario.UsarPermissoesCustomizadas,
            permissoesCustomizadas,
            ResolvePermissoesEfetivas(usuario),
            usuario.DataCadastro);
    }

    private static string? NormalizeCracha(string? cracha)
    {
        var normalized = string.IsNullOrWhiteSpace(cracha) ? null : cracha.Trim();
        if (normalized is not null && normalized.Length > 80)
        {
            throw new AppException("Codigo de barras do cracha deve ter no maximo 80 caracteres.");
        }

        return normalized;
    }

    private async Task<string> GenerateNextBadgeCodeAsync(Guid empresaId, string perfilCodigo, Guid? usuarioId = null)
    {
        var prefixo = ResolveBadgePrefix(perfilCodigo);
        var prefixoComSeparador = $"{prefixo}-";

        var existingCodes = await dbContext.Usuarios
            .AsNoTracking()
            .Where(item =>
                item.EmpresaId == empresaId &&
                item.UsuarioId != usuarioId &&
                item.CodigoBarrasCracha != null &&
                item.CodigoBarrasCracha.StartsWith(prefixoComSeparador))
            .Select(item => item.CodigoBarrasCracha!)
            .ToListAsync();

        var proximoNumero = existingCodes
            .Select(item => ParseBadgeSequence(item, prefixo))
            .Where(item => item.HasValue)
            .Select(item => item!.Value)
            .DefaultIfEmpty(0)
            .Max() + 1;

        return $"{prefixo}-{proximoNumero:D6}";
    }

    private static int? ParseBadgeSequence(string codigoBarrasCracha, string prefixo)
    {
        var prefixoComSeparador = $"{prefixo}-";
        if (!codigoBarrasCracha.StartsWith(prefixoComSeparador, StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var sufixo = codigoBarrasCracha[prefixoComSeparador.Length..];
        return int.TryParse(sufixo, out var numero) && numero > 0
            ? numero
            : null;
    }

    private static string ResolveBadgePrefix(string perfilCodigo)
        => perfilCodigo switch
        {
            Perfis.Admin => "ADM",
            Perfis.Gerente => "GER",
            Perfis.OperadorCaixa => "OPC",
            Perfis.Comprador => "COM",
            Perfis.Entregador => "ENT",
            _ => BuildFallbackBadgePrefix(perfilCodigo)
        };

    private static string BuildFallbackBadgePrefix(string perfilCodigo)
    {
        var letters = new string(perfilCodigo
            .Trim()
            .ToUpperInvariant()
            .Where(char.IsLetterOrDigit)
            .ToArray());

        if (letters.Length >= 3)
        {
            return letters[..3];
        }

        return letters.PadRight(3, 'X');
    }

    private static bool PerfilExigeCracha(string perfilCodigo)
        => !string.Equals(perfilCodigo, Perfis.Comprador, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(perfilCodigo, Perfis.Entregador, StringComparison.OrdinalIgnoreCase);

    private sealed record UsuarioValidationResult(
        string NormalizedEmail,
        string? CodigoBarrasCracha,
        string PerfilCodigo);
}
