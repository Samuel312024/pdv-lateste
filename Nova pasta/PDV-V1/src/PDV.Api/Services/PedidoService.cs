using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PDV.Api.Common;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Infrastructure;

namespace PDV.Api.Services;

public class PedidoService(
    AppDbContext dbContext,
    CurrentUserService currentUser,
    PedidoRealtimeNotifier realtimeNotifier,
    VendaService vendaService)
{
    public async Task<IReadOnlyCollection<PedidoResumoDto>> GetAllAsync(string? status, string? atendimento, string? termo)
    {
        EnsurePedidoManagementAccess();

        var empresaId = currentUser.GetEmpresaId();
        var query = BuildPedidoQuery(empresaId);

        if (TryParsePedidoStatus(status, out var parsedStatus))
        {
            query = query.Where(item => item.PedidoStatus == parsedStatus);
        }

        if (TryParseAtendimento(atendimento, out var parsedAtendimento))
        {
            query = query.Where(item => item.AtendimentoTipo == parsedAtendimento);
        }

        if (!string.IsNullOrWhiteSpace(termo))
        {
            var normalized = termo.Trim();
            query = query.Where(item =>
                item.NumeroVenda.Contains(normalized) ||
                (item.CodigoAcompanhamento != null && item.CodigoAcompanhamento.Contains(normalized)) ||
                (item.Cliente != null && item.Cliente.Nome.Contains(normalized)) ||
                (item.ContatoNome != null && item.ContatoNome.Contains(normalized)));
        }

        var pedidos = await query
            .OrderByDescending(item => item.DataUltimaAtualizacaoPedido ?? item.DataVenda)
            .ThenByDescending(item => item.DataVenda)
            .ToListAsync();

        return pedidos.Select(MapResumo).ToArray();
    }

    public async Task<PedidoDetalheDto> GetByIdAsync(Guid vendaId)
    {
        EnsurePedidoManagementAccess();
        var pedido = await LoadPedidoAsync(vendaId, currentUser.GetEmpresaId());
        return MapDetalhe(pedido);
    }

    public async Task<IReadOnlyCollection<PedidoResumoDto>> GetMineAsync()
    {
        var clienteId = EnsureCustomerTrackingAccess();
        var empresaId = currentUser.GetEmpresaId();

        var pedidos = await BuildPedidoQuery(empresaId)
            .Where(item => item.ClienteId == clienteId)
            .OrderByDescending(item => item.DataUltimaAtualizacaoPedido ?? item.DataVenda)
            .ThenByDescending(item => item.DataVenda)
            .ToListAsync();

        return pedidos.Select(MapResumo).ToArray();
    }

    public async Task<PedidoDetalheDto> GetMineByIdAsync(Guid vendaId)
    {
        var clienteId = EnsureCustomerTrackingAccess();
        var pedido = await LoadPedidoAsync(vendaId, currentUser.GetEmpresaId());

        if (pedido.ClienteId != clienteId)
        {
            throw new ForbiddenAppException("Este pedido nao pertence ao comprador autenticado.");
        }

        return MapDetalhe(pedido);
    }

    public async Task<IReadOnlyCollection<PedidoResumoDto>> GetAssignedDeliveriesAsync()
    {
        EnsureCourierTrackingAccess();

        var empresaId = currentUser.GetEmpresaId();
        var usuarioId = currentUser.GetUserId();

        var pedidos = await BuildPedidoQuery(empresaId)
            .Where(item =>
                item.AtendimentoTipo == AtendimentoPedidoTipo.Entrega &&
                item.EntregadorUsuarioId == usuarioId)
            .OrderByDescending(item => item.DataUltimaAtualizacaoPedido ?? item.DataVenda)
            .ThenByDescending(item => item.DataVenda)
            .ToListAsync();

        return pedidos.Select(MapResumo).ToArray();
    }

    public async Task<PedidoDetalheDto> GetAssignedDeliveryByIdAsync(Guid vendaId)
    {
        EnsureCourierTrackingAccess();

        var pedido = await LoadPedidoAsync(vendaId, currentUser.GetEmpresaId());
        if (pedido.EntregadorUsuarioId != currentUser.GetUserId())
        {
            throw new ForbiddenAppException("Esta entrega nao esta vinculada ao entregador autenticado.");
        }

        return MapDetalhe(pedido);
    }

    public async Task<PedidoDetalheDto> AtualizarStatusAsync(Guid vendaId, AtualizarPedidoStatusRequest request)
    {
        EnsurePedidoManagementAccess();

        var pedido = await LoadPedidoAsync(vendaId, currentUser.GetEmpresaId(), trackChanges: true);

        if (request.Status == PedidoStatus.Cancelado)
        {
            await vendaService.CancelarAsync(vendaId, new CancelarVendaRequest(request.Observacao?.Trim() ?? "Pedido cancelado pela operacao."));
            var cancelado = await LoadPedidoAsync(vendaId, currentUser.GetEmpresaId());
            await realtimeNotifier.NotifyAsync(cancelado.EmpresaId, BuildRealtimeEvent(cancelado), cancelado.ClienteId, cancelado.EntregadorUsuarioId);
            return MapDetalhe(cancelado);
        }

        ValidateStatusTransition(pedido, request.Status);

        pedido.PedidoStatus = request.Status;
        ActivateDeliveryTrackingIfNeeded(pedido, request.Status);
        pedido.DataUltimaAtualizacaoPedido = DateTime.UtcNow;

        dbContext.PedidoOcorrencias.Add(new PedidoOcorrencia
        {
            PedidoOcorrenciaId = Guid.NewGuid(),
            EmpresaId = pedido.EmpresaId,
            VendaId = pedido.VendaId,
            UsuarioId = currentUser.GetUserId(),
            Status = request.Status,
            Titulo = BuildStatusTitle(request.Status, pedido.AtendimentoTipo),
            Descricao = NormalizeOptionalText(request.Observacao, 500, "Observacao do pedido"),
            VisivelParaCliente = true,
            DataOcorrencia = pedido.DataUltimaAtualizacaoPedido.Value
        });

        await dbContext.SaveChangesAsync();

        var atualizado = await LoadPedidoAsync(vendaId, currentUser.GetEmpresaId());
        await realtimeNotifier.NotifyAsync(atualizado.EmpresaId, BuildRealtimeEvent(atualizado), atualizado.ClienteId, atualizado.EntregadorUsuarioId);
        return MapDetalhe(atualizado);
    }

    private IQueryable<Venda> BuildPedidoQuery(Guid empresaId)
        => dbContext.Vendas
            .AsSplitQuery()
            .Include(item => item.Cliente)
            .Include(item => item.Usuario)
            .Include(item => item.EntregadorUsuario)
            .Include(item => item.Itens)
                .ThenInclude(item => item.Produto)
            .Include(item => item.Pagamentos)
            .Include(item => item.OcorrenciasPedido)
                .ThenInclude(item => item.Usuario)
            .Include(item => item.Transportadora)
            .Where(item => item.EmpresaId == empresaId && item.EhPedido);

    private async Task<Venda> LoadPedidoAsync(Guid vendaId, Guid empresaId, bool trackChanges = false)
    {
        var query = BuildPedidoQuery(empresaId);
        if (!trackChanges)
        {
            query = query.AsNoTracking();
        }

        return await query.FirstOrDefaultAsync(item => item.VendaId == vendaId)
            ?? throw new NotFoundException("Pedido nao encontrado.");
    }

    private void EnsurePedidoManagementAccess()
    {
        if (currentUser.HasPermission(Permissoes.VisualizarPedidos) || currentUser.HasPermission(Permissoes.GerenciarPedidos))
        {
            return;
        }

        throw new ForbiddenAppException("Seu usuario nao possui permissao para visualizar o fluxo operacional de pedidos.");
    }

    private Guid EnsureCustomerTrackingAccess()
    {
        if (!currentUser.HasPermission(Permissoes.AcompanharPedidosCliente) &&
            !currentUser.HasPermission(Permissoes.RealizarPedidoCliente))
        {
            throw new ForbiddenAppException("Seu usuario nao possui permissao para acompanhar pedidos de comprador.");
        }

        return currentUser.GetClienteId()
            ?? throw new ForbiddenAppException("Este usuario precisa estar vinculado a um cadastro de cliente para acompanhar os pedidos.");
    }

    private void EnsureCourierTrackingAccess()
    {
        if (currentUser.HasPermission(Permissoes.AcessarPainelEntregador))
        {
            return;
        }

        throw new ForbiddenAppException("Seu usuario nao possui permissao para acompanhar entregas designadas.");
    }

    private PedidoResumoDto MapResumo(Venda venda)
        => new(
            venda.VendaId,
            venda.NumeroVenda,
            venda.CodigoAcompanhamento ?? venda.NumeroVenda,
            venda.Status.ToString(),
            venda.PedidoStatus?.ToString() ?? PedidoStatus.Recebido.ToString(),
            venda.AtendimentoTipo?.ToString() ?? AtendimentoPedidoTipo.Retirada.ToString(),
            venda.Cliente?.Nome ?? venda.ContatoNome ?? "Cliente do pedido",
            venda.Cliente?.Telefone ?? venda.ContatoTelefone,
            venda.Total,
            (int)Math.Max(1, Math.Round(venda.Itens.Sum(item => item.Quantidade), MidpointRounding.AwayFromZero)),
            venda.DataVenda,
            venda.DataUltimaAtualizacaoPedido,
            BuildAddressSummary(venda.EnderecoEntregaSnapshotJson),
            venda.ObservacaoPedido,
            MapEntrega(venda, includeCourierPanelLink: currentUser.HasPermission(Permissoes.AcessarPainelEntregador)));

    private PedidoDetalheDto MapDetalhe(Venda venda)
        => new(
            venda.VendaId,
            venda.ClienteId,
            venda.NumeroVenda,
            venda.CodigoAcompanhamento ?? venda.NumeroVenda,
            venda.Status.ToString(),
            venda.PedidoStatus?.ToString() ?? PedidoStatus.Recebido.ToString(),
            venda.AtendimentoTipo?.ToString() ?? AtendimentoPedidoTipo.Retirada.ToString(),
            venda.Cliente?.Nome ?? venda.ContatoNome ?? "Cliente do pedido",
            venda.Cliente?.Documento,
            venda.Cliente?.Telefone ?? venda.ContatoTelefone,
            venda.Subtotal,
            venda.DescontoTotal,
            venda.Total,
            venda.DataVenda,
            venda.DataUltimaAtualizacaoPedido,
            venda.ObservacaoPedido,
            BuildAddressSummary(venda.EnderecoEntregaSnapshotJson),
            MapEntrega(venda, includeCourierPanelLink: currentUser.HasPermission(Permissoes.GerenciarPedidos) || currentUser.HasPermission(Permissoes.AcessarPainelEntregador)),
            venda.Itens.Select(item => new VendaItemDto(
                item.VendaItemId,
                item.ProdutoId,
                item.Produto.Nome,
                item.Quantidade,
                item.ValorUnitario,
                item.Desconto,
                item.Total)).ToArray(),
            venda.Pagamentos.Select(item => new VendaPagamentoDto(
                item.VendaPagamentoId,
                item.FormaPagamento,
                item.CapturaModo,
                item.StatusTransacao,
                item.ProvedorOperacao,
                item.ReferenciaTransacao,
                item.CodigoAutorizacao,
                item.BandeiraCartao,
                item.UltimosDigitosCartao,
                item.Parcelas,
                item.ObservacaoOperacao,
                item.DataCaptura,
                item.ValorPago,
                item.Troco)).ToArray(),
            venda.OcorrenciasPedido
                .OrderBy(item => item.DataOcorrencia)
                .Select(item => new PedidoOcorrenciaDto(
                    item.PedidoOcorrenciaId,
                    item.Status.ToString(),
                    item.Titulo,
                    item.Descricao,
                    item.VisivelParaCliente,
                    item.DataOcorrencia,
                    item.UsuarioId,
                    item.Usuario?.Nome))
                .ToArray());

    private PedidoRealtimeEventoDto BuildRealtimeEvent(Venda venda, string tipoEvento = "Status")
        => new(
            venda.VendaId,
            venda.ClienteId,
            venda.NumeroVenda,
            venda.CodigoAcompanhamento ?? venda.NumeroVenda,
            venda.PedidoStatus?.ToString() ?? PedidoStatus.Recebido.ToString(),
            venda.DataUltimaAtualizacaoPedido ?? venda.DataVenda,
            tipoEvento,
            MapEntrega(venda, includeCourierPanelLink: false));

    private static PedidoEntregaDto? MapEntrega(Venda venda, bool includeCourierPanelLink)
    {
        var possuiEntrega = venda.AtendimentoTipo == AtendimentoPedidoTipo.Entrega ||
            venda.TransportadoraId.HasValue ||
            !string.IsNullOrWhiteSpace(venda.NomeEntregador) ||
            !string.IsNullOrWhiteSpace(venda.EntregaCodigoAcesso);

        if (!possuiEntrega)
        {
            return null;
        }

        return new PedidoEntregaDto(
            venda.TransportadoraId,
            venda.Transportadora?.Nome,
            venda.Transportadora?.CorTemaHex,
            venda.EntregadorUsuarioId,
            venda.EntregadorUsuario?.Nome,
            venda.NomeEntregador,
            venda.TelefoneEntregador,
            venda.EntregaCompartilhamentoAtivo,
            venda.EntregaUltimaAtualizacaoGps,
            includeCourierPanelLink && !string.IsNullOrWhiteSpace(venda.EntregaCodigoAcesso)
                ? $"/entrega/{venda.EntregaCodigoAcesso}"
                : null,
            MapEntregaLocalizacaoAtual(venda));
    }

    private static PedidoEntregaLocalizacaoDto? MapEntregaLocalizacaoAtual(Venda venda)
    {
        if (!venda.EntregaUltimaLatitude.HasValue || !venda.EntregaUltimaLongitude.HasValue || !venda.EntregaUltimaAtualizacaoGps.HasValue)
        {
            return null;
        }

        var latitude = venda.EntregaUltimaLatitude.Value;
        var longitude = venda.EntregaUltimaLongitude.Value;

        return new PedidoEntregaLocalizacaoDto(
            latitude,
            longitude,
            venda.EntregaPrecisaoMetros,
            venda.EntregaVelocidadeKmh,
            venda.EntregaDirecaoGraus,
            venda.EntregaUltimaAtualizacaoGps.Value,
            $"https://www.google.com/maps?q={latitude.ToString(System.Globalization.CultureInfo.InvariantCulture)},{longitude.ToString(System.Globalization.CultureInfo.InvariantCulture)}");
    }

    private static string BuildAddressSummary(string? enderecoEntregaSnapshotJson)
    {
        if (string.IsNullOrWhiteSpace(enderecoEntregaSnapshotJson))
        {
            return "Retirada no local";
        }

        try
        {
            var snapshot = JsonSerializer.Deserialize<EnderecoEntregaSnapshot>(enderecoEntregaSnapshotJson);
            if (snapshot is null)
            {
                return "Entrega em endereco do cliente";
            }

            var headline = string.Join(", ", new[]
            {
                snapshot.Logradouro,
                snapshot.Numero
            }.Where(item => !string.IsNullOrWhiteSpace(item)));

            var region = string.Join(" · ", new[]
            {
                snapshot.Bairro,
                string.Join("/", new[] { snapshot.Cidade, snapshot.Uf }.Where(item => !string.IsNullOrWhiteSpace(item)))
            }.Where(item => !string.IsNullOrWhiteSpace(item)));

            return string.Join(" - ", new[] { headline, region }.Where(item => !string.IsNullOrWhiteSpace(item)));
        }
        catch (JsonException)
        {
            return "Entrega em endereco do cliente";
        }
    }

    private static bool TryParsePedidoStatus(string? value, out PedidoStatus status)
        => Enum.TryParse(value, true, out status);

    private static bool TryParseAtendimento(string? value, out AtendimentoPedidoTipo atendimento)
        => Enum.TryParse(value, true, out atendimento);

    private static void ValidateStatusTransition(Venda pedido, PedidoStatus nextStatus)
    {
        var currentStatus = pedido.PedidoStatus ?? PedidoStatus.Recebido;
        if (currentStatus == nextStatus)
        {
            return;
        }

        var allowed = currentStatus switch
        {
            PedidoStatus.Recebido => pedido.AtendimentoTipo == AtendimentoPedidoTipo.Entrega
                ? new[] { PedidoStatus.EmPreparacao, PedidoStatus.SaiuParaEntrega }
                : new[] { PedidoStatus.EmPreparacao, PedidoStatus.ProntoParaRetirada },
            PedidoStatus.EmPreparacao => pedido.AtendimentoTipo == AtendimentoPedidoTipo.Entrega
                ? new[] { PedidoStatus.SaiuParaEntrega, PedidoStatus.Entregue }
                : new[] { PedidoStatus.ProntoParaRetirada, PedidoStatus.Entregue },
            PedidoStatus.ProntoParaRetirada => new[] { PedidoStatus.Entregue },
            PedidoStatus.SaiuParaEntrega => new[] { PedidoStatus.Entregue },
            PedidoStatus.Entregue => Array.Empty<PedidoStatus>(),
            PedidoStatus.Cancelado => Array.Empty<PedidoStatus>(),
            _ => Array.Empty<PedidoStatus>()
        };

        if (allowed.Contains(nextStatus))
        {
            return;
        }

        throw new AppException($"Nao foi possivel mover o pedido de {currentStatus} para {nextStatus} no fluxo atual.");
    }

    private static string BuildStatusTitle(PedidoStatus status, AtendimentoPedidoTipo? atendimentoTipo)
        => status switch
        {
            PedidoStatus.Recebido => "Pedido recebido",
            PedidoStatus.EmPreparacao => "Pedido em preparacao",
            PedidoStatus.ProntoParaRetirada => "Pedido pronto para retirada",
            PedidoStatus.SaiuParaEntrega => "Pedido saiu para entrega",
            PedidoStatus.Entregue => atendimentoTipo == AtendimentoPedidoTipo.Entrega ? "Pedido entregue na residencia" : "Pedido retirado pelo cliente",
            PedidoStatus.Cancelado => "Pedido cancelado",
            _ => "Pedido atualizado"
        };

    private static void ActivateDeliveryTrackingIfNeeded(Venda pedido, PedidoStatus nextStatus)
    {
        if (nextStatus != PedidoStatus.SaiuParaEntrega || pedido.AtendimentoTipo != AtendimentoPedidoTipo.Entrega)
        {
            return;
        }

        pedido.EntregaCompartilhamentoAtivo = true;

        if (string.IsNullOrWhiteSpace(pedido.EntregaCodigoAcesso))
        {
            pedido.EntregaCodigoAcesso = GenerateDeliveryTrackingCode();
        }
    }

    private static string GenerateDeliveryTrackingCode()
        => $"ENT-{Guid.NewGuid():N}"[..20].ToUpperInvariant();

    private static string? NormalizeOptionalText(string? value, int maxLength, string fieldName)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var normalized = value.Trim();
        if (normalized.Length > maxLength)
        {
            throw new AppException($"{fieldName} excede o limite de {maxLength} caracteres.");
        }

        return normalized;
    }

    private sealed record EnderecoEntregaSnapshot(
        string? Cep,
        string? Logradouro,
        string? Numero,
        string? Complemento,
        string? Bairro,
        string? Cidade,
        string? Uf);
}
