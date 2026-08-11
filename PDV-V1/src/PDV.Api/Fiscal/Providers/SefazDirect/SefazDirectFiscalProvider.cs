using Microsoft.EntityFrameworkCore;
using PDV.Api.Common;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Fiscal.Contracts;
using PDV.Api.Fiscal.DTOs;
using PDV.Api.Infrastructure;
using PDV.Api.Services;

namespace PDV.Api.Fiscal.Providers.SefazDirect;

public class SefazDirectFiscalProvider(
    FiscalProviderContext context,
    AppDbContext dbContext,
    CurrentUserService currentUser,
    NfeTransmissionService nfeTransmissionService) : IFiscalProvider
{
    private readonly FiscalProviderContext _context = context;

    public FiscalProvider Kind => FiscalProvider.SefazDirect;
    public string DisplayName => "SEFAZ direta";

    public async Task<EmitirNFeResult> EmitirNFeAsync(EmitirNFeRequest request)
    {
        var nota = await nfeTransmissionService.TransmitirAsync(request.Documento.NotaFiscalId);
        return new EmitirNFeResult(
            nota.Status == NotaFiscalStatus.Autorizada ? FiscalDocumentoStatus.Autorizada : nota.Status == NotaFiscalStatus.Rejeitada ? FiscalDocumentoStatus.Rejeitada : FiscalDocumentoStatus.Pendente,
            nota.MensagemStatusSefaz ?? "Transmissao direta concluida.",
            request.Documento.Referencia,
            nota.NotaFiscalId.ToString("N"),
            nota.CodigoStatusSefaz,
            nota.ChaveAcesso,
            nota.ProtocoloAutorizacao,
            nota.XmlRetorno,
            null,
            null,
            null,
            null,
            nota.XmlRetorno,
            nota.DataTransmissao,
            nota.DataAutorizacao,
            nota.Status is NotaFiscalStatus.Autorizada or NotaFiscalStatus.Rejeitada);
    }

    public async Task<ConsultarNFeResult> ConsultarNFeAsync(string referenciaOuId)
    {
        var empresaId = currentUser.GetEmpresaId();
        var nota = await dbContext.NotasFiscais
            .AsNoTracking()
            .FirstOrDefaultAsync(item =>
                item.EmpresaId == empresaId &&
                (item.NotaFiscalId.ToString() == referenciaOuId || item.ReferenciaFiscal == referenciaOuId || item.ChaveAcesso == referenciaOuId))
            ?? throw new NotFoundException("NF-e nao localizada para consulta direta.");

        var status = nota.Status switch
        {
            NotaFiscalStatus.Autorizada => FiscalDocumentoStatus.Autorizada,
            NotaFiscalStatus.Cancelada => FiscalDocumentoStatus.Cancelada,
            NotaFiscalStatus.Rejeitada => FiscalDocumentoStatus.Rejeitada,
            _ => FiscalDocumentoStatus.Pendente
        };

        return new ConsultarNFeResult(
            status,
            nota.MensagemStatusSefaz ?? "Consulta direta concluida.",
            nota.ReferenciaFiscal ?? referenciaOuId,
            nota.NotaFiscalId.ToString("N"),
            nota.CodigoStatusSefaz,
            nota.ChaveAcesso,
            nota.ProtocoloAutorizacao,
            nota.XmlRetorno,
            nota.DanfeUrl,
            nota.DanfePdfBase64,
            nota.XmlRetorno,
            nota.DataAutorizacao,
            nota.Status is NotaFiscalStatus.Autorizada or NotaFiscalStatus.Cancelada or NotaFiscalStatus.Rejeitada);
    }

    public Task<CancelarNFeResult> CancelarNFeAsync(CancelarNFeRequest request)
        => throw new AppException("O cancelamento direto com a SEFAZ permanece preparado para a proxima fase desta arquitetura.");

    public Task<ConsultarNFeResult> SincronizarNFeAsync(string referenciaOuId)
        => ConsultarNFeAsync(referenciaOuId);

    public Task<FiscalEventoNFeResult> SolicitarCartaCorrecaoNFeAsync(CartaCorrecaoNFeRequest request)
        => throw new AppException("A carta de correcao via integracao direta com a SEFAZ permanece preparada para a proxima fase desta arquitetura.");

    public Task<EnviarEmailNFeResult> EnviarEmailNFeAsync(EnviarEmailNFeRequest request)
        => throw new AppException("O envio de XML/PDF por e-mail na integracao direta com a SEFAZ permanece preparado para a proxima fase desta arquitetura.");

    public Task<BaixarNFeDocumentoResult> BaixarDocumentoNFeAsync(BaixarNFeDocumentoRequest request)
        => throw new AppException("O download de XML/PDF na integracao direta com a SEFAZ permanece preparado para a proxima fase desta arquitetura.");

    public Task<InutilizarNFeResult> InutilizarNumeracaoNFeAsync(InutilizarNFeRequest request)
        => throw new AppException("A inutilizacao via integracao direta com a SEFAZ permanece preparada para a proxima fase desta arquitetura.");

    public async Task<StatusServicoResult> ConsultarStatusServicoAsync()
    {
        var empresa = await dbContext.Empresas
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.EmpresaId == _context.EmpresaId)
            ?? throw new NotFoundException("Empresa emissora nao encontrada.");
        var response = await nfeTransmissionService.ConsultarStatusServicoAsync(empresa);
        return new StatusServicoResult(
            response.Disponivel,
            response.CodigoStatus,
            response.Mensagem,
            response.Url,
            response.DataRecebimento,
            response.Diagnostico?.DetalheTecnico);
    }
}
