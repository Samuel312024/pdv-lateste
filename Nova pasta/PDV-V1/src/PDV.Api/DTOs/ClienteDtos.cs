namespace PDV.Api.DTOs;

public sealed record ClienteRequest(
    string Nome,
    string? Documento,
    string? Segmento,
    string? Telefone,
    string? Email,
    string? Cep,
    string? Logradouro,
    string? Numero,
    string? Complemento,
    string? Bairro,
    string? Cidade,
    string? Uf,
    string? CodigoMunicipioIbge,
    string? Endereco,
    bool EhFornecedor,
    bool Ativo);

public sealed record ClienteDto(
    Guid ClienteId,
    Guid EmpresaId,
    string Nome,
    string? Documento,
    string? Segmento,
    string? Telefone,
    string? Email,
    string? Cep,
    string? Logradouro,
    string? Numero,
    string? Complemento,
    string? Bairro,
    string? Cidade,
    string? Uf,
    string? CodigoMunicipioIbge,
    string? Endereco,
    bool EhFornecedor,
    bool Ativo,
    DateTime DataCadastro);

public sealed record ClientePerfilCompradorRequest(
    string? Nome,
    string Documento,
    string Telefone,
    string? Email,
    string Cep,
    string Logradouro,
    string Numero,
    string? Complemento,
    string Bairro,
    string Cidade,
    string Uf,
    string? CodigoMunicipioIbge);

public sealed record ClientePerfilCompradorResponse(
    ClienteDto Cliente,
    LoginResponse SessaoAtualizada);

public sealed record ClienteHistoricoResumoDto(
    decimal TotalComprado,
    int QuantidadeVendas,
    decimal TicketMedio,
    DateTime? UltimaCompra,
    int VendasCanceladas);

public sealed record ClienteHistoricoVendaDto(
    Guid VendaId,
    string NumeroVenda,
    DateTime DataVenda,
    string Status,
    decimal Total,
    decimal QuantidadeItens,
    string FormasPagamento);

public sealed record ClienteHistoricoProdutoFornecedorDto(
    Guid ProdutoId,
    string Nome,
    string? CodigoBarras,
    string? CodigoProdutoFornecedor,
    string? UltimaNotaFiscalCompra,
    decimal PrecoCusto,
    decimal EstoqueAtual,
    bool Ativo);

public sealed record ClienteHistoricoDto(
    Guid ClienteId,
    string Nome,
    ClienteHistoricoResumoDto Resumo,
    IReadOnlyCollection<ClienteHistoricoVendaDto> VendasRecentes,
    IReadOnlyCollection<ClienteHistoricoProdutoFornecedorDto> ProdutosRelacionados);
