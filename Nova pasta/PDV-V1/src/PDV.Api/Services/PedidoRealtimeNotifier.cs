using Microsoft.AspNetCore.SignalR;
using PDV.Api.DTOs;
using PDV.Api.Hubs;

namespace PDV.Api.Services;

public class PedidoRealtimeNotifier(IHubContext<PedidosHub> hubContext)
{
    public Task NotifyAsync(Guid empresaId, PedidoRealtimeEventoDto evento, Guid? clienteId, Guid? entregadorUsuarioId = null)
    {
        var tasks = new List<Task>
        {
            hubContext.Clients.Group(PedidosHub.GetEmpresaGroupName(empresaId)).SendAsync("PedidoAtualizado", evento)
        };

        if (clienteId.HasValue)
        {
            tasks.Add(hubContext.Clients.Group(PedidosHub.GetClienteGroupName(clienteId.Value)).SendAsync("PedidoAtualizado", evento));
        }

        if (entregadorUsuarioId.HasValue)
        {
            tasks.Add(hubContext.Clients.Group(PedidosHub.GetEntregadorGroupName(entregadorUsuarioId.Value)).SendAsync("PedidoAtualizado", evento));
        }

        return Task.WhenAll(tasks);
    }
}
