using System.Collections.Concurrent;

namespace PDV.Api.Services;

public sealed class UserPresenceService
{
    public static readonly TimeSpan DefaultOnlineWindow = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan RetentionWindow = TimeSpan.FromHours(12);
    private readonly ConcurrentDictionary<Guid, PresenceEntry> entries = new();

    public void RegisterHeartbeat(Guid usuarioId, Guid empresaId)
    {
        var now = DateTime.UtcNow;
        entries.AddOrUpdate(
            usuarioId,
            _ => new PresenceEntry(empresaId, now),
            (_, current) => current with
            {
                EmpresaId = empresaId,
                LastSeenUtc = now
            });

        PruneStale(now);
    }

    public IReadOnlyDictionary<Guid, UserPresenceStatus> GetPresenceMap(Guid empresaId, DateTime? referenceUtc = null, TimeSpan? onlineWindow = null)
    {
        var now = referenceUtc ?? DateTime.UtcNow;
        var threshold = now - (onlineWindow ?? DefaultOnlineWindow);
        PruneStale(now);

        return entries
            .Where(item => item.Value.EmpresaId == empresaId)
            .ToDictionary(
                item => item.Key,
                item => new UserPresenceStatus(item.Key, item.Value.LastSeenUtc, item.Value.LastSeenUtc >= threshold));
    }

    private void PruneStale(DateTime referenceUtc)
    {
        var cutoff = referenceUtc - RetentionWindow;
        foreach (var entry in entries)
        {
            if (entry.Value.LastSeenUtc < cutoff)
            {
                entries.TryRemove(entry.Key, out _);
            }
        }
    }

    private sealed record PresenceEntry(Guid EmpresaId, DateTime LastSeenUtc);
}

public sealed record UserPresenceStatus(
    Guid UsuarioId,
    DateTime LastSeenUtc,
    bool Online);
