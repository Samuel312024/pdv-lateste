namespace PDV.Api.DTOs;

public sealed record TerminalPdvDto(
    Guid TerminalPdvId,
    Guid EmpresaId,
    string CodigoTerminal,
    string NomeTerminal,
    string? LojaNome,
    string? EstadoUf,
    int NumeroPdv,
    string PerfilInstalacao,
    string PerfilImpressora,
    string PerfilScanner,
    string PerfilTeclado,
    bool ImpressaoAutomatica,
    string? Observacao,
    string ChaveAtivacaoMascara,
    bool Ativo,
    bool Ativado,
    string? DispositivoIdentificador,
    string? NomeHost,
    string? VersaoInstalador,
    string? VersaoAplicativo,
    string? UltimoIp,
    DateTime DataCadastro,
    DateTime ChaveGeradaEm,
    DateTime? AtivadoEm,
    DateTime? UltimaSincronizacaoEm);

public sealed record CriarTerminalPdvRequest(
    string NomeTerminal,
    string? LojaNome,
    string? EstadoUf,
    int NumeroPdv,
    string PerfilInstalacao,
    string? PerfilImpressora,
    string? PerfilScanner,
    string? PerfilTeclado,
    bool? ImpressaoAutomatica,
    string? Observacao);

public sealed record TerminalPdvCriadoDto(
    TerminalPdvDto Terminal,
    string ChaveAtivacao);

public sealed record TerminalPdvChaveRegeneradaDto(
    Guid TerminalPdvId,
    string CodigoTerminal,
    string ChaveAtivacao,
    string ChaveAtivacaoMascara,
    DateTime ChaveGeradaEm);

public sealed record AtualizarTerminalPdvStatusRequest(bool Ativo);

public sealed record AtivarTerminalPdvRequest(
    string CodigoTerminal,
    string ChaveAtivacao,
    string? DispositivoIdentificador,
    string? NomeHost,
    string? VersaoInstalador,
    string? VersaoAplicativo);

public sealed record TerminalPdvAtivacaoDto(
    string CodigoTerminal,
    string NomeTerminal,
    string? LojaNome,
    string? EstadoUf,
    int NumeroPdv,
    string PerfilInstalacao,
    string PerfilImpressora,
    string PerfilScanner,
    string PerfilTeclado,
    bool ImpressaoAutomatica,
    bool Ativo,
    bool Ativado,
    DateTime? AtivadoEm,
    DateTime UltimaSincronizacaoEm);
