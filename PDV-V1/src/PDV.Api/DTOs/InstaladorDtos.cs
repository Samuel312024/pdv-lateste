namespace PDV.Api.DTOs;

public sealed record InstaladorPdvStatusDto(
    bool Disponivel,
    string NomeArquivo,
    long? TamanhoBytes,
    DateTimeOffset? AtualizadoEmUtc,
    string DownloadUrl);
