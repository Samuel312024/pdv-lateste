namespace PDV.Api.DTOs;

public sealed record EmitirNotaFiscalVendaRequest(string? Observacoes);

public sealed record CancelarNotaFiscalRequest(string Justificativa);

public sealed record CartaCorrecaoNotaFiscalRequest(string Correcao);

public sealed record EnviarEmailNotaFiscalRequest(IReadOnlyCollection<string>? Destinatarios);

public sealed record BaixarNotaFiscalDocumentoRequest(
    string Tipo,
    bool IncluirLogotipo = false,
    bool ExibirNomeFantasia = false,
    string? Formato = null,
    string? MensagemRodape = null,
    bool? Canhoto = null);

public sealed record InutilizarNotaFiscalNumeracaoRequest(
    int Ano,
    int Serie,
    int NumeroInicial,
    int NumeroFinal,
    string Justificativa);

public sealed record TransmitirNotaFiscalResponse(
    NotaFiscalDto NotaFiscal,
    string Mensagem,
    bool Autorizada);

public sealed record NotaFiscalOperacaoResponse(
    NotaFiscalDto NotaFiscal,
    string Mensagem,
    bool Finalizado,
    string? EventoId,
    string? TipoEvento,
    int? CodigoStatus,
    string? Protocolo);

public sealed record NotaFiscalEmailResponse(
    NotaFiscalDto NotaFiscal,
    string Mensagem,
    string Status);

public sealed record NotaFiscalDownloadDocumentoDto(
    Guid NotaFiscalId,
    string Tipo,
    string ContentType,
    string? NomeArquivo,
    string? ConteudoBase64,
    string? ConteudoTexto,
    string? Url,
    bool Disponivel,
    string Mensagem);

public sealed record NotaFiscalInutilizacaoResponse(
    string Mensagem,
    bool Finalizado,
    string? EventoId,
    string? TipoEvento,
    int? CodigoStatus,
    string? Protocolo);

public sealed record NotaFiscalVendaDisponivelDto(
    Guid VendaId,
    string NumeroVenda,
    DateTime DataVenda,
    string DestinatarioNome,
    string? DestinatarioDocumento,
    decimal Total,
    int QuantidadeItens);

public sealed record NotaFiscalResumoDto(
    Guid NotaFiscalId,
    int Numero,
    int Serie,
    string Ambiente,
    string ProviderFiscal,
    string Status,
    string Origem,
    string? NumeroVenda,
    string DestinatarioNome,
    string? DestinatarioDocumento,
    DateTime DataEmissao,
    decimal ValorTotal,
    bool ProntaParaTransmissao,
    int QuantidadePendencias,
    string? ChaveAcesso,
    int? CodigoStatusSefaz,
    string? MensagemStatusSefaz,
    string? ProtocoloAutorizacao,
    DateTime? DataAutorizacao);

public sealed record NotaFiscalEmitenteSnapshotDto(
    string RazaoSocial,
    string? NomeFantasia,
    string? Cnpj,
    string? InscricaoEstadual,
    bool InscricaoEstadualIsento,
    string? InscricaoMunicipal,
    string? CnaePrincipal,
    string? Telefone,
    string? EmailFiscal,
    string? Cep,
    string? Logradouro,
    string? Numero,
    string? Complemento,
    string? Bairro,
    string? Cidade,
    string? Uf,
    string? CodigoMunicipioIbge,
    string RegimeTributario,
    string AmbienteNfe);

public sealed record NotaFiscalDestinatarioSnapshotDto(
    string Nome,
    string? Documento,
    string? Email,
    string? Telefone,
    string? Cep,
    string? Logradouro,
    string? Numero,
    string? Complemento,
    string? Bairro,
    string? Cidade,
    string? Uf);

public sealed record NotaFiscalItemDto(
    Guid NotaFiscalItemId,
    Guid ProdutoId,
    string ProdutoNome,
    string UnidadeMedida,
    string? Ncm,
    string? Cest,
    string? OrigemFiscal,
    string? Cfop,
    string? Csosn,
    string? CstIcms,
    string? CstPis,
    string? CstCofins,
    string? BeneficioFiscalCodigo,
    string? CodigoAnp,
    string? UnidadeTributavel,
    string? ExTipi,
    decimal? AliquotaIcms,
    decimal? AliquotaIpi,
    decimal? AliquotaPis,
    decimal? AliquotaCofins,
    decimal Quantidade,
    decimal ValorUnitario,
    decimal Desconto,
    decimal Total);

public sealed record NotaFiscalDto(
    Guid NotaFiscalId,
    Guid EmpresaId,
    Guid? VendaId,
    Guid? ClienteId,
    Guid UsuarioId,
    int Numero,
    int Serie,
    string Ambiente,
    string ProviderFiscal,
    string Status,
    string Origem,
    string? NumeroVenda,
    DateTime DataEmissao,
    decimal ValorProdutos,
    decimal ValorDesconto,
    decimal ValorTotal,
    bool ProntaParaTransmissao,
    string? ChaveAcesso,
    string? ReferenciaFiscal,
    string? DocumentoFiscalId,
    int? CodigoStatusSefaz,
    string? MensagemStatusSefaz,
    string? ProtocoloAutorizacao,
    string? DanfeUrl,
    DateTime? DataTransmissao,
    DateTime? DataAutorizacao,
    string? PayloadOriginalJson,
    string? PayloadProviderJson,
    string? RetornoProviderJson,
    string? XmlEnvio,
    string? XmlRetorno,
    string? Observacoes,
    IReadOnlyCollection<string> Pendencias,
    NotaFiscalEmitenteSnapshotDto Emitente,
    NotaFiscalDestinatarioSnapshotDto Destinatario,
    IReadOnlyCollection<NotaFiscalItemDto> Itens);
