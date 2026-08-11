using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using PDV.Api.Common;
using PDV.Api.Domain;
using PDV.Api.Infrastructure;

namespace PDV.Api.Hubs;

[Authorize]
public class PedidosHub(CurrentUserService currentUser) : Hub
{
    public async Task EntrarPainelEmpresa()
    {
        if (!currentUser.HasPermission(Permissoes.VisualizarPedidos) &&
            !currentUser.HasPermission(Permissoes.GerenciarPedidos) &&
            !currentUser.HasPermission(Permissoes.VisualizarVendas))
        {
            throw new ForbiddenAppException("Seu usuario nao possui acesso ao painel operacional de pedidos.");
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, GetEmpresaGroupName(currentUser.GetEmpresaId()));
    }

    public async Task EntrarMeusPedidos()
    {
        var clienteId = currentUser.GetClienteId()
            ?? throw new ForbiddenAppException("Este usuario nao possui cadastro de cliente vinculado para acompanhar pedidos.");

        if (!currentUser.HasPermission(Permissoes.AcompanharPedidosCliente) &&
            !currentUser.HasPermission(Permissoes.RealizarPedidoCliente))
        {
            throw new ForbiddenAppException("Seu usuario nao possui permissao para acompanhar pedidos como comprador.");
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, GetClienteGroupName(clienteId));
    }

    public async Task EntrarMinhasEntregas()
    {
        if (!currentUser.HasPermission(Permissoes.AcessarPainelEntregador))
        {
            throw new ForbiddenAppException("Seu usuario nao possui permissao para acompanhar entregas designadas.");
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, GetEntregadorGroupName(currentUser.GetUserId()));
    }

    public static string GetEmpresaGroupName(Guid empresaId) => $"pedidos:empresa:{empresaId:N}";

    public static string GetClienteGroupName(Guid clienteId) => $"pedidos:cliente:{clienteId:N}";

    public static string GetEntregadorGroupName(Guid usuarioId) => $"pedidos:entregador:{usuarioId:N}";
}
