using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using PDV.Api.Common;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Infrastructure;

namespace PDV.Api.Services;

public class LiberacaoGerenteService(
    AppDbContext dbContext,
    IPasswordHasher<Usuario> passwordHasher,
    CurrentUserService currentUser)
{
    public async Task<IReadOnlyDictionary<string, Usuario>> ValidarVariasAsync(
        Guid empresaId,
        Guid usuarioOperadorId,
        IReadOnlyCollection<LiberacaoGerenteRequest>? liberacoes)
    {
        if (liberacoes is null || liberacoes.Count == 0)
        {
            return new Dictionary<string, Usuario>(StringComparer.OrdinalIgnoreCase);
        }

        var result = new Dictionary<string, Usuario>(StringComparer.OrdinalIgnoreCase);
        foreach (var liberacao in liberacoes)
        {
            var acao = NormalizeAcao(liberacao.Acao);
            if (result.ContainsKey(acao))
            {
                continue;
            }

            result[acao] = await ValidarAsync(empresaId, usuarioOperadorId, liberacao, acao);
        }

        return result;
    }

    public async Task<Usuario> ValidarAsync(
        Guid empresaId,
        Guid usuarioOperadorId,
        LiberacaoGerenteRequest? liberacao,
        string acaoEsperada)
    {
        var acao = NormalizeAcao(acaoEsperada);
        if (liberacao is null)
        {
            throw new ForbiddenAppException($"A operacao {LiberacoesGerenciais.Map[acao].Nome.ToLowerInvariant()} exige liberacao gerencial por cracha e senha.");
        }

        if (!string.Equals(NormalizeAcao(liberacao.Acao), acao, StringComparison.OrdinalIgnoreCase))
        {
            throw new AppException("A acao informada na liberacao gerencial nao corresponde a operacao solicitada.");
        }

        if (string.IsNullOrWhiteSpace(liberacao.CodigoBarrasCracha) || string.IsNullOrWhiteSpace(liberacao.Senha))
        {
            throw new ForbiddenAppException("Informe o cracha e a senha do gerente para liberar esta operacao.");
        }

        var identificador = liberacao.CodigoBarrasCracha.Trim();
        var normalizedEmail = IsEmailIdentifier(identificador)
            ? identificador.ToLowerInvariant()
            : null;
        var codigoCracha = normalizedEmail is null
            ? BadgeCodeResolver.Normalize(identificador)
            : null;
        var crachaCandidates = codigoCracha is null
            ? []
            : BadgeCodeResolver.BuildCandidates(codigoCracha);
        var supervisor = await dbContext.Usuarios
            .Include(item => item.Empresa)
            .Include(item => item.Perfil)
            .FirstOrDefaultAsync(item =>
                item.EmpresaId == empresaId &&
                (
                    (normalizedEmail != null && item.Email == normalizedEmail) ||
                    (item.CodigoBarrasCracha != null && crachaCandidates.Contains(item.CodigoBarrasCracha))
                ));

        if (supervisor is null)
        {
            throw new ForbiddenAppException("Gerente nao encontrado para o cracha ou e-mail informado.");
        }

        EnsureSupervisorPodeAutenticar(supervisor);

        var passwordVerification = passwordHasher.VerifyHashedPassword(supervisor, supervisor.SenhaHash, liberacao.Senha.Trim());
        if (passwordVerification == PasswordVerificationResult.Failed)
        {
            throw new ForbiddenAppException("A senha do gerente esta incorreta.");
        }

        if (!EhSupervisorAutorizador(supervisor))
        {
            throw new ForbiddenAppException("O usuario informado nao possui perfil de gerente, admin ou master para liberar esta operacao.");
        }

        var operadorEmail = currentUser.GetEmail();
        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = empresaId,
            UsuarioId = supervisor.UsuarioId,
            Modulo = "AutorizacaoGerencial",
            Acao = acao,
            Descricao = $"Liberacao gerencial {acao} concedida por {supervisor.Email} para {operadorEmail} ({usuarioOperadorId}).",
            Dados = liberacao.Observacao,
            IpAddress = currentUser.GetIpAddress()
        });

        await dbContext.SaveChangesAsync();
        return supervisor;
    }

    private static string NormalizeAcao(string acao)
    {
        var normalized = acao?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(normalized) || !LiberacoesGerenciais.Map.ContainsKey(normalized))
        {
            throw new AppException("A liberacao gerencial informada nao e valida.");
        }

        return normalized;
    }

    private static void EnsureSupervisorPodeAutenticar(Usuario supervisor)
    {
        if (!supervisor.Ativo)
        {
            throw new ForbiddenAppException("O usuario supervisor informado esta inativo.");
        }

        if (!supervisor.Empresa.Ativo)
        {
            throw new ForbiddenAppException("A empresa vinculada ao supervisor esta inativa.");
        }

        if (!supervisor.Perfil.Ativo)
        {
            throw new ForbiddenAppException("O perfil do supervisor esta inativo.");
        }
    }

    private static bool EhSupervisorAutorizador(Usuario supervisor)
        => string.Equals(supervisor.Email, UsuariosSistema.MasterEmail, StringComparison.OrdinalIgnoreCase)
            || string.Equals(supervisor.Perfil.Codigo, Perfis.Admin, StringComparison.OrdinalIgnoreCase)
            || string.Equals(supervisor.Perfil.Codigo, Perfis.Gerente, StringComparison.OrdinalIgnoreCase);

    private static bool IsEmailIdentifier(string identificador)
        => identificador.Contains('@', StringComparison.Ordinal);
}
