using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using PDV.Api.Common;
using PDV.Api.DTOs;
using PDV.Api.Services;

namespace PDV.Api.Hubs;

[AllowAnonymous]
public class ScannerHub(ScannerSessaoService scannerSessaoService) : Hub
{
    public async Task EntrarNaSessao(string sessao)
    {
        var httpContext = Context.GetHttpContext();
        var papel = httpContext?.Request.Query["papel"].FirstOrDefault()?.Trim().ToLowerInvariant();
        var chaveAcesso = httpContext?.Request.Query["chaveAcesso"].FirstOrDefault();
        var displayName = ResolveDisplayName(httpContext?.Request.Query["device"].FirstOrDefault());
        var autenticado = Context.User?.Identity?.IsAuthenticated == true;

        if (papel != "mobile" && !autenticado && !scannerSessaoService.CanConnectAnonymousDesktop(sessao, chaveAcesso))
        {
            throw new UnauthorizedAppException("A sessao do scanner global exige autenticacao do PDV.");
        }

        ScannerStatusConexaoDto status = papel == "mobile"
            ? scannerSessaoService.RegistrarConexaoMobile(sessao, chaveAcesso ?? string.Empty, Context.ConnectionId, displayName)
            : scannerSessaoService.RegistrarConexaoPdv(
                sessao,
                Context.ConnectionId,
                ResolveDisplayName(Context.User?.Identity?.Name),
                autenticado ? null : chaveAcesso);

        await Groups.AddToGroupAsync(Context.ConnectionId, scannerSessaoService.GetGroupName(sessao));
        await Clients.Group(scannerSessaoService.GetGroupName(sessao)).SendAsync("ScannerConectado", status);
    }

    public async Task EnviarCodigo(string sessao, string codigoBarras, string? formato = null)
    {
        var reading = scannerSessaoService.RegistrarLeituraRealtime(sessao, Context.ConnectionId, codigoBarras, formato, ResolveDisplayName(null));
        await Clients.Group(scannerSessaoService.GetGroupName(sessao)).SendAsync("CodigoEscaneado", reading);
    }

    public async Task SairDaSessao(string sessao)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, scannerSessaoService.GetGroupName(sessao));
        var status = scannerSessaoService.RemoverConexao(Context.ConnectionId);
        if (status is not null)
        {
            await Clients.Group(scannerSessaoService.GetGroupName(sessao)).SendAsync("ScannerDesconectado", status);
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (scannerSessaoService.TryGetSessaoDaConexao(Context.ConnectionId, out var sessaoId))
        {
            var status = scannerSessaoService.RemoverConexao(Context.ConnectionId);
            if (status is not null)
            {
                await Clients.Group(scannerSessaoService.GetGroupName(sessaoId)).SendAsync("ScannerDesconectado", status);
            }
        }

        await base.OnDisconnectedAsync(exception);
    }

    private static string ResolveDisplayName(string? fallback)
    {
        if (!string.IsNullOrWhiteSpace(fallback))
        {
            return fallback.Trim();
        }

        return "Scanner";
    }
}
