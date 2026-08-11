namespace PDV.Api.DTOs;

public sealed record CepLookupDto(
    string Cep,
    string? Logradouro,
    string? Complemento,
    string? Bairro,
    string Cidade,
    string Uf,
    string? CodigoMunicipioIbge);
