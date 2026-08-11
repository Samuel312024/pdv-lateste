using Microsoft.EntityFrameworkCore;
using PDV.Api.Common;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Infrastructure;

namespace PDV.Api.Services;

public class ProdutoCampoPadraoService(AppDbContext dbContext, CurrentUserService currentUser)
{
    public async Task<IReadOnlyCollection<ProdutoCampoPadraoDto>> GetAllAsync()
    {
        var empresaId = currentUser.GetEmpresaId();
        var fields = await dbContext.ProdutoCamposPadrao
            .AsNoTracking()
            .Where(item => item.EmpresaId == empresaId)
            .OrderBy(item => item.Ordem)
            .ThenBy(item => item.Chave)
            .ToListAsync();

        return fields.Select(Map).ToArray();
    }

    public async Task<IReadOnlyCollection<ProdutoCampoPadraoDto>> ReplaceAllAsync(
        IReadOnlyCollection<ProdutoCampoPadraoRequest>? request)
    {
        var empresaId = currentUser.GetEmpresaId();
        var normalized = Normalize(request);

        var existing = await dbContext.ProdutoCamposPadrao
            .Where(item => item.EmpresaId == empresaId)
            .ToListAsync();

        if (existing.Count > 0)
        {
            dbContext.ProdutoCamposPadrao.RemoveRange(existing);
        }

        for (var index = 0; index < normalized.Length; index++)
        {
            dbContext.ProdutoCamposPadrao.Add(new ProdutoCampoPadrao
            {
                ProdutoCampoPadraoId = Guid.NewGuid(),
                EmpresaId = empresaId,
                Chave = normalized[index].Chave,
                ValorPadrao = normalized[index].ValorPadrao,
                Ordem = index + 1,
                DataCadastro = DateTime.UtcNow
            });
        }

        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = empresaId,
            UsuarioId = currentUser.GetUserId(),
            Modulo = "Produtos",
            Acao = "CamposPadraoEmpresa",
            Descricao = $"Campos padrao da empresa atualizados com {normalized.Length} definicoes.",
            IpAddress = currentUser.GetIpAddress()
        });

        await dbContext.SaveChangesAsync();

        return await GetAllAsync();
    }

    private static ProdutoCampoPadraoDto[] Normalize(
        IReadOnlyCollection<ProdutoCampoPadraoRequest>? request)
    {
        if (request is null || request.Count == 0)
        {
            return [];
        }

        if (request.Count > 40)
        {
            throw new AppException("Limite de 40 campos padrao por empresa.");
        }

        var normalized = new List<ProdutoCampoPadraoDto>();
        var seenKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var item in request)
        {
            var key = NormalizeNullable(item.Chave);
            if (string.IsNullOrWhiteSpace(key))
            {
                continue;
            }

            if (key.Length > 80)
            {
                throw new AppException("Campos padrao aceitam ate 80 caracteres no nome.");
            }

            if (!seenKeys.Add(key))
            {
                throw new AppException($"O campo padrao '{key}' foi informado mais de uma vez.");
            }

            var value = NormalizeNullable(item.ValorPadrao);
            if (value?.Length > 2000)
            {
                throw new AppException($"O valor padrao do campo '{key}' ultrapassou 2000 caracteres.");
            }

            normalized.Add(new ProdutoCampoPadraoDto(Guid.Empty, Guid.Empty, key, value, normalized.Count + 1, DateTime.UtcNow));
        }

        return normalized.ToArray();
    }

    private static string? NormalizeNullable(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static ProdutoCampoPadraoDto Map(ProdutoCampoPadrao item)
        => new(
            item.ProdutoCampoPadraoId,
            item.EmpresaId,
            item.Chave,
            item.ValorPadrao,
            item.Ordem,
            item.DataCadastro);
}
