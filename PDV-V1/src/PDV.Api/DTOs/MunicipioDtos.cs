namespace PDV.Api.DTOs;

public sealed record MunicipioLookupDto(
    Guid MunicipioId,
    string CodigoIbge,
    string Nome,
    string Uf);

public sealed record MunicipioResolutionDto(
    bool HasInput,
    bool IsValid,
    MunicipioLookupDto? Municipio,
    string? ErrorMessage);
