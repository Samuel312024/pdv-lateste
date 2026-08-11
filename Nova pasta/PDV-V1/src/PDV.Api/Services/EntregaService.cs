using Microsoft.EntityFrameworkCore;
using PDV.Api.Common;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Infrastructure;

namespace PDV.Api.Services;

public class EntregaService(
    AppDbContext dbContext,
    CurrentUserService currentUser,
    PedidoRealtimeNotifier pedidoRealtimeNotifier)
{
    public async Task<PedidoEntregaDto> AtualizarEntregaAsync(Guid vendaId, AtualizarPedidoEntregaRequest request)
    {
        EnsureInternalDeliveryAccess();

        var pedido = await LoadPedidoAsync(vendaId, currentUser.GetEmpresaId(), trackChanges: true);
        if (!pedido.EhPedido || pedido.AtendimentoTipo != AtendimentoPedidoTipo.Entrega)
        {
            throw new AppException("A configuracao de entrega so pode ser aplicada a pedidos com entrega em domicilio.");
        }

        Transportadora? transportadora = null;
        if (request.TransportadoraId.HasValue)
        {
            transportadora = await dbContext.Transportadoras
                .FirstOrDefaultAsync(item =>
                    item.TransportadoraId == request.TransportadoraId.Value &&
                    item.EmpresaId == pedido.EmpresaId &&
                    item.Ativo)
                ?? throw new AppException("Transportadora nao encontrada ou inativa.");
        }

        var entregadorUsuario = request.EntregadorUsuarioId.HasValue
            ? await LoadCourierUserAsync(request.EntregadorUsuarioId.Value, pedido.EmpresaId)
            : null;

        var nomeEntregador = NormalizeOptionalText(request.NomeEntregador, 120, "Nome do entregador")
            ?? entregadorUsuario?.Nome;
        var telefoneEntregador = NormalizeOptionalText(request.TelefoneEntregador, 20, "Telefone do entregador");
        var houveMudanca = pedido.TransportadoraId != request.TransportadoraId ||
            pedido.EntregadorUsuarioId != request.EntregadorUsuarioId ||
            !string.Equals(pedido.NomeEntregador, nomeEntregador, StringComparison.Ordinal) ||
            !string.Equals(pedido.TelefoneEntregador, telefoneEntregador, StringComparison.Ordinal) ||
            pedido.EntregaCompartilhamentoAtivo != request.CompartilhamentoAtivo;

        pedido.TransportadoraId = request.TransportadoraId;
        pedido.EntregadorUsuarioId = request.EntregadorUsuarioId;
        pedido.NomeEntregador = nomeEntregador;
        pedido.TelefoneEntregador = telefoneEntregador;
        pedido.EntregaCompartilhamentoAtivo = request.CompartilhamentoAtivo;
        if (request.CompartilhamentoAtivo && string.IsNullOrWhiteSpace(pedido.EntregaCodigoAcesso))
        {
            pedido.EntregaCodigoAcesso = GeneratePublicDeliveryCode();
        }

        if (houveMudanca)
        {
            pedido.DataUltimaAtualizacaoPedido = DateTime.UtcNow;
            dbContext.PedidoOcorrencias.Add(new PedidoOcorrencia
            {
                PedidoOcorrenciaId = Guid.NewGuid(),
                EmpresaId = pedido.EmpresaId,
                VendaId = pedido.VendaId,
                UsuarioId = currentUser.GetUserId(),
                Status = pedido.PedidoStatus ?? PedidoStatus.Recebido,
                Titulo = "Entrega configurada",
                Descricao = BuildAssignmentDescription(transportadora, entregadorUsuario, nomeEntregador, request.CompartilhamentoAtivo),
                VisivelParaCliente = true,
                DataOcorrencia = pedido.DataUltimaAtualizacaoPedido.Value
            });
        }

        await dbContext.SaveChangesAsync();

        var atualizado = await LoadPedidoAsync(vendaId, currentUser.GetEmpresaId(), trackChanges: false);
        await pedidoRealtimeNotifier.NotifyAsync(
            atualizado.EmpresaId,
            BuildRealtimeEvent(atualizado, "Entrega"),
            atualizado.ClienteId,
            atualizado.EntregadorUsuarioId);

        return MapEntrega(atualizado, includeCourierPanelLink: true)
            ?? throw new AppException("Nao foi possivel montar os dados da entrega.");
    }

    public async Task<PainelEntregaPublicoDto> GetPainelPublicoAsync(string codigoAcesso)
    {
        var pedido = await LoadPedidoByPublicCodeAsync(codigoAcesso, trackChanges: false);
        return MapPainelPublico(pedido);
    }

    public async Task<PainelEntregaPublicoDto> RegistrarLocalizacaoAsync(string codigoAcesso, RegistrarEntregaLocalizacaoRequest request)
    {
        ValidateLocation(request);

        var pedido = await LoadPedidoByPublicCodeAsync(codigoAcesso, trackChanges: true);
        if (pedido.Status == VendaStatus.Cancelada || pedido.PedidoStatus is PedidoStatus.Cancelado or PedidoStatus.Entregue)
        {
            throw new AppException("Este pedido nao aceita mais atualizacoes de localizacao.");
        }

        var dataCaptura = DateTime.UtcNow;
        pedido.EntregaCompartilhamentoAtivo = true;
        pedido.EntregaUltimaLatitude = request.Latitude;
        pedido.EntregaUltimaLongitude = request.Longitude;
        pedido.EntregaPrecisaoMetros = request.PrecisaoMetros;
        pedido.EntregaVelocidadeKmh = request.VelocidadeKmh;
        pedido.EntregaDirecaoGraus = request.DirecaoGraus;
        pedido.EntregaUltimaAtualizacaoGps = dataCaptura;
        pedido.DataUltimaAtualizacaoPedido = dataCaptura;

        dbContext.PedidoEntregaLocalizacoes.Add(new PedidoEntregaLocalizacao
        {
            PedidoEntregaLocalizacaoId = Guid.NewGuid(),
            EmpresaId = pedido.EmpresaId,
            VendaId = pedido.VendaId,
            Latitude = request.Latitude,
            Longitude = request.Longitude,
            PrecisaoMetros = request.PrecisaoMetros,
            VelocidadeKmh = request.VelocidadeKmh,
            DirecaoGraus = request.DirecaoGraus,
            DataCaptura = dataCaptura,
            Origem = "Entregador"
        });

        await dbContext.SaveChangesAsync();

        var atualizado = await LoadPedidoByPublicCodeAsync(codigoAcesso, trackChanges: false);
        await pedidoRealtimeNotifier.NotifyAsync(
            atualizado.EmpresaId,
            BuildRealtimeEvent(atualizado, "Localizacao"),
            atualizado.ClienteId,
            atualizado.EntregadorUsuarioId);

        return MapPainelPublico(atualizado);
    }

    private async Task<Venda> LoadPedidoAsync(Guid vendaId, Guid empresaId, bool trackChanges)
    {
        var query = BuildPedidoQuery(empresaId);
        if (!trackChanges)
        {
            query = query.AsNoTracking();
        }

        return await query.FirstOrDefaultAsync(item => item.VendaId == vendaId)
            ?? throw new NotFoundException("Pedido nao encontrado.");
    }

    private async Task<Venda> LoadPedidoByPublicCodeAsync(string codigoAcesso, bool trackChanges)
    {
        var normalizedCode = NormalizePublicCode(codigoAcesso);
        if (string.IsNullOrWhiteSpace(normalizedCode))
        {
            throw new NotFoundException("Link de entrega invalido.");
        }

        var query = dbContext.Vendas
            .AsSplitQuery()
            .Include(item => item.Cliente)
            .Include(item => item.EntregadorUsuario)
            .Include(item => item.Transportadora)
            .Where(item => item.EhPedido && item.EntregaCodigoAcesso == normalizedCode);

        if (!trackChanges)
        {
            query = query.AsNoTracking();
        }

        return await query.FirstOrDefaultAsync()
            ?? throw new NotFoundException("Link de entrega nao encontrado.");
    }

    private IQueryable<Venda> BuildPedidoQuery(Guid empresaId)
        => dbContext.Vendas
            .AsSplitQuery()
            .Include(item => item.Cliente)
            .Include(item => item.EntregadorUsuario)
            .Include(item => item.Transportadora)
            .Where(item => item.EmpresaId == empresaId && item.EhPedido);

    private void EnsureInternalDeliveryAccess()
    {
        if (currentUser.HasPermission(Permissoes.GerenciarPedidos) || currentUser.HasPermission(Permissoes.VisualizarPedidos))
        {
            return;
        }

        throw new ForbiddenAppException("Seu usuario nao possui acesso para configurar entregas.");
    }

    private async Task<Usuario> LoadCourierUserAsync(Guid usuarioId, Guid empresaId)
    {
        var usuario = await dbContext.Usuarios
            .AsSplitQuery()
            .Include(item => item.Perfil)
                .ThenInclude(item => item.PerfilPermissoes)
                    .ThenInclude(item => item.Permissao)
            .Include(item => item.UsuarioPermissoes)
                .ThenInclude(item => item.Permissao)
            .FirstOrDefaultAsync(item =>
                item.UsuarioId == usuarioId &&
                item.EmpresaId == empresaId &&
                item.Ativo)
            ?? throw new AppException("Usuario entregador nao encontrado ou inativo.");

        var permissoes = usuario.UsarPermissoesCustomizadas
            ? usuario.UsuarioPermissoes.Select(item => item.Permissao.Codigo)
            : usuario.Perfil.PerfilPermissoes.Select(item => item.Permissao.Codigo);

        if (!permissoes.Contains(Permissoes.AcessarPainelEntregador, StringComparer.OrdinalIgnoreCase))
        {
            throw new AppException("O usuario selecionado nao possui a feature flag do painel do entregador.");
        }

        return usuario;
    }

    private static string BuildAssignmentDescription(Transportadora? transportadora, Usuario? entregadorUsuario, string? nomeEntregador, bool compartilhamentoAtivo)
    {
        var partes = new List<string>();

        if (transportadora is not null)
        {
            partes.Add($"Transportadora: {transportadora.Nome}");
        }

        if (entregadorUsuario is not null)
        {
            partes.Add($"Usuario entregador: {entregadorUsuario.Nome}");
        }

        if (!string.IsNullOrWhiteSpace(nomeEntregador))
        {
            partes.Add($"Entregador: {nomeEntregador}");
        }

        partes.Add(compartilhamentoAtivo
            ? "Link de rastreio do entregador liberado para compartilhamento."
            : "Compartilhamento de GPS pausado.");

        return string.Join(" · ", partes);
    }

    private static void ValidateLocation(RegistrarEntregaLocalizacaoRequest request)
    {
        if (request.Latitude is < -90 or > 90)
        {
            throw new AppException("Latitude invalida para a entrega.");
        }

        if (request.Longitude is < -180 or > 180)
        {
            throw new AppException("Longitude invalida para a entrega.");
        }

        if (request.PrecisaoMetros.HasValue && request.PrecisaoMetros.Value < 0)
        {
            throw new AppException("Precisao do GPS nao pode ser negativa.");
        }
    }

    private static string NormalizePublicCode(string? codigoAcesso)
        => string.IsNullOrWhiteSpace(codigoAcesso)
            ? string.Empty
            : codigoAcesso.Trim().ToUpperInvariant();

    private static string GeneratePublicDeliveryCode()
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

    private static PainelEntregaPublicoDto MapPainelPublico(Venda venda)
        => new(
            venda.VendaId,
            venda.CodigoAcompanhamento ?? venda.NumeroVenda,
            venda.PedidoStatus?.ToString() ?? PedidoStatus.Recebido.ToString(),
            venda.Cliente?.Nome ?? venda.ContatoNome ?? "Cliente do pedido",
            BuildAddressSummary(venda.EnderecoEntregaSnapshotJson),
            venda.ObservacaoPedido,
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

    private static PedidoRealtimeEventoDto BuildRealtimeEvent(Venda venda, string tipoEvento)
        => new(
            venda.VendaId,
            venda.ClienteId,
            venda.NumeroVenda,
            venda.CodigoAcompanhamento ?? venda.NumeroVenda,
            venda.PedidoStatus?.ToString() ?? PedidoStatus.Recebido.ToString(),
            venda.DataUltimaAtualizacaoPedido ?? venda.DataVenda,
            tipoEvento,
            MapEntrega(venda, includeCourierPanelLink: false));

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
            return "Entrega em endereco do cliente";
        }

        try
        {
            var snapshot = System.Text.Json.JsonSerializer.Deserialize<EnderecoEntregaSnapshot>(enderecoEntregaSnapshotJson);
            if (snapshot is null)
            {
                return "Entrega em endereco do cliente";
            }

            var headline = string.Join(", ", new[] { snapshot.Logradouro, snapshot.Numero }.Where(item => !string.IsNullOrWhiteSpace(item)));
            var region = string.Join(" · ", new[]
            {
                snapshot.Bairro,
                string.Join("/", new[] { snapshot.Cidade, snapshot.Uf }.Where(item => !string.IsNullOrWhiteSpace(item)))
            }.Where(item => !string.IsNullOrWhiteSpace(item)));

            return string.Join(" - ", new[] { headline, region }.Where(item => !string.IsNullOrWhiteSpace(item)));
        }
        catch (System.Text.Json.JsonException)
        {
            return "Entrega em endereco do cliente";
        }
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
