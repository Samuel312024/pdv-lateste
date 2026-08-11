namespace PDV.Api.DTOs;

public sealed record CnpjLookupDto(
    string Cnpj,
    string RazaoSocial,
    string? NomeFantasia,
    string? Segmento,
    string? CnaePrincipalCodigo,
    string? CodigoMunicipioIbge,
    string? InscricaoEstadual,
    string? Telefone,
    string? TelefoneSecundario,
    string? Email,
    string? Cep,
    string? Logradouro,
    string? Numero,
    string? Complemento,
    string? Bairro,
    string? Cidade,
    string? Uf);
