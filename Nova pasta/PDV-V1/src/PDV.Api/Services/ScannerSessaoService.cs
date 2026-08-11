using System.Collections.Concurrent;
using PDV.Api.Common;
using PDV.Api.DTOs;
using PDV.Api.Domain;

namespace PDV.Api.Services;

public class ScannerSessaoService
{
    private static readonly TimeSpan SessionLifetime = TimeSpan.FromMinutes(20);
    private static readonly HashSet<string> AnonymousDesktopContexts = new(StringComparer.OrdinalIgnoreCase)
    {
        "acesso-profissional-caixa",
        "acesso-profissional-pdv",
        "ativacao-terminal"
    };
    private readonly ConcurrentDictionary<string, ScannerSessaoInterna> sessions = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, ScannerConexaoInterna> connections = new(StringComparer.OrdinalIgnoreCase);

    public ScannerSessaoCriadaDto CriarSessao(CriarScannerSessaoRequest request, bool permitePdvAnonimo = false)
    {
        if (string.IsNullOrWhiteSpace(request.Contexto))
        {
            throw new AppException("Contexto da sessao de scanner e obrigatorio.");
        }

        CleanupExpiredSessions();

        var sessionId = Guid.NewGuid().ToString("N");
        var accessKey = Convert.ToHexString(Guid.NewGuid().ToByteArray()).ToLowerInvariant();
        var expiresAt = DateTime.UtcNow.Add(SessionLifetime);
        var contexto = request.Contexto.Trim();

        sessions[sessionId] = new ScannerSessaoInterna(
            sessionId,
            accessKey,
            contexto,
            request.TipoLeitura,
            expiresAt,
            permitePdvAnonimo);

        return new ScannerSessaoCriadaDto(sessionId, accessKey, contexto, request.TipoLeitura, expiresAt, permitePdvAnonimo);
    }

    public bool CanCreateAnonymousDesktopSession(string contexto)
        => !string.IsNullOrWhiteSpace(contexto) && AnonymousDesktopContexts.Contains(contexto.Trim());

    public ScannerSessaoPublicaDto GetSessaoPublica(string sessaoId, string chaveAcesso)
    {
        var session = GetSession(sessaoId, chaveAcesso);
        return new ScannerSessaoPublicaDto(session.SessionId, session.Contexto, session.TipoLeitura, session.ExpiresAtUtc, session.PermitePdvAnonimo);
    }

    public IReadOnlyCollection<ScannerLeituraDto> GetLeituras(string sessaoId, long afterSequence)
    {
        var session = GetSession(sessaoId);

        lock (session.SyncRoot)
        {
            return session.Events
                .Where(item => item.Sequencia > afterSequence)
                .OrderBy(item => item.Sequencia)
                .Select(MapReading)
                .ToArray();
        }
    }

    public IReadOnlyCollection<ScannerLogDto> GetLogs(string sessaoId, long afterSequence)
    {
        var session = GetSession(sessaoId);

        lock (session.SyncRoot)
        {
            return session.Logs
                .Where(item => item.Sequencia > afterSequence)
                .OrderBy(item => item.Sequencia)
                .Select(MapLog)
                .ToArray();
        }
    }

    public ScannerLeituraDto RegistrarLeitura(string sessaoId, string chaveAcesso, ScannerLeituraRequest request)
        => RegistrarLeituraInterna(GetSession(sessaoId, chaveAcesso), request);

    public ScannerCodigoEscaneadoDto RegistrarLeituraRealtime(
        string sessaoId,
        string connectionId,
        string codigoBarras,
        string? formato,
        string? origem)
    {
        var connection = GetConnection(connectionId);
        var session = GetSession(sessaoId, connection.Role == ScannerConnectionRole.Mobile ? connection.AccessKey : null);
        var leitura = RegistrarLeituraInterna(session, new ScannerLeituraRequest(codigoBarras, formato, origem ?? connection.DisplayName));

        return new ScannerCodigoEscaneadoDto(
            session.SessionId,
            leitura.Sequencia,
            leitura.Codigo,
            leitura.Formato,
            leitura.Origem,
            leitura.DataLeituraUtc);
    }

