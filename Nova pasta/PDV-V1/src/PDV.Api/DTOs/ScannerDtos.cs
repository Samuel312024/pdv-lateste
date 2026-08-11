using PDV.Api.Domain;

namespace PDV.Api.DTOs;

public sealed record CriarScannerSessaoRequest(string Contexto, ScannerTipoLeitura TipoLeitura = ScannerTipoLeitura.Auto);

public sealed record ScannerSessaoCriadaDto(
    string SessaoId,
    string ChaveAcesso,
    string Contexto,
    ScannerTipoLeitura TipoLeitura,
    DateTime ExpiraEmUtc,
    bool PermitePdvAnonimo = false);

public sealed record ScannerLeituraRequest(
    string Codigo,
    string? Formato,
    string? Origem);

public sealed record ScannerLeituraDto(
    long Sequencia,
    string Codigo,
    string? Formato,
    string? Origem,
    DateTime DataLeituraUtc);

public sealed record ScannerLogRequest(
    string Tipo,
    string Mensagem,
    string? Origem);

public sealed record ScannerLogDto(
    long Sequencia,
    string Tipo,
    string Mensagem,
    string? Origem,
    DateTime DataEventoUtc);

public sealed record ScannerSessaoPublicaDto(
    string SessaoId,
    string Contexto,
    ScannerTipoLeitura TipoLeitura,
    DateTime ExpiraEmUtc,
    bool PermitePdvAnonimo = false);

public sealed record ScannerCodigoEscaneadoDto(
    string SessaoId,
    long Sequencia,
    string CodigoBarras,
    string? Formato,
    string? Origem,
    DateTime DataLeituraUtc);

public sealed record ScannerStatusConexaoDto(
    string SessaoId,
    string Contexto,
    ScannerTipoLeitura TipoLeitura,
    string Papel,
    string Mensagem,
    bool PdvConectado,
    bool MobileConectado,
    int ConexoesPdv,
    int ConexoesMobile,
    DateTime DataEventoUtc);
