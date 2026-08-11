using PDV.Api.Domain;

namespace PDV.Api.Fiscal.DTOs;

public enum FiscalDocumentoStatus
{
    Pendente = 1,
    Autorizada = 2,
    Rejeitada = 3,
    Cancelada = 4,
    Erro = 5
}

public sealed record FiscalProviderContext(
    Guid EmpresaId,
    string EmpresaNome,
    string? NomeFantasia,
    string Cnpj,
    string? InscricaoEstadual,
    bool InscricaoEstadualIsento,
    string? InscricaoMunicipal,
    string? Telefone,
    string? EmailFiscal,
    string Uf,
    EmpresaRegimeTributario RegimeTributario,
    string? CertificadoDigitalCaminho,
    string? CertificadoDigitalSenha,
    NFeEnderecoRequest? EnderecoEmitente,
    AmbienteFiscal Ambiente,
    FiscalProvider Provider,
    bool UsaIntegracaoDiretaSefaz,
    string? BaseUrl,
    string? TokenApiFiscal,
    string? ApiFiscalClientId,
    string? ApiFiscalClientSecret);

public sealed record NFeEnderecoRequest(
    string Logradouro,
    string Numero,
    string? Complemento,
    string Bairro,
    string Cidade,
    string Uf,
    string Cep,
    string CodigoMunicipioIbge,
    string? Telefone);

public sealed record NFeEmitenteRequest(
    string RazaoSocial,
    string? NomeFantasia,
    string Cnpj,
    string? InscricaoEstadual,
    bool InscricaoEstadualIsento,
    string? InscricaoMunicipal,
    string? CnaePrincipal,
    string? EmailFiscal,
    EmpresaRegimeTributario RegimeTributario,
    NFeEnderecoRequest Endereco);

public sealed record NFeDestinatarioRequest(
    string Nome,
    string? Documento,
    string? Email,
    bool ConsumidorFinal,
    NFeEnderecoRequest? Endereco);

public sealed record NFeImpostoRequest(
    string? OrigemFiscal,
    string? Csosn,
    string? CstIcms,
    string? CstPis,
    string? CstCofins,
    decimal? AliquotaIcms,
    decimal? AliquotaPis,
    decimal? AliquotaCofins);

public sealed record NFeItemRequest(
    Guid ProdutoId,
    string CodigoProduto,
    string Nome,
    string UnidadeComercial,
    string UnidadeTributavel,
    string? CodigoBarras,
    string Ncm,
    string? Cest,
    string Cfop,
    decimal Quantidade,
    decimal ValorUnitario,
    decimal Desconto,
    decimal Total,
    NFeImpostoRequest Impostos);

public sealed record NFePagamentoRequest(
    string FormaPagamento,
    decimal ValorPago);

public sealed record NFeRequest(
    Guid NotaFiscalId,
    string Referencia,
    AmbienteFiscal Ambiente,
    int Serie,
    int Numero,
    DateTime DataEmissaoUtc,
    string NaturezaOperacao,
    string ObservacoesComplementares,
    NFeEmitenteRequest Emitente,
    NFeDestinatarioRequest Destinatario,
    IReadOnlyCollection<NFeItemRequest> Itens,
    IReadOnlyCollection<NFePagamentoRequest> Pagamentos,
    decimal ValorProdutos,
    decimal ValorDesconto,
    decimal ValorTotal);

public sealed record EmitirNFeRequest(
    FiscalProviderContext Context,
    NFeRequest Documento);

public sealed record CancelarNFeRequest(
    string ReferenciaOuId,
    string Justificativa);

public sealed record CartaCorrecaoNFeRequest(
    string ReferenciaOuId,
    string Correcao);

public sealed record EnviarEmailNFeRequest(
    string ReferenciaOuId,
    IReadOnlyCollection<string> Destinatarios);

public sealed record InutilizarNFeRequest(
    int Ano,
    int Serie,
    int NumeroInicial,
    int NumeroFinal,
    string Justificativa);

public enum NFeDownloadDocumentoTipo
{
    DanfePdf = 1,
    XmlProcessado = 2,
    XmlNota = 3,
    XmlProtocolo = 4,
    CancelamentoPdf = 5,
    CancelamentoXml = 6,
    CartaCorrecaoPdf = 7,
    CartaCorrecaoXml = 8
}

public sealed record BaixarNFeDocumentoRequest(
    string ReferenciaOuId,
    NFeDownloadDocumentoTipo Tipo,
    bool IncluirLogotipo,
    bool ExibirNomeFantasia,
    string? Formato,
    string? MensagemRodape,
    bool? Canhoto);

public sealed record EmitirNFeResult(
    FiscalDocumentoStatus Status,
    string Mensagem,
    string Referencia,
    string? DocumentoId,
    int? CodigoStatus,
    string? ChaveAcesso,
    string? Protocolo,
    string? XmlAutorizado,
    string? DanfeUrl,
    string? DanfePdfBase64,
    string? PayloadOriginalJson,
    string? PayloadProviderJson,
    string? RetornoProviderJson,
    DateTime? DataTransmissaoUtc,
    DateTime? DataAutorizacaoUtc,
    bool Finalizado);

public sealed record ConsultarNFeResult(
    FiscalDocumentoStatus Status,
    string Mensagem,
    string Referencia,
    string? DocumentoId,
    int? CodigoStatus,
    string? ChaveAcesso,
    string? Protocolo,
    string? XmlAutorizado,
    string? DanfeUrl,
    string? DanfePdfBase64,
    string? RetornoProviderJson,
    DateTime? DataAutorizacaoUtc,
    bool Finalizado);

public sealed record CancelarNFeResult(
    FiscalDocumentoStatus Status,
    string Mensagem,
    string Referencia,
    string? DocumentoId,
    string? EventoId,
    int? CodigoStatus,
    string? Protocolo,
    string? ChaveAcesso,
    string? RetornoProviderJson,
    DateTime? DataRecebimentoUtc,
    bool Finalizado);

public sealed record FiscalEventoNFeResult(
    FiscalDocumentoStatus Status,
    string Mensagem,
    string Referencia,
    string? DocumentoId,
    string? EventoId,
    string? TipoEvento,
    int? CodigoStatus,
    string? Protocolo,
    string? ChaveAcesso,
    string? RetornoProviderJson,
    DateTime? DataRecebimentoUtc,
    bool Finalizado);

public sealed record EnviarEmailNFeResult(
    string Mensagem,
    string Referencia,
    string? DocumentoId,
    string Status,
    string? RetornoProviderJson);

public sealed record BaixarNFeDocumentoResult(
    string Referencia,
    string? DocumentoId,
    NFeDownloadDocumentoTipo Tipo,
    string ContentType,
    string? NomeArquivo,
    string? ConteudoBase64,
    string? ConteudoTexto,
    string? Url,
    bool Disponivel,
    string Mensagem);

public sealed record InutilizarNFeResult(
    FiscalDocumentoStatus Status,
    string Mensagem,
    string? EventoId,
    string? TipoEvento,
    int? CodigoStatus,
    string? Protocolo,
    string? ChaveAcesso,
    string? RetornoProviderJson,
    DateTime? DataRecebimentoUtc,
    bool Finalizado);

public sealed record StatusServicoResult(
    bool Disponivel,
    int? CodigoStatus,
    string Mensagem,
    string Url,
    DateTime? DataRecebimentoUtc,
    string? DetalheTecnico);