    public ScannerLogDto RegistrarLog(string sessaoId, string chaveAcesso, ScannerLogRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Tipo))
        {
            throw new AppException("Tipo do log do scanner e obrigatorio.");
        }

        if (string.IsNullOrWhiteSpace(request.Mensagem))
        {
            throw new AppException("Mensagem do log do scanner e obrigatoria.");
        }

        var session = GetSession(sessaoId, chaveAcesso);

        lock (session.SyncRoot)
        {
            session.LogSequence++;
            var log = new ScannerLogInterno(
                session.LogSequence,
                request.Tipo.Trim(),
                request.Mensagem.Trim(),
                string.IsNullOrWhiteSpace(request.Origem) ? null : request.Origem.Trim(),
                DateTime.UtcNow);

            session.Logs.Add(log);
            TrimLogs(session);
            return MapLog(log);
        }
    }

    public bool CanConnectAnonymousDesktop(string sessaoId, string? chaveAcesso)
    {
        if (string.IsNullOrWhiteSpace(chaveAcesso))
        {
            return false;
        }

        try
        {
            var session = GetSession(sessaoId, chaveAcesso);
            return session.PermitePdvAnonimo;
        }
        catch
        {
            return false;
        }
    }

    public ScannerStatusConexaoDto RegistrarConexaoPdv(string sessaoId, string connectionId, string? displayName, string? chaveAcesso = null)
    {
        var session = string.IsNullOrWhiteSpace(chaveAcesso)
            ? GetSession(sessaoId)
            : GetSession(sessaoId, chaveAcesso);

        if (!string.IsNullOrWhiteSpace(chaveAcesso) && !session.PermitePdvAnonimo)
        {
            throw new UnauthorizedAppException("Esta sessao de scanner nao aceita conexao anonima do PDV.");
        }

        var safeDisplayName = string.IsNullOrWhiteSpace(displayName) ? "PDV" : displayName.Trim();

        lock (session.SyncRoot)
        {
            session.PdvConnections.Add(connectionId);
            connections[connectionId] = new ScannerConexaoInterna(session.SessionId, null, ScannerConnectionRole.Pdv, safeDisplayName);

            return BuildStatus(session, "pdv", $"{safeDisplayName} conectado ao scanner global.");
        }
    }

    public ScannerStatusConexaoDto RegistrarConexaoMobile(string sessaoId, string chaveAcesso, string connectionId, string? displayName)
    {
        var session = GetSession(sessaoId, chaveAcesso);
        var safeDisplayName = string.IsNullOrWhiteSpace(displayName) ? "Celular" : displayName.Trim();

        lock (session.SyncRoot)
        {
            session.MobileConnections.Add(connectionId);
            connections[connectionId] = new ScannerConexaoInterna(session.SessionId, chaveAcesso, ScannerConnectionRole.Mobile, safeDisplayName);

            return BuildStatus(session, "mobile", $"{safeDisplayName} conectado ao scanner global.");
        }
    }

    public ScannerStatusConexaoDto? RemoverConexao(string connectionId)
    {
        if (!connections.TryRemove(connectionId, out var connection))
        {
            return null;
        }

        if (!sessions.TryGetValue(connection.SessionId, out var session) || session.ExpiresAtUtc <= DateTime.UtcNow)
        {
            return null;
        }

        lock (session.SyncRoot)
        {
            if (connection.Role == ScannerConnectionRole.Pdv)
            {
                session.PdvConnections.Remove(connectionId);
            }
            else
            {
                session.MobileConnections.Remove(connectionId);
            }

            return BuildStatus(
                session,
                connection.Role == ScannerConnectionRole.Pdv ? "pdv" : "mobile",
                $"{connection.DisplayName} desconectado do scanner global.");
        }
    }

    public bool TryGetSessaoDaConexao(string connectionId, out string sessaoId)
    {
        if (connections.TryGetValue(connectionId, out var connection))
        {
            sessaoId = connection.SessionId;
            return true;
        }

        sessaoId = string.Empty;
        return false;
    }

    public string GetGroupName(string sessaoId) => $"scanner-session:{sessaoId}";

    public void EncerrarSessao(string sessaoId)
    {
        if (!sessions.TryRemove(sessaoId, out _))
        {
            return;
        }

        foreach (var connection in connections.Where(item => item.Value.SessionId == sessaoId).ToArray())
        {
            connections.TryRemove(connection.Key, out _);
        }
    }

    private ScannerLeituraDto RegistrarLeituraInterna(ScannerSessaoInterna session, ScannerLeituraRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Codigo))
        {
            throw new AppException("Codigo lido e obrigatorio.");
        }

        lock (session.SyncRoot)
        {
            session.Sequence++;
            var reading = new ScannerLeituraInterna(
                session.Sequence,
                request.Codigo.Trim(),
                string.IsNullOrWhiteSpace(request.Formato) ? null : request.Formato.Trim(),
                string.IsNullOrWhiteSpace(request.Origem) ? null : request.Origem.Trim(),
                DateTime.UtcNow);

            session.Events.Add(reading);
            if (session.Events.Count > 80)
            {
                session.Events.RemoveRange(0, session.Events.Count - 80);
            }

            return MapReading(reading);
        }
    }

    private ScannerSessaoInterna GetSession(string sessaoId, string? chaveAcesso = null)
    {
        CleanupExpiredSessions();

        if (!sessions.TryGetValue(sessaoId, out var session))
        {
            throw new NotFoundException("Sessao de scanner nao encontrada ou expirada.");
        }

        if (session.ExpiresAtUtc <= DateTime.UtcNow)
        {
            EncerrarSessao(sessaoId);
            throw new NotFoundException("Sessao de scanner expirou.");
        }

        if (chaveAcesso is not null && !string.Equals(session.AccessKey, chaveAcesso, StringComparison.Ordinal))
        {
            throw new UnauthorizedAppException("Chave de acesso da sessao de scanner invalida.");
        }

        return session;
    }

    private ScannerConexaoInterna GetConnection(string connectionId)
    {
        if (!connections.TryGetValue(connectionId, out var connection))
        {
            throw new UnauthorizedAppException("Conexao de scanner nao registrada na sessao.");
        }

        return connection;
    }

    private void CleanupExpiredSessions()
    {
        var now = DateTime.UtcNow;
        foreach (var session in sessions.ToArray())
        {
            if (session.Value.ExpiresAtUtc <= now)
            {
                EncerrarSessao(session.Key);
            }
        }
    }

    private static ScannerStatusConexaoDto BuildStatus(ScannerSessaoInterna session, string papel, string mensagem)
        => new(
            session.SessionId,
            session.Contexto,
            session.TipoLeitura,
            papel,
            mensagem,
            session.PdvConnections.Count > 0,
            session.MobileConnections.Count > 0,
            session.PdvConnections.Count,
            session.MobileConnections.Count,
            DateTime.UtcNow);

    private static ScannerLeituraDto MapReading(ScannerLeituraInterna item)
        => new(item.Sequencia, item.Codigo, item.Formato, item.Origem, item.DataLeituraUtc);

    private static ScannerLogDto MapLog(ScannerLogInterno item)
        => new(item.Sequencia, item.Tipo, item.Mensagem, item.Origem, item.DataEventoUtc);

    private static void TrimLogs(ScannerSessaoInterna session)
    {
        if (session.Logs.Count > 120)
        {
            session.Logs.RemoveRange(0, session.Logs.Count - 120);
        }
    }

    private sealed class ScannerSessaoInterna(
        string sessionId,
        string accessKey,
        string contexto,
        ScannerTipoLeitura tipoLeitura,
        DateTime expiresAtUtc,
        bool permitePdvAnonimo)
    {
        public string SessionId { get; } = sessionId;
        public string AccessKey { get; } = accessKey;
        public string Contexto { get; } = contexto;
        public ScannerTipoLeitura TipoLeitura { get; } = tipoLeitura;
        public DateTime ExpiresAtUtc { get; } = expiresAtUtc;
        public bool PermitePdvAnonimo { get; } = permitePdvAnonimo;
        public long Sequence { get; set; }
        public long LogSequence { get; set; }
        public List<ScannerLeituraInterna> Events { get; } = [];
        public List<ScannerLogInterno> Logs { get; } = [];
        public HashSet<string> PdvConnections { get; } = [];
        public HashSet<string> MobileConnections { get; } = [];
        public object SyncRoot { get; } = new();
    }

    private sealed record ScannerLeituraInterna(
        long Sequencia,
        string Codigo,
        string? Formato,
        string? Origem,
        DateTime DataLeituraUtc);

    private sealed record ScannerLogInterno(
        long Sequencia,
        string Tipo,
        string Mensagem,
        string? Origem,
        DateTime DataEventoUtc);

    private sealed record ScannerConexaoInterna(
        string SessionId,
        string? AccessKey,
        ScannerConnectionRole Role,
        string DisplayName);

    private enum ScannerConnectionRole
    {
        Pdv = 1,
        Mobile = 2
    }
}
